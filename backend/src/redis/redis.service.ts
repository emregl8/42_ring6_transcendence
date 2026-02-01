import * as fs from 'node:fs';
import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import ioredis from 'ioredis';
import { isNullOrEmpty } from '../common/utils/validation.util';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly redisClient: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('app.REDIS_HOST');
    const port = this.configService.get<number>('app.REDIS_PORT');
    const password = this.configService.get<string>('app.REDIS_PASSWORD');
    const tlsEnabled = this.configService.get<boolean>('app.REDIS_TLS_ENABLED');
    const tlsCaPath = this.configService.get<string>('app.REDIS_TLS_CA_PATH');

    if (isNullOrEmpty(password)) {
      throw new Error('REDIS_PASSWORD must be configured');
    }

    const tlsOptions = this.buildTlsOptions(tlsEnabled, tlsCaPath);

    this.redisClient = new ioredis({
      host: isNullOrEmpty(host) ? 'localhost' : host,
      port: port !== undefined && port !== 0 ? port : 6379,
      password,
      tls: tlsOptions,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      reconnectOnError: (err) => {
        this.logger.error(`Redis reconnect on error: ${err.message}`);
        return true;
      },
    });

    this.redisClient.on('connect', () => this.logger.log('Connected to Redis (TLS enabled)'));
    this.redisClient.on('error', (err) => this.logger.error(`Redis error: ${err.message}`));
  }

  private buildTlsOptions(tlsEnabled: boolean | undefined, tlsCaPath: string | undefined): object | undefined {
    if (tlsEnabled !== true) {
      throw new Error('REDIS_TLS_ENABLED must be true - unencrypted Redis connections are not allowed');
    }

    const options: { rejectUnauthorized: boolean; ca?: Buffer } = {
      rejectUnauthorized: true,
    };

    if (!isNullOrEmpty(tlsCaPath) && fs.existsSync(tlsCaPath)) {
      options.ca = fs.readFileSync(tlsCaPath);
    }

    return options;
  }

  getClient(): Redis {
    return this.redisClient;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds !== undefined && ttlSeconds !== 0) {
      await this.redisClient.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.redisClient.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.redisClient.get(key);
  }

  async del(key: string): Promise<void> {
    await this.redisClient.del(key);
  }

  onModuleDestroy(): void {
    this.redisClient.disconnect();
  }
}
