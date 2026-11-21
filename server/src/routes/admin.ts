import { timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { isCategory, type AdminPreview, type Artist } from '@onthefeat/shared';
import { deezer } from '../deezer/client.ts';
import { toArtist } from '../deezer/normalize.ts';
import { deleteDaily, isDate, listDaily, setDaily } from '../game/challenges.ts';
import { shortestPath } from '../game/graph.ts';
import { loadArtists } from '../game/validate.ts';

const LONG_PATH = 6;

function checkPassword(header: string | undefined): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || !header?.startsWith('Bearer ')) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function pair(body: { startId?: unknown; targetId?: unknown }): Promise<[Artist, Artist] | null> {
  const [start] = await loadArtists([Number(body.startId)]);
  const [target] = await loadArtists([Number(body.targetId)]);
  return start && target && start.id !== target.id ? [start, target] : null;
}

const preview = (path: AdminPreview['path']): AdminPreview => ({
  path,
  optimalLength: path?.length ?? null,
  warning: !path
    ? 'Nie znaleziono ścieżki (w limicie przeszukiwania). Gracze mogą nie dać rady.'
    : path.length > LONG_PATH
      ? `Ścieżka ma ${path.length} kroków – może być bardzo trudno.`
      : undefined,
});

export const adminRoutes = new Hono()
  .use('*', async (c, next) => {
    if (!checkPassword(c.req.header('Authorization'))) return c.json({ error: 'Brak dostępu' }, 401);
    await next();
  })
  .get('/ping', (c) => c.json({ ok: true }))
  .get('/artists', async (c) => {
    const q = (c.req.query('q') ?? '').trim();
    if (q.length < 2) return c.json([]);
    const res = await deezer.searchArtists(q, 15);
    return c.json(res.data.map((a) => ({ ...toArtist(a), fans: a.nb_fan ?? 0 })));
  })
  .get('/daily', (c) => c.json(listDaily()))
  .post('/preview', async (c) => {
    const p = await pair(await c.req.json());
    if (!p) return c.json({ error: 'Wybierz dwóch różnych wykonawców' }, 400);
    return c.json(preview(await shortestPath(p[0], p[1], { budget: 300 })));
  })
  .put('/daily/:date/:category', async (c) => {
    const { date, category } = c.req.param();
    if (!isDate(date) || !isCategory(category)) return c.json({ error: 'Zła data lub kategoria' }, 400);
    const p = await pair(await c.req.json());
    if (!p) return c.json({ error: 'Wybierz dwóch różnych wykonawców' }, 400);
    const stored = await setDaily(date, category, p[0], p[1]);
    return c.json(preview(stored.path));
  })
  .delete('/daily/:date/:category', (c) => {
    const { date, category } = c.req.param();
    if (!isDate(date) || !isCategory(category)) return c.json({ error: 'Zła data lub kategoria' }, 400);
    deleteDaily(date, category);
    return c.json({ ok: true });
  });
