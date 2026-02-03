import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { validateAndGetJwtSecret } from '../../common/utils/jwt.util.js';
import { isNotNullOrEmpty } from '../../common/utils/validation.util.js';
import { User } from '../entities/user.entity.js';
import { AuthService } from '../services/auth.service.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly authService: AuthService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) => {
          const token = req?.cookies?.['auth_token'];
          return isNotNullOrEmpty(token) ? token : null;
        },
        (req: Request) => {
          const token = req?.headers?.['x-access-token'] as string | undefined;
          return isNotNullOrEmpty(token) ? token : null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: validateAndGetJwtSecret(configService),
    });
  }

  async validate(payload: { sub: string; username: string; email: string }): Promise<User> {
    const user = await this.authService.findUserById(payload.sub);
    if (user === null || user === undefined) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }
}
