import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const ipBuckets = new Map<string, RateLimitRecord>();

/**
 * Creates an in-memory sliding-window rate limiter middleware.
 * @param windowMs Window duration in milliseconds (e.g. 60,000 for 1 minute)
 * @param maxRequests Maximum allowed requests per window
 * @param message Optional custom error message
 */
export function rateLimiter(windowMs: number = 60000, maxRequests: number = 100, message: string = 'Too many requests, please try again later.') {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Identify client by IP (or forwarded-for)
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';
    const key = `${req.baseUrl || req.path}:${clientIp}`;
    const now = Date.now();

    let record = ipBuckets.get(key);

    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs
      };
      ipBuckets.set(key, record);
    } else {
      record.count++;
    }

    const remaining = Math.max(0, maxRequests - record.count);
    const resetSeconds = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetSeconds);

    if (record.count > maxRequests) {
      res.setHeader('Retry-After', resetSeconds);
      res.status(429).json({
        error: 'Too Many Requests',
        message,
        retryAfterSeconds: resetSeconds
      });
      return;
    }

    next();
  };
}

// Clean up stale buckets every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of ipBuckets.entries()) {
    if (now > record.resetTime) {
      ipBuckets.delete(key);
    }
  }
}, 300000).unref();
