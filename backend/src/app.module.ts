import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { VaultAgentModule } from './vault/vault-agent.module';
import { VaultFileService } from './vault/vault-file.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    VaultAgentModule,
    TypeOrmModule.forRootAsync({
      imports: [VaultAgentModule],
      inject: [VaultFileService],
      useFactory: async (vaultFileService: VaultFileService) => {
        const dbCredentials = await vaultFileService.getDatabaseCredentials();
        const appConfig = await vaultFileService.getApplicationConfig();

        return {
          type: 'postgres' as const,
          host: appConfig.DB_HOST,
          port: parseInt(appConfig.DB_PORT, 10),
          username: dbCredentials.POSTGRES_USER,
          password: dbCredentials.POSTGRES_PASSWORD,
          database: dbCredentials.POSTGRES_DB,
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          synchronize: appConfig.NODE_ENV !== 'production',
          logging: appConfig.NODE_ENV !== 'production',
          extra: {
            max: parseInt(process.env.DB_POOL_MAX || (appConfig.NODE_ENV === 'production' ? '20' : '5')),
            min: parseInt(process.env.DB_POOL_MIN || (appConfig.NODE_ENV === 'production' ? '5' : '2')),
            idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
            connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000'),
            acquireTimeoutMillis: parseInt(process.env.DB_ACQUIRE_TIMEOUT || '30000'),
            createTimeoutMillis: parseInt(process.env.DB_CREATE_TIMEOUT || '15000'),
            destroyTimeoutMillis: parseInt(process.env.DB_DESTROY_TIMEOUT || '5000'),
          },
          ssl: appConfig.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
          retryAttempts: parseInt(process.env.DB_RETRY_ATTEMPTS || '3'),
          retryDelay: parseInt(process.env.DB_RETRY_DELAY || '3000'),
        };
      },
    }),
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
