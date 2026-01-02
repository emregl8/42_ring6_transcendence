export interface DatabaseCredentials {
  POSTGRES_USER: string;
  POSTGRES_PASSWORD: string;
  POSTGRES_DB: string;
}

export interface ApplicationConfig {
  DB_HOST: string;
  DB_PORT: string;
  NODE_ENV: string;
  ALLOWED_ORIGINS: string;
  DB_SSL_ENABLED: string;
  DB_SSL_REJECT_UNAUTHORIZED: string;
  DB_SSL_CA_PATH: string;
}
