import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Artist, TrackResult } from '@onthefeat/shared';
import { api } from '../api.ts';
import { useDebounced } from '../useDebounced.ts';

const MIN_QUERY = 3;

interface Props {
  discovered: Artist[];
  busy: boolean;
  usedTrackIds: Set<number>;
  onPick: (track: TrackResult) => void;
}

const fold = (s: string) => s.toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Pogrubia fragmenty tekstu, od których zaczynają się wpisane słowa (bez względu na diakrytyki). */
function highlight(text: string, query: string): ReactNode {
  const words = fold(query).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  // fold() musi zachować długość, żeby indeksy pasowały do oryginału – inaczej bez podświetlenia.
  const folded = fold(text);
  if (!words.length || folded.length !== text.length) return text;
  const marks = new Array<boolean>(text.length).fill(false);
  for (const w of words) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gu');
    for (const m of folded.matchAll(re)) {
      const start = m.index! + m[1].length;
      for (let i = start; i < start + w.length; i++) marks[i] = true;
    }
  }
  const out: ReactNode[] = [];
  let i = 0;
  while (i < text.length) {
    let j = i;
    while (j < text.length && marks[j] === marks[i]) j++;
    out.push(marks[i] ? <b key={i}>{text.slice(i, j)}</b> : text.slice(i, j));
    i = j;
  }
  return out;
}

/**
 * Wyszukiwarka w stylu Spotify: jedno pole (tytuł, wykonawca albo oba naraz) i jedna lista utworów.
 * Serwer nie dopasowuje nazw odkrytych wykonawców, więc nie da się przeglądać ich katalogów.
 */
export function SearchBox({ discovered, busy, usedTrackIds, onPick }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TrackResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const debounced = useDebounced(query.trim(), 250);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setError(null);
    setActive(0);
    if (debounced.length < MIN_QUERY) {
      setResults([]);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    api
      .searchTracks(debounced, discovered, ctrl.signal)
      .then(setResults)
      .catch((e: Error) => e.name !== 'AbortError' && setError(e.message))
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
  }, [debounced, discovered]);

  const choose = (t: TrackResult) => {
    if (busy || usedTrackIds.has(t.id)) return;
    onPick(t);
    inputRef.current?.select();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.max(0, Math.min(results.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1)));
      setActive(next);
      listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === 'Escape') {
      setQuery('');
    }
  };

  const stale = query.trim() !== debounced;
  const showEmpty = !loading && !stale && !error && debounced.length >= MIN_QUERY && !results.length;

  return (
    <section className="search">
      <div className="search-field">
        <span className="search-icon" aria-hidden>
          ⌕
        </span>
        <input
          ref={inputRef}
          className="query"
          autoFocus
          placeholder="Szukaj utworu – tytuł, wykonawca albo oba"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Szukaj utworu po tytule i wykonawcy"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="search-results"
          aria-activedescendant={results[active] ? `result-${results[active].id}` : undefined}
        />
        {query && (
          <button
            className="scope-x"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            aria-label="Wyczyść"
          >
            ×
          </button>
        )}
      </div>

      <p className="hint">
        Np. „to tylko wiosna” albo „bang szczyl”. Nazwy odkrytych wykonawców nie są wyszukiwane – musisz pamiętać,
        z kim nagrali.
      </p>

      {error && <p className="error">{error}</p>}

      <ul className={`results ${loading || stale ? 'results-loading' : ''}`} id="search-results" role="listbox" ref={listRef}>
        {results.map((t, idx) => {
          const used = usedTrackIds.has(t.id);
          return (
            <li key={t.id} id={`result-${t.id}`} role="option" aria-selected={idx === active}>
              <button
                className={`result ${idx === active ? 'result-active' : ''}`}
                disabled={busy || used}
                onMouseEnter={() => setActive(idx)}
                onClick={() => choose(t)}
                tabIndex={-1}
              >
                {t.cover ? <img className="cover" src={t.cover} alt="" width={40} height={40} /> : <span className="cover" />}
                <span className="result-main">
                  <span className="result-title">{highlight(t.title, debounced)}</span>
                  <span className="result-artist">{highlight(t.artist.name, debounced)}</span>
                </span>
                {used && <span className="muted">użyty</span>}
              </button>
            </li>
          );
        })}
      </ul>

      {loading && !results.length && <p className="muted">Szukam…</p>}
      {showEmpty && <p className="muted">Brak wyników. Spróbuj dodać lub zmienić słowo z tytułu.</p>}
    </section>
  );
}
