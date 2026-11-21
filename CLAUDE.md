# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projekt: On the Feat

Gra webowa (UI po polsku): gracz dostaje wykonawcę startowego i docelowego i łączy ich piosenkami nagranymi wspólnie przez kilku wykonawców. Dane pochodzą z publicznego Deezer API (bez klucza, bez CORS, dlatego przez serwer).

## Komendy

```bash
npm install                     # instaluje wszystkie workspaces
npm run dev                     # serwer (:3001, tsx watch) + Vite (:5173, proxy /api -> :3001)
npm test                        # vitest w server/
npm test -w server -- test/validate.test.ts      # jeden plik
npm test -w server -- -t "przykład z Matą"       # jeden test po nazwie
npm run typecheck               # tsc w server i client
npm run build && npm start      # produkcja: Hono serwuje client/dist
```

Konfiguracja w `.env` w katalogu głównym (patrz `.env.example`): `ADMIN_PASSWORD` (bez niego `/api/admin/*` zwraca 401), `PORT`, `DB_PATH`. Panel admina jest pod `/admin`.

Wymaga Node ≥ 22.13 (`node:sqlite`, bez natywnych zależności). Pliki TS importujemy z rozszerzeniem `.ts`; serwer działa przez `tsx` bez kroku budowania.

## Architektura

npm workspaces: `shared/` (same typy DTO, importowane jako `@onthefeat/shared`), `server/` (Node + Hono), `client/` (Vite + React).

**Warstwa Deezera** (`server/src/deezer/`): `client.ts` cachuje każdą odpowiedź w SQLite (`cache.ts`, tabela `cache` z TTL) i ogranicza tempo (~40 zapytań / 5 s, limit Deezera to 50). W testach fetcher podmienia się przez `setFetcher` (`server/test/fake-deezer.ts`), więc testy nie łączą się z siecią; `VITEST` przełącza bazę na `:memory:`.

**Tożsamość wykonawcy to znormalizowana nazwa, nie id.** Deezer ma zduplikowane konta (np. dwa konta „Mata” z albumami) i „wykonawców złożonych” („Helena Vondrácková & Karel Gott”). Dlatego:
- `normName()` w `deezer/normalize.ts` to klucz porównań wszędzie (walidacja, wykluczanie z wyszukiwania, węzły BFS);
- `participants.ts` rozbija nazwy złożone (tylko gdy wszystkie części istnieją jako osobni wykonawcy) i dokłada gości z tytułu „(feat. X)”;
- `graph.ts#neighbors` łączy utwory ze wszystkich kont o tej samej nazwie (`siblingIds`).

**Zasady gry** (`game/validate.ts`): ruch jest poprawny, gdy w utworze występuje któryś z już odkrytych wykonawców (dowolny, nie tylko ostatni) i ktoś nowy. Walidacja jest bezstanowa: klient wysyła listę odkrytych id.

**Uczciwość wyszukiwania** to kluczowy wymóg produktu. Gracz nie może wpisać odkrytego wykonawcy i przeglądać jego utworów w poszukiwaniu połączeń:
- `/api/search/tracks` szuka tylko w tytułach (`track:"..."`), a wyniki pokazują tytuł oczyszczony z „feat.” i tylko głównego wykonawcę;
- `/api/search/artists` pomija odkrytych (także duplikaty i nazwy złożone zawierające odkrytego);
- `/api/artist/:id/tracks` zwraca 403 dla odkrytego wykonawcy;
- minimum 3 znaki, maksymalnie 10 wyników.

**Generowanie par** (`game/generator.ts`, `game/graph.ts`, `game/challenges.ts`):
- Graf współpracy budowany jest leniwie z `/artist/{id}/top` i cachowany (`nb:<nazwa>`). Pomija wykonawców złożonych, więc jest podzbiorem ruchów akceptowanych przez walidację.
- `shortestPath` to dwukierunkowy BFS z budżetem rozwinięć, więc `optimalLength` znaczy „najkrótsza znana ścieżka”.
- Wyzwanie dnia: wpis admina albo `generateFamousPair`. Oba końce pochodzą z ręcznej listy bardzo znanych wykonawców (`data/seed-artists.ts#FAMOUS_ARTISTS`) i nie mogą być połączone bezpośrednio (ścieżka ≥ 2). Ziarno PRNG to data (Europe/Warsaw), wynik zapisuje się w `daily_challenges`. Serwer co godzinę przygotowuje w tle wyzwanie na dziś i jutro (`warmDaily`), bo na zimnym cache generowanie trwa nawet ~80 s.
- Tryb losowy: losowy spacer po grafie od `SEED_ARTISTS`. Gotowe pary leżą w puli `random_challenges`, uzupełnianej w tle.
- Przyszłe wyzwania dnia i ich rozwiązania są ukryte przed graczami (403).

**Klient**: bez routera (`main.tsx` sprawdza, czy ścieżka to `/admin`). Stan gry trzyma `state/gameStore.ts` (reducer), zapisywany w `localStorage` pod `onthefeat:game:<challengeId>`.
