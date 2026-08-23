# GELLATTI — Mapper-First Product Intelligence

**Data:** 2026-08-23
**Gałąź:** `claude/intimport-mapper-first` (worktree `pinguino-intelligence-v1-mapper-first`)
**Baza:** `origin/staging` @ `72d328eb4da05925b8b1253fa3329e870b48cba4`
**Koszt zewnętrzny tego etapu:** **0 web calls, 0 OpenAI calls, 0 Vision calls, 0 zapisów do bazy.**

---

## 1. Co zostało zbudowane

Nowa warstwa zamienia to, co Mapper już wie, w **realne wartości robocze** produktów,
których Gellatti nigdy nie widział. Wartość oszacowana ląduje w tym samym polu
kanonicznym co zmierzona — Engine, Recipe, Monitor, Score, POD/PAC, odżywianie,
Etykieta, Preview i Apply czytają ją identycznie. Różnica żyje w proweniencji, nie
w użyteczności.

| Moduł | Rola |
|---|---|
| `src/features/product-intelligence/productFieldTruth.ts` | Model stanu pola: `VERIFIED` / `ESTIMATED` / `UNKNOWN` + pewność + podstawa + odwołania do wierszy Mappera + wersja algorytmu + odcisk Mappera |
| `src/features/product-intelligence/mapperValueInference.ts` | Pięć poziomów wnioskowania z Mappera, każdy bramkowany rozrzutem kohorty |
| `src/features/product-intelligence/productWorkingValues.ts` | Scalenie deklaracja → Mapper → domknięcie arytmetyczne; werdykt gotowości |
| `src/features/product-intelligence/mapperFirstIntelligence.test.ts` | 28 testów pilnujących własności bezpieczeństwa |
| `src/features/product-intelligence/__dryrun__/mapperFirst.dryrun.test.ts` | Lokalny przebieg na pełnych 820 wierszach, zero płatnych wywołań |

### Poziomy wnioskowania (od najmocniejszego)

1. **`mapper_exact`** — GTIN produktu jest polem `ean_code` wiersza Mappera. To jest
   tożsamość, więc wartości są `VERIFIED`, nie oszacowane.
2. **`mapper_simple_profile`** — nazwa produktu JEST surowcem, który Mapper już definiuje.
3. **`mapper_similar_profile`** — najbliżsi sąsiedzi po ważonym pokryciu tokenów nazwy.
4. **`mapper_brand_sibling`** — inne wiersze tej samej marki w tej samej podkategorii.
5. **`mapper_family_consensus`** — kohorta wywnioskowanej rodziny Mappera.

Poziomy 2–5 są **bramkowane rozrzutem osobno dla każdego pola**. Kohorta, która się nie
zgadza, nie produkuje NICZEGO dla tego pola — nigdy środka szerokiego rozrzutu.
To najważniejsza własność całej warstwy: bramka stoi na zgodności, nie na tym, żeby
mieć odpowiedź.

### Czego warstwa nigdy nie robi

* Nie zapisuje do Mappera, nie dodaje wierszy, nie zmienia autorytetu Mappera.
  Odcisk pliku po przebiegu: `b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38`
  — **identyczny** z wartością historyczną. 2088 wierszy, 62 kolumny.
* Nie szacuje tożsamości ani faktów prawnych. `NEVER_ESTIMATED_FACTS` obejmuje EAN,
  markę, producenta, skład, **alergeny**, deklaracje wegańskie/bezmleczne/bezglutenowe,
  dozowanie, kraj pochodzenia. **Nieznane alergeny pozostają nieznane** — nigdy nie
  wnioskujemy „brak alergenów".
* `VERIFIED` zawsze wypiera `ESTIMATED`, nigdy odwrotnie — niezależnie od pewności.
* Techniczny ProductBehavior pozostaje fail-closed.

---

## 2. Wynik pełnego lokalnego przebiegu na 820 produktach

Plik: `~/Desktop/PL_Poland.csv`, 820 wierszy, 0 duplikatów, 0 nieprawidłowych.
Pełny raport maszynowy: `docs/products/mapper_first_dryrun.json`.

| Miara | Wynik |
|---|---|
| Produkty ocenione | **820** |
| Produkty, którym Mapper dał **co najmniej jedno pole** (odrębne) | **578** |
| — użyły `mapper_similar_profile` | 348 |
| — użyły `mapper_family_consensus` | 366 |
| — użyły `mapper_simple_profile` | 6 |
| Produkty z **kompletnym profilem 9 pól** | **119** |
| Produkty **gotowe dla Engine** (kompletne **i** ≥85%) | **13** |
| Zablokowane autorytetem technicznym (mimo kompletnych liczb) | 6 |
| Do przeglądu | 807 |

Poziomy sumują się do 720, bo jeden produkt może korzystać z kilku poziomów;
odrębnych produktów jest **578**.

