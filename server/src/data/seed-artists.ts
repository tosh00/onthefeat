/**
 * Wykonawcy, o których „każdy słyszał”. Z tej listy losowane są OBA końce wyzwania dnia.
 * Nazwy muszą dokładnie (po normalizacji) odpowiadać nazwie na Deezerze; nierozpoznane są pomijane.
 */
export const FAMOUS_ARTISTS = [
  'Maryla Rodowicz',
  'Krzysztof Krawczyk',
  'Dawid Podsiadło',
  'Doda',
  'Edyta Górniak',
  'Kayah',
  'Kazik',
  'Taco Hemingway',
  'Mata',
  'sanah',
  'Ewa Farna',
  'Michał Szpak',
  'Zbigniew Wodecki',
  'Andrzej Piaseczny',
  'Natalia Kukulska',
  'Golec uOrkiestra',
  'Quebonafide',
  'Margaret',
  'Sylwia Grzeszczak',
  'Lady Pank',
  'Budka Suflera',
  'Perfect',
  'Bajm',
  'Myslovitz',
  'Ich Troje',
  'Czesław Niemen',
  'Krzysztof Zalewski',
  'Brodka',
  'Kortez',
  'Viki Gabor',
  'Cleo',
  'Bedoes',
  'Karel Gott',
  'Helena Vondrackova',
];

/** Dodatkowe punkty startowe trybu losowego (obok FAMOUS_ARTISTS). */
export const SEED_ARTISTS = [
  ...FAMOUS_ARTISTS,
  'Ralph Kaminski',
  'Paluch',
  'Pezet',
  'O.S.T.R.',
  'Tede',
  'Sokół',
  'Daria Zawiałow',
  'Grzegorz Turnau',
  'Young Leosia',
  'Kukon',
  'Ania Dąbrowska',
  'Igo',
  'Smolasty',
  'Sobel',
];

/** Minimalna łączna liczba fanów na Deezerze (polscy wykonawcy mają ich tam mało, np. Maryla ~12 tys.), by wykonawca nadawał się na cel trybu losowego. */
export const MIN_FANS = 3000;
