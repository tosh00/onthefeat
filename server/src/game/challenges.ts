import { randomBytes } from 'node:crypto';
import type { Artist, Challenge, DailyEntry, PathStep } from '@onthefeat/shared';
import { getDb } from '../cache.ts';
import { normName } from '../deezer/normalize.ts';
import { SEED_ARTISTS } from '../data/seed-artists.ts';
import { generateFamousPair, generatePair, hashSeed, rng } from './generator.ts';
import { shortestPath } from './graph.ts';

interface Stored {
  start: Artist;
  target: Artist;
  path: PathStep[] | null;
}

export function today(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
}

export const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

function readDaily(date: string): (Stored & { source: DailyEntry['source'] }) | null {
  const row = getDb().prepare('SELECT data, source FROM daily_challenges WHERE date = ?').get(date) as
    | { data: string; source: DailyEntry['source'] }
    | undefined;
  return row ? { ...(JSON.parse(row.data) as Stored), source: row.source } : null;
}

function writeDaily(date: string, data: Stored, source: DailyEntry['source']): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO daily_challenges (date, data, source) VALUES (?, ?, ?)')
    .run(date, JSON.stringify(data), source);
}

const pending = new Map<string, Promise<Stored | null>>();

/** Wyzwanie dnia: wpis admina, a w jego braku para znanych wykonawców bez bezpośredniego połączenia (ziarno = data). */
async function ensureDaily(date: string): Promise<Stored | null> {
  const existing = readDaily(date);
  if (existing) return existing;
  if (!pending.has(date)) {
    pending.set(
      date,
      (async () => {
        const pair = await generateFamousPair({ random: rng(hashSeed(date)) });
        if (!pair) return null;
        const stored = { start: pair.start, target: pair.target, path: pair.path };
        // Admin mógł w międzyczasie ustawić parę – nie nadpisujemy.
        if (!readDaily(date)) writeDaily(date, stored, 'generated');
        return readDaily(date);
      })().finally(() => pending.delete(date)),
    );
  }
  return pending.get(date)!;
}

/** Przygotowuje wyzwanie na dziś i jutro w tle, żeby gracz nie czekał na zimny cache. */
export async function warmDaily(): Promise<void> {
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
  for (const d of [today(), tomorrow]) {
    try {
      await ensureDaily(d);
    } catch (e) {
      console.error(`Nie udało się przygotować wyzwania ${d}:`, e);
    }
  }
}

const toChallenge = (id: string, s: Stored, date?: string): Challenge => ({
  id,
  date,
  start: s.start,
  target: s.target,
  optimalLength: s.path?.length ?? null,
});

export async function getDaily(date = today()): Promise<Challenge | null> {
  const s = await ensureDaily(date);
  return s && toChallenge(`daily:${date}`, s, date);
}

export function listDaily(): DailyEntry[] {
  const rows = getDb().prepare('SELECT date, data, source FROM daily_challenges ORDER BY date DESC LIMIT 60').all() as {
    date: string;
    data: string;
    source: DailyEntry['source'];
  }[];
  return rows.map((r) => {
    const s = JSON.parse(r.data) as Stored;
    return { date: r.date, start: s.start, target: s.target, optimalLength: s.path?.length ?? null, source: r.source };
  });
}

export async function setDaily(date: string, start: Artist, target: Artist): Promise<Stored> {
  const path = await shortestPath(start, target, { budget: 300 });
  const stored = { start, target, path };
  writeDaily(date, stored, 'admin');
  return stored;
}

export function deleteDaily(date: string): void {
  getDb().prepare('DELETE FROM daily_challenges WHERE date = ?').run(date);
}

// --- Tryb losowy: pula gotowych par uzupełniana w tle ---

const POOL_TARGET = 8;
let filling: Promise<void> | null = null;

function poolSize(): number {
  return (getDb().prepare('SELECT COUNT(*) AS n FROM random_challenges').get() as { n: number }).n;
}

async function generateRandom(): Promise<string | null> {
  const pair = await generatePair();
  if (!pair) return null;
  const token = randomBytes(6).toString('base64url');
  getDb()
    .prepare('INSERT INTO random_challenges (token, data, created_at) VALUES (?, ?, ?)')
    .run(token, JSON.stringify({ start: pair.start, target: pair.target, path: pair.path }), Date.now());
  return token;
}

/** Usuwa z puli pary, których końce wypadły z listy znanych wykonawców (np. po jej edycji). */
export function purgeStalePool(): number {
  const known = new Set(SEED_ARTISTS.map(normName));
  const rows = getDb().prepare('SELECT token, data FROM random_challenges').all() as { token: string; data: string }[];
  const del = getDb().prepare('DELETE FROM random_challenges WHERE token = ?');
  let removed = 0;
  for (const r of rows) {
    const d = JSON.parse(r.data) as Stored;
    if (!known.has(normName(d.start.name)) || !known.has(normName(d.target.name))) {
      del.run(r.token);
      removed++;
    }
  }
  return removed;
}

export function refillPool(): Promise<void> {
  filling ??= (async () => {
    try {
      for (let i = 0; poolSize() < POOL_TARGET && i < POOL_TARGET * 2; i++) await generateRandom();
    } catch (e) {
      console.error('Uzupełnianie puli nie powiodło się:', e);
    }
  })().finally(() => (filling = null));
  return filling;
}

function readRandom(token: string): Stored | null {
  const row = getDb().prepare('SELECT data FROM random_challenges WHERE token = ?').get(token) as
    | { data: string }
    | undefined;
  return row ? (JSON.parse(row.data) as Stored) : null;
}

export async function getRandom(exclude: string[] = []): Promise<Challenge | null> {
  const rows = getDb().prepare('SELECT token FROM random_challenges').all() as { token: string }[];
  const fresh = rows.map((r) => r.token).filter((t) => !exclude.includes(t));
  let token = fresh.length ? fresh[Math.floor(Math.random() * fresh.length)] : await generateRandom();
  void refillPool();
  if (!token) return null;
  return toChallenge(`random:${token}`, readRandom(token)!);
}

export async function getSolution(id: string): Promise<PathStep[] | null> {
  const [kind, key] = id.split(':');
  if (kind === 'daily' && isDate(key)) return (await ensureDaily(key))?.path ?? null;
  if (kind === 'random') return readRandom(key)?.path ?? null;
  return null;
}
