import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const SESSION_COOKIE = 'gbt_admin';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function createAuth(adminPassword: string | undefined, sessionSecret: string | undefined) {
  const secret = sessionSecret || randomBytes(32).toString('hex');
  const passwordDigest = adminPassword ? sha256(adminPassword) : null;

  const sign = (payload: string) => createHmac('sha256', secret).update(payload).digest('base64url');

  function issueToken(): string {
    const payload = String(Date.now() + SESSION_TTL_MS);
    return `${payload}.${sign(payload)}`;
  }

  function verifyToken(token: string | undefined): boolean {
    if (!token) return false;
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return false;
    if (!safeEqual(Buffer.from(signature), Buffer.from(sign(payload)))) return false;
    return Number(payload) > Date.now();
  }

  return {
    enabled: passwordDigest !== null,

    checkPassword(candidate: unknown): boolean {
      if (!passwordDigest || typeof candidate !== 'string') return false;
      return safeEqual(sha256(candidate), passwordDigest);
    },

    startSession(req: Request, res: Response) {
      res.cookie(SESSION_COOKIE, issueToken(), {
        httpOnly: true,
        sameSite: 'strict',
        secure: req.secure,
        path: '/api/admin',
        maxAge: SESSION_TTL_MS,
      });
    },

    endSession(res: Response) {
      res.clearCookie(SESSION_COOKIE, { path: '/api/admin' });
    },

    isAuthenticated(req: Request): boolean {
      return verifyToken(readCookie(req, SESSION_COOKIE));
    },

    requireAdmin(req: Request, res: Response, next: NextFunction) {
      if (verifyToken(readCookie(req, SESSION_COOKIE))) return next();
      res.status(401).json({ error: 'Oturum gerekli.' });
    },
  };
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq !== -1 && part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}
