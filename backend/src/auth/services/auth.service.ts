import { randomBytes, createHmac } from 'crypto';
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogService } from '../../common/services/audit-log.service';
import { RefreshToken } from '../entities/refresh-token.entity';
import { User } from '../entities/user.entity';

interface OAuth42Profile {
  intra42Id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly refreshTokenPepper: string;
  private readonly refreshTokenTtl: number;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly auditLogService: AuditLogService,
    private readonly configService: ConfigService
  ) {
    this.refreshTokenPepper = this.getConfigPepper();
    this.refreshTokenTtl = this.getConfigTtl();
  }

  private getConfigPepper(): string {
    const pepper = this.configService.get<string>('app.REFRESH_TOKEN_PEPPER');
    if (pepper === undefined || pepper === null || pepper === '' || pepper.length < 32) {
      throw new Error('REFRESH_TOKEN_PEPPER must be configured and at least 32 characters');
    }
    return pepper;
  }

  private getConfigTtl(): number {
    const rawDays = this.configService.get<string>('app.REFRESH_TOKEN_TTL_DAYS');
    const days = Number(rawDays ?? 30);
    if (!Number.isFinite(days) || days <= 0) {
      return 30 * 24 * 3600 * 1000;
    }
    return Math.floor(days) * 24 * 3600 * 1000;
  }

  private hashToken(token: string): string {
    return createHmac('sha256', this.refreshTokenPepper).update(token).digest('hex');
  }

  private sanitizeAvatarUrl(urlStr?: string): string | undefined {
    if (urlStr === undefined || urlStr === null || urlStr === '') return undefined;

    try {
      const url = new URL(urlStr);
      if (url.protocol !== 'https:') return undefined;

      const allowedDomains = ['cdn.intra.42.fr', 'profile.intra.42.fr', 'api.intra.42.fr'];
      if (!allowedDomains.includes(url.hostname)) return undefined;

      const safePath = encodeURI((url.pathname !== '' ? url.pathname : '') + (url.search !== '' ? url.search : ''));
      return `${url.origin}${safePath}`;
    } catch {
      return undefined;
    }
  }

  async validateOAuthUser(profile: OAuth42Profile): Promise<User> {
    const sanitizedAvatar = this.sanitizeAvatarUrl(profile.avatar);

    const userData = {
      intra42Id: profile.intra42Id,
      username: profile.username,
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      avatar: sanitizedAvatar,
    };

    try {
      await this.userRepository
        .createQueryBuilder()
        .insert()
        .into(User)
        .values(userData)
        .orUpdate({
          conflict_target: ['intra_42_id'],
          overwrite: ['username', 'email', 'first_name', 'last_name', 'avatar'],
        })
        .execute();

      const user = await this.userRepository.findOne({
        where: { intra42Id: profile.intra42Id },
      });

      if (user === null || user === undefined) {
        throw new Error('Failed to load user after upsert');
      }
      return user;
    } catch (error) {
      this.logger.error('User upsert failed', error);
      this.auditLogService.logSecurityEvent({
        eventType: 'user_upsert_failed',
        success: false,
        resource: 'user',
      });
      throw new Error('User creation failed');
    }
  }

  async findUserById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  generateJwtToken(user: User): string {
    return this.jwtService.sign({
      sub: user.id,
      username: user.username,
      email: user.email,
    });
  }

  async createRefreshToken(user: User, clientIp?: string, userAgent?: string): Promise<{ token: string; expiresAt: Date }> {
    const rawToken = randomBytes(64).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + this.refreshTokenTtl);

    const entity = this.refreshTokenRepository.create({
      tokenHash,
      userId: user.id,
      user,
      expiresAt,
      revoked: false,
      userAgent: userAgent?.slice(0, 512),
      ipAddress: clientIp,
    });

    await this.saveRefreshTokenWithRetry(entity, user.id);
    return { token: rawToken, expiresAt };
  }

  private async saveRefreshTokenWithRetry(entity: RefreshToken, userId: string): Promise<void> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.refreshTokenRepository.save(entity);
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to save refresh token (attempt ${attempt}/${maxAttempts}) for user ${userId}: ${msg}`);

        if (attempt === maxAttempts) {
          this.auditLogService.logSecurityEvent({
            eventType: 'refresh_token_save_failed',
            success: false,
            resource: 'refresh_token',
          });
          throw err;
        }

        await new Promise((resolve) => setTimeout(resolve, 150 * Math.pow(2, attempt - 1)));
      }
    }
  }

  async verifyAndRotateRefreshToken(providedToken: string, clientIp?: string, userAgent?: string): Promise<{ user: User; newRefreshToken: string }> {
    const providedHash = this.hashToken(providedToken);
    const existing = await this.refreshTokenRepository.findOne({
      where: { tokenHash: providedHash },
      relations: ['user'],
    });

    if (existing === null || existing === undefined) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (existing.revoked) {
      throw new UnauthorizedException('Refresh token revoked');
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const { token: newRaw } = await this.createRefreshToken(existing.user, clientIp, userAgent);

    existing.revoked = true;
    existing.replacedBy = this.hashToken(newRaw);

    try {
      await this.refreshTokenRepository.save(existing);
    } catch (error) {
      this.logger.error('Failed to revoke old refresh token', error);
      this.auditLogService.logSecurityEvent({
        eventType: 'refresh_token_rotate_failed',
        success: false,
        resource: 'refresh_token',
      });
    }

    return { user: existing.user, newRefreshToken: newRaw };
  }

  async revokeRefreshToken(providedToken: string): Promise<void> {
    const providedHash = this.hashToken(providedToken);
    try {
      await this.refreshTokenRepository.update({ tokenHash: providedHash }, { revoked: true });
    } catch (error) {
      this.logger.error('Failed to revoke refresh token', error);
    }
  }
}
