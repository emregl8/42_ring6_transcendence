import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { isNotNullOrEmpty } from '../utils/validation.util.js';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const isDevelopment = process.env.NODE_ENV === 'development';

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = exception instanceof HttpException ? exception.message : 'Internal server error';

    const errorResponse = isDevelopment
      ? this.getDevelopmentErrorResponse(status, request, exception, message)
      : this.getProductionErrorResponse(status);

    const sanitizedUrl = this.sanitizeUrl(request.url);

    this.logger.error(`${request.method} ${sanitizedUrl} - Status: ${status} - ${message}`);

    response.status(status).json(errorResponse);
  }

  private getProductionErrorResponse(status: number): { statusCode: number; message: string } {
    const errorMessages = new Map([
      [400, 'Bad request'],
      [401, 'Unauthorized'],
      [403, 'Forbidden'],
      [404, 'Resource not found'],
      [429, 'Too many requests'],
      [500, 'Internal server error'],
      [503, 'Service unavailable'],
    ]);

    const errorMessage = errorMessages.get(status);
    return {
      statusCode: status,
      message: errorMessage ?? 'An error occurred',
    };
  }

  private getDevelopmentErrorResponse(
    status: number,
    request: Request,
    exception: unknown,
    message: string
  ): {
    statusCode: number;
    timestamp: string;
    path: string;
    method: string;
    message: string;
    stack?: string;
  } {
    let stack: string | undefined;

    if (exception instanceof Error && typeof exception.stack === 'string' && exception.stack !== '') {
      stack = exception.stack.split('\n').slice(0, 10).join('\n');
    }

    return {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: this.sanitizeUrl(request.url),
      method: request.method,
      message: exception instanceof Error ? exception.message : message,
      ...(isNotNullOrEmpty(stack) && { stack }),
    };
  }

  private sanitizeUrl(url: string): string {
    const urlObj = new URL(url, 'http://localhost');

    const sensitiveParams = ['token', 'password', 'secret', 'key', 'api_key', 'apiKey'];

    sensitiveParams.forEach((param) => {
      if (urlObj.searchParams.has(param)) {
        urlObj.searchParams.set(param, '[REDACTED]');
      }
    });

    return urlObj.pathname + urlObj.search;
  }
}
