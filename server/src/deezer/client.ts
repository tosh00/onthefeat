import { cacheGet, cacheSet } from '../cache.ts';

const BASE = 'https://api.deezer.com';
const DAY = 24 * 60 * 60 * 1000;

export interface DzArtist {
  id: number;
  name: string;
  picture_medium?: string;
  nb_fan?: number;
  role?: string;
}

export interface DzTrack {
  id: number;
  title: string;
  title_short?: string;
  preview?: string;
  artist: DzArtist;
  album?: { id: number; title: string; cover_medium?: string };
  contributors?: DzArtist[];
}

interface DzList<T> {
  data: T[];
  total?: number;
}

// Deezer pozwala na 50 zapytań / 5 s; trzymamy się bezpiecznie poniżej.
const WINDOW_MS = 5000;
const MAX_IN_WINDOW = 40;
const sent: number[] = [];

async function throttle(): Promise<void> {
  for (;;) {
    const now = Date.now();
    while (sent.length && now - sent[0] > WINDOW_MS) sent.shift();
    if (sent.length < MAX_IN_WINDOW) {
      sent.push(now);
      return;
    }
    await new Promise((r) => setTimeout(r, WINDOW_MS - (now - sent[0]) + 10));
  }
}

export class DeezerError extends Error {
  constructor(
    message: string,
    public code?: number,
  ) {
    super(message);
  }
}

/** Test hook: podmiana fetchera (np. na fixture'y). */
export let fetcher: (path: string) => Promise<unknown> = async (path) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    await throttle();
    const res = await fetch(BASE + path);
    if (!res.ok) throw new DeezerError(`Deezer HTTP ${res.status}`, res.status);
    const json = (await res.json()) as { error?: { code: number; message: string } };
    if (json.error) {
      // 4 = quota exceeded -> chwila przerwy i ponowienie
      if (json.error.code === 4) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      throw new DeezerError(json.error.message, json.error.code);
    }
    return json;
  }
  throw new DeezerError('Deezer quota exceeded', 4);
};

export function setFetcher(f: typeof fetcher): void {
  fetcher = f;
}

async function get<T>(path: string, ttl = DAY): Promise<T> {
  const key = 'dz:' + path;
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;
  const value = (await fetcher(path)) as T;
  cacheSet(key, value, ttl);
  return value;
}

const q = (s: string) => encodeURIComponent(s);

export const deezer = {
  track: (id: number) => get<DzTrack>(`/track/${id}`, 7 * DAY),
  artist: (id: number) => get<DzArtist>(`/artist/${id}`, 7 * DAY),
  artistTop: (id: number, limit = 100) =>
    get<DzList<DzTrack>>(`/artist/${id}/top?limit=${limit}`, 7 * DAY),
  searchArtists: (query: string, limit = 15) =>
    get<DzList<DzArtist>>(`/search/artist?q=${q(query)}&limit=${limit}`),
  // Uwaga: Deezer ignoruje obecnie składnię `track:"..."` / `artist:"..."` (szuka dosłownie słowa "track"),
  // więc szukamy zwykłym zapytaniem i filtrujemy wyniki u siebie (routes/search.ts).
  searchTracks: (query: string, limit = 100) => get<DzList<DzTrack>>(`/search/track?q=${q(query)}&limit=${limit}`),
};
