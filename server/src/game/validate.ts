import type { Artist, MoveRequest, MoveResult } from '@onthefeat/shared';
import { deezer, DeezerError } from '../deezer/client.ts';
import { normName, toArtist } from '../deezer/normalize.ts';
import { trackParticipants } from './participants.ts';

/** Zbiór "tożsamości" wykonawców: dopasowanie po id lub po znormalizowanej nazwie (Deezer ma duplikaty). */
export class ArtistSet {
  private ids = new Set<number>();
  private names = new Set<string>();
  constructor(artists: Artist[] = []) {
    artists.forEach((a) => this.add(a));
  }
  add(a: Artist): void {
    this.ids.add(a.id);
    this.names.add(normName(a.name));
  }
  has(a: Artist): boolean {
    return this.ids.has(a.id) || this.names.has(normName(a.name));
  }
}

export async function loadArtists(ids: number[]): Promise<Artist[]> {
  const unique = [...new Set(ids)].slice(0, 200);
  const res = await Promise.all(
    unique.map((id) =>
      deezer.artist(id).then(toArtist, (e) => {
        if (e instanceof DeezerError) return null;
        throw e;
      }),
    ),
  );
  return res.filter((a): a is Artist => a !== null);
}

export async function validateMove(req: MoveRequest): Promise<MoveResult> {
  let track;
  try {
    track = await deezer.track(req.trackId);
  } catch (e) {
    if (e instanceof DeezerError) {
      return {
        valid: false,
        reason: 'track-not-found',
        track: { id: req.trackId, title: '?', artist: { id: 0, name: '?' } },
        linkedVia: [],
        newArtists: [],
        won: false,
      };
    }
    throw e;
  }

  const [participants, discoveredArtists, [target]] = await Promise.all([
    trackParticipants(track),
    loadArtists(req.discovered),
    loadArtists([req.targetId]),
  ]);
  const discovered = new ArtistSet(discoveredArtists);

  const linkedVia = participants.filter((a) => discovered.has(a));
  const newArtists = participants.filter((a) => !discovered.has(a));
  const trackInfo = {
    id: track.id,
    title: track.title,
    artist: toArtist(track.artist),
    cover: track.album?.cover_medium,
  };

  if (!linkedVia.length) {
    return { valid: false, reason: 'no-discovered-artist', track: trackInfo, linkedVia, newArtists: [], won: false };
  }
  if (!newArtists.length) {
    return { valid: false, reason: 'nothing-new', track: trackInfo, linkedVia, newArtists, won: false };
  }
  const won = !!target && new ArtistSet(newArtists).has(target);
  return { valid: true, track: trackInfo, linkedVia, newArtists, won };
}
