import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type Suggestion = {
  id: number;
  createdAt: string;
  name: string | null;
  topics: string[];
  message: string;
};

type SuggestionRow = {
  id: number;
  created_at: string;
  name: string | null;
  topics: string;
  message: string;
};

export type Store = ReturnType<typeof openStore>;

export function openStore(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS suggestions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      name       TEXT,
      topics     TEXT    NOT NULL DEFAULT '[]',
      message    TEXT    NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const insertSuggestion = db.prepare(
    'INSERT INTO suggestions (name, topics, message) VALUES (?, ?, ?)',
  );
  const listSuggestions = db.prepare(
    'SELECT id, created_at, name, topics, message FROM suggestions ORDER BY id DESC',
  );
  const deleteSuggestion = db.prepare('DELETE FROM suggestions WHERE id = ?');
  const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
  const upsertSetting = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );

  const toSuggestion = (row: SuggestionRow): Suggestion => ({
    id: row.id,
    createdAt: row.created_at,
    name: row.name,
    topics: JSON.parse(row.topics) as string[],
    message: row.message,
  });

  return {
    addSuggestion(name: string | null, topics: string[], message: string) {
      insertSuggestion.run(name, JSON.stringify(topics), message);
    },
    listSuggestions(): Suggestion[] {
      return (listSuggestions.all() as SuggestionRow[]).map(toSuggestion);
    },
    deleteSuggestion(id: number): boolean {
      return deleteSuggestion.run(id).changes > 0;
    },
    getSetting(key: string): string | null {
      const row = getSetting.get(key) as { value: string } | undefined;
      return row?.value ?? null;
    },
    setSetting(key: string, value: string) {
      upsertSetting.run(key, value);
    },
  };
}
