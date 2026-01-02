import { Module, Global } from '@nestjs/common';
import { VaultFileService } from './vault-file.service';
import { VaultFileReaderService } from './services/vault-file-reader.service';
import { VaultValidatorService } from './services/vault-validator.service';
import { VaultFileWatcherService } from './services/vault-file-watcher.service';

@Global()
@Module({
  providers: [
    VaultFileService,
    VaultFileReaderService,
    VaultValidatorService,
    VaultFileWatcherService,
  ],
  exports: [VaultFileService],
})
export class VaultAgentModule {}
