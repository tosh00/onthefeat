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
