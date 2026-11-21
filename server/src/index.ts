import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { DeezerError } from './deezer/client.ts';
import { purgeStalePool, refillPool, warmDaily } from './game/challenges.ts';
import { adminRoutes } from './routes/admin.ts';
import { gameRoutes } from './routes/game.ts';
import { searchRoutes } from './routes/search.ts';

export const app = new Hono();

app.onError((err, c) => {
  console.error(err);
  if (err instanceof DeezerError) return c.json({ error: 'Deezer chwilowo nie odpowiada' }, 502);
  return c.json({ error: 'Błąd serwera' }, 500);
});

app.route('/api', searchRoutes);
app.route('/api', gameRoutes);
app.route('/api/admin', adminRoutes);

if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: '../client/dist' }));
  app.get('*', serveStatic({ path: '../client/dist/index.html' }));
}

if (!process.env.VITEST) {
  const port = Number(process.env.PORT ?? 3001);
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Serwer: http://localhost:${port}`);
    if (!process.env.ADMIN_PASSWORD) console.warn('Brak ADMIN_PASSWORD – panel admina wyłączony.');
    const purged = purgeStalePool();
    if (purged) console.log(`Usunięto ${purged} nieaktualnych losowych par.`);
    void warmDaily().then(refillPool);
    setInterval(() => void warmDaily(), 60 * 60 * 1000);
  });
}
