import { describe, expect, it } from 'vitest';
import { cleanTitle, featuredFromTitle, normName, splitArtistName } from '../src/deezer/normalize.ts';

describe('normName', () => {
  it('ignoruje diakrytyki, ł i wielkość liter', () => {
    expect(normName('Helena Vondráčková')).toBe(normName('HELENA vondrackova'));
    expect(normName('Czesław Niemen')).toBe('czeslaw niemen');
    expect(normName('  O.S.T.R. ')).toBe('o s t r');
  });
});

describe('splitArtistName', () => {
  it('rozbija wykonawców złożonych', () => {
    expect(splitArtistName('Helena Vondrácková & Karel Gott')).toEqual(['Helena Vondrácková', 'Karel Gott']);
    expect(splitArtistName('Mata x Maryla Rodowicz')).toEqual(['Mata', 'Maryla Rodowicz']);
    expect(splitArtistName('A feat. B, C')).toEqual(['A', 'B', 'C']);
  });
  it('zostawia pojedyncze nazwy', () => {
    expect(splitArtistName('Malcolm X')).toEqual(['Malcolm X']);
    expect(splitArtistName('Maryla Rodowicz')).toEqual(['Maryla Rodowicz']);
  });
});

describe('goście w tytule', () => {
  it('wyciąga feat. z tytułu', () => {
    expect(featuredFromTitle('Małgośka (feat. Maryla Rodowicz)')).toEqual(['Maryla Rodowicz']);
    expect(featuredFromTitle('Song [ft. A & B]')).toEqual(['A', 'B']);
    expect(featuredFromTitle('Song - feat. Kazik')).toEqual(['Kazik']);
    expect(featuredFromTitle('Zwykły tytuł (Live)')).toEqual([]);
  });
  it('cleanTitle ukrywa gości', () => {
    expect(cleanTitle('Małgośka (feat. Maryla Rodowicz)')).toBe('Małgośka');
    expect(cleanTitle('To tylko wiosna (Live MTV Unplugged)')).toBe('To tylko wiosna (Live MTV Unplugged)');
  });
});
