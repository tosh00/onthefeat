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
- jest jedno wyszukiwanie w stylu Spotify, `/api/search/tracks`: tytuł i wykonawca naraz („bang szczyl”), wynikiem jest jedna lista utworów;
- Deezer ignoruje składnię `track:"..."`/`artist:"..."`, więc serwer szuka zwykłym zapytaniem i sam filtruje w `routes/search.ts#rankTracks`;
- każde wpisane słowo musi być początkiem słowa z tytułu (bez „feat.”) albo z nazwy NIEodkrytego głównego wykonawcy; nazwy odkrytych (`isBlocked`, także duplikaty i nazwy złożone) niczego nie dopasowują, a goście nie są przeszukiwani;
- pasujące tytuły z topów odkrytych wykonawców trafiają na górę, bo popularne tytuły zasypują ich utwory;
- wyniki pokazują tylko tytuł oczyszczony z „feat.” i głównego wykonawcę; minimum 3 znaki, maksymalnie 12 wyników.

**Kategorie i generowanie par** (`shared` → `CATEGORIES`; `data/categories.ts`, `game/generator.ts`, `game/graph.ts`, `game/challenges.ts`):
- Kategorie: `rap` (polski i zagraniczny), `pl-hits`, `foreign-pop`, `wild` („Dzicz”). Pule wykonawców są w `data/categories.ts`.
- Graf współpracy budowany jest leniwie z `/artist/{id}/top` i cachowany (`nb:<nazwa>`). Pomija wykonawców złożonych, więc jest podzbiorem ruchów akceptowanych przez walidację.
- `shortestPath` to dwukierunkowy BFS z budżetem rozwinięć, więc `optimalLength` znaczy „najkrótsza znana ścieżka”.
- `generatePair(category)`: dla kategorii z listą oba końce pochodzą z puli i nie mogą być połączone bezpośrednio (ścieżka ≥ 2). „Dzicz” (`generateWildPair`) robi losowy spacer od znanego wykonawcy: 1–3 kroki do startu, potem 4–6 kroków do celu, ścieżka ≥ 3.
- Wyzwanie dnia: jedno na kategorię (tabela `daily`, klucz `(date, category)`, id `daily:<data>:<kategoria>`). Źródłem jest wpis admina albo generator z ziarnem PRNG = id. Serwer co godzinę przygotowuje w tle dzisiejsze i jutrzejsze wyzwania wszystkich kategorii (`warmDaily`), bo na zimnym cache generowanie trwa nawet ~80 s.
- Tryb losowy: pula `random_pool` per kategoria, uzupełniana w tle. `purgeStalePool` przy starcie usuwa pary, których końców nie ma już na liście kategorii.
- `cache.ts#migrate` przenosi dane ze starego schematu (sprzed kategorii).
- Przyszłe wyzwania dnia i ich rozwiązania są ukryte przed graczami (403).

**Klient**: bez routera (`main.tsx` sprawdza, czy ścieżka to `/admin`). Wybrana kategoria jest pamiętana w `localStorage`. Stan gry trzyma `state/gameStore.ts` (reducer), zapisywany w `localStorage` pod `onthefeat:game:<challengeId>`. Postęp pokazuje `components/ProgressGraph.tsx` (`react-force-graph-2d`): węzły to wykonawcy (klucz = znormalizowana nazwa, jak na serwerze), krawędzie to utwory, a start i cel są przypięte (`fx`/`fy`) na przeciwnych krańcach. `SearchBox` to jedno pole i jedna lista utworów (combobox z nawigacją klawiaturą i podświetleniem dopasowań).
