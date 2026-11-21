import type { Artist, PathStep } from '@onthefeat/shared';
import { cacheGet, cacheSet } from '../cache.ts';
import { deezer, type DzTrack } from '../deezer/client.ts';
import { normName, splitArtistName } from '../deezer/normalize.ts';
import { trackParticipantsOffline } from './participants.ts';

export interface Edge {
  artist: Artist;
  track: { id: number; title: string; rank: number };
}

const WEEK = 7 * 24 * 60 * 60 * 1000;
/** Konto-duplikat o tej samej nazwie traktujemy jako tego samego wykonawcę od tylu fanów. */
const SIBLING_MIN_FANS = 500;

/**
 * Deezer potrafi mieć kilka kont tego samego wykonawcy (np. dwa konta "Mata" z albumami).
 * Zwraca id wszystkich kont o identycznej (znormalizowanej) nazwie, które wyglądają na prawdziwe.
 */
export async function siblingIds(artist: Artist): Promise<number[]> {
  const key = normName(artist.name);
  const res = await deezer.searchArtists(artist.name, 25);
  const ids = res.data
    .filter((a) => normName(a.name) === key && ((a.nb_fan ?? 0) >= SIBLING_MIN_FANS || a.id === artist.id))
    .map((a) => a.id);
  return [...new Set([artist.id, ...ids])];
}

/**
 * Sąsiedzi wykonawcy w grafie współpracy: współwykonawcy z najpopularniejszych utworów
 * (wszystkich kont-duplikatów). Pomijamy "wykonawców złożonych" (np. "A & B"), żeby ścieżki
 * z generatora składały się z prawdziwych artystów. To podzbiór ruchów, które akceptuje walidacja.
 */
export async function neighbors(artist: Artist): Promise<Edge[]> {
  const self = normName(artist.name);
  const key = `nb:${self}`;
  const hit = cacheGet<Edge[]>(key);
  if (hit) return hit;

  const ids = await siblingIds(artist);
  const tops = await Promise.all(ids.map((id) => deezer.artistTop(id, 100)));
  const best = new Map<string, Edge>();
  for (const t of tops.flatMap((r) => r.data) as (DzTrack & { rank?: number })[]) {
    const participants = trackParticipantsOffline(t);
    if (!participants.some((p) => normName(p.name) === self)) continue;
    const rank = t.rank ?? 0;
    for (const p of participants) {
      const n = normName(p.name);
      if (n === self || splitArtistName(p.name).length > 1) continue;
      const prev = best.get(n);
      if (!prev || prev.track.rank < rank) best.set(n, { artist: p, track: { id: t.id, title: t.title, rank } });
    }
  }
  const edges = [...best.values()].sort((a, b) => b.track.rank - a.track.rank);
  cacheSet(key, edges, WEEK);
  return edges;
}

export type NeighborFn = (a: Artist) => Promise<Edge[]>;

interface Visit {
  artist: Artist;
  parent: string | null;
  track: { id: number; title: string } | null;
  depth: number;
}

/**
 * Dwukierunkowy BFS (węzeł = znormalizowana nazwa) z budżetem rozwinięć – każde rozwinięcie
 * to kilka zapytań do Deezera, póki nie trafią do cache. Zwraca najkrótszą znalezioną ścieżkę albo null.
 */
export async function shortestPath(
  start: Artist,
  target: Artist,
  opts: { maxDepth?: number; budget?: number; neighborFn?: NeighborFn } = {},
): Promise<PathStep[] | null> {
  const { maxDepth = 6, budget = 150, neighborFn = neighbors } = opts;
  const s = normName(start.name);
  const t = normName(target.name);
  if (s === t) return [];

  const fwd = new Map<string, Visit>([[s, { artist: start, parent: null, track: null, depth: 0 }]]);
  const bwd = new Map<string, Visit>([[t, { artist: target, parent: null, track: null, depth: 0 }]]);
  let fFrontier = [s];
  let bFrontier = [t];
  let expansions = 0;

  const build = (meet: string): PathStep[] => {
    const left: PathStep[] = [];
    for (let cur = fwd.get(meet)!; cur.parent !== null; cur = fwd.get(cur.parent)!) {
      left.unshift({ from: fwd.get(cur.parent)!.artist, track: cur.track!, to: cur.artist });
    }
    const right: PathStep[] = [];
    for (let cur = bwd.get(meet)!; cur.parent !== null; cur = bwd.get(cur.parent)!) {
      right.push({ from: cur.artist, track: cur.track!, to: bwd.get(cur.parent)!.artist });
    }
    return [...left, ...right];
  };

  while (fFrontier.length && bFrontier.length) {
    const fDepth = fwd.get(fFrontier[0])!.depth;
    const bDepth = bwd.get(bFrontier[0])!.depth;
    if (fDepth + bDepth >= maxDepth) return null;

    const forward = fFrontier.length <= bFrontier.length;
    const [mine, other] = forward ? [fwd, bwd] : [bwd, fwd];
    const frontier = forward ? fFrontier : bFrontier;
    const next: string[] = [];
    let meet: string | null = null;
    let meetLen = Infinity;

    for (const key of frontier) {
      if (expansions++ >= budget) return meet !== null ? build(meet) : null;
      const visit = mine.get(key)!;
      for (const e of await neighborFn(visit.artist)) {
        const n = normName(e.artist.name);
        if (mine.has(n)) continue;
        mine.set(n, { artist: e.artist, parent: key, track: { id: e.track.id, title: e.track.title }, depth: visit.depth + 1 });
        next.push(n);
        const o = other.get(n);
        if (o && visit.depth + 1 + o.depth < meetLen) {
          meet = n;
          meetLen = visit.depth + 1 + o.depth;
        }
      }
    }
    if (meet !== null) return build(meet);
    if (forward) fFrontier = next;
    else bFrontier = next;
  }
  return null;
}

/** Łączna liczba fanów wszystkich kont wykonawcy (miara rozpoznawalności). */
export async function totalFans(artist: Artist): Promise<number> {
  const key = normName(artist.name);
  const res = await deezer.searchArtists(artist.name, 25);
  return res.data
    .filter((a) => normName(a.name) === key)
    .reduce((sum, a) => sum + (a.nb_fan ?? 0), 0);
}

