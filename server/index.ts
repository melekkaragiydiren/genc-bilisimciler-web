import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import { LIMITS, TOPICS } from '../src/shared/topics.ts';
import { createAuth } from './auth.ts';
import { openStore } from './db.ts';
import { rateLimit } from './rate-limit.ts';

const PORT = Number(process.env.PORT ?? 3001);
const DIST_DIR = resolve(import.meta.dirname, '../dist');
const MEMBERSHIP_URL_KEY = 'membershipUrl';

const adminPassword = process.env.ADMIN_PASSWORD;
if (!adminPassword) {
  console.warn('[uyarı] ADMIN_PASSWORD tanımlı değil — admin paneli girişi kapalı.');
} else if (adminPassword.length < 12) {
  console.error('[hata] ADMIN_PASSWORD en az 12 karakter olmalı.');
  process.exit(1);
}

const store = openStore(process.env.DATABASE_PATH ?? resolve(import.meta.dirname, '../data/gbt.sqlite'));
const auth = createAuth(adminPassword, process.env.SESSION_SECRET);

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  );
  next();
});

app.use('/api', express.json({ limit: '8kb' }));
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// ── Herkese açık uçlar ──────────────────────────────────────────────

app.get('/api/config', (_req, res) => {
  res.json({ membershipUrl: store.getSetting(MEMBERSHIP_URL_KEY) ?? '' });
});

app.post(
  '/api/suggestions',
  // Stantta herkes aynı kampüs Wi-Fi'ı (tek IP) üzerinden gelebilir; limit bu yüzden cömert tutuldu.
  rateLimit({ windowMs: 10 * 60_000, max: 40, message: 'Çok fazla gönderim yaptınız, biraz sonra tekrar deneyin.' }),
  (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;

    // Bal küpü alanı: gerçek kullanıcılar bu gizli alanı görmez, botlar doldurur.
    if (typeof body.website === 'string' && body.website.trim() !== '') {
      res.status(201).json({ ok: true });
      return;
    }

    const name = typeof body.name === 'string' ? body.name.trim().slice(0, LIMITS.name) : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const topics = Array.isArray(body.topics)
      ? [...new Set(body.topics.filter((t): t is string => (TOPICS as readonly string[]).includes(t as string)))]
      : [];

    if (message.length > LIMITS.message) {
      res.status(400).json({ error: `Mesaj en fazla ${LIMITS.message} karakter olabilir.` });
      return;
    }
    if (topics.length === 0 && message.length < 3) {
      res.status(400).json({ error: 'Lütfen bir konu seçin ya da birkaç kelime yazın.' });
      return;
    }

    store.addSuggestion(name || null, topics, message);
    res.status(201).json({ ok: true });
  },
);

// ── Admin uçları ────────────────────────────────────────────────────

app.post(
  '/api/admin/login',
  rateLimit({ windowMs: 15 * 60_000, max: 10, message: 'Çok fazla deneme. 15 dakika sonra tekrar deneyin.' }),
  (req, res) => {
    if (!auth.enabled) {
      res.status(503).json({ error: 'Admin girişi yapılandırılmamış (ADMIN_PASSWORD).' });
      return;
    }
    if (!auth.checkPassword((req.body as Record<string, unknown> | undefined)?.password)) {
      res.status(401).json({ error: 'Şifre hatalı.' });
      return;
    }
    auth.startSession(req, res);
    res.json({ ok: true });
  },
);

app.post('/api/admin/logout', (_req, res) => {
  auth.endSession(res);
  res.json({ ok: true });
});

app.get('/api/admin/me', (req, res) => {
  res.json({ authenticated: auth.isAuthenticated(req), enabled: auth.enabled });
});

app.get('/api/admin/suggestions', auth.requireAdmin, (_req, res) => {
  res.json({ suggestions: store.listSuggestions() });
});

app.get('/api/admin/suggestions.csv', auth.requireAdmin, (_req, res) => {
  const rows = store.listSuggestions();
  const cell = (value: string) => {
    // Excel formül enjeksiyonunu önlemek için =,+,-,@ ile başlayan hücrelerin önüne ' eklenir.
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const lines = [
    ['Tarih', 'İsim', 'Konular', 'Mesaj'].map(cell).join(';'),
    ...rows.map((r) => [r.createdAt, r.name ?? '', r.topics.join(', '), r.message].map(cell).join(';')),
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="oneriler.csv"');
  res.send('﻿' + lines.join('\r\n'));
});

app.delete('/api/admin/suggestions/:id', auth.requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !store.deleteSuggestion(id)) {
    res.status(404).json({ error: 'Kayıt bulunamadı.' });
    return;
  }
  res.json({ ok: true });
});

app.get('/api/admin/settings', auth.requireAdmin, (_req, res) => {
  res.json({ membershipUrl: store.getSetting(MEMBERSHIP_URL_KEY) ?? '' });
});

app.put('/api/admin/settings', auth.requireAdmin, (req, res) => {
  const raw = (req.body as Record<string, unknown> | undefined)?.membershipUrl;
  const url = typeof raw === 'string' ? raw.trim() : '';
  if (url !== '') {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      res.status(400).json({ error: 'Geçerli bir bağlantı girin.' });
      return;
    }
    if (parsed.protocol !== 'https:') {
      res.status(400).json({ error: 'Bağlantı https:// ile başlamalı.' });
      return;
    }
  }
  store.setSetting(MEMBERSHIP_URL_KEY, url);
  res.json({ membershipUrl: url });
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Bulunamadı.' });
});

// ── Derlenmiş site (production) ─────────────────────────────────────

if (existsSync(DIST_DIR)) {
  app.use(
    '/assets',
    express.static(resolve(DIST_DIR, 'assets'), { immutable: true, maxAge: '1y' }),
  );
  app.use(express.static(DIST_DIR, { maxAge: '1h' }));
}

app.listen(PORT, () => {
  console.log(`GBT sunucusu http://localhost:${PORT} adresinde çalışıyor`);
});
