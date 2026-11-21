import type {
  AdminPreview,
  Artist,
  Category,
  Challenge,
  DailyEntry,
  MoveResult,
  PathStep,
  TrackResult,
} from '@onthefeat/shared';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch('/api' + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((body as { error?: string }).error ?? `Błąd ${res.status}`, res.status);
  return body as T;
}

const ids = (artists: Artist[]) => artists.map((a) => a.id).join(',');
const qs = (params: Record<string, string>) => new URLSearchParams(params).toString();

export const api = {
  daily: (category: Category) => call<Challenge>(`/challenge/daily?${qs({ category })}`),
  random: (category: Category, exclude: string[]) =>
    call<Challenge>(`/challenge/random?${qs({ category, exclude: exclude.join(',') })}`),
  solution: (id: string) => call<{ path: PathStep[] | null }>(`/challenge/${encodeURIComponent(id)}/solution`),
  searchTracks: (q: string, discovered: Artist[], signal?: AbortSignal) =>
    call<TrackResult[]>(`/search/tracks?${qs({ q, discovered: ids(discovered) })}`, { signal }),
  move: (trackId: number, discovered: Artist[], targetId: number) =>
    call<MoveResult>('/move', {
      method: 'POST',
      body: JSON.stringify({ trackId, discovered: discovered.map((a) => a.id), targetId }),
    }),
};

export function adminApi(password: string) {
  const auth = { headers: { Authorization: `Bearer ${password}` } };
  return {
    ping: () => call<{ ok: true }>('/admin/ping', auth),
    artists: (q: string) => call<Artist[]>(`/admin/artists?${qs({ q })}`, auth),
    list: () => call<DailyEntry[]>('/admin/daily', auth),
    preview: (startId: number, targetId: number) =>
      call<AdminPreview>('/admin/preview', { ...auth, method: 'POST', body: JSON.stringify({ startId, targetId }) }),
    save: (date: string, category: Category, startId: number, targetId: number) =>
      call<AdminPreview>(`/admin/daily/${date}/${category}`, {
        ...auth,
        method: 'PUT',
        body: JSON.stringify({ startId, targetId }),
      }),
    remove: (date: string, category: Category) =>
      call<{ ok: true }>(`/admin/daily/${date}/${category}`, { ...auth, method: 'DELETE' }),
  };
}
