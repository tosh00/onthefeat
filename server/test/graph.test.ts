import { describe, expect, it } from 'vitest';
import type { Artist } from '@onthefeat/shared';
import { shortestPath, type Edge } from '../src/game/graph.ts';
import { generatePair, rng } from '../src/game/generator.ts';

// A - B - C - D - E, plus skrót A - X - E
const names = ['A', 'B', 'C', 'D', 'E', 'X', 'F'];
const art = Object.fromEntries(names.map((n, i) => [n, { id: i + 1, name: n }])) as Record<string, Artist>;
const links: [string, string][] = [['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'E'], ['A', 'X'], ['X', 'E'], ['B', 'F']];
const neighborFn = async (a: Artist): Promise<Edge[]> =>
  links
    .filter(([x, y]) => x === a.name || y === a.name)
    .map(([x, y], i) => ({ artist: art[x === a.name ? y : x], track: { id: 100 + i, title: `${x}+${y}`, rank: 0 } }));

describe('shortestPath', () => {
  it('znajduje najkrótszą ścieżkę', async () => {
    const p = await shortestPath(art.A, art.E, { neighborFn });
    expect(p?.map((s) => `${s.from.name}>${s.to.name}`)).toEqual(['A>X', 'X>E']);
  });
  it('ścieżka 3-krokowa i spójność kroków', async () => {
    const p = (await shortestPath(art.F, art.D, { neighborFn }))!;
    expect(p.map((s) => s.to.name)).toEqual(['B', 'C', 'D']);
    p.slice(1).forEach((s, i) => expect(s.from).toEqual(p[i].to));
  });
  it('null, gdy brak ścieżki w limicie głębokości', async () => {
    expect(await shortestPath(art.F, art.E, { neighborFn, maxDepth: 2 })).toBeNull();
  });
});

describe('generatePair', () => {
  it('nie zwraca par połączonych bezpośrednio', async () => {
    for (let seed = 1; seed < 20; seed++) {
      const p = await generatePair({ random: rng(seed), neighborFn, pool: async () => Object.values(art) });
      expect(p).not.toBeNull();
      expect(p!.path.length).toBeGreaterThanOrEqual(2);
      expect(names).toContain(p!.start.name);
      expect(names).toContain(p!.target.name);
    }
  });
});
