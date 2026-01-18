import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RateLimitMiddleware } from '../common/middleware/rate-limit.middleware';
import { validateAndGetJwtSecret } from '../common/utils/jwt.util';
import { SessionController } from './controllers/auth.controller';
import { OAuthController } from './controllers/oauth.controller';
import { RefreshToken } from './entities/refresh-token.entity';
import { User } from './entities/user.entity';
import { AuthService } from './services/auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([User, RefreshToken]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = validateAndGetJwtSecret(configService);
        const expiresIn = configService.get('app.JWT_EXPIRES_IN') ?? '15m';
        return {
          secret,
          signOptions: {
            expiresIn,
            algorithm: 'HS256' as const,
          },
        };
      },
    }),
  ],
  controllers: [OAuthController, SessionController],
  providers: [AuthService, JwtStrategy, RateLimitMiddleware],
  exports: [AuthService],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RateLimitMiddleware).forRoutes(OAuthController);
  }
}
