import type { Artist, PathStep } from '@onthefeat/shared';
import type { Step } from '../state/gameStore.ts';

const names = (as: Artist[]) => as.map((a) => a.name).join(', ');

/** Historia ruchów gracza: kto → utwór → kogo odkrył. */
export function PlayerPath({ steps }: { steps: Step[] }) {
  if (!steps.length) return null;
  return (
    <ol className="path">
      {steps.map((s, i) => (
        <li key={s.track.id + ':' + i}>
          <span className="path-from">{names(s.linkedVia)}</span>
          <span className="path-track">♪ {s.track.title}</span>
          <span className="path-to">{names(s.newArtists)}</span>
        </li>
      ))}
    </ol>
  );
}

/** Wzorcowa ścieżka (po wygranej lub poddaniu się). */
export function SolutionPath({ path }: { path: PathStep[] }) {
  return (
    <ol className="path">
      {path.map((s, i) => (
        <li key={i}>
          <span className="path-from">{s.from.name}</span>
          <span className="path-track">♪ {s.track.title}</span>
          <span className="path-to">{s.to.name}</span>
        </li>
      ))}
    </ol>
  );
}
