import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class VaultFileWatcherService implements OnModuleDestroy {
  private readonly logger = new Logger(VaultFileWatcherService.name);
  private watchers: fs.FSWatcher[] = [];

  startWatching(secretsPath: string, onReload: () => Promise<void>): void {
    const dbPath = path.join(secretsPath, 'database.json');
    const appPath = path.join(secretsPath, 'app-config.json');

    this.watchers.push(
      this.createFileWatcher(dbPath, 'Database credentials', onReload),
      this.createFileWatcher(appPath, 'Application config', onReload)
    );

    this.logger.log('Secret file watchers initialized');
  }

  onModuleDestroy(): void {
    this.watchers.forEach(watcher => watcher.close());
  }

  private createFileWatcher(filePath: string, label: string, onReload: () => Promise<void>): fs.FSWatcher {
    return fs.watch(filePath, (eventType) => {
      if (eventType === 'change') {
        this.logger.log(`${label} updated, reloading...`);
        onReload().catch(() => {
          this.logger.error(`Failed to reload ${label.toLowerCase()}`);
        });
      }
    });
  }
}
