import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module.js';
import { CommonModule } from './common/common.module.js';
import { AllExceptionsFilter } from './common/filters/http-exception.filter.js';
import { DatabaseCredentials, ApplicationConfig } from './common/interfaces/config.interface.js';
import { CsrfMiddleware } from './common/middleware/csrf.middleware.js';
import { parseEnvInt, parseEnvBool } from './common/utils/config.util.js';
import { ContentModule } from './content/content.module.js';
import { DatabaseModule, DatabaseConfigService } from './database/database-config.service.js';
import { HealthModule } from './health/health.module.js';
import { RedisModule } from './redis/redis.module.js';

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: path.join(ROOT_DIR, '..', 'uploads', 'public'),
      serveRoot: '/uploads',
      serveStaticOptions: {
        setHeaders: (res) => {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          res.setHeader('X-Content-Type-Options', 'nosniff');
        },
      },
    }),
    CommonModule,
    RedisModule,
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [
        () => {
          const base = '/vault/secrets';
          const dbPath = path.join(base, 'database.json');
          const appPath = path.join(base, 'app-config.json');

          if (!fs.existsSync(dbPath)) {
            throw new Error(`Vault database config not found at ${dbPath}`);
          }
          if (!fs.existsSync(appPath)) {
            throw new Error(`Vault application config not found at ${appPath}`);
          }

          let db: Record<string, unknown>;
          try {
            db = JSON.parse(fs.readFileSync(dbPath, 'utf8')) as Record<string, unknown>;
          } catch (err) {
            throw new Error(`Failed to parse Vault database config: ${err instanceof Error ? err.message : 'Unknown error'}`);
          }

          let vaultSecrets: Record<string, unknown>;
          try {
            vaultSecrets = JSON.parse(fs.readFileSync(appPath, 'utf8')) as Record<string, unknown>;
          } catch (err) {
            throw new Error(`Failed to parse Vault application config: ${err instanceof Error ? err.message : 'Unknown error'}`);
          }

          const app: Record<string, unknown> = {
            NODE_ENV: process.env.NODE_ENV,
            DB_HOST: process.env.DB_HOST,
            DB_PORT: parseEnvInt(process.env.DB_PORT),
            ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
            DB_SSL_ENABLED: parseEnvBool(process.env.DB_SSL_ENABLED),
            DB_SSL_REJECT_UNAUTHORIZED: parseEnvBool(process.env.DB_SSL_REJECT_UNAUTHORIZED),
            DB_SSL_CA_PATH: process.env.DB_SSL_CA_PATH,
            JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
            OAUTH_42_CALLBACK_URL: process.env.OAUTH_42_CALLBACK_URL,
            REFRESH_TOKEN_TTL_DAYS: parseEnvInt(process.env.REFRESH_TOKEN_TTL_DAYS),
            REDIS_HOST: process.env.REDIS_HOST,
            REDIS_PORT: parseEnvInt(process.env.REDIS_PORT),
            REDIS_TLS_ENABLED: parseEnvBool(process.env.REDIS_TLS_ENABLED),
            REDIS_TLS_CA_PATH: process.env.REDIS_TLS_CA_PATH,
            ...vaultSecrets,
          };

          return { app, db };
        },
      ],
    }),

    DatabaseModule,

    TypeOrmModule.forRootAsync({
      imports: [DatabaseModule],
      inject: [ConfigService, DatabaseConfigService],
      useFactory: async (configService: ConfigService, dbConfigService: DatabaseConfigService) => {
        const dbCredentials = configService.get<Record<string, unknown>>('db');
        const appConfig = configService.get<Record<string, unknown>>('app');

        if (dbCredentials === null || dbCredentials === undefined) {
          throw new Error('Database credentials not available in configuration');
        }

        return dbConfigService.createTypeOrmConfig(dbCredentials as unknown as DatabaseCredentials, appConfig as unknown as ApplicationConfig);
      },
    }),

    AuthModule,
    ContentModule,
    HealthModule,
  ],
  providers: [AllExceptionsFilter],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CsrfMiddleware).forRoutes('*');
  }
}
