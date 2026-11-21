import type { Artist, PathStep } from '@onthefeat/shared';
import { normName, toArtist } from '../deezer/normalize.ts';
import { FAMOUS_ARTISTS, MIN_FANS, SEED_ARTISTS } from '../data/seed-artists.ts';
import { neighbors, shortestPath, totalFans, type NeighborFn } from './graph.ts';
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
  /** Czy wykonawca jest wystarczająco rozpoznawalny (domyślnie: nb_fan z Deezera). */
  isKnown?: (a: Artist) => Promise<boolean>;
  seeds?: () => Promise<Artist[]>;
  minLength?: number;
  attempts?: number;
}

async function defaultIsKnown(a: Artist): Promise<boolean> {
  return (await totalFans(a)) >= MIN_FANS;
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
const defaultSeeds = () => resolveList(SEED_ARTISTS);
export const famousArtists = () => resolveList(FAMOUS_ARTISTS);

/**
 * Losowy spacer po grafie współpracy (4–6 kroków, bez powrotów), a potem BFS
 * od startu do końca spaceru. Para jest akceptowana, gdy najkrótsza znana
 * ścieżka ma co najmniej `minLength` kroków, a cel jest rozpoznawalny.
 */
export async function generatePair(opts: GenOptions = {}): Promise<GeneratedPair | null> {
  const {
    random = Math.random,
    neighborFn = neighbors,
    isKnown = defaultIsKnown,
    seeds = defaultSeeds,
    minLength = 3,
    attempts = 8,
  } = opts;
  const pool = await seeds();
  if (!pool.length) return null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const start = pool[Math.floor(random() * pool.length)];
    const steps = 4 + Math.floor(random() * 3);
    const visited = new Set([normName(start.name)]);
    let cur = start;

    for (let i = 0; i < steps; i++) {
      // Preferujemy popularne utwory: losujemy z górnej połowy listy sąsiadów.
      const options = (await neighborFn(cur)).filter((e) => !visited.has(normName(e.artist.name)));
      if (!options.length) break;
      const top = options.slice(0, Math.max(3, Math.ceil(options.length / 2)));
      const pick = top[Math.floor(random() * top.length)];
      visited.add(normName(pick.artist.name));
      cur = pick.artist;
    }
    if (cur === start || !(await isKnown(cur))) continue;

    const path = await shortestPath(start, cur, { neighborFn });
    if (path && path.length >= minLength) return { start, target: cur, path };
  }
  return null;
}

/**
 * Para do wyzwania dnia: oba końce z listy bardzo znanych wykonawców (FAMOUS_ARTISTS),
 * bez bezpośredniego połączenia – najkrótsza znana ścieżka ma co najmniej `minLength` (domyślnie 2) utwory.
 */
export async function generateFamousPair(
  opts: Pick<GenOptions, 'random' | 'neighborFn' | 'attempts' | 'minLength'> & { pool?: () => Promise<Artist[]> } = {},
): Promise<GeneratedPair | null> {
  const { random = Math.random, neighborFn = neighbors, attempts = 15, minLength = 2, pool = famousArtists } = opts;
  const artists = await pool();
  if (artists.length < 2) return null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const i = Math.floor(random() * artists.length);
    let j = Math.floor(random() * (artists.length - 1));
    if (j >= i) j++;
    const [start, target] = [artists[i], artists[j]];
    const path = await shortestPath(start, target, { neighborFn, budget: 200 });
    if (path && path.length >= minLength) return { start, target, path };
  }
  return null;
}