### Nie udało się odtworzyć 614/820

**Zmierzony wynik to 13/820 gotowych dla Engine, nie 614/820.** Nie stroiłem
progów, żeby zbliżyć się do tej liczby, i nie zamierzam. Poniżej dokładna diagnoza.

**Powód 1 — plik źródłowy prawie nie zawiera odżywiania.**
650 z 820 wierszy ma `Nutrition Basis = not_found`. Tylko ~155 wierszy niesie
jakiekolwiek zadeklarowane odżywianie. Benchmark 614 nie mógł powstać z danych
zadeklarowanych.

**Powód 2 — szerokie rodziny Mappera się nie zgadzają, i słusznie.**
Rodzina `flavor_paste` ma 618 wierszy Mappera — od pistacji po truskawkę. Jej
rozrzut międzykwartylowy na tłuszczu i cukrach jest ogromny, więc bramka odrzuca
pole. To zachowanie poprawne: rodzina jest prawdziwa, ale nie jest kohortą.
Dlatego dodałem poziom `mapper_similar_profile` — sąsiadów po tokenach nazwy — który
podniósł pokrycie ze 124 do 578 odrębnych produktów. To jednak nadal nie wystarcza na
komplet dziewięciu pól.

**Powód 3 — 106 kompletnych profili leży poniżej progu 85%, i to nie są przypadki graniczne.**
Rozkład pewności 119 kompletnych profili:

| Pewność | Produkty |
|---|---|
| ≥0.95 | 6 |
| 0.90–0.95 | 7 |
| 0.80–0.90 | 2 |
| 0.60–0.80 | 33 |
| 0.30–0.60 | 71 |

Większość siedzi w przedziale 0.45–0.60, nie tuż pod kreską. Obniżenie progu
wpuściłoby wartości, które są uczciwie słabe. Próg 85% robi realną robotę.

### Jak blisko są pozostałe produkty

| Brakujące pola Engine | Produkty |
|---|---|
| 0 (kompletne, ale poniżej progu) | 106 |
| 1 | 36 |
| 2 | 59 |
| 3 | 72 |
| 4–8 | 322 |
| 9 (nic) | 212 |

95 produktów jest oddalonych o jedno lub dwa pola. To jest właściwy cel dla
enrichmentu ze źródeł oficjalnych — najtańszy zysk na produkt.

---

## 3. Pytanie, na które tylko Ty możesz odpowiedzieć

**Co dokładnie liczyło Twoje 614?** Ta liczba decyduje, czy różnica to błąd mojej
bramki, czy inna definicja gotowości.

* Jeśli 614 = „produkt ma tożsamość, kategorię i **częściowy** profil" — moje
  **578 produktów, którym Mapper dał co najmniej jedno pole**, leży 6% od Twojej
  liczby. To jest moja hipoteza robocza, ale **nie potwierdzam jej** — bez Twojego
  pliku wynikowego to tylko zbieżność rzędu wielkości, nie dowód.
* Jeśli 614 = „produkt da się sformułować w Engine z pełnym profilem" — mam realną
  lukę i muszę zobaczyć, skąd Twoja metoda brała komplet dziewięciu pól przy
  650 wierszach bez odżywiania.

Jeśli masz plik `PL_Poland_GELLATTI_FINAL_READY.xlsx`, z którego wyszło 614 — nie ma
go na Desktopie (jest tylko `PL_Poland.xlsx`). Z nim mogę porównać produkt po
produkcie i wskazać dokładnie, gdzie nasze metody się rozjeżdżają.

---

## 4. Defekty znalezione i naprawione po drodze

1. **Polskie `ł` nigdy nie pasowało do żadnego wzorca rodziny.** `NFKD` nie
   rozkłada liter z kreską wewnątrz glifu, więc każdy polski wzorzec w klasyfikatorze
   (`maslo`, `bialko`, `slonecznikow`) po cichu nie działał — na polskim pliku
   importowym. Dodany jawny fold (`ł→l`, `đ→d`, `ø→o`, `ß→ss`).
2. **Autorytet techniczny wymazywał stan wartości.** 367 produktów zawodowych
   wracało jako `TECHNICAL_AUTHORITY_REQUIRED` niezależnie od tego, czy miały liczby.
   Rozdzielone: `valueReadiness` mówi o liczbach, `readiness` dokłada bramkę
   techniczną na wierzchu. Fail-closed zachowane, kompozycja pozostaje widoczna.
3. **Próg rodziny blokował wybór kohorty.** Próg 0.8 powstał dla podbijania
   *pewności*, gdzie jest nieweryfikowany. Zaproponowanie kohorty jest weryfikowane
   przez bramkę rozrzutu, więc dostało własny, niższy próg 0.6 (`FAMILY_COHORT_THRESHOLD`).
   Próg 0.8 dla pewności nietknięty.
