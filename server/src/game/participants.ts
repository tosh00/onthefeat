import type { Artist } from '@onthefeat/shared';
import { deezer, type DzArtist, type DzTrack } from '../deezer/client.ts';
import { featuredFromTitle, normName, splitArtistName, toArtist } from '../deezer/normalize.ts';

/** Znajduje wykonawcę o dokładnie tej (znormalizowanej) nazwie; najpopularniejszy wygrywa. */
export async function resolveArtistByName(name: string): Promise<DzArtist | null> {
  const key = normName(name);
  if (!key) return null;
  const res = await deezer.searchArtists(name, 10);
  const exact = res.data.filter((a) => normName(a.name) === key);
  if (!exact.length) return null;
  return exact.reduce((best, a) => ((a.nb_fan ?? 0) > (best.nb_fan ?? 0) ? a : best));
}

/**
 * Rozbija wykonawcę złożonego ("A & B") na składowych, o ile wszystkie
 * składowe istnieją jako osobni wykonawcy. W przeciwnym razie (np. nazwa
 * zespołu z "&") zostawia go bez zmian.
 */
export async function expandArtist(a: DzArtist): Promise<DzArtist[]> {
  const parts = splitArtistName(a.name);
  if (parts.length < 2) return [a];
  const resolved = await Promise.all(parts.map(resolveArtistByName));
  if (resolved.every((r): r is DzArtist => r !== null)) return resolved;
  return [a];
}

function dedupe(artists: DzArtist[]): Artist[] {
  const seenId = new Set<number>();
  const seenName = new Set<string>();
  const out: Artist[] = [];
  for (const a of artists) {
    const n = normName(a.name);
    if (seenId.has(a.id) || seenName.has(n)) continue;
    seenId.add(a.id);
    seenName.add(n);
    out.push(toArtist(a));
  }
  return out;
}

/** Wszyscy wykonawcy utworu: contributors + rozbite nazwy złożone + goście z tytułu. */
export async function trackParticipants(track: DzTrack): Promise<Artist[]> {
  const base = track.contributors?.length ? track.contributors : [track.artist];
  const expanded = (await Promise.all(base.map(expandArtist))).flat();

  const known = new Set(expanded.map((a) => normName(a.name)));
  const feat = featuredFromTitle(track.title).filter((n) => !known.has(normName(n)));
  const featResolved = (await Promise.all(feat.map(resolveArtistByName))).filter(
    (a): a is DzArtist => a !== null,
  );

  return dedupe([...expanded, ...featResolved]);
}

/** Szybki wariant bez zapytań do sieci (do budowy grafu w generatorze). */
export function trackParticipantsOffline(track: DzTrack): Artist[] {
  const base = track.contributors?.length ? track.contributors : [track.artist];
  return dedupe(base);
}
