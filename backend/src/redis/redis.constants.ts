export const REDIS_KEYS = {
  userCache: (id: string) => `user:${id}`,
  refreshToken: (hash: string) => `refresh:${hash}`,
  rateLimitCount: (id: string) => `ratelimit:count:${id}`,
  rateLimitLock: (id: string) => `ratelimit:lock:${id}`,
  postRateLimit: (id: string) => `post:limit:${id}`,
} as const;

export const CACHE_TTL = {
  USER: 3600,
  RATELIMIT_WINDOW: 300,
  RATELIMIT_LOCKOUT: 1800,
  POST_LIMIT_WINDOW: 60,
} as const;
