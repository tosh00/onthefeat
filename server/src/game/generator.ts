import type { Artist, Category, PathStep } from '@onthefeat/shared';
import { normName, toArtist } from '../deezer/normalize.ts';
import { CATEGORY_ARTISTS, WILD_SEEDS } from '../data/categories.ts';
import { neighbors, shortestPath, type NeighborFn } from './graph.ts';
import { resolveArtistByName } from './participants.ts';

export interface GeneratedPair {
  start: Artist;
  target: Artist;
  path: PathStep[];
}

/** Deterministyczny PRNG (mulberry32) – to samo ziarno daje tę samą sekwencję. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

export interface GenOptions {
  random?: () => number;
  neighborFn?: NeighborFn;
  /** Pula wykonawców: końce pary (kategorie) albo punkty startowe spaceru (dzicz). */
  pool?: () => Promise<Artist[]>;
  /** Minimalna długość najkrótszej znanej ścieżki (2 = brak bezpośredniego połączenia). */
  minLength?: number;
  attempts?: number;
}

const resolvedLists = new Map<string[], Promise<Artist[]>>();
function resolveList(names: string[]): Promise<Artist[]> {
  if (!resolvedLists.has(names)) {
    resolvedLists.set(
      names,
      Promise.all(names.map((n) => resolveArtistByName(n).catch(() => null))).then((r) =>
        r.filter((a) => a !== null).map(toArtist),
      ),
    );
  }
  return resolvedLists.get(names)!;
}

/** Rozpoznani na Deezerze wykonawcy z puli kategorii (dla „Dziczy”: punkty startowe spaceru). */
export const categoryArtists = (category: Category) =>
  resolveList(category === 'wild' ? WILD_SEEDS : CATEGORY_ARTISTS[category]);

/**
 * Losuje parę z puli (oba końce z listy) bez bezpośredniego połączenia – najkrótsza znana
 * ścieżka ma co najmniej `minLength` (domyślnie 2) utwory. Pośrednicy mogą być dowolni.
 */
export async function generatePoolPair(opts: GenOptions & { pool: () => Promise<Artist[]> }): Promise<GeneratedPair | null> {
  const { random = Math.random, neighborFn = neighbors, attempts = 12, minLength = 2, pool } = opts;
  const artists = await pool();
  if (artists.length < 2) return null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const i = Math.floor(random() * artists.length);
    let j = Math.floor(random() * (artists.length - 1));
    if (j >= i) j++;
    const [start, target] = [artists[i], artists[j]];
    const path = await shortestPath(start, target, { neighborFn, budget: 150 });
    if (path && path.length >= minLength) return { start, target, path };
  }
  return null;
}

/** Losowy spacer bez powrotów; preferuje sąsiadów z popularniejszych utworów (górna połowa listy). */
async function walk(from: Artist, steps: number, random: () => number, neighborFn: NeighborFn, visited: Set<string>): Promise<Artist> {
  let cur = from;
  for (let i = 0; i < steps; i++) {
    const options = (await neighborFn(cur)).filter((e) => !visited.has(normName(e.artist.name)));
    if (!options.length) break;
    const top = options.slice(0, Math.max(3, Math.ceil(options.length / 2)));
    const pick = top[Math.floor(random() * top.length)];
    visited.add(normName(pick.artist.name));
    cur = pick.artist;
  }
  return cur;
}

/**
 * „Dzicz”: oba końce są całkowicie losowe. Od znanego wykonawcy idziemy 1–3 kroki, żeby
 * wylosować start, potem kolejne 4–6 kroków do celu. Para musi mieć ścieżkę ≥ `minLength` (domyślnie 3).
 */
export async function generateWildPair(opts: GenOptions = {}): Promise<GeneratedPair | null> {
  const { random = Math.random, neighborFn = neighbors, attempts = 8, minLength = 3, pool = () => categoryArtists('wild') } = opts;
  const seeds = await pool();
  if (!seeds.length) return null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const seed = seeds[Math.floor(random() * seeds.length)];
    const visited = new Set([normName(seed.name)]);
    const start = await walk(seed, 1 + Math.floor(random() * 3), random, neighborFn, visited);
    const target = await walk(start, 4 + Math.floor(random() * 3), random, neighborFn, visited);
    if (normName(start.name) === normName(target.name)) continue;
    const path = await shortestPath(start, target, { neighborFn, budget: 150 });
    if (path && path.length >= minLength) return { start, target, path };
  }
  return null;
}

export function generatePair(category: Category, opts: GenOptions = {}): Promise<GeneratedPair | null> {
  if (category === 'wild') return generateWildPair(opts);
  return generatePoolPair({ pool: () => categoryArtists(category), ...opts });
}
