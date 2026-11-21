import type { Artist, PathStep } from '@onthefeat/shared';
import { toArtist } from '../deezer/normalize.ts';
import { FAMOUS_ARTISTS, SEED_ARTISTS } from '../data/seed-artists.ts';
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
  /** Pula wykonawców, z której losowane są OBA końce pary. */
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
/** Wyzwanie dnia: tylko wykonawcy, o których „każdy słyszał”. */
export const famousArtists = () => resolveList(FAMOUS_ARTISTS);
/** Tryb losowy: znani wykonawcy plus nieco szersza lista rozpoznawalnych. */
export const knownArtists = () => resolveList(SEED_ARTISTS);

/**
 * Losuje parę znanych wykonawców z puli (oba końce z listy) bez bezpośredniego połączenia –
 * najkrótsza znana ścieżka ma co najmniej `minLength` (domyślnie 2) utwory. Pośrednicy mogą być dowolni.
 */
export async function generatePair(opts: GenOptions = {}): Promise<GeneratedPair | null> {
  const { random = Math.random, neighborFn = neighbors, attempts = 15, minLength = 2, pool = knownArtists } = opts;
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

/** Para do wyzwania dnia: oba końce z FAMOUS_ARTISTS. */
export const generateFamousPair = (opts: GenOptions = {}) => generatePair({ pool: famousArtists, ...opts });
