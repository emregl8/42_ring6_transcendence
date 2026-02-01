import { randomBytes } from 'node:crypto';
import { Injectable, NestMiddleware, ForbiddenException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const tokenKey = 'XSRF-TOKEN';
    let token = req.cookies['XSRF-TOKEN'];
    if (token === undefined || token === null) {
      token = randomBytes(16).toString('hex');
      res.cookie(tokenKey, token, {
        httpOnly: false,
        secure: true,
        sameSite: 'lax',
        path: '/',
      });
    }
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const headerVal = req.headers['x-xsrf-token'];
      const headerToken = Array.isArray(headerVal) ? headerVal[0] : headerVal;
      if (headerToken === undefined || headerToken !== token) {
        throw new ForbiddenException('Invalid or missing CSRF token');
      }
    }
    next();
  }
}
