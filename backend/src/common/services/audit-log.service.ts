import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuditLogService implements OnModuleInit {
  private readonly logger = new Logger('AUDIT');
  private readonly jsonOutput: boolean;

  constructor(private readonly configService: ConfigService) {
    this.jsonOutput = this.configService.get<string>('AUDIT_LOG_JSON') === 'true';
  }

  onModuleInit(): void {
    this.logAuditInitialization();
  }

  private formatLog(label: string, details: Record<string, unknown>): string {
    const { eventType, ...rest } = details;
    const typeValue = eventType ?? label;
    const timestamp = new Date().toISOString();

    if (this.jsonOutput) {
      return JSON.stringify({
        Type: typeValue,
        Timestamp: timestamp,
        ...rest,
      });
    }

    const detailStr = Object.entries(rest)
      .map(([k, v]) => {
        const value = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
        return `${k}: ${value}`;
      })
      .join(' | ');

    const typeStr = typeof typeValue === 'object' && typeValue !== null ? JSON.stringify(typeValue) : String(typeValue);
    return `${typeStr} | ${detailStr}`;
  }

  logUserAccess(userId: string, resource: string, action: string): void {
    this.logger.log(
      this.formatLog('USER_ACCESS', {
        UserID: userId,
        Resource: resource,
        Action: action,
      })
    );
  }

  logAuditAccess(userId: string, auditResource: string): void {
    this.logger.log(
      this.formatLog('AUDIT_ACCESS', {
        UserID: userId,
        AuditResource: auditResource,
      })
    );
  }

  logFailedAuthentication(identifier: string, reason: string): void {
    this.logger.warn(this.formatLog('AUTH_FAILED', { Identifier: identifier, Reason: reason }));
  }

  logSuccessfulAuthentication(userId: string, method: string): void {
    this.logger.log(this.formatLog('AUTH_SUCCESS', { UserID: userId, Method: method }));
  }

  logAuditInitialization(): void {
    this.logger.log(
      this.formatLog('AUDIT_INIT', {
        message: 'Audit logging system initialized',
      })
    );
  }

  logSystemChange(action: string, object: string, userId?: string): void {
    const userInfo = userId !== undefined && userId !== null && userId !== '' ? { UserID: userId } : { System: true };
    this.logger.log(
      this.formatLog('SYSTEM_CHANGE', {
        ...userInfo,
        Action: action,
        Object: object,
      })
    );
  }

  logSecurityEvent(event: { userId?: string; eventType: string; success: boolean; resource: string; ipAddress?: string }): void {
    const payload = {
      UserID: event.userId ?? null,
      Type: event.eventType,
      Success: event.success,
      Resource: event.resource,
      IP: event.ipAddress ?? null,
    };

    if (event.success) {
      this.logger.log(this.formatLog('SECURITY_EVENT', payload));
    } else {
      this.logger.warn(this.formatLog('SECURITY_EVENT', payload));
    }
  }
}
