import { useCallback, useEffect, useReducer } from 'react';
import type { Artist, Challenge, MoveResult, PathStep } from '@onthefeat/shared';

export interface Step {
  track: MoveResult['track'];
  linkedVia: Artist[];
  newArtists: Artist[];
}

export interface GameState {
  challenge: Challenge;
  discovered: Artist[];
  steps: Step[];
  mistakes: number;
  status: 'playing' | 'won' | 'gaveup';
  solution?: PathStep[] | null;
}

type Action =
  | { type: 'load'; state: GameState }
  | { type: 'move'; result: MoveResult }
  | { type: 'giveUp' }
  | { type: 'solution'; path: PathStep[] | null };

export const newGame = (challenge: Challenge): GameState => ({
  challenge,
  discovered: [challenge.start],
  steps: [],
  mistakes: 0,
  status: 'playing',
});

function reducer(state: GameState | null, action: Action): GameState | null {
  if (action.type === 'load') return action.state;
  if (!state) return state;
  switch (action.type) {
    case 'move': {
      const r = action.result;
      if (!r.valid) return { ...state, mistakes: state.mistakes + 1 };
      return {
        ...state,
        discovered: [...state.discovered, ...r.newArtists],
        steps: [...state.steps, { track: r.track, linkedVia: r.linkedVia, newArtists: r.newArtists }],
        status: r.won ? 'won' : state.status,
      };
    }
    case 'giveUp':
      return { ...state, status: 'gaveup' };
    case 'solution':
      return { ...state, solution: action.path };
  }
}

const storageKey = (challengeId: string) => `onthefeat:game:${challengeId}`;

export function loadSaved(challengeId: string): GameState | null {
  try {
    const raw = localStorage.getItem(storageKey(challengeId));
    return raw ? (JSON.parse(raw) as GameState) : null;
  } catch {
    return null;
  }
}

/** Stan gry; każda zmiana trafia do localStorage (wyzwanie dnia przetrwa odświeżenie strony). */
export function useGame() {
  const [state, dispatch] = useReducer(reducer, null);

  useEffect(() => {
    if (!state) return;
    try {
      localStorage.setItem(storageKey(state.challenge.id), JSON.stringify(state));
    } catch {
      /* brak dostępu do localStorage – gra działa dalej bez zapisu */
    }
  }, [state]);

  const start = useCallback((challenge: Challenge) => {
    dispatch({ type: 'load', state: loadSaved(challenge.id) ?? newGame(challenge) });
  }, []);

  return { state, dispatch, start };
}

const playedKey = 'onthefeat:random-played';

export function playedRandom(): string[] {
  try {
    return JSON.parse(localStorage.getItem(playedKey) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function markRandomPlayed(token: string): void {
  try {
    localStorage.setItem(playedKey, JSON.stringify([...new Set([...playedRandom(), token])].slice(-200)));
  } catch {
    /* ignorujemy */
  }
}
