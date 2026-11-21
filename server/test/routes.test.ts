import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/index.ts';
import { rankTracks } from '../src/routes/search.ts';
import { A, installFakeDeezer } from './fake-deezer.ts';

beforeAll(() => installFakeDeezer([]));

describe('admin', () => {
  it('admin wymaga hasła', async () => {
    process.env.ADMIN_PASSWORD = 'tajne';
    expect((await app.request('/api/admin/ping')).status).toBe(401);
    expect((await app.request('/api/admin/ping', { headers: { Authorization: 'Bearer tajne' } })).status).toBe(200);
  });
});

describe('rankTracks (wyszukiwanie tytuł + wykonawca)', () => {
  const t = (id: number, title: string, artist: { id: number; name: string } = A.mata) => ({ id, title, artist });

  it('odrzuca rozmyte trafienia i stawia dokładne na górze', () => {
    const out = rankTracks([t(1, 'Gangsta Track'), t(2, 'Big Bang Theory'), t(3, 'Bang (feat. X)'), t(4, 'Bangarang')], 'bang');
    expect(out.map((x) => x.id)).toEqual([3, 4, 2]);
  });

  it('łączy tytuł i wykonawcę w jednym zapytaniu', () => {
    const tracks = [t(1, 'Bang', A.maryla), t(2, 'Bang', A.taco), t(3, 'Banda', A.maryla)];
    expect(rankTracks(tracks, 'bang maryla').map((x) => x.id)).toEqual([1]);
    expect(rankTracks(tracks, 'maryla ban').map((x) => x.id)).toEqual([1, 3]);
  });

  it('nazwa nieodkrytego wykonawcy pokazuje jego utwory, odkrytego – nic', () => {
    const tracks = [t(1, 'Bang', A.maryla), t(2, 'Banda', A.maryla), t(3, 'Mata', A.taco)];
    expect(rankTracks(tracks, 'maryla').map((x) => x.id)).toEqual([1, 2]);
    expect(rankTracks(tracks, 'maryla', [A.maryla])).toEqual([]);
    expect(rankTracks(tracks, 'bang maryla', [A.maryla])).toEqual([]);
    expect(rankTracks(tracks, 'bang', [A.maryla]).map((x) => x.id)).toEqual([1]);
    expect(rankTracks(tracks, 'mata', [A.mata]).map((x) => x.id)).toEqual([3]);
  });

  it('nie przeszukuje gości z tytułu', () => {
    expect(rankTracks([t(1, 'Coś (feat. Kubi Producent)', A.maryla)], 'kubi')).toEqual([]);
  });
});
