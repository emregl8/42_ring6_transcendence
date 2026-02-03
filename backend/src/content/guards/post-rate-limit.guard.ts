import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { User } from '../../auth/entities/user.entity.js';
import { REDIS_KEYS, CACHE_TTL } from '../../redis/redis.constants.js';
import { RedisService } from '../../redis/redis.service.js';

@Injectable()
export class PostRateLimitGuard implements CanActivate {
  private readonly MAX_POSTS_PER_MINUTE = 5;

  constructor(private readonly redisService: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as User | undefined;
    if (user?.id === undefined) {
      return true;
    }
    const key = REDIS_KEYS.postRateLimit(user.id);
    const client = this.redisService.getClient();
    const currentCount = await client.incr(key);
    if (currentCount === 1) {
      await client.expire(key, CACHE_TTL.POST_LIMIT_WINDOW);
    }
    if (currentCount > this.MAX_POSTS_PER_MINUTE) {
      throw new HttpException('Too many posts created. Please wait a minute.', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
