export interface DatabaseCredentials {
  POSTGRES_USER: string;
  POSTGRES_PASSWORD: string;
  POSTGRES_DB: string;
}

export interface ApplicationConfig {
  DB_HOST: string;
  DB_PORT: number;
  NODE_ENV: 'production' | 'development';

  DB_SSL_ENABLED: boolean;
  DB_SSL_REJECT_UNAUTHORIZED: boolean;
  DB_SSL_CA_PATH?: string;

  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;

  REFRESH_TOKEN_PEPPER: string;
  REFRESH_TOKEN_TTL_DAYS?: number;

  OAUTH_42_CLIENT_ID: string;
  OAUTH_42_CLIENT_SECRET: string;
  OAUTH_42_CALLBACK_URL: string;
  ALLOWED_ORIGINS: string;

  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD: string;
  REDIS_TLS_ENABLED: boolean;
  REDIS_TLS_CA_PATH?: string;
}
