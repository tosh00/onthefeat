# On the Feat – połącz wykonawców piosenkami

Gra webowa: dostajesz dwóch wykonawców, np. **Mata** i **Helena Vondráčková**, i łączysz ich łańcuchem piosenek nagranych wspólnie (duety, feat.). Wpisujesz „To tylko wiosna” i odkrywasz Marylę Rodowicz. Od tej chwili możesz iść dalej od Maty albo od Maryli.

- **Kategorie**: 🎤 Rap, 🇵🇱 Polskie hity, 🌍 Zagraniczny pop, 🎲 Dzicz (całkowicie losowi wykonawcy).
- **Wyzwanie dnia**: codziennie po jednym w każdej kategorii, takie samo dla wszystkich graczy. To para znanych wykonawców bez bezpośredniego połączenia. Admin może ustawić parę ręcznie w `/admin`.
- **Losowa para**: generowana automatycznie w wybranej kategorii.
- Wyszukiwanie po tytule albo po wykonawcy. Odkrytych wykonawców nie da się wyszukać, więc musisz pamiętać, z kim nagrali.

Dane: [Deezer API](https://developers.deezer.com/api).

## Uruchomienie

```bash
cp .env.example .env    # ustaw ADMIN_PASSWORD
npm install
npm run dev             # http://localhost:5173
```

Produkcja: `npm run build && npm start` (serwer na `PORT`, domyślnie 3001). Wymaga Node ≥ 22.13.
