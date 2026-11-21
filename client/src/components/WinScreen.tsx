import { useState } from 'react';
import { CATEGORIES } from '@onthefeat/shared';
import type { GameState } from '../state/gameStore.ts';
import { SolutionPath } from './PathGraph.tsx';

function shareText(s: GameState): string {
  const { challenge: c } = s;
  const cat = CATEGORIES.find((x) => x.id === c.category);
  const head = `On the Feat ${cat ? `${cat.emoji} ${cat.label}` : ''} ${c.date ?? '(losowe)'}`.replace(/\s+/g, ' ');
  const result =
    s.status === 'won'
      ? `✅ ${s.steps.length} ${s.steps.length === 1 ? 'utwór' : 'utworów'}${c.optimalLength ? ` (optimum ${c.optimalLength})` : ''}`
      : '🏳️ poddane';
  const bar = s.steps.map(() => '🎵').join('') + '❌'.repeat(Math.min(s.mistakes, 10));
  return `${head}\n${c.start.name} → ${c.target.name}\n${result}, błędy: ${s.mistakes}\n${bar}\n${location.origin}`;
}

export function WinScreen({ state, onNext }: { state: GameState; onNext?: () => void }) {
  const [copied, setCopied] = useState(false);
  const won = state.status === 'won';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareText(state));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* brak uprawnień do schowka */
    }
  };

  return (
    <section className={`result-card ${won ? 'won' : 'lost'}`}>
      <h2>{won ? 'Połączone! 🎉' : 'Poddajesz się'}</h2>
      {won && (
        <p>
          Udało Ci się w <strong>{state.steps.length}</strong> {state.steps.length === 1 ? 'kroku' : 'krokach'}
          {state.challenge.optimalLength != null && (
            <>
              {' '}
              (najkrótsza znana ścieżka: <strong>{state.challenge.optimalLength}</strong>)
            </>
          )}
          , błędy: {state.mistakes}.
        </p>
      )}
      {state.solution === undefined ? (
        <p className="muted">Wczytuję przykładową ścieżkę…</p>
      ) : state.solution ? (
        <>
          <h3>Przykładowa najkrótsza ścieżka</h3>
          <SolutionPath path={state.solution} />
        </>
      ) : (
        <p className="muted">Brak zapisanej ścieżki wzorcowej.</p>
      )}
      <div className="actions">
        <button onClick={copy}>{copied ? 'Skopiowano!' : 'Udostępnij wynik'}</button>
        {onNext && (
          <button className="secondary" onClick={onNext}>
            Nowa losowa para
          </button>
        )}
      </div>
    </section>
  );
}
