import type { NextFunction, Request, Response } from 'express';

/**
 * Bellek içi, IP başına sabit pencereli sınırlayıcı. Her istek O(1): IP başına yalnızca bir sayaç
 * ve pencere başlangıcı tutulur, yani saldırı altında bile istek başı maliyet sabit kalır.
 * Tek sunucu için yeterli; birden fazla sunucuya geçilirse Redis gibi ortak bir depo gerekir.
 */
export function rateLimit({ windowMs, max, message }: { windowMs: number; max: number; message: string }) {
  const hits = new Map<string, { start: number; count: number }>();

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (now - entry.start >= windowMs) hits.delete(key);
  }, windowMs).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || now - entry.start >= windowMs) {
      entry = { start: now, count: 0 };
      hits.set(key, entry);
    }
    if (entry.count >= max) {
      res.setHeader('Retry-After', Math.ceil((entry.start + windowMs - now) / 1000));
      res.status(429).json({ error: message });
      return;
    }
    entry.count++;
    next();
  };
}
