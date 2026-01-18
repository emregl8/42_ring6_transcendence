import * as fs from 'fs';
import * as path from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { DatabaseCredentials, ApplicationConfig } from './common/interfaces/config.interface';
import { DatabaseModule, DatabaseConfigService } from './database/database-config.service';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    CommonModule,
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [
        () => {
          try {
            const base = '/vault/secrets';
            const dbPath = path.join(base, 'database.json');
            const appPath = path.join(base, 'app-config.json');

            let db: Record<string, unknown> | undefined = undefined;
            let app: Record<string, unknown> = {
              NODE_ENV: process.env.NODE_ENV,
              DB_HOST: process.env.DB_HOST,
              DB_PORT: process.env.DB_PORT,
              ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
              DB_SSL_ENABLED: process.env.DB_SSL_ENABLED,
              DB_SSL_REJECT_UNAUTHORIZED: process.env.DB_SSL_REJECT_UNAUTHORIZED,
              DB_SSL_CA_PATH: process.env.DB_SSL_CA_PATH,
              JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
              OAUTH_42_CALLBACK_URL: process.env.OAUTH_42_CALLBACK_URL,
              REFRESH_TOKEN_TTL_DAYS: process.env.REFRESH_TOKEN_TTL_DAYS,
            };

            if (fs.existsSync(dbPath)) {
              try {
                const rawDb = fs.readFileSync(dbPath, 'utf8');
                db = JSON.parse(rawDb);
              } catch {}
            }

            if (fs.existsSync(appPath)) {
              try {
                const rawApp = fs.readFileSync(appPath, 'utf8');
                const vaultSecrets = JSON.parse(rawApp);
                app = { ...app, ...vaultSecrets };
              } catch {}
            }

            const out: Record<string, unknown> = { app };
            if (db !== undefined) out.db = db;
            return out;
          } catch {
            return {};
          }
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
    HealthModule,
  ],
  providers: [AllExceptionsFilter],
})
export class AppModule {}
