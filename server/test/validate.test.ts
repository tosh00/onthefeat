import { beforeAll, describe, expect, it } from 'vitest';
import type { DzTrack } from '../src/deezer/client.ts';
import { validateMove } from '../src/game/validate.ts';
import { A, fixture, installFakeDeezer } from './fake-deezer.ts';

const wiosna = fixture<DzTrack>('track-to-tylko-wiosna.json');
const duet: DzTrack = { id: 2, title: 'Duet', artist: A.helenaGott, contributors: [A.helenaGott] };
const featTrack: DzTrack = { id: 3, title: 'Coś (feat. Taco Hemingway)', artist: A.maryla, contributors: [A.maryla] };

beforeAll(() => installFakeDeezer([wiosna, duet, featTrack]));

describe('validateMove', () => {
  it('przykład z Matą: odkrywa Marylę', async () => {
    const r = await validateMove({ trackId: wiosna.id, discovered: [A.mata.id], targetId: A.helena.id });
    expect(r.valid).toBe(true);
    expect(r.linkedVia.map((a) => a.name)).toEqual(['Mata']);
    expect(r.newArtists.map((a) => a.name)).toEqual(['Maryla Rodowicz']);
    expect(r.won).toBe(false);
  });

  it('dopasowuje zduplikowane konto po nazwie', async () => {
    const r = await validateMove({ trackId: wiosna.id, discovered: [A.mataDup.id], targetId: A.helena.id });
    expect(r.valid).toBe(true);
  });

  it('odrzuca utwór bez odkrytego wykonawcy', async () => {
    const r = await validateMove({ trackId: wiosna.id, discovered: [A.taco.id], targetId: A.helena.id });
    expect(r).toMatchObject({ valid: false, reason: 'no-discovered-artist' });
  });

  it('odrzuca utwór, który nie odkrywa nikogo nowego', async () => {
    const r = await validateMove({ trackId: wiosna.id, discovered: [A.mata.id, A.maryla.id], targetId: A.helena.id });
    expect(r).toMatchObject({ valid: false, reason: 'nothing-new' });
  });

  it('rozbija wykonawcę złożonego i wykrywa wygraną', async () => {
    const r = await validateMove({ trackId: duet.id, discovered: [A.helena.id], targetId: A.gott.id });
    expect(r.valid).toBe(true);
    expect(r.newArtists.map((a) => a.name)).toEqual(['Karel Gott']);
    expect(r.won).toBe(true);
  });

  it('uwzględnia gości z tytułu', async () => {
    const r = await validateMove({ trackId: featTrack.id, discovered: [A.maryla.id], targetId: A.taco.id });
    expect(r).toMatchObject({ valid: true, won: true });
  });

  it('nieistniejący utwór', async () => {
    const r = await validateMove({ trackId: 999, discovered: [A.mata.id], targetId: A.helena.id });
    expect(r).toMatchObject({ valid: false, reason: 'track-not-found' });
  });
});
