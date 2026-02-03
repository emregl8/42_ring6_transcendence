import { Global, Module } from '@nestjs/common';
import { AuditLogService } from './services/audit-log.service.js';

@Global()
@Module({
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class CommonModule {}
