import { Hono } from 'hono';
import type { Artist, TrackResult } from '@onthefeat/shared';
import { deezer, type DzTrack } from '../deezer/client.ts';
import { cleanTitle, normName, splitArtistName, toArtist } from '../deezer/normalize.ts';
import { loadArtists } from '../game/validate.ts';

export const MIN_QUERY = 3;
export const MAX_RESULTS = 10;

export function parseIds(raw: string | undefined): number[] {
  return (raw ?? '')
    .split(',')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
}

/** Czy wykonawca (lub któraś część nazwy złożonej) jest już odkryty. */
export function isBlocked(a: Artist, discovered: Artist[]): boolean {
  const ids = new Set(discovered.map((d) => d.id));
  const names = new Set(discovered.map((d) => normName(d.name)));
  if (ids.has(a.id) || names.has(normName(a.name))) return true;
  return splitArtistName(a.name).some((p) => names.has(normName(p)));
}

/** Wynik bez gości: tytuł oczyszczony z "(feat. ...)", tylko główny wykonawca. */
export function toTrackResult(t: DzTrack): TrackResult {
  return {
    id: t.id,
    title: cleanTitle(t.title) || t.title,
    artist: toArtist(t.artist),
    cover: t.album?.cover_medium,
    preview: t.preview,
  };
}

/**
 * Deezer szuka "rozmyto" po tytule i wykonawcy naraz, więc filtrujemy sami. Każde wpisane słowo
 * musi pasować do tytułu albo do głównego wykonawcy – ale tylko NIEODKRYTEGO. Dzięki temu wpisanie
 * nazwy odkrytego wykonawcy nie odsłania jego katalogu. Co najmniej jedno słowo musi trafić w tytuł.
 * Dokładne trafienia tytułu idą na górę.
 */
export function rankByTitle(tracks: DzTrack[], query: string, discovered: Artist[] = []): DzTrack[] {
  const q = normName(query);
  const words = q.split(' ').filter(Boolean);
  const score = (t: DzTrack) => {
    const title = normName(cleanTitle(t.title) || t.title);
    const artistName = isBlocked(toArtist(t.artist), discovered) ? '' : normName(t.artist.name);
    let inTitle = 0;
    for (const w of words) {
      if (title.includes(w)) inTitle++;
      else if (!artistName.includes(w)) return -1;
    }
    if (!inTitle) return -1;
    if (title === q || inTitle < words.length) return inTitle === words.length ? 3 : 2.5;
    if (title.startsWith(q)) return 2;
    return 1;
  };
  return tracks
    .map((t, i) => ({ t, s: score(t), i }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.t);
}

function dedupeTracks(tracks: DzTrack[]): DzTrack[] {
  const seen = new Set<string>();
  return tracks.filter((t) => {
    const k = `${normName(cleanTitle(t.title))}|${t.artist.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export const searchRoutes = new Hono()
  .get('/search/tracks', async (c) => {
    const q = (c.req.query('q') ?? '').trim();
    if (q.length < MIN_QUERY) return c.json([]);
    const [res, discovered] = await Promise.all([
      deezer.searchTracks(q, 100),
      loadArtists(parseIds(c.req.query('discovered'))),
    ]);
    // Popularne tytuły ("Bang") zasypują utwory odkrytych wykonawców, więc dokładamy dopasowania
    // z ich (cachowanych) topów na górę listy. Gracz i tak musi znać tytuł – goście pozostają ukryci.
    const tops = await Promise.all(
      discovered.slice(0, 30).map((a) => deezer.artistTop(a.id, 100).then((r) => r.data, () => [])),
    );
    const fromDiscovered = rankByTitle(tops.flat(), q, discovered);
    const general = rankByTitle(res.data, q, discovered);
    return c.json(dedupeTracks([...fromDiscovered, ...general]).slice(0, MAX_RESULTS).map(toTrackResult));
  })
  .get('/search/artists', async (c) => {
    const q = (c.req.query('q') ?? '').trim();
    if (q.length < MIN_QUERY) return c.json([]);
    const [res, discovered] = await Promise.all([
      deezer.searchArtists(q, 25),
      loadArtists(parseIds(c.req.query('discovered'))),
    ]);
    const artists = res.data.map(toArtist).filter((a) => !isBlocked(a, discovered));
    return c.json(artists.slice(0, MAX_RESULTS));
  })
  .get('/artist/:id/tracks', async (c) => {
    const id = Number(c.req.param('id'));
    const [[artist], discovered] = await Promise.all([
      loadArtists([id]),
      loadArtists(parseIds(c.req.query('discovered'))),
    ]);
    if (!artist) return c.json({ error: 'Nie znaleziono wykonawcy' }, 404);
    if (isBlocked(artist, discovered)) {
      return c.json({ error: 'Nie można przeglądać utworów odkrytego wykonawcy' }, 403);
    }
    const [top, byName] = await Promise.all([deezer.artistTop(id, 100), deezer.searchTracks(artist.name, 100)]);
    const key = normName(artist.name);
    const own = byName.data.filter((t) => normName(t.artist.name) === key);
    const tracks = dedupeTracks([...top.data, ...own]);
    return c.json({ artist, tracks: tracks.slice(0, 80).map(toTrackResult) });
  });
