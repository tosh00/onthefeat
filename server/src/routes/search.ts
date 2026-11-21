import { Hono } from 'hono';
import type { Artist, TrackResult } from '@onthefeat/shared';
import { deezer, type DzTrack } from '../deezer/client.ts';
import { cleanTitle, normName, splitArtistName, toArtist } from '../deezer/normalize.ts';
import { loadArtists } from '../game/validate.ts';

export const MIN_QUERY = 3;
export const MAX_RESULTS = 12;

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

const tokens = (s: string) => normName(s).split(' ').filter(Boolean);
const matches = (words: string[], w: string) => words.some((t) => t.startsWith(w));

/**
 * Wyszukiwanie w stylu Spotify: jedno zapytanie, tytuł i wykonawca naraz ("bang szczyl").
 * Każde wpisane słowo musi być początkiem słowa z tytułu (bez "feat.") albo z nazwy głównego
 * wykonawcy – ale tylko NIEODKRYTEGO. Dzięki temu nazwa odkrytego wykonawcy niczego nie
 * dopasowuje i nie da się przejrzeć jego katalogu; goście też nie są przeszukiwani.
 * Kolejność: dokładny tytuł > tytuł zaczynający się od zapytania > słowo w tytule > sam wykonawca,
 * a w ramach grupy kolejność Deezera (popularność).
 */
export function rankTracks(tracks: DzTrack[], query: string, discovered: Artist[] = []): DzTrack[] {
  const words = tokens(query);
  if (!words.length) return [];
  const score = (t: DzTrack) => {
    const title = tokens(cleanTitle(t.title) || t.title);
    const artist = isBlocked(toArtist(t.artist), discovered) ? [] : tokens(t.artist.name);
    const inTitle: string[] = [];
    for (const w of words) {
      if (matches(title, w)) inTitle.push(w);
      else if (!matches(artist, w)) return -1;
    }
    if (!inTitle.length) return 1;
    const titleStr = title.join(' ');
    const typed = inTitle.join(' ');
    if (titleStr === typed) return 4;
    if (titleStr.startsWith(typed)) return 3;
    return 2;
  };
  return tracks
    .map((t, i) => ({ t, s: score(t), i }))
    .filter((x) => x.s > 0)
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
    // Deezer nie radzi sobie z niedopisanym ostatnim słowem ("bang szcz"), więc szukamy też bez niego;
    // prefiks i tak sprawdza rankTracks.
    const words = q.split(/\s+/);
    const withoutLast = words.slice(0, -1).join(' ');
    const [res, partial, discovered] = await Promise.all([
      deezer.searchTracks(q, 100),
      words.length > 1 && withoutLast.length >= MIN_QUERY ? deezer.searchTracks(withoutLast, 100) : null,
      loadArtists(parseIds(c.req.query('discovered'))),
    ]);
    // Popularne tytuły ("Bang") zasypują utwory odkrytych wykonawców, więc dokładamy dopasowania
    // z ich (cachowanych) topów na górę listy. Ich nazwy nie dopasowują, więc gracz i tak musi znać tytuł.
    const tops = await Promise.all(
      discovered.slice(0, 30).map((a) => deezer.artistTop(a.id, 100).then((r) => r.data, () => [])),
    );
    const fromDiscovered = rankTracks(tops.flat(), q, discovered);
    const general = rankTracks([...res.data, ...(partial?.data ?? [])], q, discovered);
    return c.json(dedupeTracks([...fromDiscovered, ...general]).slice(0, MAX_RESULTS).map(toTrackResult));
  });
