export interface Artist {
  id: number;
  name: string;
  picture?: string;
  /** Liczba fanów na Deezerze (tylko w panelu admina – pomaga wybrać właściwe z duplikatów kont). */
  fans?: number;
}

export interface TrackResult {
  id: number;
  title: string;
  /** Główny wykonawca według Deezera. Goście celowo nie są zwracani. */
  artist: Artist;
  cover?: string;
  preview?: string;
}

export interface PathStep {
  from: Artist;
  track: { id: number; title: string };
  to: Artist;
}

export interface Challenge {
  /** "daily:YYYY-MM-DD" albo "random:<token>" */
  id: string;
  date?: string;
  start: Artist;
  target: Artist;
  optimalLength: number | null;
}

export interface ChallengeSolution {
  path: PathStep[];
}

export type MoveFailReason = 'no-discovered-artist' | 'nothing-new' | 'track-not-found';

export interface MoveRequest {
  trackId: number;
  discovered: number[];
  targetId: number;
}

export interface MoveResult {
  valid: boolean;
  reason?: MoveFailReason;
  track: { id: number; title: string; artist: Artist; cover?: string };
  /** Odkryci wykonawcy obecni w utworze (przez nich prowadzi połączenie). */
  linkedVia: Artist[];
  newArtists: Artist[];
  won: boolean;
}

export interface DailyEntry {
  date: string;
  start: Artist;
  target: Artist;
  optimalLength: number | null;
  source: 'admin' | 'generated';
}

export interface AdminPreview {
  path: PathStep[] | null;
  optimalLength: number | null;
  warning?: string;
}
