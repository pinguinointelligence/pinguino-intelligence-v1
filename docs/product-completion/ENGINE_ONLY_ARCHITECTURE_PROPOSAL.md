# ENGINE-ONLY ARCHITECTURE PROPOSAL — READY FOR OWNER DECISION
(read-only audit, nightly/integration @ a55f5fc; nic nie zmieniono, nie commitowano, nie deployowano; branche addendum/M zamrożone)

## 1. Executive verdict

Produkt, którego chcesz, JEST osiągalny na istniejącym, niezmiennym silniku — ale silnik **wyłącznie OCENIA** kompletną recepturę (nigdy nie generuje gramów). Generacja gramów to osobna warstwa i tu leży cała kontaminacja. Kluczowe odkrycie matematyczne audytu: przy równości partii **każda metryka bandów silnika jest liniowa lub liniowo-ułamkowa w wektorze gramów** — generacja kompletnej receptury to mały, deterministyczny program wypukły (least-squares do środków złotych bandów), a istniejący solver korekt już robi dokładnie tę sztuczkę w 1–2 wymiarach (solveAddition/solvePair). Warstwa formulacji NIE wymaga pełnego przepisania: wymienić trzeba JEDEN etap (seed szablonowy + proporcjonalny normalize-fill) na analityczny seed QP; cały audytowany aparat uczciwości (FormulationProof, detektor skalowania, drzwi Apply, role trace, cykl wykluczeń, draftRevision) przechodzi bez zmian. Twarde bramy naukowe: brak metryki stabilizatora, kotwice lodu tylko dla mleka, brak bandów dla rodziny Protein.

## 2. What went wrong

(1) Szablony weszły jako „zatwierdzone punkty startowe", a `normalize()` proporcjonalnie upychał role w wolną kopertę — gdy solver nie wykonał żadnego ruchu (błąd kolejności bramki pojemności + zwolnienia trybu constrained; naprawione przez A3), projekcja wyjeżdżała jako „sformułowana receptura". (2) `fruit_gelato_ref_v1` to gram-w-gram kopia fixture'a QA raspberry-premium (status `reference_derived`, nigdy nie zatwierdzony). (3) Toolbox/solver ADD-y używają **literaturowych** kompozycji `DEFAULT_CORRECTION_CANDIDATES` (confidence 85, pac/pod null), etykietując linię realnym ID Mappera — żywy surogat. (4) Owoce są oceniane na fallbackowych bandach mlecznych, bo `fruit_gelato` nigdy nie dostał własnych. (5) `STARTER_TEMPLATES` duplikują gramy szablonów drugi raz i karmią flow klienta demoIngredients.

## 3. Engine truth map (niezmienne, udowodnione)

- `calculateRecipe`: 13 składowych, POD/PAC/NPAC (kanonicznie per-water), udział lodu (interpolacja kotwic, przesuw 2 pkt/°C), 11 wskaźników, nutrition, koszty null-honest, score; puste wejście → null, nigdy NaN. Deterministyczny, wersjonowany (0.4.0/0.7.0), zero fałszywych score'ów (przypięte CI).
- **Natywne bandy istnieją dla 12 komórek: milk_gelato, chocolate_gelato, sorbet, vegan_gelato × −11/−12/−13.** Sorbet = system 6-metrykowy (bez tłuszczu i bramek mlecznych), vegan = 7. NIEzasiane: fruit/nut/alcohol/custom (fallback do mleka) i cała rodzina Protein.
- Kotwice lodu: tylko 3 wiersze, wszystkie milk_gelato — lód sorbetu/vegan/czekolady liczy się na mapie mlecznej (udokumentowany fallback).
- Kalibracja zewnętrzna: 4 aktywne fixtury (tylko −11), 11 pending; lód i koszt nigdy nie są asertowane w tolerancji.
- Solver korekt: pełna ponowna ocena silnikiem, Złoty Środek (rozwiązuje do ŚRODKA bandu), ruchy 1–2-wymiarowe, strict-improvement, uczciwe stopy — wystarczający jako weryfikator/polerka, NIEwystarczający jako samodzielny generator.

## 4. Contamination inventory (skrót; pełne tabele w ledgerach A2-audytu i AGENT4)

