import { createHash } from 'node:crypto';
import * as net from 'node:net';
import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { REDIS_KEYS, CACHE_TTL } from '../../redis/redis.constants';
import { RedisService } from '../../redis/redis.service';
import { extractClientIp, extractUserAgent } from '../utils/client-info.util';
import { isDefined } from '../utils/validation.util';

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RateLimitMiddleware.name);
  private readonly MAX_ATTEMPTS = 6;

  constructor(private readonly redisService: RedisService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    const identifier = this.getIdentifier(req);
    const client = this.redisService.getClient();

    const lockKey = REDIS_KEYS.rateLimitLock(identifier);
    const countKey = REDIS_KEYS.rateLimitCount(identifier);

    const lockedUntil = await client.get(lockKey);
    if (isDefined(lockedUntil)) {
      const remainingSeconds = await client.ttl(lockKey);
      this.logger.warn(`Blocked authentication attempt for locked account: ${identifier}`);
      return res.status(429).json({
        error: 'Too many failed attempts',
        message: `Account temporarily locked. Try again in ${Math.ceil(remainingSeconds / 60)} minutes.`,
      });
    }

    this.trackAttempt(res, identifier, countKey, lockKey);
    next();
  }

  private getIdentifier(req: Request): string {
    let ip = extractClientIp(req);
    if (ip.startsWith('::ffff:')) {
      ip = ip.split(':').pop() ?? ip;
    }
    if (ip === '' || net.isIP(ip) === 0) {
      ip = 'unknown';
    }

    const body = req.body as Record<string, unknown> | undefined;
    let user = '';

    if (isDefined(body)) {
      if (typeof body.username === 'string') {
        user = body.username;
      } else if (typeof body.email === 'string') {
        user = body.email;
      } else if (typeof body.login === 'string') {
        user = body.login;
      }
    }

    return createHash('sha256')
      .update(`${ip}|${extractUserAgent(req)}|${user}`)
      .digest('hex');
  }

  private trackAttempt(res: Response, identifier: string, countKey: string, lockKey: string): void {
    res.on('finish', () => {
      void (async () => {
        const status = res.statusCode;
        const failed = String(res.getHeader('x-auth-failed') ?? '');
        const client = this.redisService.getClient();

        if (status === 401 || failed === '1') {
          const count = await client.incr(countKey);
          if (count === 1) {
            await client.expire(countKey, CACHE_TTL.RATELIMIT_WINDOW);
          }
          if (count >= this.MAX_ATTEMPTS) {
            await client.set(lockKey, '1', 'EX', CACHE_TTL.RATELIMIT_LOCKOUT);
            await client.del(countKey);
            this.logger.warn(`Account locked after ${this.MAX_ATTEMPTS} failed attempts: ${identifier}`);
          }
        } else if (status === 200) {
          await client.del(countKey);
        }
      })();
    });
  }
}
