import { Controller, Get, Req, Res, UseGuards, Logger, Post, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { extractClientIp, extractUserAgent } from '../../common/utils/client-info.util';
import { isNullOrEmpty, isNotNullOrEmpty } from '../../common/utils/validation.util';
import { User } from '../entities/user.entity';
import { AuthService } from '../services/auth.service';

interface AuthenticatedRequest extends Request {
  user?: User;
  cookies: {
    refresh_token?: string;
    auth_token?: string;
  };
}

@Controller('auth')
export class SessionController {
  private readonly logger = new Logger(SessionController.name);

  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  getProfile(@Req() req: AuthenticatedRequest): User | undefined {
    return req.user;
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  logout(@Res() res: Response, @Req() req: AuthenticatedRequest): void {
    if (req.user !== undefined && req.user !== null) {
      this.logger.log(`User logged out: ${req.user.id}`);
    }

    const refresh = req.cookies?.refresh_token;
    if (isNotNullOrEmpty(refresh)) {
      this.authService.revokeRefreshToken(refresh).catch(() => {});
    }

    this.clearCookies(res);
    res.redirect('/');
  }

  @Post('refresh')
  async refresh(@Req() req: AuthenticatedRequest, @Res() res: Response): Promise<void> {
    try {
      const provided = req.cookies?.refresh_token;
      if (isNullOrEmpty(provided)) {
        throw new UnauthorizedException('Missing refresh token');
      }

      const clientIp = extractClientIp(req);
      const userAgent = extractUserAgent(req);

      const { user, newRefreshToken } = await this.authService.verifyAndRotateRefreshToken(provided, clientIp, userAgent);
      const newAccess = this.authService.generateJwtToken(user);

      this.setCookies(res, newAccess, newRefreshToken);
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      this.logger.warn('Refresh token rotation failed');
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private clearCookies(res: Response): void {
    const options = {
      httpOnly: true,
      secure: true,
      sameSite: 'strict' as const,
      path: '/',
    };
    res.clearCookie('auth_token', options);
    res.clearCookie('refresh_token', options);
  }

  private setCookies(res: Response, accessToken: string, refreshToken: string): void {
    const options = {
      httpOnly: true,
      secure: true,
      sameSite: 'lax' as const,
      path: '/',
    };

    res.cookie('auth_token', accessToken, {
      ...options,
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refresh_token', refreshToken, {
      ...options,
      maxAge: 30 * 24 * 3600 * 1000,
    });
  }
}