| Lokalizacja | Wpływ | Akcja finalna |
|---|---|---|
| templateRegistry (8 zatwierdzonych szablonów) | gramy seedu | REPLACE WITH ENGINE-DRIVEN LOGIC (seed QP); zatwierdzone gramy → KEEP AS DOCUMENTATION/testy kalibracyjne |
| fruit_gelato_ref_v1 (z fixture'a QA) | gramy+nauka | DELETE FROM RUNTIME (decyzja produktowa #P1 rozwiązuje potrzebę) |
| intentRecipeDraft STARTER_TEMPLATES + demoIngredients w flow klienta | gramy klienta | REPLACE WITH ENGINE-DRIVEN LOGIC + REAL MAPPER DATA |
| DEFAULT_CORRECTION_CANDIDATES (literaturowe kompozycje w ADD-ach) | nauka dodanych linii | REPLACE WITH REAL MAPPER DATA (fetch po kanonicznym PI-ING-* przy dodaniu) |
| Fallback bandów mlecznych dla owoców | nauka+score | rozwiązuje decyzja produktowa #P1 (owoc = Gelato) / OWNER SCIENCE dla nut/alcohol |
| normalize() proporcjonalny fill jako finał | gramy | REPLACE (seed QP + istniejący detektor skalowania pilnuje) |
| Surogat malinowy PI-ING-001553 | testy | ISOLATE TO TESTS (już tylko testowy; realna truskawka jest Verified z pac/pod) |
| /start fixture cards, /label sample, demo preset /pro, kafle /recipes, landing demo | UI | pozostają PINK do wymiany na realne źródła (już oznaczone) |
| In-memory adaptery, goldenRecipes, sampleCatalogue | — | już czyste: DEV-gated / test-only (zweryfikowane ponownie) |

## 5. Architecture options

**A — Seed analityczny (QP):** role z wymiarów kompozycji ograniczanych bandami; wybór składników z zatwierdzonego katalogu; gramy = least-squares do środków natywnych bandów przy równości partii, blokadach, nieujemności i strukturze ról (liniowe/liniowo-ułamkowe → 1 iteracja odświeżenia mianownika); potem rafinacja weryfikowana silnikiem. Deterministyczny, tani (n≤10 zmiennych), wykrywa niewykonalność (pusty region = dowód). Ryzyko: QP to surogat — clamp lodu i progi warn idealizuje.
**B — Czyste iteracyjne szukanie od neutralnego seedu:** obecny zestaw ruchów 1–2-wymiarowych NIE uniesie generacji od zera (potwierdzone własnym wnioskiem audytu odzyskiwania); wymagałby nowego wielowymiarowego silnika ruchów — większe ryzyko, mniejsza wyjaśnialność.
**C — Hybryda (A-seed + istniejąca pętla fixed-point jako werdykt):** wymienia DOKŁADNIE jeden etap w istniejącym szwie; wszystko w dół strumienia (merge tożsamości, przywracanie partii, strict-improvement, drzwi Apply, proof, detektor skalowania z `seedBaselineGrams := rozwiązanie QP`) bez zmian.

## 6. Recommended architecture: **C**

Silnik (nie surogat QP) pozostaje jedynym źródłem werdyktu; QP daje deterministyczny, naukowo umocowany seed (środki złotych bandów zamiast cudzych receptur); istniejąca pętla konwertuje „matematycznie optymalne" na „zweryfikowany fixed point silnika" i niesie cały aparat uczciwości. Cztery czysto programowe rozszerzenia solvera (bez nauki): naprawa mianownika NPAC w RatioModel (per-water, dziś D=B), ruchy wielowymiarowe przez re-seed QP w pętli, kandydaci ADD z realnych wierszy Mappera, honorowanie wykluczeń na ścieżce lokalnej (już zgłoszone agentowi addendum).

## 7. Family model

**Gelato / Sorbet / Protein / Vegan — koniec.** Wewnętrzne polityki obliczeń silnika (milk_gelato/chocolate_gelato) to kategorie SILNIKA, nie rodziny produktu. **Owoc = składnik**: truskawkowe gelato = Gelato liczone na NATYWNYCH bandach gelato (decyzja #P1 do ratyfikacji) — to jednym ruchem likwiduje kategorię `fruit_gelato`, jej referencyjny szablon i całą „prowizoryczność" owoców. Nut/alcohol jako warianty smakowe Gelato — jak owoc (lub OWNER SCIENCE, jeśli mają mieć własne bandy). **Protein — DOMKNIĘTE (patrz §7B), nie „unsupported".**

## 7A. Multi-stabilizer selection (pełny dokument: STABILIZER_SELECTOR_SCIENCE.md)

Stabilizator = ROLA „system stabilizujący" z odrębnymi, niewymiennymi tożsamościami — nigdy jeden zaszyty produkt. **PI Stabilizer (50/30/20 LBG/tara/guar) = rekomendacja, nie przymus.**
- **Model kandydatów**: każda tożsamość (PI Stabilizer jako JEDEN produkt „PI Stabilizer — X,X g", kompozycja pod „Szczegóły"; blendy komercyjne; czyste gumy; blend własny; „bez stabilizatora") ma własną kanoniczną tożsamość, kompozycję, regułę dawki + bazę + wersję + źródło + status weryfikacji. Dawka blendu NIGDY nie przechodzi na czystą gumę; dawka produktu A nigdy na B.
- **Kompatybilność/ranking**: per rodzina × temperatura; literatura wspiera TYLKO wolną wodę / niską zawartość tłuszczu jako kierunkowy modulator (bez walidowanego współczynnika → dawka = stała ratyfikowana per tożsamość). **Odrzucone jawnie**: % owoców, % kakao, % białka, flaga `stabilizer_activity`.
- **Dawka**: deterministyczny kontrakt (gramy, % miksu, baza, wersja reguły, źródło, pewność, wyjaśnienie po polsku); ten sam przepis + wybór ⇒ zawsze ta sama dawka. Przykłady akceptacyjne (milk-gelato −11, 1000 g): PI Stabilizer 2,3 g (DO RATYFIKACJI) · blend komercyjny 5,0 g (wymaga weryfikacji) · czysta tara 1,9 g (walidowana G17/G18) · czysty guar — odmowa (brak reguły) · bez — 0 g (uczciwa nota, bez fałszywej kary).
- **UX**: „Wybierz stabilizator" → karta rekomendowana + zgodne alternatywy; „Nie mam tego" oznacza TĘ tożsamość niedostępną i liczy WŁASNĄ dawkę następnego kandydata; „Mam własny" → weryfikacja albo „Wymaga weryfikacji" z listą braków; „Bez stabilizatora" → najlepsza receptura + jawnie niegwarantowane właściwości.
- **⚠ KRYTYCZNE ODKRYCIE**: kanon (2,3/2,8/2,5/1,8 g/kg + produkt PI Stabilizer) **nie istnieje w żadnym pliku/commicie/wierszu** — projekt ma trzy NIEZGODNE systemy (seedy szablonów czystej tary 5/1,9/0,8; jednolite okno Mappera 0,2–1% jako boilerplate; model roboczy 1,8–2,1). Sorbet: kanon 2,8 vs szablon 0,8 (3,5×, poniżej własnej podłogi Mappera). Dawki BLENDU kanonu (0,18–0,28%) zgadzają się z literaturą (0,2–0,5%) — to SZABLONY są odstające (transkrypcja z receptur czystej tary). **Ostrzeżenie W1**: 50/30/20 to 100% galaktomannanów bez partnera helisowego — literatura wskazuje, że sam LBG+guar nie tworzy sieci anty-whey-off bez CMC/karagenu (wiąże wodę, ale nie żeluje) — istotne przy wysokim białku. Silnik NIE MA metryki stabilizatora (przesuw tary 5→1,4 g rusza każdy score <0,1). → **9 punktów ratyfikacji R1–R8 + W1** (m.in. wybór dawek per profil, utworzenie wiersza PI Stabilizer w Mapperze, deduplikacja LBG PI-ING-000475/001384, sprzeczność sorbetu).

## 7B. Protein family — DOMKNIĘTE (pełny dokument: PROTEIN_FAMILY_SCIENCE.md)

Białko ledwie rusza punkt zamarzania (wysoka masa cząsteczkowa) — to fakt nośny: bandy dziedziczą pod/npac/lód milk_gelato per temperatura, a re-kotwiczy się tylko metryki białkowe.
- **Tiery (PROPOSED-FOR-OWNER-RATIFICATION)**: P1 domyślny **8 g/100 g** (7–9), P2 opcjonalny **12 g/100 g** (10–13); per porcja auto z `nutrition.ts` × [60/70/80 g].
- **Bandy** `protein` × −11/−12/−13 zbudowane WYŁĄCZNIE na istniejących metrykach silnika: dziedziczą pod/npac/lód/alkohol; re-kotwiczą aerating_protein ([7,9]/[10,13]) i protein_in_solids ([16,24]/[22,32]); lactose min→0; strażnik sandiness utrzymany; korekta solids/water pod masę białka.
- **Źródła z REALNEGO Mappera (Verified, engine-ready)**: WPC80 PI-ING-000295, whey niskolaktozowe PI-ING-000264, MPC75 PI-ING-000237, WPC60 PI-ING-000294, SMP PI-ING-000270, groch PI-ING-000451, ryż, jajo. Ograniczenia jako **jawne ostrzeżenia dowodowe** (nigdy sfabrykowane score'y): pułap akceptowalności whey ~10% (12–14% ziarniste/gorzkie), roślinne << mleczne w hedonice, sandiness = laktoza miksu <7%.
- **Luki (uczciwie)**: brak wierszy WPI, kazeiny micelarnej/kazeinianu, soi (najczystsze dźwignie niskolaktozowe + podstawa tieru P2); anomalia „lactose-free" PI-ING-000285/000283 niosące 41–52% laktozy (niewiarygodne dla strażnika); `aerating_protein_percent` kurowany, ale **ignorowany przez silnik** (używa total protein %); **luka ról** — mleczne proszki białkowe (solids≥85) rozwiązują się do `milk_solids`, nigdy `protein_source` (zapadnięty ternary `ingredientRoles.ts:65`); dawka stabilizatora bez auto-korekty (brak walidowanej formuły). QP-seed (arch. C) działa bez zmian — metryki białkowe są już liniowo-ułamkowe w gramach (solver.ts:218–247). 7 decyzji ownera O1–O7.

## 8. Ingredient-data contract

Mapper v1.0 jest KOMPLETNY: pełna kompozycja/100 g + pod/pac (skala sacharoza=100) + de + stabilizer_activity + okna dozowania + koszt; **0 wierszy bez pac/pod**; realne truskawki Verified. Kontrakt na linię: żywe pobranie po PI-ING-* → cykl życia (aktywny, approved_for_engines, verification_status) → dane (pac+pod, split kompozycji) → rola. Odrzucenie zamiast surogatu: Blocked/duplikat/nieaktywny → twardy reject; brak pac/pod → „wymaga weryfikacji" ze wskazaniem pól; częściowy produkt markowy → istniejący resolver (measured > reference_linked z ujawnieniem > unresolved). DWA NOWE defekty do naprawy programowej: (a) `ingredientRoles.ts:54` — próg PAC 1.3 na złej skali (realna sacharoza pac=100 klasyfikuje się jako cukier mrożeniowy!); (b) mapa kategorii mówi v0.94 (18 kategorii) vs 48 żywych → ~737 wierszy trafia do silnika jako 'other'.

## 9. One-screen customer workflow

Jeden ekran (budowany właśnie workbench): (1) wybór rodziny [Gelato|Sorbet|Protein|Vegan]; (2) smak/składniki własnymi słowami lub z pickera (realne PI-ING-*); (3) system sam dokłada WYMAGANE ROLE z zatwierdzonego katalogu i liczy seed QP → rafinacja → kompletna receptura z wyjaśnieniem każdego dodania; (4) żywy wynik techniczny /10 obok edytora; (5) „Niedostępny" na składniku → natychmiastowe przeliczenie → „Bez dekstrozy w pełni optymalna receptura nie jest osiągalna. Najlepsza zweryfikowana: 8/10" + które metryki poza złotym zakresem + jaka rola/składnik dałaby 10/10; (6) Zastosuj → Zapisz. Zero żargonu w ścieżce standardowej; PAC/role/tryby tylko w szczegółach.

## 10. Migration plan (bramkowany, odwracalny; rodzina po rodzinie za flagą na szwie S1)

**F0** Zamrożenie: silnik nietknięty; tag bazowy; flaga `formulationEngine: 'template' | 'engine_only'` na szwie `buildOptimizePreview`. Stop: bramki zielone.
**F1** Kwarantanna: toolbox ADD-y przechodzą na realne wiersze Mappera (fetch po kanonicznym ID; literatura → testy); naprawa dwóch defektów danych (skala PAC ról, mapa kategorii v1.0). Stop: testy autentyczności linii dodanych.
**F2** Generator QP (czysta funkcja, feature-flag OFF): role z bandów, seed do środków, dowody niewykonalności; testy własności (determinizm, blokady byte-exact, partia, brak duplikatów). Stop: T-suite offline na milk_gelato −11/−12/−13 = AUTHENTIC-OPTIMAL lub udowodniony fixed point.
**F3** Rodzina 1: **Gelato** (w tym owocowe na bandach gelato po decyzji #P1) za flagą na staging; rerun T1–T20; porównania MyGelato jako diagnostyka. Stop: akceptacja klik-testów.
**F4** Rodzina 2: **Sorbet** (uwaga: band lodu na mlecznych kotwicach — udokumentowana aproksymacja lub decyzja #S2). **F5** Vegan. **F6** Protein = ekran „unsupported do czasu bandów".
**F7** Usunięcie ścieżki szablonowej z runtime (szablony → dokumentacja/testy kalibracyjne), zdjęcie flagi, kasacja STARTER_TEMPLATES z flow klienta, wymiana powierzchni PINK na realne źródła. Każda faza: cel, pliki, testy akceptacyjne, warunek stopu, decyzje ownera — bez merge przy czerwonym.

## 11. Acceptance tests (finałowe strażniki)

Brak importu templateRegistry/demoIngredients/goldenRecipes z runtime (test grafu modułów); linia dodana przez PI = realny wiersz Mappera (pac/pod niezerowe, is_verified); zero surogatów (PI-ING-001553 tylko w testach); zero bandów fallback w ścieżce Gelato/Sorbet/Vegan; detektor skalowania: seed QP ≠ prezentowany wynik bez zweryfikowanych ruchów LUB jawny proof fixed-point; stabilizator bez modelu → linia nieobecna + komunikat unsupported (nigdy odziedziczona dawka); determinizm bajtowy; constrained: locks byte-exact/impossible-z-dowodem/nearest-feasible; wszystkie istniejące zamrożone suity zielone.

## 12. Owner decisions required

**PRODUKTOWE:** P1 — ratyfikuj: owocowe gelato liczy się na natywnych bandach Gelato (likwidacja fruit_gelato i szablonu referencyjnego); analogicznie nut/alcohol? P2 — czym zastąpić fixture'owe „gotowe receptury" na /start do czasu realnego katalogu (ukryć sekcję vs zostawić PINK)? P3 — semantyka usunięcia wiersza (obecnie: usuwa bez wykluczania; wykluczenie tylko jawną akcją) — potwierdź jako finalny kontrakt.
**NAUKOWE:** S1 — stabilizator: zatwierdź model dawki (np. okno Mappera 0.2–1% jako reguła per rodzina) ALBO utrzymaj „unsupported" (bez tary w recepturach do czasu modelu); sprzeczność do rozstrzygnięcia: okno vs seedy referencyjne 0.8/1.9 g. S2 — kotwice lodu dla sorbet/vegan/chocolate (dostarczyć wiersze albo zatwierdzić mleczną aproksymację jako udokumentowaną). S3 — bandy rodziny Protein (albo pozostaje unsupported). S4 — kalibracja −12/−13 (aktywne fixtury są tylko dla −11).
**PROGRAMOWE (bez Twojego wkładu, wymienione dla przejrzystości):** naprawa skali PAC w rolach; mapa kategorii v1.0; realne wiersze w ADD-ach; mianownik NPAC w RatioModel; generator QP za flagą.

---

(Sekcje §7A stabilizator i §7B Protein powyżej zastępują wcześniejszy roboczy Addendum A. Pełna nauka: STABILIZER_SELECTOR_SCIENCE.md + PROTEIN_FAMILY_SCIENCE.md. Silnik nietknięty; zero implementacji/deployu do akceptacji ownera.)

# FINAL STATUS

`ENGINE-ONLY ARCHITECTURE — ALL FOUR FAMILIES + MULTI-STABILIZER SELECTION READY FOR OWNER APPROVAL`
