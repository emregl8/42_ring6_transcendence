import * as crypto from 'crypto';
import { Controller, Get, Req, Res, Logger, InternalServerErrorException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response, Request } from 'express';
import { AuditLogService } from '../../common/services/audit-log.service';
import { extractClientIp, extractUserAgent } from '../../common/utils/client-info.util';
import { parseDuration } from '../../common/utils/time.util';
import { isNullOrEmpty, isNotNullOrEmpty } from '../../common/utils/validation.util';
import { RedisService } from '../../redis/redis.service';
import { User } from '../entities/user.entity';
import { AuthService } from '../services/auth.service';

interface OAuthTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  created_at?: number;
}

interface Intra42Profile {
  id?: number;
  login?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  image?: {
    link?: string;
  };
  [key: string]: unknown;
}

@Controller('auth')
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly callbackUrl: string;
  private readonly allowedOrigins: string[];
  private readonly jwtExpiresIn: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly auditLogService: AuditLogService,
    private readonly redisService: RedisService
  ) {
    this.clientId = (this.configService.get<string>('app.OAUTH_42_CLIENT_ID') ?? '').trim();
    this.clientSecret = (this.configService.get<string>('app.OAUTH_42_CLIENT_SECRET') ?? '').trim();
    this.callbackUrl = (this.configService.get<string>('app.OAUTH_42_CALLBACK_URL') ?? '').trim();

    const allowedOriginsRaw = this.configService.get<string>('app.ALLOWED_ORIGINS', '');
    this.allowedOrigins = allowedOriginsRaw
      .split(',')
      .map((o) => o.trim())
      .filter((o) => isNotNullOrEmpty(o));

    const expiresIn = this.configService.get<string>('app.JWT_EXPIRES_IN') ?? '15m';
    this.jwtExpiresIn = parseDuration(expiresIn);

    this.validateConfiguration();
  }

  private validateConfiguration(): void {
    if (isNullOrEmpty(this.clientId) || isNullOrEmpty(this.clientSecret) || isNullOrEmpty(this.callbackUrl)) {
      throw new Error('OAuth configuration missing: clientId, clientSecret, or callbackUrl');
    }
    if (this.allowedOrigins.length === 0) {
      throw new Error('ALLOWED_ORIGINS is not configured or empty');
    }

    try {
      const url = new URL(this.callbackUrl);
      if (url.protocol !== 'https:') {
        throw new Error('Callback URL must use HTTPS');
      }
      const callbackOrigin = `${url.protocol}//${url.host}`;
      if (!this.allowedOrigins.includes(callbackOrigin)) {
        throw new Error('Callback URL not in allowed origins');
      }
    } catch {
      throw new Error('Invalid callback URL configuration');
    }
  }

  @Get('login')
  async login(@Res() res: Response): Promise<void> {
    const state = crypto.randomBytes(32).toString('hex');
    await this.redisService.set(`oauth_state:${state}`, '1', 600); // 10 minutes TTL

    const authUrl = `https://api.intra.42.fr/oauth/authorize?client_id=${this.clientId}&redirect_uri=${encodeURIComponent(
      this.callbackUrl
    )}&response_type=code&scope=public&state=${state}`;
    res.redirect(authUrl);
  }

  @Get('callback')
  async callback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const clientIp = extractClientIp(req);
    try {
      const state = String(req.query.state ?? '');
      if (isNullOrEmpty(state)) {
        throw new BadRequestException('Missing state parameter');
      }

      const isValidState = await this.redisService.get(`oauth_state:${state}`);
      if (isValidState === null) {
        this.auditLogService.logFailedAuthentication(clientIp, 'Invalid or expired OAuth state');
        throw new BadRequestException('Invalid or expired state');
      }
      await this.redisService.del(`oauth_state:${state}`);

      const code = this.validateAuthorizationCode(req, clientIp);
      const accessToken = await this.exchangeCodeForToken(code, clientIp);
      const profile = await this.fetchUserProfile(accessToken);
      const user = await this.processUser(profile);

      this.auditLogService.logSuccessfulAuthentication(user.id, 'OAuth-42');

      const jwtToken = this.authService.generateJwtToken(user);
      const refreshToken = await this.generateRefreshToken(user, req, clientIp);

      this.setCookies(res, jwtToken, refreshToken);
      res.redirect('/auth-redirect.html');
    } catch (error) {
      this.handleCallbackError(error);
    }
  }

  private validateAuthorizationCode(req: Request, clientIp: string): string {
    const code = String(req.query.code ?? '');
    if (isNullOrEmpty(code) || code.length === 0 || code.length > 512 || /\s/.test(code)) {
      this.auditLogService.logFailedAuthentication(clientIp, 'Missing/invalid authorization code');
      throw new BadRequestException('Invalid authorization code');
    }
    return code;
  }

  private async exchangeCodeForToken(code: string, clientIp: string): Promise<string> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code: code,
      redirect_uri: this.callbackUrl,
    });

    const response = await fetch('https://api.intra.42.fr/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: params.toString(),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'No body');
      this.logger.error(`OAuth token exchange failed: status=${response.status}, body=${errorBody}`);
      this.auditLogService.logFailedAuthentication(clientIp, `OAuth token exchange failed: ${response.status}`);
      throw new UnauthorizedException('Authentication failed');
    }

    const data = (await response.json()) as OAuthTokenResponse;
    const accessToken = data.access_token ?? '';

    if (accessToken === '') {
      this.logger.error('OAuth token missing access_token in response');
      this.auditLogService.logFailedAuthentication(clientIp, 'OAuth token missing access_token');
      throw new UnauthorizedException('Authentication failed');
    }
    return accessToken;
  }

  private async fetchUserProfile(accessToken: string): Promise<Intra42Profile> {
    const response = await fetch('https://api.intra.42.fr/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      this.logger.warn(`Profile retrieval failed: status=${response.status}`);
      throw new UnauthorizedException('Authentication failed');
    }

    const profile = (await response.json()) as Intra42Profile;
    if (typeof profile !== 'object' || profile === null) {
      throw new UnauthorizedException('Invalid profile data from OAuth provider');
    }
    return profile;
  }

  private async processUser(profile: Intra42Profile): Promise<User> {
    if (profile.id === undefined || profile.login === undefined || profile.email === undefined) {
      throw new UnauthorizedException('Invalid profile data: missing required fields');
    }

    const email = String(profile.email).trim().toLowerCase();
    if (email.length < 3 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new UnauthorizedException('Invalid email from OAuth provider');
    }

    return this.authService.validateOAuthUser({
      intra42Id: String(profile.id),
      username: String(profile.login).trim(),
      email,
      firstName: isNotNullOrEmpty(profile.first_name) ? String(profile.first_name).trim() : '',
      lastName: isNotNullOrEmpty(profile.last_name) ? String(profile.last_name).trim() : '',
      avatar: isNotNullOrEmpty(profile.image?.link) ? String(profile.image?.link).trim() : undefined,
    });
  }

  private async generateRefreshToken(user: User, req: Request, clientIp: string): Promise<string | undefined> {
    try {
      const userAgent = extractUserAgent(req);
      const { token } = await this.authService.createRefreshToken(user, clientIp, userAgent);
      return token;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to persist refresh token for user ${user.id}: ${msg}`);
      return undefined;
    }
  }

  private setCookies(res: Response, jwtToken: string, refreshToken?: string): void {
    const commonOptions = {
      httpOnly: true,
      secure: true,
      sameSite: 'lax' as const,
      path: '/',
    };

    res.cookie('auth_token', jwtToken, {
      ...commonOptions,
      maxAge: this.jwtExpiresIn,
    });

    if (refreshToken !== undefined && refreshToken !== '') {
      res.cookie('refresh_token', refreshToken, {
        ...commonOptions,
        maxAge: 30 * 24 * 3600 * 1000,
      });
    }
  }

  private handleCallbackError(error: unknown): void {
    if (error instanceof BadRequestException || error instanceof UnauthorizedException) {
      this.logger.warn(`Authentication attempt rejected: ${error.message}`);
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      this.logger.error('OAuth request timeout');
      throw new InternalServerErrorException('Authentication service timeout');
    }

    const msg = error instanceof Error ? error.message : String(error);
    this.logger.error(`Authentication error: ${msg}`, error instanceof Error ? error.stack : undefined);
    throw new UnauthorizedException('Authentication failed');
  }
}
