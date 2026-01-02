import { Injectable } from '@nestjs/common';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import * as fs from 'fs';
import { DatabaseCredentials, ApplicationConfig } from '../vault/interfaces/vault-secrets.interface';

@Injectable()
export class DatabaseConfigService {
  createTypeOrmConfig(
    dbCredentials: DatabaseCredentials,
    appConfig: ApplicationConfig
  ): TypeOrmModuleOptions {
    const sslConfig = this.createSslConfig(appConfig);

    return {
      type: 'postgres',
      host: appConfig.DB_HOST,
      port: parseInt(appConfig.DB_PORT, 10),
      username: dbCredentials.POSTGRES_USER,
      password: dbCredentials.POSTGRES_PASSWORD,
      database: dbCredentials.POSTGRES_DB,
      entities: [__dirname + '/../**/*.entity{.ts,.js}'],
      synchronize: false,
      logging: false,
      extra: this.createConnectionPoolConfig(appConfig.NODE_ENV),
      ssl: sslConfig,
      retryAttempts: parseInt(process.env.DB_RETRY_ATTEMPTS || '3'),
      retryDelay: parseInt(process.env.DB_RETRY_DELAY || '5000'),
    };
  }

  private createSslConfig(appConfig: ApplicationConfig) {
    const sslEnabled = appConfig.DB_SSL_ENABLED === 'true';
    
    if (!sslEnabled) {
      return false;
    }

    if (!fs.existsSync(appConfig.DB_SSL_CA_PATH)) {
      throw new Error('SSL CA certificate file not found');
    }

    return {
      rejectUnauthorized: appConfig.DB_SSL_REJECT_UNAUTHORIZED === 'true',
      ca: fs.readFileSync(appConfig.DB_SSL_CA_PATH, 'utf8'),
    };
  }

  private createConnectionPoolConfig(nodeEnv: string) {
    const isProduction = nodeEnv === 'production';
    
    return {
      max: parseInt(process.env.DB_POOL_MAX || (isProduction ? '20' : '5')),
      min: parseInt(process.env.DB_POOL_MIN || (isProduction ? '5' : '2')),
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000'),
      acquireTimeoutMillis: parseInt(process.env.DB_ACQUIRE_TIMEOUT || '30000'),
      createTimeoutMillis: parseInt(process.env.DB_CREATE_TIMEOUT || '15000'),
      destroyTimeoutMillis: parseInt(process.env.DB_DESTROY_TIMEOUT || '5000'),
    };
  }
}
