import { useEffect, useMemo, useRef, useState } from 'react';
import type { Artist, TrackResult } from '@onthefeat/shared';
import { api } from '../api.ts';
import { useDebounced } from '../useDebounced.ts';
import { Avatar } from './ArtistChips.tsx';

const MIN_QUERY = 3;
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const MAX_ARTISTS = 5;

interface Props {
  discovered: Artist[];
  busy: boolean;
  usedTrackIds: Set<number>;
  onPick: (track: TrackResult) => void;
}

type Item = { kind: 'artist'; artist: Artist } | { kind: 'track'; track: TrackResult };

/**
 * Jedno pole wyszukiwania: pokazuje naraz nieodkrytych wykonawców (klik = ich utwory)
 * i utwory pasujące tytułem. Katalogów odkrytych wykonawców nie da się przeglądać –
 * serwer pomija ich w podpowiedziach i szuka utworów wyłącznie po tytule.
 */
export function SearchBox({ discovered, busy, usedTrackIds, onPick }: Props) {
  const [query, setQuery] = useState('');
  const [artist, setArtist] = useState<Artist | null>(null);
  const [artistTracks, setArtistTracks] = useState<TrackResult[]>([]);
  const [tracks, setTracks] = useState<TrackResult[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const debounced = useDebounced(query.trim());
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Wybrany wykonawca mógł właśnie zostać odkryty – wtedy wracamy do wyszukiwania.
  useEffect(() => {
    if (artist && discovered.some((d) => d.id === artist.id || d.name === artist.name)) closeArtist();
  }, [discovered]);

  useEffect(() => {
    setError(null);
    setActive(0);
    if (artist || debounced.length < MIN_QUERY) {
      setTracks([]);
      setArtists([]);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    Promise.all([api.searchArtists(debounced, discovered, ctrl.signal), api.searchTracks(debounced, discovered, ctrl.signal)])
      .then(([a, t]) => {
        setArtists(a.slice(0, MAX_ARTISTS));
        setTracks(t);
      })
      .catch((e: Error) => e.name !== 'AbortError' && setError(e.message))
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    // Przerwane zapytanie nie gasi wskaźnika – robi to następne uruchomienie efektu.
    return () => ctrl.abort();
  }, [debounced, artist, discovered]);

  const openArtist = async (a: Artist) => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.artistTracks(a.id, discovered);
      setArtist(r.artist);
      setArtistTracks(r.tracks);
      setQuery('');
      setActive(0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  function closeArtist() {
    setArtist(null);
    setArtistTracks([]);
    setQuery('');
    inputRef.current?.focus();
  }

  // Sekcja wykonawców idzie na górę tylko, gdy wpisany tekst to dokładnie nazwa wykonawcy.
  const artistsFirst = !artist && artists.some((a) => norm(a.name) === norm(debounced));

  // W widoku wykonawcy pole działa jako filtr jego utworów.
  const items: Item[] = useMemo(() => {
    if (artist) {
      const f = query.trim().toLowerCase();
      return artistTracks.filter((t) => t.title.toLowerCase().includes(f)).map((track) => ({ kind: 'track', track }));
    }
    const a = artists.map((x): Item => ({ kind: 'artist', artist: x }));
    const t = tracks.map((x): Item => ({ kind: 'track', track: x }));
    return artistsFirst ? [...a, ...t] : [...t, ...a];
  }, [artist, artistTracks, query, artists, tracks, artistsFirst]);

  const choose = (item: Item) => {
    if (item.kind === 'artist') void openArtist(item.artist);
    else if (!busy && !usedTrackIds.has(item.track.id)) onPick(item.track);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.max(0, Math.min(items.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1)));
      setActive(next);
      listRef.current?.querySelector(`[data-idx="${next}"]`)?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && items[active]) {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === 'Escape' && artist) {
      closeArtist();
    } else if (e.key === 'Backspace' && artist && !query) {
      closeArtist();
    }
  };

  const renderItem = (item: Item, idx: number) => {
    const cls = `result ${idx === active ? 'result-active' : ''}`;
    if (item.kind === 'artist') {
      const a = item.artist;
      return (
        <li key={'a' + a.id}>
          <button className={cls} data-idx={idx} onMouseEnter={() => setActive(idx)} onClick={() => choose(item)}>
            <Avatar artist={a} size={36} />
            <span className="result-main">{a.name}</span>
            <span className="muted">utwory →</span>
          </button>
        </li>
      );
    }
    const t = item.track;
    const used = usedTrackIds.has(t.id);
    return (
      <li key={'t' + t.id}>
        <button className={cls} data-idx={idx} disabled={busy || used} onMouseEnter={() => setActive(idx)} onClick={() => choose(item)}>
          {t.cover ? <img className="cover" src={t.cover} alt="" width={36} height={36} /> : <span className="cover" />}
          <span className="result-main">
            {t.title}
            <span className="muted"> · {t.artist.name}</span>
          </span>
          {used && <span className="muted">użyty</span>}
        </button>
      </li>
    );
  };

  const showEmpty = !loading && !error && !artist && debounced.length >= MIN_QUERY && !items.length;

  const sections: { title: string | null; from: number; to: number }[] = [];
  if (artist) sections.push({ title: null, from: 0, to: items.length });
  else {
    const order: [string, number][] = artistsFirst
      ? [['Wykonawcy', artists.length], ['Utwory', tracks.length]]
      : [['Utwory', tracks.length], ['Wykonawcy', artists.length]];
    let from = 0;
    for (const [title, n] of order) {
      if (n) sections.push({ title, from, to: from + n });
      from += n;
    }
  }

  return (
    <section className="search">
      <div className="search-field">
        {artist && (
          <span className="scope">
            <Avatar artist={artist} size={22} />
            {artist.name}
            <button className="scope-x" onClick={closeArtist} aria-label="Wróć do wyszukiwania">
              ×
            </button>
          </span>
        )}
        <input
          ref={inputRef}
          className="query"
          autoFocus
          placeholder={artist ? 'Filtruj utwory…' : 'Tytuł piosenki albo wykonawca, którego jeszcze nie odkryłeś…'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Szukaj utworu lub wykonawcy"
        />
      </div>

      <p className="hint">
        {artist
          ? `Utwory: ${artist.name}. Wybierz ten, w którym występuje ktoś z odkrytych.`
          : 'Odkrytych wykonawców nie da się wyszukać – musisz pamiętać, z kim nagrali.'}
      </p>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Szukam…</p>}

      <div ref={listRef}>
        {sections.map((sec) => (
          <div key={sec.title ?? 'artist'}>
            {sec.title && <h3 className="results-head">{sec.title}</h3>}
            <ul className="results">{items.slice(sec.from, sec.to).map((it, i) => renderItem(it, sec.from + i))}</ul>
          </div>
        ))}
      </div>

      {showEmpty && <p className="muted">Brak wyników.</p>}
    </section>
  );
}
