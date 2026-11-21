import { randomBytes } from 'node:crypto';
import { CATEGORIES, isCategory, type Artist, type Category, type Challenge, type DailyEntry, type PathStep } from '@onthefeat/shared';
import { getDb } from '../cache.ts';
import { normName } from '../deezer/normalize.ts';
import { CATEGORY_ARTISTS } from '../data/categories.ts';
import { generatePair, hashSeed, rng } from './generator.ts';
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

const dailyId = (date: string, category: Category) => `daily:${date}:${category}`;

// --- Wyzwania dnia: jedno na kategorię ---

function readDaily(date: string, category: Category): (Stored & { source: DailyEntry['source'] }) | null {
  const row = getDb().prepare('SELECT data, source FROM daily WHERE date = ? AND category = ?').get(date, category) as
    | { data: string; source: DailyEntry['source'] }
    | undefined;
  return row ? { ...(JSON.parse(row.data) as Stored), source: row.source } : null;
}

function writeDaily(date: string, category: Category, data: Stored, source: DailyEntry['source']): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO daily (date, category, data, source) VALUES (?, ?, ?, ?)')
    .run(date, category, JSON.stringify(data), source);
}

const pending = new Map<string, Promise<Stored | null>>();

/** Wpis admina, a w jego braku para wygenerowana dla kategorii (ziarno = data + kategoria, więc powtarzalnie). */
async function ensureDaily(date: string, category: Category): Promise<Stored | null> {
  const existing = readDaily(date, category);
  if (existing) return existing;
  const key = dailyId(date, category);
  if (!pending.has(key)) {
    pending.set(
      key,
      (async () => {
        const pair = await generatePair(category, { random: rng(hashSeed(key)) });
        if (!pair) return null;
        // Admin mógł w międzyczasie ustawić parę – nie nadpisujemy.
        if (!readDaily(date, category)) writeDaily(date, category, pair, 'generated');
        return readDaily(date, category);
      })().finally(() => pending.delete(key)),
    );
  }
  return pending.get(key)!;
}

/** Przygotowuje wyzwania na dziś i jutro (wszystkie kategorie) w tle, żeby gracz nie czekał na zimny cache. */
export async function warmDaily(): Promise<void> {
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
  for (const d of [today(), tomorrow]) {
    for (const { id: category } of CATEGORIES) {
      try {
        await ensureDaily(d, category);
      } catch (e) {
        console.error(`Nie udało się przygotować wyzwania ${d} (${category}):`, e);
      }
    }
  }
}

const toChallenge = (id: string, category: Category, s: Stored, date?: string): Challenge => ({
  id,
  category,
  date,
  start: s.start,
  target: s.target,
  optimalLength: s.path?.length ?? null,
});

export async function getDaily(category: Category, date = today()): Promise<Challenge | null> {
  const s = await ensureDaily(date, category);
  return s && toChallenge(dailyId(date, category), category, s, date);
}

export function listDaily(): DailyEntry[] {
  const rows = getDb()
    .prepare('SELECT date, category, data, source FROM daily ORDER BY date DESC, category LIMIT 200')
    .all() as { date: string; category: Category; data: string; source: DailyEntry['source'] }[];
  return rows.map((r) => {
    const s = JSON.parse(r.data) as Stored;
    return {
      date: r.date,
      category: r.category,
      start: s.start,
      target: s.target,
      optimalLength: s.path?.length ?? null,
      source: r.source,
    };
  });
}

export async function setDaily(date: string, category: Category, start: Artist, target: Artist): Promise<Stored> {
  const path = await shortestPath(start, target, { budget: 300 });
  const stored = { start, target, path };
  writeDaily(date, category, stored, 'admin');
  return stored;
}

export function deleteDaily(date: string, category: Category): void {
  getDb().prepare('DELETE FROM daily WHERE date = ? AND category = ?').run(date, category);
}

// --- Tryb losowy: pula gotowych par na kategorię, uzupełniana w tle ---

const POOL_TARGET = 5;
let filling: Promise<void> | null = null;

function poolSize(category: Category): number {
  return (getDb().prepare('SELECT COUNT(*) AS n FROM random_pool WHERE category = ?').get(category) as { n: number }).n;
}

async function generateRandom(category: Category): Promise<string | null> {
  const pair = await generatePair(category);
  if (!pair) return null;
  const token = randomBytes(6).toString('base64url');
  getDb()
    .prepare('INSERT INTO random_pool (token, category, data, created_at) VALUES (?, ?, ?, ?)')
    .run(token, category, JSON.stringify({ start: pair.start, target: pair.target, path: pair.path }), Date.now());
  return token;
}

/** Usuwa z puli pary, których końce wypadły z listy kategorii (np. po jej edycji). Dzicz nie ma listy. */
export function purgeStalePool(): number {
  const rows = getDb().prepare('SELECT token, category, data FROM random_pool').all() as {
    token: string;
    category: string;
    data: string;
  }[];
  const del = getDb().prepare('DELETE FROM random_pool WHERE token = ?');
  let removed = 0;
  for (const r of rows) {
    if (r.category === 'wild') continue;
    const list = isCategory(r.category) ? CATEGORY_ARTISTS[r.category as Exclude<Category, 'wild'>] : null;
    const known = new Set(list?.map(normName));
    const d = JSON.parse(r.data) as Stored;
    if (!list || !known.has(normName(d.start.name)) || !known.has(normName(d.target.name))) {
      del.run(r.token);
      removed++;
    }
  }
  return removed;
}

export function refillPool(): Promise<void> {
  filling ??= (async () => {
    for (const { id: category } of CATEGORIES) {
      try {
        for (let i = 0; poolSize(category) < POOL_TARGET && i < POOL_TARGET * 2; i++) await generateRandom(category);
      } catch (e) {
        console.error(`Uzupełnianie puli (${category}) nie powiodło się:`, e);
      }
    }
  })().finally(() => (filling = null));
  return filling;
}

function readRandom(token: string): (Stored & { category: Category }) | null {
  const row = getDb().prepare('SELECT category, data FROM random_pool WHERE token = ?').get(token) as
    | { category: Category; data: string }
    | undefined;
  return row ? { ...(JSON.parse(row.data) as Stored), category: row.category } : null;
}

export async function getRandom(category: Category, exclude: string[] = []): Promise<Challenge | null> {
  const rows = getDb().prepare('SELECT token FROM random_pool WHERE category = ?').all(category) as { token: string }[];
  const fresh = rows.map((r) => r.token).filter((t) => !exclude.includes(t));
  const token = fresh.length ? fresh[Math.floor(Math.random() * fresh.length)] : await generateRandom(category);
  void refillPool();
  if (!token) return null;
  return toChallenge(`random:${token}`, category, readRandom(token)!);
}

/** Id wyzwania dnia albo null; daty z przyszłości traktujemy jak niedostępne. */
export function parseDailyId(id: string): { date: string; category: Category } | null {
  const [kind, date, category] = id.split(':');
  return kind === 'daily' && isDate(date) && isCategory(category) ? { date, category } : null;
}

export async function getSolution(id: string): Promise<PathStep[] | null> {
  const daily = parseDailyId(id);
  if (daily) return (await ensureDaily(daily.date, daily.category))?.path ?? null;
  const [kind, token] = id.split(':');
  if (kind === 'random') return readRandom(token)?.path ?? null;
  return null;
}
