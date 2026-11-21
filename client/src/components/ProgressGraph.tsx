import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import type { Artist } from '@onthefeat/shared';
import type { GameState } from '../state/gameStore.ts';

/** Klucz wykonawcy – jak na serwerze porównujemy po nazwie (Deezer ma duplikaty kont). */
const keyOf = (a: Artist) =>
  a.name.toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

interface GNode {
  id: string;
  artist: Artist;
  role: 'start' | 'target' | 'artist';
  reached: boolean;
  fresh: boolean;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
}

interface GLink {
  id: string;
  source: string | GNode;
  target: string | GNode;
  title: string;
  onPath: boolean;
}

interface Palette {
  text: string;
  muted: string;
  surface: string;
  border: string;
  accent: string;
  ok: string;
  chip: string;
}

function readPalette(): Palette {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(n).trim();
  return {
    text: v('--text'),
    muted: v('--muted'),
    surface: v('--surface'),
    border: v('--border'),
    accent: v('--accent'),
    ok: v('--ok'),
    chip: v('--chip'),
  };
}

function usePalette(): Palette {
  const [p, setP] = useState(readPalette);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setP(readPalette());
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return p;
}

const images = new Map<string, HTMLImageElement>();
function imageFor(url?: string): HTMLImageElement | null {
  if (!url) return null;
  let img = images.get(url);
  if (!img) {
    img = new Image();
    img.src = url;
    images.set(url, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

const ANCHOR_X = 160;

const endId = (e: string | GNode) => (typeof e === 'string' ? e : e.id);

/** Ścieżka start → cel w grafie odkryć (BFS po krawędziach-utworach), do podświetlenia po wygranej. */
function winningLinks(links: GLink[], start: string, target: string): Set<string> {
  const adj = new Map<string, { to: string; link: string }[]>();
  for (const l of links) {
    const [a, b] = [endId(l.source), endId(l.target)];
    adj.set(a, [...(adj.get(a) ?? []), { to: b, link: l.id }]);
    adj.set(b, [...(adj.get(b) ?? []), { to: a, link: l.id }]);
  }
  const prev = new Map<string, { from: string; link: string }>();
  const queue = [start];
  const seen = new Set([start]);
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === target) break;
    for (const e of adj.get(cur) ?? []) {
      if (seen.has(e.to)) continue;
      seen.add(e.to);
      prev.set(e.to, { from: cur, link: e.link });
      queue.push(e.to);
    }
  }
  const out = new Set<string>();
  for (let cur = target; prev.has(cur); cur = prev.get(cur)!.from) out.add(prev.get(cur)!.link);
  return out;
}

export function ProgressGraph({ state }: { state: GameState }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<GNode, GLink> | undefined>(undefined);
  const nodesRef = useRef(new Map<string, GNode>());
  const challengeRef = useRef<string | null>(null);
  const lastCount = useRef(0);
  const [size, setSize] = useState({ width: 600, height: 420 });
  const palette = usePalette();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setSize({ width: e.contentRect.width, height: Math.max(320, Math.min(560, e.contentRect.width * 0.75)) }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const data = useMemo(() => {
    const { challenge, steps, status } = state;
    if (challengeRef.current !== challenge.id) {
      challengeRef.current = challenge.id;
      nodesRef.current = new Map();
      lastCount.current = 0;
    }
    const startKey = keyOf(challenge.start);
    const targetKey = keyOf(challenge.target);
    const freshKeys = new Set(steps.at(-1)?.newArtists.map(keyOf));
    const reached = new Set([startKey, ...steps.flatMap((s) => s.newArtists.map(keyOf))]);

    // Obiekty węzłów są trwałe między renderami, żeby zachowały pozycje z symulacji.
    const node = (a: Artist): GNode => {
      const id = keyOf(a);
      let n = nodesRef.current.get(id);
      if (!n) {
        n = { id, artist: a, role: 'artist', reached: false, fresh: false };
        nodesRef.current.set(id, n);
      }
      n.role = id === startKey ? 'start' : id === targetKey ? 'target' : 'artist';
      // Start i cel są przypięte na przeciwnych krańcach – graf rośnie pomiędzy nimi.
      if (n.role !== 'artist') {
        n.fx = n.role === 'start' ? -ANCHOR_X : ANCHOR_X;
        n.fy = 0;
      }
      n.reached = reached.has(id);
      n.fresh = freshKeys.has(id);
      return n;
    };

    const nodes = new Map<string, GNode>();
    const add = (a: Artist) => nodes.set(keyOf(a), node(a));
    add(challenge.start);
    add(challenge.target);

    const links: GLink[] = [];
    for (const s of steps) {
      s.newArtists.forEach(add);
      for (const from of s.linkedVia) {
        for (const to of s.newArtists) {
          links.push({ id: `${s.track.id}:${keyOf(from)}:${keyOf(to)}`, source: keyOf(from), target: keyOf(to), title: s.track.title, onPath: false });
        }
      }
    }
    if (status === 'won') {
      const path = winningLinks(links, startKey, targetKey);
      links.forEach((l) => (l.onPath = path.has(l.id)));
    }
    return { nodes: [...nodes.values()], links };
  }, [state]);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    (fg.d3Force('link') as unknown as { distance: (d: number) => void } | undefined)?.distance(90);
    (fg.d3Force('charge') as unknown as { strength: (s: number) => void } | undefined)?.strength(-320);
  }, []);

  const fit = () => fgRef.current?.zoomToFit(500, 60);

  // Dopasowanie widoku po zmianie rozmiaru i po pojawieniu się nowych węzłów (gdy symulacja okrzepnie).
  useEffect(() => {
    const t = setTimeout(fit, 50);
    return () => clearTimeout(t);
  }, [size.width, size.height]);

  const handleStop = () => {
    if (data.nodes.length !== lastCount.current) {
      lastCount.current = data.nodes.length;
      fit();
    }
  };

  const radius = (n: GNode) => (n.role === 'artist' ? 16 : 22);

  const drawNode = (n: GNode, ctx: CanvasRenderingContext2D, scale: number) => {
    const r = radius(n);
    const x = n.x ?? 0;
    const y = n.y ?? 0;
    const dim = n.role === 'target' && !n.reached;

    ctx.save();
    ctx.globalAlpha = dim ? 0.55 : 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = palette.chip;
    ctx.fill();
    const img = imageFor(n.artist.picture);
    if (img) {
      ctx.save();
      ctx.clip();
      ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
      ctx.restore();
    } else {
      ctx.fillStyle = palette.muted;
      ctx.font = `600 ${r}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(n.artist.name.slice(0, 1).toUpperCase(), x, y);
    }
    ctx.restore();

    // obramowanie: start = akcent, cel = zielony (przerywany, póki nieosiągnięty), świeżo odkryci = akcent
    const ring = n.role === 'start' ? palette.accent : n.role === 'target' ? palette.ok : n.fresh ? palette.accent : palette.border;
    ctx.beginPath();
    ctx.arc(x, y, r + 1.5, 0, 2 * Math.PI);
    ctx.lineWidth = n.role === 'artist' && !n.fresh ? 1.5 : 3;
    ctx.strokeStyle = ring;
    ctx.setLineDash(dim ? [5, 4] : []);
    ctx.stroke();
    ctx.setLineDash([]);

    const fontSize = Math.max(11 / scale, 4);
    ctx.font = `${n.role === 'artist' ? 500 : 700} ${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const label = n.role === 'target' ? `🎯 ${n.artist.name}` : n.role === 'start' ? `▶ ${n.artist.name}` : n.artist.name;
    ctx.lineWidth = 3 / scale;
    ctx.strokeStyle = palette.surface;
    ctx.strokeText(label, x, y + r + 4);
    ctx.fillStyle = palette.text;
    ctx.fillText(label, x, y + r + 4);
  };

  const drawLinkLabel = (l: GLink, ctx: CanvasRenderingContext2D, scale: number) => {
    const s = l.source as GNode;
    const t = l.target as GNode;
    if (s.x == null || t.x == null || scale < 0.7) return;
    const mx = (s.x + t.x) / 2;
    const my = ((s.y ?? 0) + (t.y ?? 0)) / 2;
    const fontSize = Math.max(9.5 / scale, 3);
    const text = l.title.length > 28 ? l.title.slice(0, 27) + '…' : l.title;
    ctx.font = `${fontSize}px system-ui, sans-serif`;
    const w = ctx.measureText(text).width + fontSize;
    ctx.fillStyle = palette.surface;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.roundRect(mx - w / 2, my - fontSize * 0.75, w, fontSize * 1.5, fontSize * 0.75);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = l.onPath ? palette.ok : palette.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, mx, my);
  };

  return (
    <div className="graph" ref={wrapRef}>
      <ForceGraph2D<GNode, GLink>
        ref={fgRef}
        width={size.width}
        height={size.height}
        graphData={data}
        backgroundColor="rgba(0,0,0,0)"
        nodeId="id"
        nodeLabel={(n) => n.artist.name}
        nodeCanvasObject={drawNode}
        nodePointerAreaPaint={(n, color, ctx) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(n.x ?? 0, n.y ?? 0, radius(n) + 2, 0, 2 * Math.PI);
          ctx.fill();
        }}
        linkLabel={(l) => `♪ ${l.title}`}
        linkColor={(l) => (l.onPath ? palette.ok : palette.border)}
        linkWidth={(l) => (l.onPath ? 4 : 2)}
        linkCanvasObjectMode={() => 'after'}
        linkCanvasObject={drawLinkLabel}
        autoPauseRedraw={false}
        cooldownTicks={120}
        onEngineStop={handleStop}
        onNodeDragEnd={(n) => {
          n.fx = n.x;
          n.fy = n.y;
        }}
        onBackgroundRightClick={fit}
      />
      {state.steps.length === 0 && (
        <p className="graph-empty muted">Tu wyrośnie graf Twoich połączeń. Zacznij od utworu, w którym występuje {state.challenge.start.name}.</p>
      )}
    </div>
  );
}
