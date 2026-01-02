import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { VaultAgentModule } from './vault/vault-agent.module';
import { VaultFileService } from './vault/vault-file.service';
import { DatabaseConfigService } from './database/database-config.service';

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
        
        const databaseConfigService = new DatabaseConfigService();
        return databaseConfigService.createTypeOrmConfig(dbCredentials, appConfig);
      },
    }),
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
