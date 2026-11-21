import type { Artist } from '@onthefeat/shared';
import type { DzArtist } from './client.ts';

/** Klucz porównawczy nazwy: małe litery, bez diakrytyków, pojedyncze spacje. */
export function normName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const SEPARATORS = /\s*(?:&|,|\+|\/|\bx\b|\bfeat\.?|\bft\.?|\bfeaturing\b|\bvs\.?|\bi\b|\band\b)\s*/i;

/** "Helena Vondrácková & Karel Gott" -> ["Helena Vondrácková", "Karel Gott"] */
export function splitArtistName(name: string): string[] {
  const parts = name
    .split(SEPARATORS)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : [name.trim()];
}

const FEAT_IN_TITLE = /[([]\s*(?:feat\.?|ft\.?|featuring|with|gość:?|gosc:?)\s+([^)\]]+)[)\]]|\s-\s*(?:feat\.?|ft\.?)\s+(.+)$/gi;

/** Nazwy gości wyciągnięte z tytułu, np. "Tytuł (feat. A & B)" -> ["A", "B"]. */
export function featuredFromTitle(title: string): string[] {
  const out: string[] = [];
  for (const m of title.matchAll(FEAT_IN_TITLE)) {
    const chunk = m[1] ?? m[2];
    if (chunk) out.push(...splitArtistName(chunk));
  }
  return out;
}

/** Tytuł bez dopisków "(feat. ...)". */
export function cleanTitle(title: string): string {
  return title.replace(FEAT_IN_TITLE, '').trim();
}

export function toArtist(a: DzArtist): Artist {
  return { id: a.id, name: a.name, picture: a.picture_medium };
}
