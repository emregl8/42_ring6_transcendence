import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable, Module, Global } from '@nestjs/common';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity.js';
import { User } from '../auth/entities/user.entity.js';
import { ConfigurationError } from '../common/errors/configuration.error.js';
import { DatabaseCredentials, ApplicationConfig } from '../common/interfaces/config.interface.js';
import { parseBoolean } from '../common/utils/parse-boolean.util.js';
import { Comment } from '../content/entities/comment.entity.js';
import { Like } from '../content/entities/like.entity.js';
import { Post } from '../content/entities/post.entity.js';

@Injectable()
export class DatabaseConfigService {
  createTypeOrmConfig(dbCredentials: DatabaseCredentials, appConfig: ApplicationConfig): TypeOrmModuleOptions {
    const sslConfig = this.createSslConfig(appConfig);

    const port = typeof appConfig.DB_PORT === 'number' ? appConfig.DB_PORT : Number.parseInt(String(appConfig.DB_PORT), 10);

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
      entities: [User, RefreshToken, Post, Comment, Like],
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
    if (parseBoolean(appConfig.DB_SSL_ENABLED, 'DB_SSL_ENABLED') === false) {
      throw new ConfigurationError('SSL must be enabled');
    }

    const caPath = this.validateCaPath(appConfig.DB_SSL_CA_PATH);

    const rejectUnauthorized = parseBoolean(appConfig.DB_SSL_REJECT_UNAUTHORIZED, 'DB_SSL_REJECT_UNAUTHORIZED');
    if (rejectUnauthorized === false) {
      throw new ConfigurationError('DB_SSL_REJECT_UNAUTHORIZED must be true for security');
    }

    return {
      rejectUnauthorized: true,
      ca: fs.readFileSync(caPath, 'utf8'),
    };
  }

  private validateCaPath(caPath: string | undefined): string {
    if (caPath === null || caPath === undefined || caPath === '') {
      throw new ConfigurationError('DB_SSL_CA_PATH must be provided when SSL is enabled');
    }

    const trustedBases = ['/vault/secrets', '/etc/postgres-ca'];
    const resolved = path.resolve(caPath);

    let realResolved: string;
    try {
      realResolved = fs.realpathSync(resolved);
    } catch {
      throw new ConfigurationError('DB_SSL_CA_PATH points outside trusted vault path');
    }

    const resolvedBases = trustedBases.map((b) => path.resolve(b));
    const allowed = resolvedBases.some((base) => realResolved === base || realResolved.startsWith(base + path.sep));

    if (!allowed) {
      throw new ConfigurationError('DB_SSL_CA_PATH points outside trusted vault path');
    }

    if (!fs.existsSync(realResolved)) {
      throw new ConfigurationError('SSL certificate not found');
    }

    const stat = fs.statSync(realResolved);
    if (!stat.isFile()) {
      throw new ConfigurationError('DB_SSL_CA_PATH is not a file');
    }

    try {
      fs.accessSync(realResolved, fs.constants.R_OK);
    } catch {
      throw new ConfigurationError('DB_SSL_CA_PATH is not readable');
    }

    return realResolved;
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
