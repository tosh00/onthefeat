import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/index.ts';
import { A, installFakeDeezer } from './fake-deezer.ts';

beforeAll(() => installFakeDeezer([]));

describe('uczciwość wyszukiwania', () => {
  it('podpowiedzi wykonawców pomijają odkrytych (także duplikaty i nazwy złożone)', async () => {
    const res = await app.request(`/api/search/artists?q=a&discovered=${A.mata.id},${A.helena.id}`);
    // krótkie zapytanie -> brak wyników
    expect(await res.json()).toEqual([]);
    const res2 = await app.request(`/api/search/artists?q=mata&discovered=${A.mata.id}`);
    expect(await res2.json()).toEqual([]);
    const res3 = await app.request(`/api/search/artists?q=gott&discovered=${A.helena.id}`);
    expect(((await res3.json()) as { name: string }[]).map((a) => a.name)).toEqual(['Karel Gott']);
  });

  it('403 przy przeglądaniu utworów odkrytego wykonawcy', async () => {
    const res = await app.request(`/api/artist/${A.mataDup.id}/tracks?discovered=${A.mata.id}`);
    expect(res.status).toBe(403);
    const ok = await app.request(`/api/artist/${A.maryla.id}/tracks?discovered=${A.mata.id}`);
    expect(ok.status).toBe(200);
  });

  it('admin wymaga hasła', async () => {
    process.env.ADMIN_PASSWORD = 'tajne';
    expect((await app.request('/api/admin/ping')).status).toBe(401);
    expect((await app.request('/api/admin/ping', { headers: { Authorization: 'Bearer tajne' } })).status).toBe(200);
  });
});

describe('rankByTitle', () => {
  it('odrzuca rozmyte trafienia i stawia dokładne na górze', async () => {
    const { rankByTitle } = await import('../src/routes/search.ts');
    const t = (id: number, title: string) => ({ id, title, artist: A.mata });
    const out = rankByTitle([t(1, 'Gangsta Track'), t(2, 'Big Bang Theory'), t(3, 'Bang (feat. X)'), t(4, 'Bangarang')], 'bang');
    expect(out.map((x) => x.id)).toEqual([3, 4, 2]);
  });

  it('słowo z nazwy wykonawcy działa tylko dla nieodkrytych', async () => {
    const { rankByTitle } = await import('../src/routes/search.ts');
    const tracks = [
      { id: 1, title: 'Bang', artist: A.maryla },
      { id: 2, title: 'Banda', artist: A.maryla },
      { id: 3, title: 'Mata', artist: A.taco },
    ];
    expect(rankByTitle(tracks, 'bang maryla').map((x) => x.id)).toEqual([1]);
    expect(rankByTitle(tracks, 'bang maryla', [A.maryla])).toEqual([]);
    // nazwa odkrytego wykonawcy nie wystarczy, by przeglądać jego katalog
    expect(rankByTitle(tracks, 'maryla')).toEqual([]);
    expect(rankByTitle(tracks, 'mata').map((x) => x.id)).toEqual([3]);
  });
});
