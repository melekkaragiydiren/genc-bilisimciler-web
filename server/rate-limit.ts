import type { NextFunction, Request, Response } from 'express';

/** Basit, bellek içi, IP başına kayan pencere sınırlayıcı. Tek sunucu için yeterli. */
export function rateLimit({ windowMs, max, message }: { windowMs: number; max: number; message: string }) {
  const hits = new Map<string, number[]>();

  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, times] of hits) {
      const fresh = times.filter((t) => t > cutoff);
      if (fresh.length) hits.set(key, fresh);
      else hits.delete(key);
    }
  }, windowMs).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const times = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
    if (times.length >= max) {
      res.setHeader('Retry-After', Math.ceil((times[0] + windowMs - now) / 1000));
      res.status(429).json({ error: message });
      return;
    }
    times.push(now);
    hits.set(key, times);
    next();
  };
}
