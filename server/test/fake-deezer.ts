import { readFileSync } from 'node:fs';
import { DeezerError, setFetcher, type DzArtist, type DzTrack } from '../src/deezer/client.ts';
import { normName } from '../src/deezer/normalize.ts';

export const fixture = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as T;

export const A = {
  mata: { id: 353802652, name: 'Mata', nb_fan: 1907 },
  mataDup: { id: 78517542, name: 'Mata', nb_fan: 11935 },
  maryla: { id: 78459, name: 'Maryla Rodowicz', nb_fan: 11619 },
  helena: { id: 194231, name: 'Helena Vondrackova', nb_fan: 3212 },
  helenaGott: { id: 428037701, name: 'Helena Vondrácková & Karel Gott', nb_fan: 0 },
  gott: { id: 1001, name: 'Karel Gott', nb_fan: 50000 },
  taco: { id: 8090229, name: 'Taco Hemingway', nb_fan: 47905 },
} satisfies Record<string, DzArtist>;

/** Podmienia fetcher Deezera na wersję w pamięci. */
export function installFakeDeezer(tracks: DzTrack[], artistTop: Record<number, DzTrack[]> = {}): void {
  const artists: DzArtist[] = Object.values(A);
  setFetcher(async (path) => {
    const url = new URL('https://x' + path);
    let m: RegExpMatchArray | null;
    if ((m = url.pathname.match(/^\/track\/(\d+)$/))) {
      const t = tracks.find((t) => t.id === Number(m![1]));
      if (!t) throw new DeezerError('no data', 800);
      return t;
    }
    if ((m = url.pathname.match(/^\/artist\/(\d+)\/top$/))) return { data: artistTop[Number(m![1])] ?? [] };
    if ((m = url.pathname.match(/^\/artist\/(\d+)$/))) {
      const a = artists.find((a) => a.id === Number(m![1]));
      if (!a) throw new DeezerError('no data', 800);
      return a;
    }
    if (url.pathname === '/search/artist') {
      const q = normName(url.searchParams.get('q') ?? '');
      return { data: artists.filter((a) => normName(a.name).includes(q)) };
    }
    if (url.pathname === '/search/track') return { data: [] };
    throw new Error('Nieobsłużona ścieżka w fake Deezer: ' + path);
  });
}
