# Co zmienia ta gałąź

<!-- Jedno, dwa zdania: co i po co. Bez listy plików - to widać w diffie. -->

## Zakres

- Etap roadmapy:
- Moduł (wg `docs/architecture.md`):

## Jak to sprawdziłem

<!-- Konkretnie: jakie komendy, jakie dane, co zobaczyłem. Nie "przetestowane". -->

- [ ] `npm run verify` przechodzi lokalnie
- [ ] `npm run verify:db` przechodzi lokalnie (jeśli zmiana dotyka `supabase/`)
- [ ] Sprawdziłem ręcznie ścieżkę:

## Czego nie sprawdziłem

<!-- Sekcja obowiązkowa. Uczciwa lista luk jest cenniejsza niż zapewnienie, że
     wszystko działa. Jeśli czegoś nie dało się sprawdzić, napisz dlaczego. -->

-

## Wpływ na dane i bezpieczeństwo

- [ ] Nowa migracja jest dopisana, żadna istniejąca nie została zmieniona
- [ ] Nowe tabele mają włączone RLS i polityki w migracji `0014` lub nowszej
- [ ] `database.types.ts` zregenerowany razem z migracją
- [ ] Żaden sekret nie trafił do repozytorium ani do logów

## Wpływ na treść i jakość

- [ ] Zmiana nie otwiera drogi do publikacji bez akceptacji redaktora
- [ ] Zmiana promptu ma podbitą wersję w `PROMPT_VERSIONS` i opis różnicy
- [ ] Nie dodano tekstów clickbaitowych ani automatycznej publikacji
