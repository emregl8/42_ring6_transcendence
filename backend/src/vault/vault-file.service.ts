import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseCredentials, ApplicationConfig } from './interfaces/vault-secrets.interface';
import { VaultFileReaderService } from './services/vault-file-reader.service';
import { VaultValidatorService } from './services/vault-validator.service';
import { VaultFileWatcherService } from './services/vault-file-watcher.service';

@Injectable()
export class VaultFileService implements OnModuleInit {
  private readonly logger = new Logger(VaultFileService.name);
  private readonly secretsPath: string;
  private dbCredentials: DatabaseCredentials | null = null;
  private appConfig: ApplicationConfig | null = null;

  constructor(
    private readonly fileReader: VaultFileReaderService,
    private readonly validator: VaultValidatorService,
    private readonly watcher: VaultFileWatcherService,
  ) {
    this.secretsPath = process.env.VAULT_SECRETS_PATH || '/vault/secrets';
  }

  async onModuleInit(): Promise<void> {
    await this.loadSecrets();
    this.watcher.startWatching(this.secretsPath, () => this.loadSecrets());
  }

  private async loadSecrets(): Promise<void> {
    try {
      this.logger.log('Loading secrets from Vault Agent files...');

      const secrets = this.fileReader.readSecretFiles(this.secretsPath);
      
      this.validator.validateDatabaseCredentials(secrets.dbCredentials);
      this.validator.validateApplicationConfig(secrets.appConfig);

      this.dbCredentials = secrets.dbCredentials;
      this.appConfig = secrets.appConfig;

      this.logger.log('Secrets loaded successfully from Vault Agent');
    } catch (error) {
      this.logger.error(`Failed to load secrets from Vault Agent: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new Error('Secret initialization failed');
    }
  }

  async getDatabaseCredentials(): Promise<DatabaseCredentials> {
    if (!this.dbCredentials) {
      await this.loadSecrets();
    }

    if (!this.dbCredentials) {
      throw new Error('Database credentials not available');
    }

    return { ...this.dbCredentials };
  }

  async getApplicationConfig(): Promise<ApplicationConfig> {
    if (!this.appConfig) {
      await this.loadSecrets();
    }

    if (!this.appConfig) {
      throw new Error('Application config not available');
    }

    return { ...this.appConfig };
  }
}
