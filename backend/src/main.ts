import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/http-exception.filter.js';
import { parseAllowedOrigins } from './common/utils/origin.util.js';

async function bootstrap(): Promise<void> {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const app = await NestFactory.create(AppModule, {
    logger: isDevelopment ? ['error', 'warn', 'log', 'debug', 'verbose'] : ['error', 'warn', 'log'],
  });

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);

  app.use(cookieParser());

  const exceptionFilter = app.get(AllExceptionsFilter);
  app.useGlobalFilters(exceptionFilter);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: false,
      },
      disableErrorMessages: !isDevelopment,
      stopAtFirstError: true,
    })
  );

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https://cdn.intra.42.fr', 'https://profile.intra.42.fr'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      frameguard: { action: 'deny' },
      noSniff: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      dnsPrefetchControl: { allow: false },
      ieNoOpen: true,
      hidePoweredBy: true,
      permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    })
  );

  const configService = app.get(ConfigService);
  const allowedOrigins = parseAllowedOrigins(configService.get<string>('app.ALLOWED_ORIGINS'));

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 3600,
  });

  app.setGlobalPrefix('api', {
    exclude: ['health', 'metrics'],
  });

  const portEnv = process.env.PORT;
  const port = portEnv !== undefined && portEnv !== '' ? Number(portEnv) : 3000;
  await app.listen(port);
}

try {
  await bootstrap();
} catch (error) {
  console.error('Fatal error during bootstrap:', error);
  process.exit(1);
}
