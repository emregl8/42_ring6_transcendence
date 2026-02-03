import { Controller, Get, HttpStatus, HttpException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RedisService } from '../redis/redis.service.js';
import { HealthCheckResult, HealthCheckResponse } from './interfaces/health-check-result.interface.js';

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService
  ) {}

  @Get()
  async check(): Promise<HealthCheckResponse> {
    const isDevelopment = process.env.NODE_ENV === 'development';
    const results: HealthCheckResult[] = [];

    const dbResult = await this.checkDatabase();
    results.push(dbResult);

    const vaultResult = await this.checkVault();
    results.push(vaultResult);

    const redisResult = await this.checkRedis();
    results.push(redisResult);

    const allHealthy = results.every((r) => r.status === 'ok');

    if (allHealthy === false) {
      this.logger.error({
        message: 'Health check failed',
        service: 'health-check',
        type: 'HEALTH_CHECK_FAILURE',
        services: results.filter((r) => r.status === 'unhealthy').map((r) => r.service),
        timestamp: new Date().toISOString(),
      });

      throw new HttpException(isDevelopment ? { status: 'unhealthy', details: results } : { status: 'unhealthy' }, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return isDevelopment ? { status: 'ok', details: results } : { status: 'ok' };
  }

  private async checkRedis(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      const client = this.redisService.getClient();
      const pong = await client.ping();

      if (pong !== 'PONG') {
        throw new Error('Redis ping failed');
      }

      return {
        service: 'redis',
        status: 'ok',
        latency: Date.now() - startTime,
      };
    } catch (error) {
      const isDevelopment = process.env.NODE_ENV === 'development';
      const errorMessage = error instanceof Error ? error.message : 'Redis unavailable';

      this.logger.error({
        message: 'Redis health check failed',
        service: 'redis',
        type: 'REDIS_HEALTH_CHECK_FAILURE',
        latency: Date.now() - startTime,
        error: errorMessage,
      });

      return {
        service: 'redis',
        status: 'unhealthy',
        error: isDevelopment ? errorMessage : 'Redis unavailable',
      };
    }
  }

  private async checkDatabase(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const timeoutMs = 5000;

    try {
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

      await Promise.race([
        this.dataSource.query('SELECT 1'),
        new Promise((_, reject) => {
          const onAbort = (): void => {
            abortController.signal.removeEventListener('abort', onAbort);
            reject(new Error('Database health check timeout'));
          };
          abortController.signal.addEventListener('abort', onAbort);
        }),
      ]);

      clearTimeout(timeoutId);

      return {
        service: 'database',
        status: 'ok',
        latency: Date.now() - startTime,
      };
    } catch (error) {
      const errorType = error instanceof Error ? error.constructor.name : 'UnknownError';
      const errorMessage = error instanceof Error ? error.message : 'Database check failed';

      this.logger.error({
        message: 'Database health check failed',
        service: 'database',
        type: 'DATABASE_HEALTH_CHECK_FAILURE',
        errorType,
        latency: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      });

      const isDevelopment = process.env.NODE_ENV === 'development';
      return {
        service: 'database',
        status: 'unhealthy',
        error: isDevelopment ? errorMessage : 'Database unavailable',
      };
    }
  }

  private async checkVault(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const timeoutMs = 3000;

    try {
      const start = Date.now();
      const db = this.configService.get('db');
      const app = this.configService.get('app');

      if (db === undefined || app === undefined) {
        throw new Error('Vault-derived configuration missing');
      }

      const latency = Date.now() - start;
      if (latency > timeoutMs) {
        throw new Error('Vault health check timeout');
      }

      return {
        service: 'vault',
        status: 'ok',
        latency: Date.now() - startTime,
      };
    } catch (error) {
      const isDevelopment = process.env.NODE_ENV === 'development';
      const errorType = error instanceof Error ? error.constructor.name : 'UnknownError';
      const errorMessage = error instanceof Error ? error.message : 'Vault check failed';

      this.logger.error({
        message: 'Vault health check failed',
        service: 'vault',
        type: 'VAULT_HEALTH_CHECK_FAILURE',
        errorType,
        latency: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      });

      return {
        service: 'vault',
        status: 'unhealthy',
        error: isDevelopment ? errorMessage : 'Vault unavailable',
      };
    }
  }
}
