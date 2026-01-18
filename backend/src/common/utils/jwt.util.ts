import { ConfigService } from '@nestjs/config';
export function validateAndGetJwtSecret(configService: ConfigService): string {
  const secret = configService.get<string>('app.JWT_SECRET');

  if (secret === undefined || secret === null || secret === '') {
    throw new Error('JWT_SECRET is not configured');
  }

  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters (256 bits)');
  }

  return secret;
}
