import { createHash } from 'crypto';
import * as net from 'net';
import { Injectable, NestMiddleware, Logger, OnModuleDestroy } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { extractClientIp, extractUserAgent } from '../utils/client-info.util';

interface RateLimitRecord {
  count: number;
  lockUntil: number;
  firstAttempt: number;
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware, OnModuleDestroy {
  private readonly logger = new Logger(RateLimitMiddleware.name);
  private readonly attempts = new Map<string, RateLimitRecord>();
  private readonly MAX_ATTEMPTS = 6;
  private readonly LOCKOUT_DURATION = 30 * 60 * 1000;
  private readonly WINDOW = 5 * 60 * 1000;
  private readonly MAX_ENTRIES = 10000;
  private cleanupInterval?: NodeJS.Timeout;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanupOldEntries(), this.WINDOW);
  }

  use(req: Request, res: Response, next: NextFunction): void | Response {
    const identifier = this.getIdentifier(req);
    const now = Date.now();

    this.enforceMaxEntries();

    const record = this.attempts.get(identifier);

    if (record !== undefined && record.lockUntil > now) {
      const remainingMinutes = Math.ceil((record.lockUntil - now) / 60000);
      this.logger.warn(`Blocked authentication attempt for locked account`);
      return res.status(429).json({
        error: 'Too many failed attempts',
        message: `Account temporarily locked. Try again in ${remainingMinutes} minutes.`,
      });
    }

    if (record !== undefined && record.lockUntil <= now && record.lockUntil > 0) {
      this.attempts.delete(identifier);
    }

    if (record !== undefined && now - record.firstAttempt > this.WINDOW) {
      this.attempts.delete(identifier);
    }

    this.trackAttempt(res, identifier);
    next();
  }

  private getIdentifier(req: Request): string {
    let ipCandidate = extractClientIp(req);

    if (ipCandidate.startsWith('::ffff:')) {
      ipCandidate = ipCandidate.split(':').pop() ?? ipCandidate;
    }

    if (ipCandidate === '' || net.isIP(ipCandidate) === 0) {
      ipCandidate = 'unknown';
    }

    const ua = extractUserAgent(req);

    const body = req.body as Record<string, unknown> | undefined;

    let usernameField: unknown = null;
    if (body !== undefined && body !== null) {
      if (body.username !== undefined && body.username !== null) usernameField = body.username;
      else if (body.email !== undefined && body.email !== null) usernameField = body.email;
      else if (body.login !== undefined && body.login !== null) usernameField = body.login;
    }

    const username = usernameField !== null ? String(usernameField) : '';

    const raw = `${ipCandidate}|${ua}|${username}`;
    return createHash('sha256').update(raw).digest('hex');
  }

  private trackAttempt(res: Response, identifier: string): void {
    res.on('finish', () => {
      const status = res.statusCode;
      const authFailedHeader = String(res.getHeader('x-auth-failed') ?? '');

      if (status === 401 || authFailedHeader === '1') {
        this.recordFailedAttempt(identifier);
      } else if (status === 200) {
        this.attempts.delete(identifier);
      }
    });
  }

  private recordFailedAttempt(identifier: string): void {
    const now = Date.now();
    const record = this.attempts.get(identifier);

    if (record === undefined) {
      this.attempts.set(identifier, {
        count: 1,
        lockUntil: 0,
        firstAttempt: now,
      });
      return;
    }

    record.count += 1;
    if (record.count >= this.MAX_ATTEMPTS) {
      record.lockUntil = now + this.LOCKOUT_DURATION;
      this.logger.warn(`Account locked after ${this.MAX_ATTEMPTS} failed attempts`);
    }
  }

  private enforceMaxEntries(): void {
    if (this.attempts.size <= this.MAX_ENTRIES) return;

    const now = Date.now();
    for (const [identifier, record] of this.attempts) {
      if ((record.lockUntil > 0 && record.lockUntil < now) || now - record.firstAttempt > this.WINDOW) {
        this.attempts.delete(identifier);
      }
    }

    if (this.attempts.size > this.MAX_ENTRIES) {
      const oldestEntries = Array.from(this.attempts.entries())
        .sort((a, b) => a[1].firstAttempt - b[1].firstAttempt)
        .slice(0, Math.floor(this.MAX_ENTRIES * 0.2));

      oldestEntries.forEach(([id]) => this.attempts.delete(id));
      this.logger.warn(`Rate limit cache exceeded maximum size, purged ${oldestEntries.length} oldest entries`);
    }
  }

  private cleanupOldEntries(): void {
    const now = Date.now();
    let deletedCount = 0;

    for (const [identifier, record] of this.attempts) {
      if ((record.lockUntil > 0 && record.lockUntil < now - this.WINDOW) || (now - record.firstAttempt > this.WINDOW && record.lockUntil === 0)) {
        this.attempts.delete(identifier);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      this.logger.debug(`Cleaned up ${deletedCount} expired rate limit entries`);
    }
  }

  onModuleDestroy(): void {
    if (this.cleanupInterval !== undefined) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }
}
