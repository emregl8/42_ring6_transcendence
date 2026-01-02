import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseCredentials, ApplicationConfig } from '../interfaces/vault-secrets.interface';

export interface SecretFiles {
  dbCredentials: DatabaseCredentials;
  appConfig: ApplicationConfig;
}

@Injectable()
export class VaultFileReaderService {
  private readonly logger = new Logger(VaultFileReaderService.name);

  readSecretFiles(secretsPath: string): SecretFiles {
    this.validateSecretPath(secretsPath);
    
    const dbPath = path.join(secretsPath, 'database.json');
    const appPath = path.join(secretsPath, 'app-config.json');

    this.validateFileExists(dbPath, 'Database credentials');
    this.validateFileExists(appPath, 'Application config');

    const dbData = this.readFile(dbPath, 'Database credentials');
    const appData = this.readFile(appPath, 'Application config');

    return {
      dbCredentials: this.parseJson<DatabaseCredentials>(dbData, 'Database credentials'),
      appConfig: this.parseJson<ApplicationConfig>(appData, 'Application config'),
    };
  }

  private validateFileExists(filePath: string, label: string): void {
    if (!fs.existsSync(filePath)) {
      throw new Error(`${label} file not found`);
    }
  }

  private readFile(filePath: string, label: string): string {
    const data = fs.readFileSync(filePath, 'utf8');
    
    if (!data || data.length === 0) {
      throw new Error(`${label} file is empty`);
    }

    return data;
  }

  private parseJson<T>(data: string, label: string): T {
    try {
      return JSON.parse(data) as T;
    } catch (parseError) {
      this.logger.error(`Failed to parse ${label} JSON`);
      throw new Error(`${label} file contains invalid JSON`);
    }
  }

  private validateSecretPath(secretsPath: string): void {
    if (!secretsPath || typeof secretsPath !== 'string') {
      throw new Error('Invalid secrets path');
    }

    if (secretsPath.includes('..') || !path.isAbsolute(secretsPath)) {
      throw new Error('Invalid secrets path: must be absolute and cannot contain ..');
    }
  }
}
