import { randomBytes, createHmac } from 'crypto';
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogService } from '../../common/services/audit-log.service';
import { isDefined, isNullOrEmpty } from '../../common/utils/validation.util';
import { REDIS_KEYS, CACHE_TTL } from '../../redis/redis.constants';
import { RedisService } from '../../redis/redis.service';
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
    private readonly configService: ConfigService,
    private readonly redisService: RedisService
  ) {
    this.refreshTokenPepper = this.getConfigPepper();
    this.refreshTokenTtl = this.getConfigTtl();
  }

  private getConfigPepper(): string {
    const pepper = this.configService.get<string>('app.REFRESH_TOKEN_PEPPER');
    if (isNullOrEmpty(pepper) || pepper.length < 32) {
      throw new Error('REFRESH_TOKEN_PEPPER must be configured and at least 32 characters');
    }
    return pepper;
  }

  private getConfigTtl(): number {
    const rawDays = this.configService.get<string>('app.REFRESH_TOKEN_TTL_DAYS');
    const days = Number(rawDays ?? 30);
    return (!Number.isFinite(days) || days <= 0 ? 30 : Math.floor(days)) * 24 * 3600 * 1000;
  }

  private hashToken(token: string): string {
    return createHmac('sha256', this.refreshTokenPepper).update(token).digest('hex');
  }

  private sanitizeAvatarUrl(urlStr?: string): string | undefined {
    if (isNullOrEmpty(urlStr)) {
      return undefined;
    }
    try {
      const url = new URL(urlStr);
      if (url.protocol !== 'https:') {
        return undefined;
      }
      if (!['cdn.intra.42.fr', 'profile.intra.42.fr', 'api.intra.42.fr'].includes(url.hostname)) {
        return undefined;
      }
      return `${url.origin}${encodeURI((url.pathname !== '' ? url.pathname : '') + (url.search !== '' ? url.search : ''))}`;
    } catch {
      return undefined;
    }
  }

  async validateOAuthUser(profile: OAuth42Profile): Promise<User> {
    const userData = {
      ...profile,
      avatar: this.sanitizeAvatarUrl(profile.avatar),
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

      const user = await this.userRepository.findOne({ where: { intra42Id: profile.intra42Id } });
      if (!isDefined(user)) {
        throw new Error('Failed to load user after upsert');
      }

      await this.redisService.del(REDIS_KEYS.userCache(user.id));
      return user;
    } catch (error) {
      this.logger.error('User upsert failed', error);
      this.auditLogService.logSecurityEvent({ eventType: 'user_upsert_failed', success: false, resource: 'user' });
      throw new Error('User creation failed');
    }
  }

  async findUserById(id: string): Promise<User | null> {
    const cacheKey = REDIS_KEYS.userCache(id);
    try {
      const cached = await this.redisService.get(cacheKey);
      if (isDefined(cached)) {
        const parsed = this.validateCachedUser(cached, id);
        if (isDefined(parsed)) {
          return parsed;
        }
      }
    } catch {
      this.logger.warn(`Redis cache read failed for user ${id}`);
    }

    const user = await this.userRepository.findOne({ where: { id } });
    if (isDefined(user)) {
      await this.redisService.set(cacheKey, JSON.stringify(user), CACHE_TTL.USER).catch(() => {});
    }
    return user;
  }

  private validateCachedUser(cached: string, expectedId: string): User | null {
    try {
      const parsed = JSON.parse(cached) as Record<string, unknown>;
      if (
        typeof parsed.id !== 'string' ||
        typeof parsed.intra42Id !== 'string' ||
        typeof parsed.username !== 'string' ||
        typeof parsed.email !== 'string' ||
        parsed.id !== expectedId
      ) {
        this.logger.warn(`Invalid cached user data for id ${expectedId}`);
        void this.redisService.del(REDIS_KEYS.userCache(expectedId));
        return null;
      }
      return parsed as unknown as User;
    } catch {
      this.logger.warn(`Failed to parse cached user for id ${expectedId}`);
      void this.redisService.del(REDIS_KEYS.userCache(expectedId));
      return null;
    }
  }

  generateJwtToken(user: User): string {
    return this.jwtService.sign({ sub: user.id, username: user.username, email: user.email });
  }

  async createRefreshToken(user: User, clientIp?: string, userAgent?: string): Promise<{ token: string; expiresAt: Date }> {
    const rawToken = randomBytes(64).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + this.refreshTokenTtl);

    await this.saveRefreshTokenWithRetry(
      this.refreshTokenRepository.create({
        tokenHash,
        userId: user.id,
        user,
        expiresAt,
        userAgent: userAgent?.slice(0, 512),
        ipAddress: clientIp,
      }),
      user.id
    );

    const cacheKey = REDIS_KEYS.refreshToken(tokenHash);
    const ttlSeconds = Math.floor(this.refreshTokenTtl / 1000);
    await this.redisService.set(cacheKey, JSON.stringify({ userId: user.id, revoked: false }), ttlSeconds).catch(() => {});

    return { token: rawToken, expiresAt };
  }

  private async saveRefreshTokenWithRetry(entity: RefreshToken, userId: string): Promise<void> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.refreshTokenRepository.save(entity);
        return;
      } catch (err) {
        this.logger.error(`Failed to save refresh token (attempt ${attempt}/${maxAttempts}) for user ${userId}`);
        if (attempt === maxAttempts) {
          this.auditLogService.logSecurityEvent({ eventType: 'refresh_token_save_failed', success: false, resource: 'refresh_token' });
          throw err;
        }
        await new Promise((resolve) => setTimeout(resolve, 150 * Math.pow(2, attempt - 1)));
      }
    }
  }

  async verifyAndRotateRefreshToken(providedToken: string, clientIp?: string, userAgent?: string): Promise<{ user: User; newRefreshToken: string }> {
    const providedHash = this.hashToken(providedToken);
    const cacheKey = REDIS_KEYS.refreshToken(providedHash);

    let cachedData: { userId: string; revoked: boolean } | null = null;
    try {
      const cached = await this.redisService.get(cacheKey);
      if (isDefined(cached)) {
        cachedData = JSON.parse(cached);
      }
    } catch {}

    let user: User | null = null;
    let existingToken: RefreshToken | null = null;

    if (isDefined(cachedData) && !cachedData.revoked) {
      user = await this.findUserById(cachedData.userId);
    }

    if (!isDefined(user)) {
      existingToken = await this.refreshTokenRepository.findOne({ where: { tokenHash: providedHash }, relations: ['user'] });
      if (!isDefined(existingToken)) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      if (existingToken.revoked) {
        throw new UnauthorizedException('Refresh token revoked');
      }
      if (existingToken.expiresAt.getTime() < Date.now()) {
        throw new UnauthorizedException('Refresh token expired');
      }
      user = existingToken.user;
    }

    if (!isDefined(user)) {
      throw new UnauthorizedException('Invalid refresh token state');
    }

    const { token: newRaw } = await this.createRefreshToken(user, clientIp, userAgent);
    const newHash = this.hashToken(newRaw);

    if (!isDefined(existingToken)) {
      await this.refreshTokenRepository.update({ tokenHash: providedHash }, { revoked: true, replacedBy: newHash });
    } else {
      existingToken.revoked = true;
      existingToken.replacedBy = newHash;
      await this.refreshTokenRepository.save(existingToken);
    }

    await this.redisService.del(cacheKey).catch(() => {});
    return { user, newRefreshToken: newRaw };
  }

  async revokeRefreshToken(providedToken: string): Promise<void> {
    const providedHash = this.hashToken(providedToken);
    try {
      await this.refreshTokenRepository.update({ tokenHash: providedHash }, { revoked: true });
      await this.redisService.del(REDIS_KEYS.refreshToken(providedHash));
    } catch (error) {
      this.logger.error('Failed to revoke refresh token', error);
    }
  }
}
