import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORIES, isCategory, type Category, type MoveFailReason, type TrackResult } from '@onthefeat/shared';
import { api } from '../api.ts';
import { Matchup } from '../components/ArtistChips.tsx';
import { PlayerPath } from '../components/PathGraph.tsx';
import { ProgressGraph } from '../components/ProgressGraph.tsx';
import { SearchBox } from '../components/SearchBox.tsx';
import { WinScreen } from '../components/WinScreen.tsx';
import {
  loadSaved,
  markRandomPlayed,
  playedRandom,
  saveCategory,
  savedCategory,
  todayWarsaw,
  useGame,
} from '../state/gameStore.ts';

type Mode = 'daily' | 'random';

const REASONS: Record<MoveFailReason, string> = {
  'no-discovered-artist': 'W tym utworze nie występuje nikt z odkrytych wykonawców.',
  'nothing-new': 'Ten utwór nie odkrywa nikogo nowego.',
  'track-not-found': 'Nie udało się sprawdzić tego utworu.',
};

export function Game() {
  const [mode, setMode] = useState<Mode>('daily');
  const [category, setCategory] = useState<Category>(() => {
    const c = savedCategory();
    return isCategory(c) ? c : 'pl-hits';
  });
  const requestId = useRef(0);
  const { state, dispatch, start } = useGame();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);

  const load = useCallback(
    async (m: Mode, c: Category) => {
      // Szybkie przełączanie kategorii: liczy się tylko odpowiedź na ostatnie żądanie.
      const id = ++requestId.current;
      setLoading(true);
      setLoadError(null);
      setToast(null);
      try {
        const ch = m === 'daily' ? await api.daily(c) : await api.random(c, playedRandom());
        if (id !== requestId.current) return;
        if (m === 'random') markRandomPlayed(ch.id.slice('random:'.length));
        start(ch);
      } catch (e) {
        if (id === requestId.current) setLoadError((e as Error).message);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [start],
  );

  useEffect(() => {
    void load(mode, category);
  }, [mode, category, load]);

  const chooseCategory = (c: Category) => {
    setCategory(c);
    saveCategory(c);
  };

  // Które dzisiejsze wyzwania są już zakończone (✓ na zakładce kategorii).
  const dailyDone = useMemo(() => {
    const date = todayWarsaw();
    return new Set(
      CATEGORIES.filter((c) => {
        const saved = loadSaved(`daily:${date}:${c.id}`);
        return saved && saved.status !== 'playing';
      }).map((c) => c.id),
    );
    // state w zależnościach: odświeżamy po każdym ruchu (np. wygranej)
  }, [state]);

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

      <nav className="categories" aria-label="Kategoria">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            className="category"
            aria-pressed={category === c.id}
            onClick={() => chooseCategory(c.id)}
          >
            <span aria-hidden>{c.emoji}</span> {c.label}
            {mode === 'daily' && dailyDone.has(c.id) && <span className="done" aria-label="ukończone"> ✓</span>}
          </button>
        ))}
      </nav>

      {loading && <p className="muted center">Przygotowuję wyzwanie… (za pierwszym razem może to chwilę potrwać)</p>}
      {loadError && (
        <p className="error center">
          {loadError} <button onClick={() => load(mode, category)}>Spróbuj ponownie</button>
        </p>
      )}

      {!loading && !loadError && state && (
        <main>
          <p className="muted center">
            {CATEGORIES.find((c) => c.id === state.challenge.category)?.description}
            {state.challenge.date && ` · wyzwanie z dnia ${state.challenge.date}`}
          </p>
          <Matchup start={state.challenge.start} target={state.challenge.target} won={state.status === 'won'} />

          <div className="stats">
            <span>
              Ruchy: <strong>{state.steps.length}</strong>
            </span>
            <span>
              Odkryci: <strong>{state.discovered.length}</strong>
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

          {state.status !== 'playing' && (
            <WinScreen state={state} onNext={mode === 'random' ? () => load('random', category) : undefined} />
          )}

          <div className={`layout ${state.status !== 'playing' ? 'layout-done' : ''}`}>
            {state.status === 'playing' && (
              <SearchBox discovered={state.discovered} busy={busy} usedTrackIds={usedTrackIds} onPick={pick} />
            )}
            <section className="progress">
              <ProgressGraph state={state} />
              {state.steps.length > 0 && (
                <details className="history">
                  <summary>Historia ruchów ({state.steps.length})</summary>
                  <PlayerPath steps={state.steps} />
                </details>
              )}
            </section>
          </div>
        </main>
      )}
    </div>
  );
}
