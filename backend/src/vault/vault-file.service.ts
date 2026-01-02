import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

interface DatabaseCredentials {
  POSTGRES_USER: string;
  POSTGRES_PASSWORD: string;
  POSTGRES_DB: string;
}

interface ApplicationConfig {
  DB_HOST: string;
  DB_PORT: string;
  NODE_ENV: string;
  ALLOWED_ORIGINS: string;
}

@Injectable()
export class VaultFileService implements OnModuleInit {
  private readonly logger = new Logger(VaultFileService.name);
  private readonly secretsPath: string;
  private dbCredentials: DatabaseCredentials | null = null;
  private appConfig: ApplicationConfig | null = null;
  private watchers: fs.FSWatcher[] = [];

  constructor() {
    this.secretsPath = process.env.VAULT_SECRETS_PATH || '/vault/secrets';
  }

  async onModuleInit(): Promise<void> {
    await this.loadSecrets();
    this.watchSecrets();
  }

  onModuleDestroy(): void {
    this.watchers.forEach(watcher => watcher.close());
  }

  private async loadSecrets(): Promise<void> {
    try {
      this.logger.log('Loading secrets from Vault Agent files...');

      const dbPath = path.join(this.secretsPath, 'database.json');
      const appPath = path.join(this.secretsPath, 'app-config.json');

      if (!fs.existsSync(dbPath)) {
        throw new Error('Database credentials file not found');
      }

      if (!fs.existsSync(appPath)) {
        throw new Error('Application config file not found');
      }

      const dbData = fs.readFileSync(dbPath, 'utf8');
      const appData = fs.readFileSync(appPath, 'utf8');

      if (!dbData || dbData.length === 0) {
        throw new Error('Database credentials file is empty');
      }

      if (!appData || appData.length === 0) {
        throw new Error('Application config file is empty');
      }

      let parsedDbCredentials: unknown;
      let parsedAppConfig: unknown;

      try {
        parsedDbCredentials = JSON.parse(dbData);
      } catch (parseError) {
        this.logger.error('Failed to parse database credentials JSON');
        throw new Error('Database credentials file contains invalid JSON');
      }

      try {
        parsedAppConfig = JSON.parse(appData);
      } catch (parseError) {
        this.logger.error('Failed to parse application config JSON');
        throw new Error('Application config file contains invalid JSON');
      }

      this.dbCredentials = parsedDbCredentials as DatabaseCredentials;
      this.appConfig = parsedAppConfig as ApplicationConfig;

      this.validateSecrets();

      this.logger.log('Secrets loaded successfully from Vault Agent');
    } catch (error) {
      this.logger.error(`Failed to load secrets from Vault Agent: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw new Error('Secret initialization failed');
    }
  }

  private validateSecrets(): void {
    if (!this.dbCredentials?.POSTGRES_USER ||
        !this.dbCredentials?.POSTGRES_PASSWORD ||
        !this.dbCredentials?.POSTGRES_DB) {
      throw new Error('Invalid database credentials structure');
    }

    if (!this.appConfig?.DB_HOST ||
        !this.appConfig?.DB_PORT ||
        !this.appConfig?.NODE_ENV) {
      throw new Error('Invalid application config structure');
    }
  }

  private watchSecrets(): void {
    const dbPath = path.join(this.secretsPath, 'database.json');
    const appPath = path.join(this.secretsPath, 'app-config.json');

    this.watchers.push(
      this.createFileWatcher(dbPath, 'Database credentials'),
      this.createFileWatcher(appPath, 'Application config')
    );

    this.logger.log('Secret file watchers initialized');
  }

  private createFileWatcher(filePath: string, label: string): fs.FSWatcher {
    return fs.watch(filePath, (eventType) => {
      if (eventType === 'change') {
        this.logger.log(`${label} updated, reloading...`);
        this.loadSecrets().catch(() => {
          this.logger.error(`Failed to reload ${label.toLowerCase()}`);
        });
      }
    });
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
