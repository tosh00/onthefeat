import { Hono } from 'hono';
import type { MoveRequest } from '@onthefeat/shared';
import { getDaily, getRandom, getSolution, isDate, today } from '../game/challenges.ts';
import { validateMove } from '../game/validate.ts';

export const gameRoutes = new Hono()
  .get('/challenge/daily', async (c) => {
    const date = c.req.query('date') ?? today();
    if (!isDate(date)) return c.json({ error: 'Zła data' }, 400);
    if (date > today()) return c.json({ error: 'To wyzwanie jeszcze nie jest dostępne' }, 403);
    const ch = await getDaily(date);
    return ch ? c.json(ch) : c.json({ error: 'Nie udało się przygotować wyzwania' }, 503);
  })
  .get('/challenge/random', async (c) => {
    const exclude = (c.req.query('exclude') ?? '').split(',').filter(Boolean);
    const ch = await getRandom(exclude);
    return ch ? c.json(ch) : c.json({ error: 'Nie udało się wygenerować pary' }, 503);
  })
  .get('/challenge/:id/solution', async (c) => {
    const id = c.req.param('id');
    const date = id.startsWith('daily:') ? id.slice(6) : null;
    if (date && date > today()) return c.json({ error: 'Niedostępne' }, 403);
    return c.json({ path: await getSolution(id) });
  })
  .post('/move', async (c) => {
    const body = await c.req.json<Partial<MoveRequest>>().catch(() => ({}) as Partial<MoveRequest>);
    const trackId = Number(body.trackId);
    const targetId = Number(body.targetId);
    const discovered = Array.isArray(body.discovered) ? body.discovered.map(Number).filter(Number.isInteger) : [];
    if (!Number.isInteger(trackId) || !Number.isInteger(targetId) || !discovered.length) {
      return c.json({ error: 'Niepoprawne dane ruchu' }, 400);
    }
    return c.json(await validateMove({ trackId, targetId, discovered }));
  });
