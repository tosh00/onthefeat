import { useEffect, useMemo, useState } from 'react';
import { CATEGORIES, type AdminPreview, type Artist, type Category, type DailyEntry } from '@onthefeat/shared';
import { adminApi } from '../api.ts';
import { Avatar } from '../components/ArtistChips.tsx';
import { SolutionPath } from '../components/PathGraph.tsx';
import { useDebounced } from '../useDebounced.ts';

const PASS_KEY = 'onthefeat:admin';

function ArtistPicker({
  label,
  value,
  onChange,
  search,
}: {
  label: string;
  value: Artist | null;
  onChange: (a: Artist | null) => void;
  search: (q: string) => Promise<Artist[]>;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Artist[]>([]);
  const dq = useDebounced(q.trim());

  useEffect(() => {
    if (dq.length < 2) return setResults([]);
    let alive = true;
    search(dq).then((r) => alive && setResults(r), () => alive && setResults([]));
    return () => {
      alive = false;
    };
  }, [dq, search]);

  if (value) {
    return (
      <div className="picker picked">
        <span className="label">{label}</span>
        <Avatar artist={value} size={32} />
        <strong>{value.name}</strong>
        <span className="muted">#{value.id}</span>
        <button className="ghost" onClick={() => onChange(null)}>
          zmień
        </button>
      </div>
    );
  }
  return (
    <div className="picker">
      <span className="label">{label}</span>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Szukaj wykonawcy…" />
      {results.length > 0 && (
        <ul className="results">
          {results.map((a) => (
            <li key={a.id}>
              <button className="result" onClick={() => (onChange(a), setQ(''))}>
                <Avatar artist={a} size={28} />
                <span className="result-main">{a.name}</span>
                <span className="muted">{(a.fans ?? 0).toLocaleString('pl-PL')} fanów · #{a.id}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Admin() {
  const [password, setPassword] = useState(() => sessionStorage.getItem(PASS_KEY) ?? '');
  const [authed, setAuthed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const api = useMemo(() => adminApi(password), [password]);

  const [date, setDate] = useState(() => {
    const d = new Date(Date.now() + 86400000);
    return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
  });
  const [category, setCategory] = useState<Category>('pl-hits');
  const [start, setStart] = useState<Artist | null>(null);
  const [target, setTarget] = useState<Artist | null>(null);
  const [preview, setPreview] = useState<AdminPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<DailyEntry[]>([]);

  const refresh = () => api.list().then(setList, (e: Error) => setError(e.message));

  const login = async () => {
    setError(null);
    try {
      await api.ping();
      sessionStorage.setItem(PASS_KEY, password);
      setAuthed(true);
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    if (password) void login();
  }, []);

  useEffect(() => setPreview(null), [start, target]);

  const run = async (fn: () => Promise<AdminPreview>) => {
    setBusy(true);
    setError(null);
    try {
      setPreview(await fn());
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!authed) {
    return (
      <div className="app admin">
        <h1>Panel admina</h1>
        <form
          className="login"
          onSubmit={(e) => {
            e.preventDefault();
            void login();
          }}
        >
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Hasło" />
          <button type="submit">Zaloguj</button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="app admin">
      <h1>Panel admina – wyzwania dnia</h1>
      <p className="muted">
        Każdy dzień ma osobne wyzwanie w każdej kategorii. Deezer ma zduplikowane konta wykonawców – wybieraj to z
        największą liczbą fanów. Kategorie bez wpisu dostają automatycznie parę z puli kategorii bez bezpośredniego
        połączenia (w „Dziczy” – całkowicie losową).
      </p>

      <section className="admin-form">
        <label>
          Data <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Kategoria
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.label}
              </option>
            ))}
          </select>
        </label>
        <ArtistPicker label="Start" value={start} onChange={setStart} search={api.artists} />
        <ArtistPicker label="Cel" value={target} onChange={setTarget} search={api.artists} />
        <div className="actions">
          <button disabled={!start || !target || busy} className="secondary" onClick={() => run(() => api.preview(start!.id, target!.id))}>
            Sprawdź ścieżkę
          </button>
          <button disabled={!start || !target || busy} onClick={() => run(() => api.save(date, category, start!.id, target!.id))}>
            Zapisz na {date} ({CATEGORIES.find((c) => c.id === category)?.label})
          </button>
        </div>
        {busy && <p className="muted">Przeszukuję graf współprac… (może potrwać do minuty)</p>}
        {error && <p className="error">{error}</p>}
        {preview && (
          <div className="preview">
            {preview.warning && <p className="toast toast-bad">{preview.warning}</p>}
            {preview.path && (
              <>
                <p>
                  Najkrótsza znana ścieżka: <strong>{preview.optimalLength}</strong>
                  {preview.optimalLength === 1 && ' – połączenie bezpośrednie, będzie bardzo łatwo!'}
                </p>
                <SolutionPath path={preview.path} />
              </>
            )}
          </div>
        )}
      </section>

      <section>
        <h2>Zaplanowane i rozegrane</h2>
        <table className="daily-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Kategoria</th>
              <th>Para</th>
              <th>Ścieżka</th>
              <th>Źródło</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((d) => (
              <tr key={d.date + d.category}>
                <td>{d.date}</td>
                <td>{CATEGORIES.find((c) => c.id === d.category)?.emoji ?? d.category}</td>
                <td>
                  {d.start.name} → {d.target.name}
                </td>
                <td>{d.optimalLength ?? '—'}</td>
                <td>{d.source === 'admin' ? 'admin' : 'auto'}</td>
                <td>
                  <button className="ghost" onClick={() => api.remove(d.date, d.category).then(refresh)}>
                    usuń
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
