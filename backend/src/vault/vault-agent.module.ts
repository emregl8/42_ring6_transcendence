import { Module, Global } from '@nestjs/common';
import { VaultFileService } from './vault-file.service';

@Global()
@Module({
  providers: [VaultFileService],
  exports: [VaultFileService],
})
export class VaultAgentModule {}
