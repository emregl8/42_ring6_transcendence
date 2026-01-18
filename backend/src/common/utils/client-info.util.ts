import { Request } from 'express';

export function extractClientIp(req: Request): string {
  const xForwardedFor = req.get('x-forwarded-for');

  if (xForwardedFor !== undefined && xForwardedFor.length > 0) {
    const firstIp = xForwardedFor.split(',')[0].trim();
    if (firstIp !== '' && firstIp.length > 0) {
      return firstIp;
    }
  }

  return req.socket.remoteAddress ?? 'unknown';
}

export function extractUserAgent(req: Request): string {
  return req.get('user-agent') ?? '';
}
