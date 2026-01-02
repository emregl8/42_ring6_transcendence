import { Injectable } from '@nestjs/common';
import { DatabaseCredentials, ApplicationConfig } from '../interfaces/vault-secrets.interface';

@Injectable()
export class VaultValidatorService {
  validateDatabaseCredentials(credentials: DatabaseCredentials): void {
    if (!credentials?.POSTGRES_USER ||
        !credentials?.POSTGRES_PASSWORD ||
        !credentials?.POSTGRES_DB) {
      throw new Error('Invalid database credentials structure');
    }
  }

  validateApplicationConfig(config: ApplicationConfig): void {
    if (!config?.DB_HOST ||
        !config?.DB_PORT ||
        !config?.NODE_ENV ||
        !config?.DB_SSL_ENABLED ||
        !config?.DB_SSL_REJECT_UNAUTHORIZED ||
        !config?.DB_SSL_CA_PATH) {
      throw new Error('Invalid application config structure');
    }
  }
}