4. **Wiersze Mappera z kategoriami `base_mix` i `flavor_paste` nie wchodziły do
   żadnej kohorty** — reguła `\bmix\b` nie mogła dopasować `base_mix`, bo podkreślnik
   jest znakiem słowa. Dodane reguły dla własnego słownika kategorii Mappera.
5. **Kohorta na zerowej ewidencji przyjmowała wszystko.** Zapytanie dzielące z
   Mapperem wyłącznie tokeny obecne w każdym wierszu dawało wynik 0 dla wszystkich
   kandydatów, a próg dopuszczenia `0.6 × 0` przepuszczał cały Mapper. Dodane
   zabezpieczenie.
6. **Reguła odrzucania częstych tokenów była zależna od skali.** Przy małym Mapperze
   wyrzucała tokeny doskonale rozróżniające. Dodany bezwzględny próg 20 wierszy.
7. **Próg gotowości był wzięty ze standardu kuracji Mappera, nie z kontraktu Engine.**
   `ingredientPodContribution` i `ingredientPacContribution` traktują puste
   `pod_value`/`pac_value` jako udokumentowany fallback do widma cukrów (a dla PAC
   także do `de_value`). Trzymanie produktów importowanych przy standardzie kuracji
   odrzucałoby produkty, którymi Engine już potrafi liczyć.
8. **Własna zła kalibracja poziomów.** Pierwsza krzywa dyskonta (`0.6 + 0.4×zgodność`)
   sprawiała, że konsensus rodziny nie mógł przekroczyć progu 0.85 nawet przy
   praktycznie jednomyślnej kohorcie — poziom byłby ozdobą. Poprawione **przed**
   pierwszym przebiegiem na 820 wierszach, nie po zobaczeniu wyniku.

---

9. **Naruszenie granicy Studio we własnym komentarzu.** `studioBoundary.test.ts`
   skanuje `src/features/` pod kątem nazw wewnętrznych Engine. Mój komentarz
   dokumentacyjny cytował z nazwy funkcje wkładu POD/PAC. Przeredagowany na opis
   ścieżek słodzenia i zamrażania bez nazw — uzasadnienie zachowane, strażnik
   przechodzi.

## 5. Stan testów

* 28 nowych testów własności bezpieczeństwa w `mapperFirstIntelligence.test.ts`.
* `src/features/product-intelligence/` + `studioBoundary` — 297 testów, wszystkie
  przechodzą.
* `tsc --noEmit` — czysto. `eslint` na nowych modułach — czysto.
* Pełny pakiet repo: **593 pliki, 7494 testy, wszystkie przechodzą** (kod wyjścia 0).

**Jeden test niestabilny, niezwiązany z tą zmianą.**
`mainTechnicalMaximum.test.ts > Apply then Undo restores a positive demoted
Standard line` przekracza domyślny limit 5 s przy obciążonej maszynie. Sprawdzone
na commicie bazowym `72d328e`: tam też pada (8449 ms uruchomiony pojedynczo).
To istniejąca wrażliwość na czas, nie regresja tej gałęzi — ale warto ją kiedyś
przyspieszyć albo dać jej własny limit.

Testy pilnują m.in.: `VERIFIED` nigdy nie ustępuje `ESTIMATED`; kohorta niezgodna
nie produkuje nic; kohorta mniejsza od minimum nie produkuje nic; fakty tożsamościowe
i prawne nigdy nie są szacowane; Mapper nie jest mutowany; produkt techniczny zostaje
fail-closed z zachowaną kompozycją; spirytus (0 cukru, 40% alkoholu) **nie** dostaje
POD/PAC równego zero.

---

## 6. Czego nie zrobiłem

* **Nie wdrożyłem na produkcję.** Nic nie zostało wdrożone — to jest gałąź robocza.
* **Nie wydałem ani jednego płatnego wywołania** na tym etapie.
* **Nie podłączyłem warstwy do UI ani do Apply.** Warstwa jest czysta i przetestowana,
  ale dopóki nie wiemy, czy jej wynik odpowiada Twojemu benchmarkowi, podpinanie jej
  pod Preview/Apply byłoby przedwczesne.
* **Nie stroiłem progów pod 614.**

## 7. Otwarte pozycje z wcześniejszych faz

* Uwierzytelniony smoke Scanner na prawdziwym zdjęciu — wymaga Twoich poświadczeń.
* Mały kontrolowany zapis testowy INTIMPORT — jw.
* `INTIMPORT_MAX_EXTERNAL_CALLS_PER_IMPORT` nadal na **6** (sufit QA).
* Decyzje właściciela z audytu Vegan §7: pasma −11/−12, fallback lodu mlecznego,
  18 produktów `VEGAN_CONFLICT`.
