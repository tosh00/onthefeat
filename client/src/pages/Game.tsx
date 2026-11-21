import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MoveFailReason, TrackResult } from '@onthefeat/shared';
import { api } from '../api.ts';
import { DiscoveredList, Matchup } from '../components/ArtistChips.tsx';
import { PlayerPath } from '../components/PathGraph.tsx';
import { SearchBox } from '../components/SearchBox.tsx';
import { WinScreen } from '../components/WinScreen.tsx';
import { markRandomPlayed, playedRandom, useGame } from '../state/gameStore.ts';

type Mode = 'daily' | 'random';

const REASONS: Record<MoveFailReason, string> = {
  'no-discovered-artist': 'W tym utworze nie występuje nikt z odkrytych wykonawców.',
  'nothing-new': 'Ten utwór nie odkrywa nikogo nowego.',
  'track-not-found': 'Nie udało się sprawdzić tego utworu.',
};

export function Game() {
  const [mode, setMode] = useState<Mode>('daily');
  const { state, dispatch, start } = useGame();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);

  const load = useCallback(
    async (m: Mode) => {
      setLoading(true);
      setLoadError(null);
      setToast(null);
      try {
        const ch = m === 'daily' ? await api.daily() : await api.random(playedRandom());
        if (m === 'random') markRandomPlayed(ch.id.slice('random:'.length));
        start(ch);
      } catch (e) {
        setLoadError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [start],
  );

  useEffect(() => {
    void load(mode);
  }, [mode, load]);

  // Po zakończeniu gry dociągamy wzorcową ścieżkę.
  useEffect(() => {
    if (state && state.status !== 'playing' && state.solution === undefined) {
      api
        .solution(state.challenge.id)
        .then((r) => dispatch({ type: 'solution', path: r.path }))
        .catch(() => dispatch({ type: 'solution', path: null }));
    }
  }, [state, dispatch]);

  const usedTrackIds = useMemo(() => new Set(state?.steps.map((s) => s.track.id)), [state?.steps]);
  const latest = useMemo(() => new Set(state?.steps.at(-1)?.newArtists.map((a) => a.id)), [state?.steps]);

  const pick = async (t: TrackResult) => {
    if (!state || busy) return;
    setBusy(true);
    setToast(null);
    try {
      const r = await api.move(t.id, state.discovered, state.challenge.target.id);
      dispatch({ type: 'move', result: r });
      setToast(
        r.valid
          ? { kind: 'ok', text: `„${r.track.title}” → odkryto: ${r.newArtists.map((a) => a.name).join(', ')}` }
          : { kind: 'bad', text: `„${r.track.title}”: ${REASONS[r.reason!]}` },
      );
    } catch (e) {
      setToast({ kind: 'bad', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app">
      <header>
        <h1>
          🎤 On the Feat <small>połącz wykonawców piosenkami</small>
        </h1>
        <nav className="tabs">
          <button aria-selected={mode === 'daily'} onClick={() => setMode('daily')}>
            Wyzwanie dnia
          </button>
          <button aria-selected={mode === 'random'} onClick={() => setMode('random')}>
            Losowa para
          </button>
        </nav>
      </header>

      {loading && <p className="muted center">Przygotowuję wyzwanie… (za pierwszym razem może to chwilę potrwać)</p>}
      {loadError && (
        <p className="error center">
          {loadError} <button onClick={() => load(mode)}>Spróbuj ponownie</button>
        </p>
      )}

      {!loading && state && (
        <main>
          {state.challenge.date && <p className="muted center">Wyzwanie z dnia {state.challenge.date}</p>}
          <Matchup start={state.challenge.start} target={state.challenge.target} won={state.status === 'won'} />

          <div className="stats">
            <span>
              Ruchy: <strong>{state.steps.length}</strong>
            </span>
            <span>
              Błędy: <strong>{state.mistakes}</strong>
            </span>
            {state.status === 'playing' && (
              <button className="ghost" onClick={() => confirm('Na pewno się poddajesz?') && dispatch({ type: 'giveUp' })}>
                Poddaj się
              </button>
            )}
          </div>

          {toast && <p className={`toast toast-${toast.kind}`}>{toast.text}</p>}

          {state.status === 'playing' ? (
            <div className="layout">
              <SearchBox discovered={state.discovered} busy={busy} usedTrackIds={usedTrackIds} onPick={pick} />
              <aside>
                <DiscoveredList artists={state.discovered} latest={latest} />
                {state.steps.length > 0 && <h2>Twoja ścieżka</h2>}
                <PlayerPath steps={state.steps} />
              </aside>
            </div>
          ) : (
            <>
              <WinScreen state={state} onNext={mode === 'random' ? () => load('random') : undefined} />
              {state.steps.length > 0 && (
                <section>
                  <h2>Twoja ścieżka</h2>
                  <PlayerPath steps={state.steps} />
                </section>
              )}
            </>
          )}
        </main>
      )}
    </div>
  );
}
