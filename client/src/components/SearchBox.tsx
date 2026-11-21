import { useEffect, useRef, useState } from 'react';
import type { Artist, TrackResult } from '@onthefeat/shared';
import { api } from '../api.ts';
import { useDebounced } from '../useDebounced.ts';
import { Avatar } from './ArtistChips.tsx';

const MIN_QUERY = 3;
type Mode = 'title' | 'artist';

interface Props {
  discovered: Artist[];
  busy: boolean;
  usedTrackIds: Set<number>;
  onPick: (track: TrackResult) => void;
}

/**
 * Wyszukiwarka utworów. Celowo nie pozwala przeglądać katalogu odkrytych wykonawców:
 * po tytule szukamy tylko w tytułach, a po wykonawcy podpowiadamy wyłącznie nieodkrytych.
 */
export function SearchBox({ discovered, busy, usedTrackIds, onPick }: Props) {
  const [mode, setMode] = useState<Mode>('title');
  const [query, setQuery] = useState('');
  const [artist, setArtist] = useState<Artist | null>(null);
  const [tracks, setTracks] = useState<TrackResult[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounced = useDebounced(query.trim());
  const inputRef = useRef<HTMLInputElement>(null);

  // Po odkryciu nowych wykonawców wybrany wykonawca może stać się "odkryty" – wtedy go zamykamy.
  useEffect(() => {
    if (artist && discovered.some((d) => d.id === artist.id || d.name === artist.name)) setArtist(null);
  }, [discovered, artist]);

  useEffect(() => {
    setError(null);
    if (artist || debounced.length < MIN_QUERY) {
      setTracks([]);
      setArtists([]);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const req =
      mode === 'title'
        ? api.searchTracks(debounced, ctrl.signal).then((r) => (setTracks(r), setArtists([])))
        : api.searchArtists(debounced, discovered, ctrl.signal).then((r) => (setArtists(r), setTracks([])));
    req
      .catch((e: Error) => e.name !== 'AbortError' && setError(e.message))
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
  }, [debounced, mode, artist, discovered]);

  const openArtist = async (a: Artist) => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.artistTracks(a.id, discovered);
      setArtist(r.artist);
      setTracks(r.tracks);
      setFilter('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setArtist(null);
    setTracks([]);
    setArtists([]);
    inputRef.current?.focus();
  };

  const visibleTracks = artist
    ? tracks.filter((t) => t.title.toLowerCase().includes(filter.trim().toLowerCase()))
    : tracks;

  return (
    <section className="search">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={mode === 'title'} onClick={() => switchMode('title')}>
          Po tytule
        </button>
        <button role="tab" aria-selected={mode === 'artist'} onClick={() => switchMode('artist')}>
          Po wykonawcy
        </button>
      </div>

      {artist ? (
        <div className="artist-header">
          <button className="ghost" onClick={() => setArtist(null)} aria-label="Wróć do wyszukiwania">
            ←
          </button>
          <Avatar artist={artist} size={32} />
          <strong>{artist.name}</strong>
          <input
            className="filter"
            placeholder="Filtruj utwory…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      ) : (
        <input
          ref={inputRef}
          className="query"
          autoFocus
          placeholder={mode === 'title' ? 'Wpisz tytuł piosenki…' : 'Wpisz wykonawcę, którego jeszcze nie odkryłeś…'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}

      <p className="hint">
        {mode === 'title'
          ? 'Wybierz utwór, w którym występuje któryś z odkrytych wykonawców i ktoś nowy.'
          : 'Odkrytych wykonawców nie da się wyszukać – musisz pamiętać, z kim nagrali.'}
      </p>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Szukam…</p>}

      {!artist && artists.length > 0 && (
        <ul className="results">
          {artists.map((a) => (
            <li key={a.id}>
              <button className="result" onClick={() => openArtist(a)}>
                <Avatar artist={a} size={36} />
                <span className="result-main">{a.name}</span>
                <span className="muted">utwory →</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {visibleTracks.length > 0 && (
        <ul className="results">
          {visibleTracks.map((t) => {
            const used = usedTrackIds.has(t.id);
            return (
              <li key={t.id}>
                <button className="result" disabled={busy || used} onClick={() => onPick(t)}>
                  {t.cover ? <img className="cover" src={t.cover} alt="" width={36} height={36} /> : <span className="cover" />}
                  <span className="result-main">
                    {t.title}
                    <span className="muted"> · {t.artist.name}</span>
                  </span>
                  {used && <span className="muted">użyty</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!loading && !error && debounced.length >= MIN_QUERY && !artist && !tracks.length && !artists.length && (
        <p className="muted">Brak wyników.</p>
      )}
    </section>
  );
}
