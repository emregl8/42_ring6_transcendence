import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Module, Global } from '@nestjs/common';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { User } from '../auth/entities/user.entity';
import { ConfigurationError } from '../common/errors/configuration.error';
import { DatabaseCredentials, ApplicationConfig } from '../common/interfaces/config.interface';
import { parseBoolean } from '../common/utils/parse-boolean.util';
import { Post } from '../content/entities/post.entity';

@Injectable()
export class DatabaseConfigService {
  createTypeOrmConfig(dbCredentials: DatabaseCredentials, appConfig: ApplicationConfig): TypeOrmModuleOptions {
    const sslConfig = this.createSslConfig(appConfig);

    const port = typeof appConfig.DB_PORT === 'number' ? appConfig.DB_PORT : parseInt(String(appConfig.DB_PORT), 10);

    if (Number.isInteger(port) === false || port <= 0 || port > 65535) {
      throw new ConfigurationError('Invalid DB_PORT: must be an integer 1-65535');
    }

    return {
      type: 'postgres',
      host: appConfig.DB_HOST,
      port,
      username: dbCredentials.POSTGRES_USER,
      password: dbCredentials.POSTGRES_PASSWORD,
      database: dbCredentials.POSTGRES_DB,
      entities: [User, RefreshToken, Post],
      synchronize: appConfig.NODE_ENV === 'development',
      logging: ['error'],
      extra: this.createConnectionPoolConfig(),
      ssl: sslConfig,
      retryAttempts: 3,
      retryDelay: 5000,
    };
  }

  private createSslConfig(appConfig: ApplicationConfig): {
    rejectUnauthorized: boolean;
    ca: string;
  } {
    let sslEnabled: boolean;
    try {
      sslEnabled = parseBoolean(appConfig.DB_SSL_ENABLED, 'DB_SSL_ENABLED');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid DB_SSL_ENABLED value';
      throw new ConfigurationError(message);
    }

    if (sslEnabled === false) {
      throw new ConfigurationError('SSL must be enabled');
    }

    if (appConfig.DB_SSL_CA_PATH === null || appConfig.DB_SSL_CA_PATH === undefined || appConfig.DB_SSL_CA_PATH === '') {
      throw new ConfigurationError('DB_SSL_CA_PATH must be provided when SSL is enabled');
    }

    const trustedBases = ['/vault/secrets', '/etc/postgres-ca'];
    const resolved = path.resolve(appConfig.DB_SSL_CA_PATH as string);

    let realResolved: string;
    try {
      realResolved = fs.realpathSync(resolved);
    } catch {
      throw new ConfigurationError('DB_SSL_CA_PATH points outside trusted vault path');
    }

    const resolvedBases = trustedBases.map((b) => path.resolve(b));
    const allowed = resolvedBases.some((base) => realResolved === base || realResolved.startsWith(base + path.sep));
    if (allowed === false) {
      throw new ConfigurationError('DB_SSL_CA_PATH points outside trusted vault path');
    }

    if (fs.existsSync(realResolved) === false) {
      throw new ConfigurationError('SSL certificate not found');
    }
    const stat = fs.statSync(realResolved);
    if (stat.isFile() === false) {
      throw new ConfigurationError('DB_SSL_CA_PATH is not a file');
    }
    try {
      fs.accessSync(realResolved, fs.constants.R_OK);
    } catch {
      throw new ConfigurationError('DB_SSL_CA_PATH is not readable');
    }

    let rejectUnauthorized: boolean;
    try {
      rejectUnauthorized = parseBoolean(appConfig.DB_SSL_REJECT_UNAUTHORIZED, 'DB_SSL_REJECT_UNAUTHORIZED');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid DB_SSL_REJECT_UNAUTHORIZED value';
      throw new ConfigurationError(message);
    }

    if (rejectUnauthorized === false) {
      throw new ConfigurationError('DB_SSL_REJECT_UNAUTHORIZED must be true for security');
    }

    return {
      rejectUnauthorized: true,
      ca: fs.readFileSync(realResolved, 'utf8'),
    };
  }

  private createConnectionPoolConfig(): {
    max: number;
    min: number;
    idleTimeoutMillis: number;
    connectionTimeoutMillis: number;
    acquireTimeoutMillis: number;
    createTimeoutMillis: number;
    destroyTimeoutMillis: number;
  } {
    return {
      max: 100,
      min: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      acquireTimeoutMillis: 30000,
      createTimeoutMillis: 15000,
      destroyTimeoutMillis: 5000,
    };
  }
}

@Global()
@Module({
  providers: [DatabaseConfigService],
  exports: [DatabaseConfigService],
})
export class DatabaseModule {}
