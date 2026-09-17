# GELLATTI SHOP — uzgodnienie stanu i infopak za 0 €

Raport z 2026-09-17, zamykający audyt: prompt v2 z uzupełnieniem „domknięcie audytu”.

**Zakres.** Audyt, gotowe teksty i jeden minimalny pakiet implementacji.

Jedyny wdrożony wyjątek to osobno zatwierdzona zmiana zdjęć 7 fizycznych produktów (sekcja H). Na polecenie właściciela z 2026-09-17 **PR #383 został scalony wyłącznie do `staging`** (merge `5ee5e467`), bez `main`, bez produkcji i bez ręcznego deployu.

## M. Korekta właściciela 2026-09-17 (wieczór): jeden PDF za 0 € per kraj, siedem składników Starter Packu

**Polecenie właściciela.** Jedna oferta za 0 €. PDF wyłącznie dla wybranego kraju, w jego właściwym języku, obejmujący wszystkie siedem pozycji Starter Packu z odpowiednimi lokalnymi zamiennikami. Mechanizmy zamówienia, logowania, historii i prywatnego pobierania zostają. Najpierw odszukać tabelę lokalnych odpowiedników siedmiu składników i wyjaśnić rozbieżność na podstawie źródeł.

### M1. Rozbieżność — co jest czym (źródła)

| Materiał | Co obejmuje | Źródło | Stan |
|---|---|---|---|
| Infopak v1/v1.1 („Składniki bazy lodów”) | 6 ról bazy (mleko, śmietanka 30%, SMP, cukier, dekstroza, stabilizator/tara) × 75 krajów, EN | brief właściciela 2026-09-12 „FREE 0€ PDF — 75-COUNTRY GELATO BASE GUIDE”; `GELLATTI_BAZA_GELATO_75_KRAJOW_v23_SYNC_FINAL.xlsx` (sha 37afaf6f…) | zbudowany, TEST_ACCOUNTS_ONLY na staging |
| Starter Pack | 7 pozycji: DEX 250 g (PI-ING-000494), SMP 250 g (000270), śmietanka w proszku 42% 125 g (000260), fruktoza 125 g (000496), inulina 125 g (000456), suszone żółtko 125 g (001645), Gellatti Stabilizer 125 g (002114) | `shop_bundle_items`; `src/features/constraint-studio/starterPackRescuePalette.ts` | produkt w SHOP |
| **Tabela lokalnych odpowiedników 7 składników** | `shop_country_components` (kraj × 7 składników; z niej Lokalny Zestaw Startowy buduje PDF) | migracja `20260902150000_shop_country_and_shipping_authority.sql`, PR #128 (2–3.09) | **struktura bez danych**: CA 7 pustych wierszy, US 7 wierszy testowych (`example.invalid`); 8 zamówień LSP = dane testowe US |
| Rejestr researchu | `country_local_products` | gałąź `claude/global-country-readiness` (171ac48d, 75c62b28; 3.09) | 2 wiersze Starter Packu (dekstroza PL, dekstroza US) + 2 wiersze bazy PL |
| Dowody PL | dekstroza, SMP, inulina 1 kg, śmietanka w proszku 42% (tylko 25 kg, bez EAN), fruktoza (bez EAN); brak żółtka i stabilizatora | `reports/a03/A03_PRODUCT_EVIDENCE.md` (5.09) | research, nie wybór |
| Decyzje 10.09 | D-22…D-24, D-38: SHOP nie wybiera produktów dla brakujących rynków, czeka na kompletny Excel właściciela | `GLOBAL_BASE_PRODUCT_ARCHITECTURE_AUDIT.md` | Excel z 12.09 (v23) objął tylko bazę |
| `GELLATTI_GOTOWE_PR-ING z brakami.xlsx` (sha 8c771d80…) | inulina i żółtko 75/75, ale „wybrany produkt” = ogólny PI („INULIN · Fibre · Powder”, „EGGS CHICKEN YOLK DRIED”), „NIE WYMAGA POTWIERDZENIA”, `OWNER_ACCEPTED_MARKET_UNCONFIRMED`; brak DEX, SMP, CRP, FRU, STB | Pulpit właściciela (13.09) | akceptacja rodzaju składnika w recepturach, nie produkty sklepowe |

**Przeszukane i bez wypełnionej tabeli 7 × kraje:** repo (wszystkie gałęzie), raporty, baza (`shop_country_components`, `country_local_products`, snapshoty 8 zamówień LSP), `~/Developer/gellatti-source-data`, `gellatti-owner-inputs`, Pulpit (XLSX), Google Drive, historia sesji Claude i Codex.

**Część wspólna v23 ↔ Starter Pack:** dekstroza i SMP (te same PI, 75/75), stabilizator (slot v23 tara/guar/LBG — nie ta sama mieszanka, D-13…D-18). Śmietanka w proszku 42% ≠ śmietanka płynna 30% z v23. Fruktoza, inulina i żółtko: brak danych krajowych.

### M2. Decyzje właściciela (2026-09-17)

1. Brakujące pozycje: **Research SHOP** (zdjęcie pauzy D-38 dla CRP, FRU, INU, YOL); wyniki jako propozycje do akceptacji przed PDF. Po pokazaniu pliku PR-ING: „sama uzupełnij wszystkie 75 krajów”.
2. Stabilizator: **produkt ze slotu stabilizatora v23**, opisany jako lokalna alternatywa, nie ta sama mieszanka.
3. Kraje: **75 krajów z v23**.

### M3. Wykonane

**Backend (wspólny projekt `tunabqqrwabacxjcxxkz`)** — migracja `20260917153851_shop_document_per_market_language` (plik sha `12d90d80…97b0ed`, rollback `0493b305…`; `supabase/rollbacks/`).
- Przed apply: projekt, bieżące definicje (6 funkcji, md5), zależności (tylko kod infopaku: klient staging + funkcja), rollback, zgoda (ta sama praca infopaku).
- Próba w wycofanej transakcji: markety BE[fr,nl] i PL[pl] widoczne, DE (OFF) ukryty; anon `orderable=false`, QA A `true`; zamówienie PL/pl utworzone i idempotentne (także „ pl ”), BE/nl osobne; finance (nie QA), DE OFF, XX, PL/en odmowa; v1 bazy działa przez nową funkcję (zamówienie A `G-20260917-9F038F`, `created=false`), v1 nigdy nie wybiera dokumentu kraju; pobranie A ok, B na zamówieniu A `order_not_found`; drugi bieżący PL/pl 23505, zmiana języka `shop_document_version_is_immutable`, małe litery kraju 23514; brak EXECUTE anon/authenticated na order_v2 i place_order.
- Próba rollbacku: funkcje (md5 + ACL), ograniczenia, indeksy, kolumny i uprawnienia tabeli identyczne jak przed migracją; liczba funkcji 6 → 9 → 6.
- Po apply: wpis w ledgerze `20260917153851`; rejestr 1 wiersz (0 wierszy krajowych); zamówienia 17 (1 dokument) bez zmian.

**Edge Function `shop-digital-document` v3** — wdrożona z repo; pobrane źródło sha `a34c5207…` = plik w repo; `verify_jwt` włączone. Zamknięta lista dokumentów; dokument kraju wymaga poprawnego kraju i języka (tylko wybierają wiersz rejestru); mail nazywa kraj i język.

**Klient — PR #399** (`claude/shop-starter-local-document`, `f5f9d6b0`): oferta z wyborem kraju ze sklepu, stany „wybierz kraj / jeszcze nie ma PDF / gotowe”, wybór wersji językowej, intencja po logowaniu z krajem i językiem, kraje z samym PDF na jednej liście (bez obietnicy wysyłki), konto i admin z krajem i językiem, przycisk lokalnego Starter Packu prowadzi do tej jednej oferty. Lokalnie: tsc, eslint, 157 plików / 1501 testów. CI w toku; gałąź wymaga synchronizacji ze staging przed merge'em.

**Research (75 krajów × CRP, FRU, INU, YOL)** — protokół `reports/shop_starter_local/RESEARCH_PROTOCOL.md` (reguły D-10, D-29…D-37: EAN jako dane na stronie sklepu/producenta z rynku, wiązanie rynku bez waluty, marketplace nigdy nie potwierdza, wysyłka z zagranicy tylko z cytatem polityki, BRAK dozwolony). 8 równoległych badań regionalnych; wyniki `reports/shop_starter_local/research/<ISO>.json`; dowody stron `~/.cache/gellatti-evidence/verify`.

**PDF per kraj i język** — `reports/shop_starter_local/build_starter_local.py`: DEX/SMP/STB z v23, CRP/FRU/INU/YOL z researchu tylko po akceptacji (`acceptance.json`); tryb `--draft` z paskiem „PROJEKT · propozycje do akceptacji”. 43 języki, 108 wariantów kraj × język (D-32). Teksty: `strings/pl.json`, `strings/en.json` + tłumaczenia pozostałych 41 języków (do przeglądu native).

**Akceptacja** — `reports/shop_starter_local/review/GELLATTI_STARTER_PACK_LOKALNE_ODPOWIEDNIKI_REVIEW.xlsx`: 01_DO_DECYZJI (TAK/NIE przy produkcie), 02_BRAKI, 03_V23, 04_MACIERZ; import decyzji: `build_review.py --import`.

### M4. Test E2E na staging (przed korektą, mechanizmy wspólne)

Konto QA A (`test1@test1.com`, logowanie wpisane przez właściciela), staging `042bddbe`: zamówienie przyciskiem → `G-20260917-9F038F` (0 €, `DIGITAL_DOCUMENT`, paid/delivered, wersja 1.1, bez Stripe/adresu/prowizji); 1 zadanie maila `queued` do `info@gellatti.com`, temat `[STAGING] [QA] …`, link staging; plik z linku zamówienia: 200, 2 773 306 B, sha `f9226284…` (= PDF v1.1; ten sam sha ma plik zapisany przez właściciela na Pulpicie 13:29 UTC); 3 równoległe zamówienia → to samo zamówienie, bez nowego maila; wygasły link (331 s) → 400 InvalidJWT, nowy link → 200; odświeżenie → „gotowe” + „Pobierz PDF”, bez ponownego zamówienia; konto → wiersz dokumentu (fokus z linku maila) + pobranie 200; LSP US przez API → 400 `local_pack_not_available` (0/7); zakup fizyczny bez kraju zablokowany z linkiem do wyboru kraju, PL: 4,90 € + 9,90 € = 14,80 € (checkout nieklikany; koszyk i kraj wyczyszczone). Dowody: `reports/evidence/SHOP_RECONCILIATION_2026-09-17/staging-qa-2026-09-17/account-A/`.
Konto B i finance admin: **wstrzymane** do czasu dokumentów krajowych (test ma iść na właściwym dokumencie). Mail: dyspozytor nieskonfigurowany (brak sekretów vault i klucza Resend) — zadania zostają `queued`.

### M5. Wyniki researchu i pokrycie (2026-09-17, wieczór)

> **Liczby w M5 i M9 są z wcześniejszych godzin tej samej nocy.** Zostały zastąpione przez M10 po zmianie reguły dowodu
> dostawy (znaczenie zdania zamiast układu strony), wycofaniu automatu „≥ 5 kg → Dla firm" i policzeniu pełnych 525
> kombinacji. Zostawiam je jako zapis kolejnych stanów, nie jako aktualny wynik.

Research zakończony dla 75/75 krajów. Każdy wiersz to `PROPOSAL_AWAITING_OWNER_ACCEPTANCE`; do PDF klienta nie trafiło nic.

| Pozycja | Potwierdzony lokalnie | Potwierdzony z zagranicy (cytat polityki wysyłki) | Trop (niepotwierdzony) | BRAK |
|---|---|---|---|---|
| Śmietanka w proszku 42% (CRP) | 6 | 20 | 9 | 40 |
| Fruktoza (FRU) | 28 | 16 | 8 | 23 |
| Inulina (INU) | 44 | 14 | 7 | 10 |
| Suszone żółtko (YOL) | 23 | 11 | 12 | 29 |

**Uzupełnienia koordynatora** (te same produkty już zweryfikowane w innych krajach, nowy cytat wysyłki per kraj, `check_quotes.py` found=true, pliki w `~/.cache/gellatti-evidence/quotes/coordinator/`):
- CY, CRP: Pati-Versand (DE) wymienia „Zypern” w liście krajów dostawy → Cake-Masters Sahnepulver 42% (weryfikacja strony `afcac807…`).
- LT, LV, SI, FRU: glaeserundflaschen.de (DE) ma w tabeli dostaw „Litauen”, „Lettland”, „Slowenien” → Sweet Family Fruchtzucker 500 g, GTIN 4008671070229 na stronie (`5ce5ea37…`, `48ba0618…`, `05b0d440…`).
- HR, RO, BG, IS, FRU: gourmet-versand.com wymienia „Croatia”, „Romania”, „Bulgaria”, „Iceland” w selektorze krajów dostawy → Sosa fructose 1 kg, GTIN 8414933026259 na stronie.
- HR, RO, BG, YOL: taste-market.de „EU-Zone3: Bulgarien, … Kroatien, … Rumänien” → Taste Market Eigelbpulver 100 g, GTIN 4262421423127 na stronie.
- Sprawdzone bez skutku: Grecja i Malta nie są na listach Pati-Versand, backfun.de ani meincupcake.de; Lucgel (IT, śmietanka 42%) wysyła tylko po Włoszech; gourmet-versand.com (wysyłka do ~70 krajów) nie ma śmietanki 42% ani żółtka w proszku.

**Pokrycie, jeśli właściciel przyjmie wszystkie rekomendacje TAK** (230 wierszy w 59 krajach; 85 tropów i 4 produkty o innym składzie wymagają osobnej decyzji):
- **7/7 — 25 krajów, 32 PDF:** AT BE CH CY CZ DE DK EE ES FI FR GB HU IE IT LT LU LV NL NO PL PT SE SI SK.
- **Brakuje tylko śmietanki — 9:** BG BR CA GR HR MT NZ RO US. US ma lokalny produkt o innym składzie (Hoosier Hill Farm Heavy Cream Powder, 72% tłuszczu); CA/BR/NZ tylko tropy (marketplace, brak składu); GR/MT tylko tropy (worki 25 kg, sklep UK 75%); BG/HR/RO bez tropu.
- **Brakuje śmietanki i żółtka — 9:** AU CL CR IL IS JP PA TR ZA.
- **Brakuje 3–4 pozycji — 32:** AE AR BD BH CN CO DO DZ EG GH HK ID IN KE KR KW LK MA MX MY NG OM PH PK QA SA SG TH TN TW UY VN.

**Wniosek.** Śmietanka w proszku 42% praktycznie nie występuje w handlu detalicznym poza Europą (JP: „クリームパウダー” to kategoria przemysłowa, ≥ 50% tłuszczu mlecznego, sprzedaż B2B; AU, ZA, IL, TR, KR: w czytelnych sklepach tylko mleko w proszku, mieszanki do bitej śmietany lub sztuczne śmietanki — odrzucone); w 20 krajach UE/EOG pokrywa ją jeden produkt (Cake-Masters Sahnepulver 100 g) z jednej grupy sklepów (pati-versand.de, backfun.de, meincupcake.de, hobbybaecker.de). Żółtko w proszku poza Europą to głównie Myprotein (per kraj) i pojedyncze sklepy.

**Ograniczenia (BRAK ≠ dowód, że produktu nie ma).** Wspólny limit WebSearch sesji (200) wyczerpał się wcześnie; dalsze szukanie szło przez wyszukiwarki sklepów, sitemapy i sklepy marek. Blokady botów (nieobchodzone): m.in. Carrefour (FR/BE/ES/IT/AE/SA/QA), Tesco, Sainsbury's, Migros, Coop, Shufersal, Jumia, noon, iHerb. Strony wymagające przeglądarki (ab.gr, naturasi.it, migros.com.tr, BILLA, Delhaize) nieprzeczytane. Najsłabsze pokrycie: ID PH VN PK LK NG GH MY TH, części KR/CN/TW/MX/UY/DO, oraz BG HR RO.

**Tłumaczenia.** 41 plików `strings/<locale>.json` (plus pl, en): struktura, placeholdery, kierunek pisma i marki sprawdzone automatycznie (41/41). Do przeglądu native: si, sw, is, fil, ta, bn, ur (najmniejsza pewność); terminy śmietanki (pt BR „creme de leite em pó”, es „nata en polvo”, zh-Hant, ar) i mleka odtłuszczonego (es „desnatada”); rok tajski 2569.

**Poprawki generatora PDF** (wykryte na szkicach):
- Nazwy kraju i języka: Chrome ma okrojone dane ICU i dla `is` i `si` po cichu zwracał polskie nazwy („islandzki”, „syngaleski”). Teraz Node (pełne CLDR) + przerwanie builda przy braku danych.
- RTL (ar, he, ur): liczba oddzielona od jednostki („250 غ”) i dane produktu przestawiane przez akapit („1 lb (454 g)”). Teraz izolacja `<bdi>` danych produktu, bieg RTL zaczyna się od liczby, marginesy logiczne; bez rozstrzelenia liter w pismach łączonych.
- Jeden zawieszony Chrome zatrzymał build 108 dokumentów: teraz limit 90 s z ponowieniem, błąd jednego dokumentu nie zatrzymuje reszty, 4 dokumenty równolegle.

### M6. Zdjęcia 7 produktów (PR #400, zdjęcia właściciela)

PR #400 scalony do staging (`a378a4f4`) po zielonym CI na `e0597224`; zmiana tylko ramki zdjęcia i 7 plików PNG 512×512 (zastępczy woreczek zostaje jako fallback). Przegląd serwowanej strony (headless Chrome 153, desktop 1440×900 @2x i mobile 390×844 @3x, bez logowania i koszyka): 7/7 kart ładuje własne zdjęcie (`naturalWidth` 512, `object-fit: contain`, cały obraz w ramce), sha256 serwowanych plików = pliki z PR, placeholder nie jest pobierany, 0 błędów konsoli, brak poziomego przewijania i nakładania kart. Bundle bez wpisanego SHA; zweryfikowano bundle `index-KvQ8jaYV.js`, który zawiera ścieżki 7 zdjęć. Dowody: `reports/evidence/SHOP_RECONCILIATION_2026-09-17/single-photos-served/`. Uwagi do etykiet na zdjęciach (literówka „preferenatemente”, brak „Contains MILK” na SMP, puste „Net wt.”) — pozostawione bez zmian. Akceptacja wizualna właściciela: **brak**.

### M7. Korekta właściciela po przeglądzie arkusza i 108 szkiców (2026-09-17, noc)

Właściciel **nie akceptuje hurtowo** 230 rekomendacji. Decyzje Ownera zostają puste; `acceptance.json` nie istnieje, a build
publikacyjny nadal wymaga akceptacji dla każdej z siedmiu ról. Rozliczone zostały wskazane różnice:

| Zarzut właściciela | Co było | Co jest teraz |
|---|---|---|
| Znana niedostępność ginie w PDF (PL wiersz 259 Naturavena, PL 263 KicCake, ES 122 Myprotein) | stan magazynowy tylko w „Uwagach badacza” | `extract_stock.py` odczytuje stan z dowodów już zebranych (własna notatka badacza przy kandydacie + strona w cache weryfikatora): 140 w sprzedaży, 26 brak towaru, 155 bez informacji. PDF drukuje „Sklep pokazał brak towaru 2026-09-17” pod produktem; arkusz ma kolumny Stan magazynowy / Stan z dnia / Podstawa stanu |
| Produkt kasowany albo ukrywany przez chwilowy brak | — | produkt zostaje; **tylko potwierdzony i dostępny** zamiennik wyprzedza pozycję bez towaru (stan „nie podano” nie wyprzedza niczego) |
| Notatka wspólna dla całej pozycji mogła oznaczyć oba produkty jako niedostępne | — | stan bierze się wyłącznie z notatki przy danym kandydacie; to usunęło 15 fałszywych „brak towaru” |
| „Z zagranicy” wzmacniało dowód v23 samą zmianą tekstu (135 oznaczeń) | jedno oznaczenie dla wszystkich | `v23_shipping_check.py` rozlicza samą dostawę per kraj, bez zmiany wyboru produktu w v23: **82 potwierdzone** (kraj wymieniony na liście dostaw sprzedawcy: bulksupplements 34, bakingwarehouse 17, buxtrade 12, iHerb 9+6, saporepuro 4, artegustando 1), **53 niepotwierdzone** (m.in. 51 wierszy SaporePuro). PDF: „Z zagranicy” tylko przy potwierdzonych, „Sklep za granicą” bez obietnicy dostawy przy reszcie; arkusz 03_V23 ma cytat i adres polityki |
| B2B jako zwykła oferta | tylko tag z v23 | każde opakowanie ≥ 5 kg dostaje oznaczenie „Dla firm”, także w pozycjach z researchu (np. PL śmietanka 25 kg); legenda mówi wprost „nie zwykła oferta detaliczna” |
| „not printed” jako marka (ES s. 4), „not stated” (CZ/FRU/2) | sentinel trafiał do PDF | `clean_text` usuwa sentinele i nawiasy z notatkami badacza (SKU, Art.-Nr, „size selector”); brak marki = brak wiersza, nic nie jest dopowiadane; marka nie zawiera już nazw spółek w nawiasie |
| „v23” nie oznacza nowej kontroli zakupowej | nota „sprawdziliśmy we wrześniu 2026” | nota rozdziela źródła: research sprawdzony 17 września 2026, dekstroza/mleko/stabilizator z tabeli krajowej z 12 września 2026 i **niesprawdzane ponownie** |
| Poprawny plik ≠ gotowy produkt | walidator sprawdzał plik | walidator sprawdza osobno: brak sentineli, linia „brak towaru” przy produkcie bez towaru, a w trybie publikacyjnym **każda z siedmiu ról ma produkt zaakceptowany przez właściciela** (kandydat LEAD bez akceptacji nie zamyka warunku) |
| Numery wierszy zmieniają się przy każdej wersji arkusza | — | kolumna `ID` (np. `PL-FRU-1`) jest stała; import decyzji czyta ją w pierwszej kolejności |

Dowody nowych rozliczeń: `~/.cache/gellatti-evidence/quotes/coordinator-v23/` (cytaty dostaw v23), `stock.json`, `v23_shipping.json`.

**Kanał sprzedaży jako osobny wymiar (wynik domykania braków w Europie).** `shop.cake-masters.com` — handlowe ramię tej samej grupy z Herzlake — publikuje tabelę kosztów wysyłki wymieniającą Bułgarię, Grecję, Islandię, Chorwację, Maltę i Rumunię i sprzedaje te same potwierdzone produkty w opakowaniach 100 g (Sahnepulver 42 %, Eigelbpulver; „Auf Lager”, cytaty w `~/.cache/gellatti-evidence/quotes/research-gap-eu/`). Ale stopka mówi: „Verkauf nur an registrierte, gewerbliche Wiederverkäufer”, a ceny są netto. Zgodnie z regułą właściciela „B2B pozostaje B2B” dodałem kanał jako osobny wymiar: kandydat z kanałem `TRADE_ONLY_*` dostaje w PDF oznaczenie „Dla firm”, a w arkuszu **nie dostaje rekomendacji TAK**, tylko „DO DECYZJI: kanał tylko dla firm (nie zwykła sprzedaż detaliczna)”. Dotyczy 7 kandydatów (GR, MT, BG, HR, RO, IS śmietanka + IS żółtko). Pokrycie 7/7 zostaje więc na 25 krajach — te sześć krajów ma śmietankę jako otwartą decyzję, nie jako zamknięty brak.

**Fakty negatywne ustalone przy tym (żeby nie powtarzać poszukiwań):** `taste-market.de` nie ma żadnego Sahnepulver (przeskanowany pełny sitemap 2 425 URL), a jego strefy EU nie obejmują Islandii ani Turcji; `gourmet-versand.com` nadal bez śmietanki w proszku; `specialingredients.co.uk` (1 130 produktów) i `souschef.co.uk` (6 274) bez mlecznej śmietanki w proszku, podobnie cerfdellier, cuisineaddict, deco-relief, bienmanger, koro-shop; jedyna śmietanka Sosy to liofilizowany produkt z linii smaków/barw (2 kg, bez podanego tłuszczu); Turcja **ma** krajową śmietankę 42 % (Enka Süt, Konya, `İçindekiler: Krema`), ale wyłącznie w worku 25 kg, a wszystkie tureckie detaliczne „krema tozu” to mieszanki cukrowo-skrobiowe lub z tłuszczem roślinnym (odrzucone).

### M8. Ocena śmietanki 72 % (USA) — pełny raport: `reports/shop_starter_local/US_CREAM_POWDER_72_EVALUATION.md`

Ocena wyłącznie czytająca: żadnej zmiany kodu, żadnego zapisu do bazy, wszystkie zapytania to `SELECT`.
**Pierwsza wersja tej oceny (wieczór) była napisana na nieaktualnym katalogu roboczym z 25 sierpnia — 1 373 commity za
staging — i na etykiecie ze strony producenta, której nie da się użyć. Poniżej wersja po dwóch sprawdzeniach właściciela.**

**Tożsamość: potwierdzona.** Hoosier Hill Farm Heavy Cream Powder 1 lb, GTIN 850054854513 jako dane przy własnym
wariancie (454 g), `addressCountry US`; sklep deklaruje wysyłkę tylko w USA.

**Etykieta: przeczytana ze zdjęć (to jest research, nie praca nad skanerem) i ODRZUCONA jako źródło.** Galeria ma
10 zdjęć; tablica wartości odżywczych jest na `Heavy_Cream_Powder_Side.webp` (2048 × 2048, dodane 2026-09-16), a nie na
grafice marketingowej wskazanej w pytaniu. Tablica nie nadaje się do użycia, bo przeczy sama sobie:
„Total Fat 0g — 3 %" **nad** „Saturated Fat 5g — 10 %"; „About 151 servings × 6 g" = 906 g, czyli żadne z opakowań na tej
stronie (454 / 907 / 11 340 g); wiersz „Vitamin 3.45mg" bez nazwy witaminy; „Calcium 28mg" przy 0 %; przypis o Daily Value
złożony z nie-słów („…tnis 'yvw.foion loevs a butorix in a eslvitig of aozdmenneg akro…"); adres „HOOSIER HILL FARM,
MIDDLETHIN, IN" zamiast Middlebury. Zdjęcie nie jest przypisane do żadnego wariantu. Kontrola na innym produkcie tego
samego producenta (Butter Powder) przechodzi wszystkie te testy, więc to nie jest wada metody odczytu.

**Skład: nadal niepełny.** Zostaje wyłącznie zdanie „72 % butterfat" z tekstu strony i lista składników („Cream, nonfat
dry milk, natural vitamin E and vitamin C Ester"). Białko, węglowodany/laktoza, sucha masa beztłuszczowa, woda, sól i
wartość energetyczna pozostają nieustalone. **Niczego nie wyliczono z samego procentu tłuszczu** — żadnej wody, laktozy,
suchej masy, PAC ani POD. Producent nie publikuje karty technicznej (przeszukany sitemap, 16 stron, wyszukiwarka na
stronie, brak PDF).

**Dane w aplikacji: sprostowanie.** Wbrew pierwszej wersji oceny **nie ma rozbieżności** między plikiem repo a bazą dla
`PI-ING-000260`: na staging `b0455b24` żywa tabela `mapper_basement` ma 2 541 wierszy, a `docs/ingredients/validation/
mapper_basement.csv` ma te same 2 541 rekordów (ten sam skrót zbioru identyfikatorów, `md5 4ae515e3…` po obu stronach) i
ten sam wiersz `PI-ING-000260` pole po polu (woda 3 / sucha masa 97 / tłuszcz 42 / NFMS 55 / białko 20 / laktoza 30 /
POD 4,8 / PAC 30,585). „2 147 rekordów" pochodziło z niezacommitowanej lokalnej zmiany w tamtym starym katalogu. **Nic
nie wymagało kopiowania CSV na bazę i nic takiego nie zostało zrobione.**

**Mechanizm zamiany: zarzut „gram za gram, bez świadomości tłuszczu" WYCOFANY.** Ścieżka na staging:
`IngredientRow.tsx:566` → `IngredientBuilder.tsx:461` → `createSubstitutionPreviewWithServerAuthority()` →
`buildSubstitutionPreview()` (`applyPipeline.ts:8837`). Podmiana zastępuje **cały obiekt składnika** (wszystkie 16 pól
składu, `structuredClone`), dziedziczy tylko planowane gramy, potem uruchamia `buildOptimizePreview()` i weryfikuje
`detectViolations(calculateRecipe(...))`; `fat` jest tam metryką pierwszej klasy, a odmowa ma postać `hard:fat`.
Mechanizm, który odmawia komunikatem `hard:fat`, nie jest nieświadomy tłuszczu. Prawdziwy brak jest gdzie indziej:
**interfejs** pokazuje jedno ogólne zdanie odmowy i nie nazywa metryki. Brak rodziny `cream_powder` w `CorrectionFamily`
dotyczy wyłącznie słownika dźwigni korekcyjnych i nie blokuje użycia produktu.

**Prawdziwa luka techniczna** (`src/data/products/productEngineHandoff.ts:71`): `prepareProductEngineIngredient()`
*pożycza skład produktu referencyjnego* — „the product itself carries no water / total_solids / sugar-type breakdown, so
it cannot become a full EngineIngredient on its own". Żadna istniejąca ścieżka nie pozwala policzyć bazy z **własnego**
składu produktu; produkt może nieść najwyżej własne PAC/POD, a jedyna ścieżka czytająca etykietę produktu
(`labelOnlyCatalogToppingIngredient`) dotyczy TOPPINGU, nie bazy. Dlatego podstawienie produktu 72 % pod
`PI-ING-000260` byłoby **błędem rachunkowym**, nie tylko złamaniem konwencji: silnik policzyłby 42 % tłuszczu.
Do właściciela danych/Engine idą więc dwie rzeczy: (a) nie istnieje profil mlecznej śmietanki w proszku ~72 %, (b) pytanie
strukturalne, czy produkt może w ogóle wnosić własny skład do receptury bazowej. Bez drugiego Mappera, bez nowego
klasyfikatora i bez jednego arbitralnego profilu dla wszystkich proszków 53–75 %.

**Wniosek.** Zakupowo: produkt może być pokazany jako lokalna alternatywa z oznaczeniem „inny skład" i podanym
tłuszczem — decyzja właściciela, wiersz `US-CRP-1`. Technicznie: **jawny brak gotowości**; PDF nie może przy tym
produkcie obiecywać, że aplikacja przeliczy recepturę na jego składzie. Jedno nie zastępuje drugiego.

**Przy okazji ustalone:** testowe wiersze Lokalnego Zestawu Startowego w USA są od dziś **wykluczone strukturalnie**
przez `public.shop_is_reserved_test_url` z migracji `20260917111101`, a nie tylko „do usunięcia"; PR-y #336 i #328
pozostają otwarte, więc zależność sekwencyjna dla ewentualnego nowego profilu nadal obowiązuje.

### M9. Domykanie braków w kontrolowanych grupach — wynik (2026-09-17, noc)

Cztery rozłączne grupy krajów, tylko wskazane kombinacje, bez powtarzania pozycji już poprawnych. Liczymy **kombinacje
kraj × rola (75 × 4 = 300)**, nigdy PDF-y (`gap_counters.py`).

| | Przed | Po |
|---|---|---|
| Kandydatów w arkuszu | 313 | **416** |
| Kombinacje bez żadnego kandydata | 102 | **29** |
| Kombinacje bez rekomendacji TAK | 139 | **125** |
| Krajów z rekomendacją na wszystkich 4 rolach | 25 | **25** (32 warianty językowe) |

| Rola | rekomendacja TAK | kanał tylko dla firm | inny skład | tylko trop | brak kandydata |
|---|---|---|---|---|---|
| Śmietanka w proszku | 25 | 7 | 1 (USA 72 %) | 27 | 15 |
| Fruktoza | 59 | 0 | 0 | 12 | 4 |
| Inulina | 57 | 0 | 0 | 18 | 0 |
| Suszone żółtko | 34 | 1 | 0 | 30 | 10 |

**Co to znaczy uczciwie.** Prawie zniknęły puste pola (102 → 29), ale większość nowych znalezisk to **tropy**, nie
rozwiązania: sprzedawca istnieje, lecz nie nazywa kraju w polityce dostawy, albo to marketplace, albo strona nie podaje
składu. Liczba potwierdzonych rekomendacji dla inuliny **spadła** (66 → 57), bo zaostrzyłem regułę dostawy (niżej) — to
celowe: wolę mniej obietnic niż obietnicę bez dowodu.

**Jedna reguła dowodu dostawy dla wszystkich (rozstrzygnięcie sprzeczności między agentami).** Dwóch badaczy różnie
przeczytało tę samą stronę: selektor kraju w sklepie Shopify jednemu wystarczył za dowód wysyłki, drugiemu nie. Test jest
obiektywny: pobrać stronę wysyłki **i** stronę produktu. Jeśli ta sama lista krajów jest na stronie produktu, to element
szablonu sklepu (selektor rynku/waluty), a nie oświadczenie o dostawie — i nie potwierdza niczego, choćby baner mówił
„wysyłamy na cały świat” (reguła D-31: waluta nigdy nie wiąże rynku). Sprawdzone: **szablon** — bulksupplements.com,
bakingwarehouse.com, kiki-health.com (dodatkowo własne zastrzeżenie „Some countries may require bespoke postage … if
unable to select a delivery option at the checkout”); **prawdziwa lista dostaw** — gourmet-versand.com („Shipment to the
following country”), pati-versand.de, glaeserundflaschen.de, taste-market.de, buxtrade.de, shop.cake-masters.com (ich
listy nie występują na stronach produktów). `reconcile_shipping_basis.py` obniżył **18 kandydatów w 14 krajach** z
„potwierdzony z zagranicy” na „trop”, zachowując produkt, cytat i wyjaśnienie. W v23 ta sama reguła dała 31 potwierdzeń
zamiast 82 (bakingwarehouse 17 i bulksupplements 35 to szablon, nie lista dostaw).

**Nowe fakty, które warto znać przy decyzjach:**
- **Śmietanka w proszku poza Europą to problem kanału, nie odkrycia.** Jedyna prawdziwa mleczna śmietanka w proszku w
  Azji to przemysłowa Fonterra/NZMP „Cream Powder 55” (55 % tłuszczu, worki) — zapisana i oznaczona jako B2B. W Turcji
  krajowa śmietanka 42 % istnieje (Enka Süt), ale tylko w worku 25 kg. `hobbybaecker.de` i `pati-versand.de` mają
  dokładny produkt referencyjny 42 % w opakowaniu 100 g, ale ich listy dostaw obejmują wyłącznie Europę i Wielką
  Brytanię; „Rest der Welt 17,99 EUR” nie nazywa żadnego kraju, więc dla rynków pozaeuropejskich to trop.
- **Śmietanka 75 % (ingredientsbar.com, UK)** to prawdziwa mleczna śmietanka w proszku z pełną tabelą na 100 g
  (tłuszcz 75 g, białko 8,5 g, laktoza w składzie) — zapisana jako „ten sam rodzaj, inny skład”, ale tylko jako trop,
  bo polityka dostawy nie nazywa kraju. To jedyny kandydat, który technicznie mógłby obsłużyć wiele rynków naraz.
- **Żółtko w proszku z zagranicy jest zamknięte, nie niesprawdzone:** gourmet-versand, MSK Ingredients (6 597 URL),
  Sous Chef (6 274 URL) i BulkSupplements nie mają żółtka w proszku; Modernist Pantry wysyła tylko w USA; Judee's nie
  mówi nic o wysyłce międzynarodowej. Jedyna nieprzetestowana droga (gosupps.com) odpowiada 403.
- **Dwa rynki są jedną decyzją od potwierdzenia lokalnego:** Arabia Saudyjska — Halwani Brothers „Fruit Sugar
  Fructose 250 g” w Tamimi ma GTIN w danych strony i saudyjski adres sprzedawcy, brakuje tylko wydrukowanego składu;
  NOW Foods w Nahdi `/en-sa/` drukuje skład, brakuje dopasowania zapisu opakowania.
- **Do sprawdzenia w narzędziach:** `verify_ean_market.py` uznał kod `729011818324` (razberry.co.il) za potwierdzony,
  a `identifiers.py` typuje go jako błędną sumę kontrolną; w `IL.json` zapisano `gtin: null` i zastrzeżenie. Arkusz i tak
  nie daje rekomendacji TAK produktowi z kodem, który nie jest poprawnym GTIN.
- **Zablokowane, zapisane, nieobchodzone:** iHerb (403 na wszystkich adresach), amazon.ae/.eg (ściana botowa — stan
  magazynowy tych tropów jest uczciwie „nieznany”), Carrefour, Lulu, Spinneys, Shufersal, Jumia, noon, urbanplatter,
  redmanshop, healthguard.lk, naheed.pk, chaldal, laranitadelapaz.com.mx, ingredientesonline.com.br, qualifirst,
  chefsarmoury, gosupps. Wyczerpany limit wyszukiwarki i ściana botowa nie są dowodem, że produktu nie ma.

### M10. Druga korekta właściciela (2026-09-17, noc): treść dowodu, kanał, tropy, pełne 525 kombinacji

**1. Dostawa — znaczenie zdania, nie układ strony.** Poprzednia heurystyka („ta sama lista jest też na stronie produktu
→ to szablon sklepu") była testem układu, nie treści. Zastąpiona przez `delivery_check.py`: jeden wpis na sprzedawcę z
**cytatem, który rozstrzyga**, i z powodem. Deklaracja liczy się, gdy jej treść dotyczy dostawy i obejmuje kraj —
przez nazwanie go w dowolnym języku **albo** przez jednoznaczną grupę, do której należy (strefa cenowa „European Union
(EU)", „North America, Canada, Australia, South America", „EU-Zone 3: …") — o ile wyjątek ani ograniczenie produktowe go
nie wyłącza. Sam selektor rynku/waluty bez słów o dostawie nie liczy się; ogólne „worldwide"/„Europe" też nie.

Wynik ponownej oceny **rekordów zależnych od tych reguł** (nie hurtowego przywrócenia): v23 **97 potwierdzonych /
38 niepotwierdzonych** (poprzednio 31/104 przy teście układu i 82/53 przy pierwszym, zbyt luźnym podejściu).
- `bulksupplements.com` liczy się: „Please select your shipping country. Buy from the country of your choice. **Remember
  that we can only ship your order to addresses located in the chosen country.**" — to zdanie o dostawie, a lista pod nim
  wymienia 71 z naszych 75 rynków (pozostałe 4 były nazwane lokalnie: Danmark, România, Slovenija, Hong Kong SAR — po
  poprawieniu tabeli nazw też się znalazły).
- `saporepuro.com` liczy się przez strefy cenowe: „4) European Union (EU)", „5) United Kingdom (UK)", „6) Switzerland",
  „8) North America, Canada, Australia, South America, and Islands" → potwierdza 35 wierszy, ale **nie** Azję, Afrykę,
  Bliski Wschód, Norwegię ani Islandię (20 wierszy zostaje niepotwierdzonych).
- `bakingwarehouse.com` nie liczy się: ma tylko baner „Door to Door worldwide shipping" i selektor „Country (waluta)" —
  17 wierszy zostaje niepotwierdzonych. `hsnstore.eu` odpowiada 403 (nieobchodzone) — 1 wiersz niepotwierdzony.
- iHerb liczy się przez stronę wysyłki dla konkretnego kraju (`/shipping/<kraj>`), także gdy w źródłach v23 jest tylko
  subdomena krajowa (`mx.iherb.com` → `/shipping/mx`).

**2. Masa opakowania nie ustala kanału.** Automat „≥ 5 kg → Dla firm" wycofany. Teraz: masa jest faktem o opakowaniu
(oznaczenie „Duże opakowanie" obok podanej masy), a „Tylko dla firm" wymaga **potwierdzonego ograniczenia sprzedawcy**.
Uzgodnienie po stabilnych ID, bez ręcznej korekty licznika: **7 kandydatów z researchu** ma ograniczenie sprzedawcy —
`BG-CRP-1`, `GR-CRP-1`, `HR-CRP-1`, `IS-CRP-1`, `IS-YOL-1`, `MT-CRP-1`, `RO-CRP-1` (wszystkie: shop.cake-masters.com,
„Verkauf nur an registrierte, gewerbliche Wiederverkäufer") — oraz **1 wiersz v23** oznaczony B2B przez właściciela
(`US-STB`). Wcześniejsza liczba 8 brała dodatkowo turecki worek 25 kg (Enka Süt): to duże opakowanie, nie kanał.

**3. Tropy w PDF jako wydzielona informacja dodatkowa.** Nowa sekcja „Warto też wiedzieć" pod pozycją, z kropką zamiast
numeru wyboru, ze zlokalizowanym zdaniem „Dostawa do {kraj} niepotwierdzona — sprawdź u sprzedawcy". Zasady w kodzie:
- siedem pozycji zamyka **tylko** produkt potwierdzony, w kanale detalicznym, z dostawą lokalną albo zadeklarowaną;
- trop i oferta tylko dla firm trafiają do informacji dodatkowej i **nie** zamykają pozycji;
- „niepotwierdzony" jako oznaczenie dotyczy wyłącznie tożsamości/składu — brak deklaracji dostawy ma własne zdanie, więc
  jedno nie udaje drugiego;
- nic w tej sekcji nie mówi o potwierdzonej dostępności, sprawdzonej wysyłce ani gotowym zamienniku w aplikacji.

**5. Pełne 525 kombinacji (75 × 7), wymiary rozdzielone** — `readiness_matrix.py`, arkusz `05_MACIERZ_525`:

| | |
|---|---|
| Kombinacje kraj × rola | **525** |
| Zamknięte zakupowo (produkt potwierdzony + kanał detaliczny + dostawa lokalna albo zadeklarowana) | **339** |
| Otwarte | **186** |
| Kraje z siedmioma zamkniętymi rolami | **24**: AT BE CH CY CZ DE DK EE ES FI FR GB HU IE IT LT LU LV NL PL PT SE SI SK |
| …z tego zaakceptowane przez właściciela | **0** |
| …z tego, gdzie każdy zamykający produkt odpowiada składem referencji roli | **23** |

Wymiary liczone niezależnie (kombinacja bywa otwarta na kilku naraz — nie sumować): produkt zidentyfikowany 482,
zaproponowany 14, brak 29 · zakup: lokalny 212, zagraniczny zadeklarowany 156, zagraniczny niezadeklarowany 128,
brak 29 · kanał: detaliczny 488, tylko dla firm 8, nieznany 29 · stan towaru: w sprzedaży 198, brak 21, nieznany 306 ·
technicznie: skład zgodny z referencją roli 456, wymaga własnego profilu 13, nieustalone 56 · decyzja właściciela:
brak 300, wybór v23 225.

**To jest wynik, którego nie widać w 108 poprawnych szkicach.** Najtwardszy wniosek: **stabilizator z v23** ma
niezadeklarowaną dostawę w 37 krajach (SaporePuro wysyła do UE, UK, Szwajcarii, Ameryki Północnej, Ameryki Południowej i
Australii), więc kraje „kompletne na czterech nowych rolach" nie są kompletne na siedmiu. Akceptacja tożsamości produktu
w v23 nie jest potwierdzeniem jego dostawy — to dwa różne wymiary i tak są teraz liczone.

### M12. Stan po drugiej korekcie — wynik liczony na pełnych 525 kombinacjach

Wszystkie cztery grupy domykające skończyły, plus osobny tor ścieżek zakupu dla produktu v23. Nic nie zostało
zaakceptowane; `acceptance.json` nadal nie istnieje.

| | Przed drugą korektą | Po |
|---|---|---|
| Kandydaci w arkuszu | 416 | **428** |
| Kombinacje zamknięte zakupowo (z 525) | 339 | **385** |
| Kombinacje otwarte | 186 | **140** |
| Kraje z kompletem siedmiu ról | 24 | **26** (AT BE CH CY CZ DE DK EE ES FI FR GB HU IE IT LT LU LV NL NO NZ PL PT SE SI SK) |
| Dostawa v23 potwierdzona / niepotwierdzona | 31 / 104 | **100 / 35** |
| Zaakceptowane przez właściciela | 0 | **0** |

**Dlaczego kombinacja jest otwarta (140):** dostawa niezadeklarowana przez sprzedawcę **87**, brak produktu **26**,
tożsamość albo skład nieudowodnione **14**, kanał tylko dla firm **8**, inne 5. Otwarte według ról: śmietanka 47,
żółtko 39, stabilizator 24, fruktoza 13, dekstroza 12, inulina 5.

**Najważniejszy wniosek tej rundy:** głównym blokerem **nie jest brak produktu, tylko brak deklaracji dostawy**.
87 ze 140 otwartych kombinacji ma realny, zidentyfikowany produkt — brakuje zdania sprzedawcy, że wysyła do tego kraju.

**Zamknięte w tej rundzie:** NZ śmietanka (53,3 % tłuszczu — odczytane z tablicy na zdjęciu producenta), TW i VN żółtko
(etykieta producenta), NG inulina (lokalnie), IL inulina, BH/KW/QA inulina (gourmet-versand), EG inulina (lokalnie),
TR śmietanka (Enka Süt — po wycofaniu automatu B2B okazała się ofertą bez ograniczeń sprzedawcy, worek 25 kg jako
„duże opakowanie"), oraz **14 ścieżek zakupu stabilizatora v23** (AU ID JP KR MY NO NZ PH QA SA SG TH TW VN) przez
tabelę „SHIPPING RATES & Fee - INTERNATIONAL" sklepu bakingwarehouse.com — produkt z v23 bez zmian, zmienia się tylko
miejsce zakupu.

**Kraje jedną rolą od kompletu (9):** BG, BR, CA, GR, HR, RO, TW, VN — wszystkie śmietanka w proszku; US — sam
stabilizator (wiersz v23 oznaczony przez właściciela jako B2B). **Dwie role (17):** AR AU CL CO HK ID JP KR MX MY PH QA
SA SG UY (śmietanka + żółtko), MT (dekstroza + śmietanka), TR (żółtko + stabilizator).

**Sprostowania wewnątrz tej rundy** (reguła „znaczenie, nie układ" działa w obie strony):
- `bulksupplements.com` **ma** prawdziwą deklarację — zamkniętą listę „We currently ship to the following nations: …"
  na stronie polityki, nieobecną na stronach produktów. Jej treść wyklucza jednak 12 naszych rynków (m.in. Panamę,
  Grecję, Tajlandię, Katar, Kuwejt, Oman), więc dekstroza spadła z 74 do 63 zamkniętych — to poprawka w dół, nie w górę.
- `bakingwarehouse.com` **ma** deklarację na osobnej stronie (tabela cen wysyłki per kraj) — 13 krajów potwierdzonych,
  ale nie AE: wiersz wymienia miasto „dubai" w otwartym worku „Other (…)", a miasto nie jest deklaracją dla kraju.
  Zapisane jako decyzja właściciela, nie jako potwierdzenie.
- 8 kandydatów (inulina KIKI Health w BH, DZ, EG, IL, KW, OM, QA, TN) **przywróconych** do „potwierdzony z zagranicy":
  ich listę krajów poprzedza nagłówek „Your shipping estimates — Country", czyli zdanie o dostawie. Zastrzeżenie
  sprzedawcy („Some countries may require bespoke postage…") zapisane przy każdym z nich.
- Ostrzeżenie jednego z badaczy, że lista bulksupplements to „tylko USA", sprawdziłam osobno — dotyczyło innej strony
  tego sklepu; wiążąca jest zamknięta lista na stronie polityki.

**Szkice:** 108/108 przechodzi walidację na końcowych danych (bez sentineli, linia braku towaru tam, gdzie stan to
potwierdza, siedem ról zamykanych wyłącznie produktem potwierdzonym w kanale detalicznym z dostawą lokalną albo
zadeklarowaną). Stan magazynowy zapisany dla 443 kandydatów.

### M11. Konieczne zastosowania — pokazane osobno, **żadne nie wykonane**

Ta wiadomość właściciela nie daje zgody na wspólną bazę, Storage, funkcje Edge, usuwanie wierszy testowych, `ON` ani
`main`/produkcję. Poniżej jest wszystko, co **musiałoby** zostać zastosowane, żeby domknąć infopak — każda pozycja
osobno, z dokładną operacją, żeby dało się ją zatwierdzić albo odrzucić pojedynczo.

| # | Operacja | Co dokładnie | Stan |
|---|---|---|---|
| 1 | Akceptacja produktów | Wpisy TAK/NIE właściciela w `01_DO_DECYZJI` (albo arkusze `06_REKOMENDACJE` i `07_WYJATKI`), import przez `build_review.py --import` → `acceptance.json`. Bez tego build publikacyjny odmawia każdego wariantu. | **niewykonane, czeka na właściciela** |
| 2 | Pliki PDF do prywatnego bucketa | `publish_starter_local.py --plan` (odmawia szkiców i wariantów bez 7/7), potem `--upload`: `supabase storage cp` do `shop-documents/starter-pack-local/1.0/<kraj>/<locale>-<sha>.pdf`. | niewykonane |
| 3 | Wiersze rejestru dokumentów | `publish/registry.sql`: `insert … on conflict do nothing`, `availability = 'TEST_ACCOUNTS_ONLY'`, konta QA, odbiorca `info@gellatti.com`, `is_current = true`, `country_iso2` + `language` + `version`. Kontrola przed i po: `publish/verify.sql`. | niewykonane |
| 4 | Wyłączenie starej oferty bazy | Jeden `update public.shop_digital_documents set availability = 'OFF' where document_key = 'GELATO_BASE_INGREDIENTS' and country_iso2 is null and version = '1.1'`. Nie dotyka zamówienia `G-20260917-9F038F` ani jego pliku: pobranie nie czyta dostępności (sprawdzone). | niewykonane, **opcjonalne** |
| 5 | Profil wysokotłuszczowej śmietanki w proszku | Migracja pisana ręcznie, **neutralny** nowy profil (nigdy edycja `PI-ING-000260`), po rozstrzygnięciu pytania strukturalnego z M8 i po PR #336/#328. Do właściciela danych/Engine, nie do SHOP. | niewykonane, **zależne od decyzji** |
| 6 | Testowe wiersze LSP w USA | Od dziś wykluczone strukturalnie przez `shop_is_reserved_test_url` (migracja `20260917111101`). Fizyczne usunięcie 7 wierszy pozostaje osobną decyzją porządkową. | niewykonane, **nie jest już pilne** |
| 7 | QA na staging po publikacji | Konto A, konto B (brak dostępu do zamówienia A), finance admin, wyścig równoległych zamówień, mail do kontrolowanego odbiornika. Wymaga logowań właściciela. | niewykonane |
| 8 | Publiczne `ON` i wydanie `main`/produkcja | Jeden końcowy pakiet, osobna wyraźna zgoda. | niewykonane |

## Stan ukończenia (2026-09-17, po korekcie wieczornej): mechanizm gotowy, treść czeka na akceptację

Poprzednia wersja tej tabeli opisywała stan przed wykonaniem pakietu K. Stan na teraz, wyłącznie `staging` + wspólna baza:

| Zakres | Stan | Dowód |
|---|---|---|
| Zamówienie dokumentu za 0 € (K1) | **Wdrożone** | migracja `20260917113631_shop_digital_document_orders` w ledgerze; funkcja `shop-digital-document` v3 (sha pobranego źródła = plik w repo); E2E konta A: `G-20260917-9F038F`, pobranie 200, plik obecny w prywatnym buckecie |
| Oferta per kraj i język (K5, PR #399) | **Scalone do staging `5d4e35ce`** | 4 joby CI zielone na `14ccf6dc`; rejestr nie ma wierszy krajowych, więc oferta nie pokazuje się nikomu — to stan oczekiwany |
| Rejestr per kraj × język (migracja) | **Wdrożone** | `20260917153851_shop_document_per_market_language`; próba w wycofanej transakcji + próba rollbacku (identyczne md5/ACL/indeksy) |
| Naprawa 401 przy wyborze kraju (K6) i zabezpieczenie testowego LSP (K4) | **Wdrożone** | `20260917111101_shop_public_offer_read_and_qa_fixture_guard`; serwowana strona bez logowania: `shop_country_local_readiness` 200, `gellatti_shop_document_availability_v1` 200 |
| Zdjęcia 7 fizycznych produktów (PR #400) | **Wdrożone na staging, sprawdzone na serwowanej stronie** | staging `a378a4f4`; 7/7 kart z własnym zdjęciem, sha serwowanych plików = pliki z PR, 0 błędów konsoli. Akceptacja wizualna właściciela: **brak** |
| PDF bazy v1.1 (stary, angielski, 6 ról) | **Zbudowany, w prywatnym storage, zamówiony przez konto A** | sha `f9226284…`, plik obecny; pobranie nie zależy od dostępności, więc historyczne zamówienie zostaje sprawne także po wyłączeniu oferty |
| PDF-y per kraj (7 ról Starter Packu) | **Szkice przechodzą walidację; 0 pozycji zaakceptowanych** | `acceptance.json` nie istnieje; build publikacyjny odmawia wariantu, w którym któraś z 7 ról nie ma produktu **zaakceptowanego i zdolnego ją zamknąć** (potwierdzony, detaliczny, z dostawą lokalną albo zadeklarowaną) |
| Kompletność siedmiu ról (75 × 7 = 525) | **339 kombinacji zamkniętych zakupowo, 186 otwartych; 24 kraje mają komplet siedmiu ról** | `readiness_matrix.py`, arkusz `05_MACIERZ_525`; wymiary rozdzielone (produkt, zakup, kanał, stan, technika, decyzja) |
| Testowe wiersze Lokalnego Zestawu Startowego w USA | **Nadal 7 wierszy testowych** | decyzja o ich usunięciu otwarta (guard z K4 blokuje ofertę, dane testowe zostają) |
| Publiczne ON, `main`, produkcja | **Niezatwierdzone** | wymaga osobnej, wyraźnej zgody właściciela |

Kolejność dalszych kroków (nic z tego nie jest wykonane):
1. **Decyzje właściciela w arkuszu** (TAK/NIE; oddzielnie: kanał tylko dla firm, inny skład, tropy).
2. **Domknięcie braków** w kontrolowanych grupach — trwa; wyczerpany limit wyszukiwarki nie jest dowodem, że produktu nie ma.
3. **Build publikacyjny** wariantów z 7/7 zaakceptowanymi rolami → walidacja → `publish_starter_local.py --plan` (+ `verify.sql`).
4. **Upload do prywatnego bucketa i wiersze rejestru** z dostępnością `TEST_ACCOUNTS_ONLY` i kontami QA (operacja do zatwierdzenia).
5. **QA na staging** na zaakceptowanych wariantach: konto A, konto B (brak dostępu do zamówienia A), finance admin, wyścig równoległych zamówień, mail do kontrolowanego odbiornika — wymaga logowań właściciela.
6. **Osobno do decyzji:** wyłączenie starej oferty bazy (`OFF`), usunięcie testowych wierszy LSP w USA, neutralny profil śmietanki wysokotłuszczowej (migracja).
7. **Publiczne ON i wydanie `main`/produkcja:** jeden końcowy pakiet wymagający wyraźnej zgody.

---

## 0. Punkty odczytu i rodzaj dowodów

- **`origin/staging`.** START_SHA = END_SHA = `6e83b8d1086fc1b72d6abc06fd525a72f5b561eb` (merge PR #379, 2026-09-16). W trakcie audytu nie pojawił się żaden nowy commit; `git fetch` wykonano na początku i na końcu. Po otwarciu PR #383 staging przesunął się do `b668349b` (PR #382, poza SHOP; zob. H1).
- **`origin/main`:** `7fa36890`.
- **Gałąź raportów SHOP.** `claude/pl-country-product-set` = `acdd8e7df11e09c2e3df3fe2cfc5d31059eb6e4e`; nie jest scalana.
- **Baza.** Supabase `tunabqqrwabacxjcxxkz` to jedyny projekt, wspólny dla staging i produkcji. Dowody:
  - opis PR #336;
  - `registry.json`, pole `sharedWithProduction: true`;
  - `list_projects` zwraca tylko ten projekt.

| Nowe odczyty 2026-09-17 | Raporty historyczne (nie powtórzone dziś) |
|---|---|
| git/gh na `6e83b8d1`; kod SHOP czytany przez `git show` | `reports/shop_pdf0/SHOP_FREE_BASE_PDF_REPORT.md` i walidacja PDF 13/13 (2026-09-12) |
| baza: SELECT, same agregaty, bez danych osobowych (`reports/evidence/SHOP_RECONCILIATION_2026-09-17/db_readonly_selects.md`) | przegląd renderów PDF telefon/desktop (2026-09-12) |
| porównanie danych PDF z rejestrem v23 (`reports/evidence/SHOP_RECONCILIATION_2026-09-17/dataset_vs_registry_v23.json`) | decyzje D-8, D-18, D-26, D-27, D-32 (`GLOBAL_BASE_PRODUCT_ARCHITECTURE_AUDIT.md`, 2026-09-10) |
| obejrzane podglądy produktu i tekst stron 1–3 PDF | raporty SHOP na staging (2026-08-31) i opis PR #128 (2026-09-03) |

**Czego nie robiono w audycie:**
- buildów, pełnych testów i walidatora PDF (pełne CI przeszło tylko PR #383, sekcja H1);
- zamówień, maili, migracji i zapisów do bazy;
- merge'a i deployu; jedyny wyjątek to PR #383, scalony do `staging` na osobne polecenie (sekcja H).

**Brak globalnego PASS.** Wynik historyczny nie jest nową walidacją.

---

## A. Stan i mapa

```
tabela v23 (xlsx, sha256 37afaf6f…82de16b4)                         ALREADY_DONE, zatwierdzona
  └─ w repo: docs/country-products/gelato-base-v23/{manifest,registry}.json (PR #319, #324 — MERGED 2026-09-12)
dane PDF: reports/shop_pdf0/guide_dataset.json (acdd8e7d)          ALREADY_DONE, zgodne z rejestrem (B)
plik: GELLATTI_GELATO_BASE_GUIDE_75_COUNTRIES_v1.pdf                PARTIAL
  └─ 82 s., EN, sha256 e84ebd58…; strony krajów OK; korekta frontu i wierszy cukru (C1–C2); nigdzie nie hostowany
oferta w SHOP                                                        OPEN (brak produktu; NOT FOUND w kodzie i bazie)
  └─ podglądy z 12.09: SUPERSEDED (dominuje „75”)
zamówienie za 0 €                                                    OPEN dla infopaku
  └─ istnieje tylko LOCAL_STARTER_PACK: 7 proszków Zestawu Startowego, inny zakres
dostęp do pliku                                                      OPEN dla infopaku
  └─ wzorzec LSP: Konto → Zamówienia → PDF budowany w przeglądarce ze snapshotu; mail = link
```

**Lokalny Zestaw Startowy (LSP): stan kodu na staging i produkcji** (PR #128, #132, #134)

```
/shop → blok Zestawu Startowego → kraj (localStorage) → tryb: physical, jeśli wysyłka > local, jeśli live > none
local → /shop/local-starter-pack → logowanie → wymagany adres → funkcja shop-local-pack:
  JWT; kraj; adres (usuwa i wstawia domyślny adres klienta); widok gotowości (tylko komponenty GEL-STARTER-PACK);
  INSERT shop_orders (LOCAL_STARTER_PACK, paid/delivered, 0 €, local_pack_snapshot);
  mail z kluczem local-pack:<orderId>
→ /account?section=orders&order=<id>&created=1 → przycisk → PDF z pdf-lib w przeglądarce → ponownie z konta
```

**Dowody:**
- zakres „the same seven canonical components”: `supabase/functions/shop-local-pack/index.ts:4-5`;
- logowanie „A free order is still an order”: `:7-9`;
- adres wymagany: `:93-106`; zastąpienie adresu domyślnego: `:167-188`;
- losowy numer zamówienia i INSERT bez sprawdzania istniejącego zamówienia: `:190-229`;
- klucz maila `local-pack:${order.id}`: `:250`; `APP_PUBLIC_ORIGIN ?? 'https://staging.pinguinoai.com'`: `:242`;
- tryb physical ma pierwszeństwo: `src/services/shopCountries.ts:69-74`;
- widok gotowości: `supabase/migrations/20260902150000_shop_country_and_shipping_authority.sql:199-241`;
- typy zamówienia: `:182-191` tej samej migracji;
- test adresu: `src/features/shop/localStarterPackContract.test.ts:79-82`;
- test „a free order earns no commission”: `:150-162`.

**Stan bazy (SELECT 2026-09-17):**
- 8 aktywnych produktów (Zestaw Startowy + 7 proszków), wszystkie z `image_url = null`.
- 17 krajów; tryb lokalny „live” ma tylko US, a jego 7/7 komponentów to wiersze „TEST PLACEHOLDER” z `example.invalid`.
- 8 zamówień LOCAL_STARTER_PACK: wszystkie US, z 2026-09-03 (dzień scalenia #128 i #132), 7 z zadaniem mailowym, 0 z atrybucją partnera.
- Te 8 zamówień **nie jest dowodem zakupów klientów ani kompletności rozwiązania**. Wskazują raczej na testy wdrożeniowe: NOT_VERIFIED, bez odczytu danych osobowych.

**Placeholdery 7 produktów:** osobny zakres, sekcja H.

**Kontekst:**
- żadnego kontraktu właściciela ani wiersza SOL o SHOP;
- PR-y #328, #334, #336 (OPEN) oraz #362 i #368–#379 (MERGED) nie dotykają SHOP;
- produkty v23 **nie są gotowe w aplikacji**: trasy v23 nie są zapisane (PR #328 fail-closed), a walidator trasy odrzuca PI mleka, śmietanki i SMP (PR #336 OPEN).

---

## B. Dowody porównania danych PDF z tabelą v23 i ich ograniczenia

- **Pliki dowodów:** `reports/evidence/SHOP_RECONCILIATION_2026-09-17/`:
  - `dataset_vs_registry_v23.json`: wejścia, metoda, wyniki, ograniczenia;
  - `compare_dataset_registry.py`: skrypt tylko do odczytu.

**Wejścia**

| Plik | Wersja | sha256 |
|---|---|---|
| dane PDF `guide_dataset.json` | `acdd8e7d`, blob `6c5a99c6…` | `ed193d9e…` |
| rejestr `registry.json` | `6e83b8d1`, blob `12a4b7a4…` | `e0799825…` |
| manifest | — | `baf0c2a2…` |
| PDF | — | `e84ebd58…` |

Rejestr deklaruje źródło v23 `37afaf6f…`.

**Wyniki**

| Co porównano | Wynik |
|---|---|
| wybory kraj × rola | 450/450 |
| nazwa (`localName`), opakowanie (`localPackText`), EAN (`gtin`) produktów konkretnych | 375/375 |
| cukier jako `GLOBAL_PI` | 75/75 |
| kanał tary a etykieta „From abroad” / „B2B” | 75/75 |
| linki pokazane w PDF obecne w źródłach rejestru | 638/638 |

**Dwanaście różnych zapisów marki: bez zmian.**
- Lista: BD, MX, PK, PA, LK (SMP) „NOW Foods”; TH „NOW Foods / Real Food”; CR „NOW Foods / iHerb Costa Rica”; FR „Régilait”; IN (śmietanka) „Elle & Vire Professionnel”; SI (mleko) „Alpsko mleko”; US „Bob's Red Mill”; UY „Bob's Red Mill / iHerb Uruguay”.
- PDF pokazuje wartość z właściwego wiersza kraju w `04_POKRYCIE_PR`. Rejestr po deduplikacji trzyma jeden zapis na produkt, np. „Bob's Red Mill / iHerb Japan” także dla US.
- **Rozstrzyga wpis kraju w zatwierdzonej tabeli.** Identyczny EAN nie uzasadnia zmiany nazwy. Nie ujednolicać.

**Trzy kontrole, które rejestr sam oznaczył jako nieudane, nie wpływają na PDF:**
1. `CALC_PRODUCT_NAME_MATCH:SMP:IL`: arkusz `18_SMP_PRZELICZENIA!A47` podaje „Spinnrad Magermilchpulver 400 g”, a `17_PROSZEK_75!A47` „Spinnrad Magermilchpulver”.
2. `CALC_PRODUCT_NAME_MATCH:SMP:LV`: to samo w wierszu 57.
   - Dlaczego bez wpływu (1 i 2): generator nie czyta arkusza 18. Dane PDF dla IL/LV to nazwa „Spinnrad Magermilchpulver”, opakowanie „400 g” i EAN 4260175411278 z `04_POKRYCIE_PR` (wiersze 254 i 314) oraz `17_PROSZEK_75` (47 i 57).
3. `ARTICLES_05_CURRENT_EQUALS_SELECTION_KEYS`: `05_PR_ING_ARTYKULY` ma 209 bieżących wierszy przy 194 kluczach wyborów, więc część wierszy nie jest używana.
   - Dlaczego bez wpływu: generator nie czyta arkusza 05.

Dowód do wszystkich trzech: `reports/shop_pdf0/build_guide.py@acdd8e7d` czyta tylko:
- `01_BAZA_PI` (linia 252);
- `02_KRAJE_75` (240);
- `04_POKRYCIE_PR` (245);
- arkusze ról 11, 14, 17, 20 i 23 (36-37, 250).

Odwołań do 05 i 18 jest 0.

**Ograniczenia**
- **To nie jest nowy test PDF.** Porównano plik danych, nie tekst, układ, czytelność ani linki w samym PDF. Jedyna kontrola na poziomie PDF to historyczne 13/13 z 2026-09-12 dla tego samego sha `e84ebd58…`.
- **To nie jest walidacja arkusza.** Rejestr to osobna pochodna v23 (PR #319), więc zgodność pokazuje zgodność dwóch pochodnych.
- **Nie porównano:** % tłuszczu, postaci dekstrozy, kodów sklepowych, notatek i etykiet SMP/dekstrozy.
- **Linki:** nie otwierano ich; dostępność, ceny i dostawa niesprawdzone.
- **Tabela i rejestr:** w ramach SHOP nie są zmieniane.

---

## C. Różnice względem zamysłu

1. **Front PDF.**
   - Okładka ma dominujące „75” i „COUNTRIES”, a tytuł „Gelato Base Guide” różni się od nowej nazwy.
   - Podtytuł okładki („matched to a product in each of 75 countries”) i krok 2 na s. 2 („the product Gellatti identified for each ingredient”) obiecują produkt także dla cukru. Źródło podaje dla cukru regułę: GLOBAL_PI 75/75.
   - Nagłówek „GELATO BASE GUIDE” i tytuł w metadanych.
   - **Strony 3–82 zostają**, poza wierszami cukru (pkt 2).
2. **Cukier.**
   - D-8 (`GLOBAL_BASE_PRODUCT_ARCHITECTURE_AUDIT.md:463`): PDF używa lokalnej nazwy konsumenckiej.
   - D-32 (`:807-811`): 28 nazw zatwierdzonych, JP グラニュー糖 (nigdy 上白糖); lista w `reports/a03/sucrose_consumer_terms_approved.csv`.
   - Stan PDF: tylko angielska reguła we wszystkich 75 krajach.
   - Korekta: dopisać nazwę lokalną w 28 rynkach, bez marki i bez EAN.
   - Opis sklepu nie może obiecywać marki dla każdego z sześciu składników w każdym kraju.
3. **Język.** Dokument jest wyłącznie po angielsku; nie obiecywać tłumaczeń. D-32 dopuszcza przyszłe warianty językowe, ale to nie jest ta praca.
4. **Teksty z 12.09 (`SHOP_PRODUCT_COPY.md`): SUPERSEDED.**
   - nazwa z „75” (linie 14, 60);
   - „a specific product in each of 75 countries” (20, 66);
   - CTA „Download…” / „Pobierz…” (48, 94) i „Free download” (45, 91) zamiast zamówienia.
5. **Podglądy z 12.09: SUPERSEDED.** Dominuje „75”. Brakuje korzyści „co kupić i gdzie” i wyraźnego „PDF”.
6. **Oferta w SHOP:** nie istnieje.
   - `kind` przyjmuje tylko `single` i `bundle`; wiersz `single` byłby pokazany jak proszek z €/kg i koszykiem.
   - LSP nie ma wiersza produktu, a znaczenie niesie typ zamówienia. Nowy typ produktu **nie jest potrzebny**.
7. **Zamówienie za 0 €: luki względem kierunku v2.**
   - **Brak typu zamówienia dla dokumentu**: jest tylko `PHYSICAL` i `LOCAL_STARTER_PACK`.
   - **Płatny checkout się nie nadaje:** zawsze Stripe, stawka wysyłki i adres (`supabase/functions/shop-checkout/index.ts:257-259, 311-313`).
   - **Ścieżka LSP się nie nadaje bez zmian:**
     - wymaga adresu i nadpisuje adres domyślny;
     - bramkuje krajem i kompletnością 7 komponentów;
     - ustępuje trybowi physical.
   - **Idempotencja:** INSERT zawsze tworzy nowe zamówienie. Deduplikacja w `gellatti_enqueue_email_v1` (`on conflict (idempotency_key) do nothing`, `20260831201500_email_jobs.sql:164`) dotyczy tylko maila **tego samego** zamówienia. Nic nie chroni przed podwójnym zamówieniem.
   - **Sukces przed dokumentem:** komunikat „Zamówienie utworzone” / „Gotowa” pokazuje się, zanim jakikolwiek plik powstanie.
   - **Link w mailu** bez `APP_PUBLIC_ORIGIN` wskazuje staging. Dostęp z konta działa niezależnie od maila.
   - **Wysyłka maila** (wdrożenie `email-dispatch`): NOT_VERIFIED.
8. **Kraj klienta.** PDF jest zbiorczy: klikalny spis A–Z i 80 zakładek. Nie nazywać go „indywidualnym PDF dla kraju”, nie tworzyć 75 plików i nie dodawać nowego selektora.
9. **Oferta LSP z danymi testowymi.** US jest „live” wyłącznie dzięki 7 testowym wierszom, a przez wspólną bazę dotyczy to też produkcji.
   - Ukrycie przycisku nie wystarczy: bezpośrednie wywołanie `shop-local-pack` nadal przechodzi przez ten sam widok gotowości.
   - Czy produkcja to serwuje: NOT_VERIFIED.
10. **Aplikacja.** Tekst infopaku nie może obiecywać, że wskazane produkty są gotowe w aplikacji Gellatti (A, kontekst).

---

## D. Gotowe teksty

Dokument jest informacją w PDF: nie paczką składników i nie zbiorem receptur z gramaturami. Zdanie o lokalnych nazwach cukru dotyczy PDF po korekcie G1.

### PL
- **Nazwa:** Gellatti — Składniki bazy lodów
- **Podtytuł:** Infopak zakupowy: co kupić i gdzie znaleźć składniki w Twoim kraju.
- **Format i cena (na karcie):** PDF · 0 €
- **Przycisk przed zamówieniem:** Zamów za 0 €
- **Krótki opis:** Darmowy infopak PDF: jakie podstawowe składniki kupić do bazy lodów i gdzie je znaleźć w Twoim kraju.
- **Opis produktu:**
  > To infopak w formacie PDF z informacjami o zakupach. Nie jest to paczka składników ani zbiór receptur z gramaturami.
  >
  > Infopak obejmuje sześć podstawowych składników bazy gelato: mleko, śmietankę, mleko odtłuszczone w proszku, cukier, dekstrozę i gumę tara. Dla mleka, śmietanki, mleka w proszku, dekstrozy i gumy tara podaje produkty wskazane w zatwierdzonej tabeli Gellatti dla Twojego kraju: markę, nazwę, opakowanie, kod kreskowy (jeśli produkt go ma) i odnośniki do miejsc, gdzie produkt znaleziono. Dla cukru podaje prostą regułę wyboru zamiast marki, a tam, gdzie potwierdziliśmy lokalną nazwę, także tę nazwę.
  >
  > Część produktów sprzedają sklepy za granicą albo dystrybutorzy dla firm. Infopak wyraźnie to oznacza. Dostępność, ceny i dostawa mogą się zmieniać i nie są gwarantowane.
- **Szczegóły:**
  - Format: PDF.
  - Język dokumentu: angielski.
  - Zakres: 75 krajów w jednym pliku; swój kraj znajdziesz w klikalnym spisie.
  - Dostawa: pobranie po złożeniu zamówienia za 0 €, bez karty i bez kosztów wysyłki.
  - Plik znajdziesz też w: Konto → Zamówienia.
- **Po złożeniu zamówienia:** „Zamówienie przyjęte. Twój infopak jest gotowy.” + przycisk **Pobierz PDF**. Komunikat pokazywać dopiero wtedy, gdy link do pliku jest dostępny.
- **W koncie:** wiersz „Składniki bazy lodów · PDF · 0 €” + przycisk **Pobierz PDF**.
- **Drobny druk:** Informacje zebrano ze stron producentów i sprzedawców (wrzesień 2026). Dostępność, ceny i dostawa nie są gwarantowane; przed zakupem sprawdź etykietę. Wskazanie produktu w infopaku nie oznacza, że jest on już dostępny w aplikacji Gellatti.
- **Miniatura:** Składniki bazy lodów · Co kupić i gdzie · PDF · 0 €

### EN
- **Name:** Gellatti — Gelato Base Ingredients
- **Subtitle:** Shopping guide: what to buy and where to find ingredients in your country.
- **Format and price (card):** PDF · €0
- **Button before ordering:** Get it for €0
- **Short description:** Free PDF shopping guide: the basic ingredients to buy for a gelato base, and where to find them in your country.
- **Product description:**
  > This is a PDF shopping guide. It is information, not a parcel of ingredients and not a recipe collection with gram amounts.
  >
  > It covers the six basic ingredients of a gelato base: milk, cream, skim milk powder, sugar, dextrose and tara gum. For milk, cream, skim milk powder, dextrose and tara gum, it lists the products in Gellatti's approved table for your country: brand, name, pack size, the barcode where the product has one, and links to where each product was found. For sugar it gives a simple buying rule instead of a brand, plus the local name where we have confirmed one.
  >
  > Some products are sold by shops abroad or by distributors to businesses, and the guide marks them clearly. Availability, prices and delivery can change and are not guaranteed.
- **Details:**
  - Format: PDF.
  - Document language: English.
  - Coverage: 75 countries in one file; find yours in the linked index.
  - Delivery: download after placing the €0 order, with no card and no shipping costs.
  - Also in: Account → Orders.
- **After ordering:** "Order received. Your guide is ready." + **Download PDF**. Show the message only once the file link is available.
- **Account row:** "Gelato Base Ingredients · PDF · €0" + **Download PDF**
- **Small print:** Compiled from manufacturer and retailer pages, September 2026. Availability, prices and delivery are not guaranteed; check the label before you buy. A product in this guide is not necessarily available in the Gellatti app yet.
- **Thumbnail:** Gelato Base Ingredients · What to buy and where · PDF · €0

---

## E. Specyfikacja korekty podglądu (bez nadpisywania grafik teraz)

Problemem nie jest to, że wielkie „75” trzeba zastąpić wielką ceną. **Najważniejsza jest korzyść: co kupić i gdzie.**

1. **Bez zmian:**
   - logo gellatti (pozycja, rozmiar, kolor);
   - białe tło, jedno koło #F0C44C, Manrope, kolory tokenów (#191A1D, #65635F);
   - marginesy i formaty 1200 × 1500 oraz 1080 × 1080.
2. **Usunąć:** cyfrę „75”, „COUNTRIES” i podtytuł „Six base ingredients · 75 countries”.
3. **Hierarchia:**
   1. **Tytuł, element dominujący:** „Składniki bazy lodów” / „Gelato Base Ingredients”. Waga 800, najwyżej 2 wiersze, w górnej połowie w miejscu dawnego „75”.
   2. **Korzyść, drugi w kolejności:** „Co kupić i gdzie” / „What to buy and where”. Waga 650, wyraźnie mniejszy od tytułu i większy od ceny.
   3. **Format i cena, cicho:** istniejąca obrysowana pigułka w prawym górnym rogu, **w obecnym rozmiarze**, z tekstem „PDF · 0 €” / „PDF · €0” zamiast „FREE GUIDE · 0 €”. Cena jest czytelna, ale nie konkuruje z tytułem ani korzyścią.
4. **Koło #F0C44C:** zmniejszone i przesunięte w prawy dolny obszar jako spokojny akcent. Bez nowych napisów i bez zmiany logo.
5. **Nie umieszczać:** „75 krajów” (zostaje w szczegółach produktu), liczby stron, opisu, informacji o recepturach.
6. **Warianty:** PL i EN (obraz z tekstem jest językowy).
7. **Kontrola:** tytuł i korzyść czytelne w skali 25%; kontrast tekstu ≥ 4,5:1; akcent użyty raz; brak dawnego pomarańczu.
8. **Okładka PDF, ta sama logika (G1):**
   - „Gelato Base Ingredients”, „What to buy and where”, „PDF shopping guide · Free · €0” (małe);
   - „Covers 75 countries — find yours in the index” małym tekstem;
   - logo bez zmian;
   - wnętrze dokumentu i jego nawigacja po krajach zostają.

---

## F. Rekomendacja: prezentacja w SHOP i stara oferta

**Jedna rekomendacja:**
1. **Nowi klienci.** `/shop` pokazuje jedną nową ofertę „Gellatti — Składniki bazy lodów” (infopak PDF, 0 €), widoczną w każdym kraju. Nie zależy od selektora kraju ani od trybu Zestawu Startowego.
   - Umieszczenie: po istniejącej sekcji „Kup osobno”, przed koszykiem. Zatwierdzony układ C3 (Zestaw Startowy → W zestawie → Kup osobno) zostaje bez przestawiania; ostateczne miejsce potwierdza akceptacja wizualna (G7).
2. **Stara oferta LSP** zostaje w kodzie i w bazie; nic nie jest likwidowane.
   - **Historia:** 8 zamówień, ich snapshoty i ponowne pobranie z konta działają bez zmian. Snapshotów nie przepisujemy na nowy dokument.
   - **Nowi klienci:** LSP pojawia się tylko tam, gdzie wzmocniona bramka gotowości (G5) uzna prawdziwe dane. Dziś żaden kraj ich nie ma, więc LSP nie będzie oferowany i nie powstaną dwie podobne darmowe oferty obok siebie.
   - **Przyszła reaktywacja** (prawdziwe dane lokalne w kraju bez wysyłki) to decyzja właściciela. LSP pojawi się wtedy tylko jako wariant Zestawu Startowego, pod dotychczasową nazwą „Lokalny Zestaw Startowy”, wyraźnie innym zakresem niż infopak.
3. **Rozdzielenie danych.** Sześć ról bazy **nie trafia** do `shop_country_components` ani do komponentów `GEL-STARTER-PACK`, a znaczenie istniejących tabel i kolumn się nie zmienia. Wspólne są tylko elementy konta, zamówień, dostępu i maili.

---

## G. Minimalny pakiet implementacyjny

**G0. Co pozostaje bez zmian:**
- tabela v23 i rejestr; dane i strony krajów PDF (poza wierszami cukru);
- `shop-local-pack` (adres, adres domyślny, bramka gotowości, snapshot);
- `localStarterPackContract.test.ts`: test adresu `:79-82` pozostaje przypisany do funkcji LSP (zmienna `edge`) i nie jest osłabiany;
- `shopCountries.ts` (`starterPackModeFor`) i płatny checkout;
- stare zamówienia i snapshoty, zdjęcia Zestawu Startowego, logo, header;
- Mapper, Engine, Scanner, Recipe Library, stawki afiliacyjne.

**G1. Dane i PDF** (narzędzia raportowe, bez kodu aplikacji)
- **Pliki:**
  - `reports/shop_pdf0/build_guide.py`:
    - `TITLE`, `page_cover()` wg E8, `page_howto()` (krok 2 z regułą cukru), `run_header()`, `<title>`;
    - `build_dataset()` + `item_html()`: pole `local_name` dla SUCROSE z `reports/a03/sucrose_consumer_terms_approved.csv` (28 rynków), np. „Local name: グラニュー糖”.
  - `reports/shop_pdf0/validate_guide.py`:
    - `REQUIRED` / `FORBIDDEN` (zakaz „matched to a product in each of 75 countries”);
    - kontrola 28/28 nazw cukru;
    - kontrola tytułu okładki.
  - `reports/shop_pdf0/build_thumbs.py`: grafiki wg E.
- **Wykorzystane ponownie:** generator, dataset z numerami wierszy v23, walidator 13 kontroli, tokeny i fonty.
- **Wynik:** nowy plik wersji (np. `…_v1.1.pdf`); v1 zostaje dla porównania. Nazwę pobieranego pliku ustala dostawa (G4).
- **Warunki ukończenia:**
  - walidator 13/13 na v1.1;
  - różnica tekstu stron 6–80 względem v1 tylko w wierszach cukru;
  - obejrzane rendery telefon i desktop: s. 1–3 oraz 3 strony z nazwą lokalną (JP, KR, BG);
  - zapisany sha.

**G2. Oferta SHOP** (prezentacja, bez bazy; wdrażana razem z G3 i G4, bo przycisk musi działać)
- **Pliki:**
  - `src/copy/shop.ts`: blok `infopak` w `ShopCopy`, `shopCopyPl` i `shopCopyEn` (teksty z D).
  - Nowy `src/features/shop/ShopInfopakOffer.tsx`: obraz, nazwa, podtytuł, „PDF · 0 €”, szczegóły (język, 75 krajów w jednym pliku), przycisk.
  - `src/features/shop/ShopCatalog.tsx`: osadzenie bloku wg F1, niezależne od `starterPackModeFor`.
  - `public/shop/infopak-pl.png`, `public/shop/infopak-en.png` (z G1).
- **Wykorzystane ponownie:** tokeny, `applicationSecondaryClasses`, istniejąca typografia SHOP. Bez nowych prymitywów.
- **Testy** (nowy kontrakt, np. `describe` w `shopPresentationContract.test.ts`):
  - klucze PL/EN;
  - „0 €”;
  - podany język dokumentu;
  - brak „75” w tytule;
  - przycisk „Zamów za 0 €” / „Get it for €0”;
  - brak słów o paczce i gramaturach.

**G3. Zamówienie** (baza i Edge, wyodrębnione od prezentacji)
- **Migracja** `supabase/migrations/<ts>_shop_digital_document_orders.sql`:
  - `shop_orders_order_type_check` + `'DIGITAL_DOCUMENT'`; istniejące wartości bez zmian.
  - Nowe kolumny (nullable): `document_key`, `document_version`, `document_sha256`, `document_path`. Nie wykorzystywać do tego `local_pack_snapshot`.
  - Ograniczenie kształtu dla `DIGITAL_DOCUMENT`:
    - sumy 0; status `paid` lub `cancelled`; `fulfillment = delivered`;
    - kolumny dokumentu wymagane;
    - `local_pack_snapshot`, `shipping_*` i `tracking_*` puste.
  - **Idempotencja:** unikalny indeks częściowy `(user_id, document_key)` z warunkiem `order_type = 'DIGITAL_DOCUMENT' and status <> 'cancelled'`.
  - ~~`gellatti_my_shop_orders_v1` zwraca nowy typ oraz `documentKey` i `documentVersion`, bez ścieżki pliku.~~ **Zmienione w K1:** v1 pomija nowy typ, a dokumenty czyta osobne RPC.
  - Podsumowanie przychodów (wzór `20260902170000_shop_revenue_summary_split.sql`) liczy nowy typ jako darmowy, nigdy jako przychód.
- **Funkcja** `supabase/functions/shop-digital-document/index.ts` (nowa; `shop-local-pack` bez zmian). Akcja `order`:
  1. Wymaga JWT (istniejące logowanie).
  2. W treści żądania tylko `documentKey` z białej listy (`GELATO_BASE_INGREDIENTS`). Wersję i ścieżkę rozwiązuje serwer.
  3. Sprawdza, czy plik jest w storage. Jeśli nie ma: `document_unavailable`, **bez zamówienia i bez sukcesu**.
  4. Wybiera istniejące aktywne zamówienie `(user, document_key)`; jeśli go nie ma, robi INSERT. Przy naruszeniu unikalności ponawia odczyt. Zwraca `{orderId, orderNumber, created}`.
  5. **Nigdy:** adres, `shop_customer_addresses`, widok gotowości, kraj, stawka wysyłki, stan magazynowy, Stripe, prowizja.
  6. **Mail** opcjonalny, tylko gdy `created = true`: `gellatti_enqueue_email_v1` z kluczem `digital-document:<orderId>`. Link wyłącznie z ustawionego `APP_PUBLIC_ORIGIN`, bez awaryjnego adresu staging; bez niego mail jest pomijany i logowany. Dostęp nigdy nie zależy od maila.
- **Wykorzystane ponownie:** wzorzec JWT i klienta admin z `shop-local-pack`, format numeru zamówienia, `gellatti_enqueue_email_v1`, obszar maili `SHOP`, RPC zamówień klienta.
- **Testy** (tylko nowy kontrakt, `src/features/shop/shopDigitalDocumentContract.test.ts`):
  - 0 € i brak dostawcy płatności;
  - brak adresu i brak `shop_customer_addresses`;
  - brak bramek kraju, wysyłki, stanu magazynowego i gotowości;
  - indeks unikalności i odczyt istniejącego zamówienia przed INSERT;
  - sprawdzenie pliku przed INSERT;
  - brak słowa „commission” i stawek 900/1900;
  - `APP_PUBLIC_ORIGIN` bez awaryjnego adresu staging.

**G4. Dostęp do pliku**
- **Storage:** prywatny bucket (np. `shop-documents`), obiekt `gelato-base-ingredients/<wersja>/<sha256>.pdf`, bez bezpośredniego odczytu dla klienta.
- **Akcja `download`** funkcji z G3:
  - JWT; zamówienie klienta typu `DIGITAL_DOCUMENT` w statusie `paid`;
  - podpisany link o krótkim czasie ważności do **wersji przypiętej w zamówieniu** (`document_path`), z nazwą pobierania `Gellatti-Gelato-Base-Ingredients-EN.pdf`;
  - ścieżka zawsze z wiersza zamówienia, nigdy z żądania klienta.
- **Klient:**
  - nowy `src/services/shopDigitalDocument.ts`: `orderDocument()`, `getDocumentLink()`;
  - `src/services/shop.ts`: `ShopOrderType` i pola wiersza;
  - `src/features/shop/ShopInfopakOffer.tsx`:
    - zamówienie → „Pobierz PDF”;
    - niezalogowany → istniejące okno logowania (wzorzec `LocalStarterPackPage.tsx:110-128`);
    - opcjonalnie fragment `#page=N` dla zapamiętanego kraju, bez nowego selektora;
  - `src/features/shop/ShopOrdersPanel.tsx`: wiersz „Pobierz PDF” dla nowego typu;
  - `src/pages/account/AccountWorkspacePage.tsx`: istniejący deep link bez zmian logiki;
  - `src/features/admin/AdminShopOrderCard.tsx` i `src/features/admin/shopOrderQueue.ts`: typ pokazany jako cyfrowy, bez akcji wysyłki.
- **Testy** (nowy kontrakt, ten sam plik co G3):
  - link tylko dla właściciela;
  - ścieżka z wiersza zamówienia;
  - brak publicznego URL;
  - „Pobierz PDF” tylko po otrzymaniu linku.

**G5. Zabezpieczenie przed ofertą z danymi testowymi** (niezależne od infopaku)
- **Migracja** `supabase/migrations/<ts>_shop_local_readiness_excludes_test_rows.sql`: `create or replace view shop_country_local_readiness` z tymi samymi kolumnami.
  - W `filled` dodatkowo:
    - `purchase_url` zaczyna się od `https://`;
    - host nie jest domeną testową: `.invalid`, `.test`, `.example`, `.localhost`, `example.com/.net/.org`;
    - `local_product_name` i `supplier_name` nie zaczynają się od „TEST”.
  - Ponowić `revoke` / `grant` (strażnik uprawnień widoków).
- **Skutek:**
  - US przestaje być „live”, więc interfejs pokazuje tryb `none`.
  - `shop-local-pack` ponownie czyta ten sam widok (`index.ts:12-14`), więc **bezpośrednie wywołanie** też dostaje `local_pack_not_available`.
  - Żadne wpisy, flagi ani zamówienia się nie zmieniają; 75 krajów nie jest oznaczane jako gotowe.
- **Test** (nowy przypadek w `localStarterPackContract.test.ts`): „testowe wiersze nigdy nie czynią kraju live”.
- **Warunki ukończenia** (po zgodzie i zastosowaniu):
  - SELECT: 0 krajów live;
  - kontrolowany odczyt: US w trybie `none`;
  - odmowa bezpośredniego wywołania, zweryfikowana dopiero przy wdrożeniu kontem testowym.

**G6. Wdrożenie** (każdy krok na wspólnej bazie wymaga osobnej zgody; aktualna kolejność i zakres zgód: „Stan ukończenia”, K i J)
1. G1: tylko pliki raportowe.
2. PR do staging z kodem G2, G3, G4 i G5; celowane testy kontraktów.
3. Migracje G3 i G5 na wspólnej bazie.
4. Bucket i wgranie PDF v1.1.
5. Deploy `shop-digital-document`.
6. Weryfikacja na staging kontem testowym:
   1. zamów → pobierz;
   2. drugi klik → ta sama liczba zamówień;
   3. Konto → Zamówienia → pobierz ponownie tę samą wersję;
   4. zamówienie z kraju z wysyłką i bez wysyłki;
   5. link z maila kieruje do właściwego środowiska (jeśli mail jest wysyłany);
   6. LSP niedostępny w US.
7. Produkcja osobno, na polecenie.

**G7. Akceptacja właściciela:** osobno dla:
- grafik (E) i renderów PDF v1.1;
- tekstów PL/EN;
- miejsca bloku w SHOP;
- przepływu na staging.

Przed akceptacją nie ogłaszać PASS.

---

## H. Zdjęcie tymczasowe 7 fizycznych produktów (osobny, zatwierdzony zakres): PR #383 scalony do staging

- **Commit i PR** (zgoda właściciela z 2026-09-17: commit, push i draft PR; potem osobne polecenie: wyjście z draftu i merge wyłącznie do staging, sekcja H2):
  - commit `3f4345ef9753e692b4fb7d90aca04b1a9635e668`, rodzic `6e83b8d1` (aktualny `origin/staging`). Lokalny commit `53972ccb` na starej bazie `814b04aa` został przeniesiony bez konfliktów, bo te 5 plików nie zmieniło się na staging;
  - gałąź `claude/shop-single-placeholder` (wypchnięta jawnym refspec);
  - **draft PR #383** do `staging`: https://github.com/pinguinointelligence/pinguino-intelligence-v1/pull/383;
  - pliki (5, +167/−25): `public/shop/single-placeholder.png` (nowy), `src/features/shop/{ShopPackaging.tsx, ShopProductCard.tsx, shopPresentationContract.test.ts, shopStarterShots.ts}`.
- **Automatyczne podglądy Vercel** dla SHA `3f4345ef` (`production: false`):
  - `Preview – pinguino-staging`: https://pinguino-staging-heexkh3sr-pinguinointelligence-7784s-projects.vercel.app;
  - `Preview – pinguino-intelligence`: https://pinguino-intelligence-i2w6yjspo.vercel.app.
  - Oba są chronione Vercel SSO: odpowiedź 302, bez sesji ekran „Log in to Vercel”. Po zalogowaniu właściciela w panelu przeglądarki obejrzane wyłącznie do odczytu, bez koszyka i bez zamówień.
  - **Dowód runtime z podglądu `pinguino-staging`:**
    - `/shop/single-placeholder.png` → 200, `image/png`, 248 619 bajtów, sha256 `54b5b020…`, zgodne z commitem;
    - wdrożony bundle `index-B_28FTEq.js` zawiera `/shop/single-placeholder.png` i wszystkie 7 SKU, bez starej ścieżki `.jpg`.
  - **Brak dowodu runtime kart** (NOT_VERIFIED):
    - w obu podglądach `/shop` pokazuje „WYMAGA UWAGI — Nie udało się wczytać sklepu”, a przeglądarka nie wysyła żadnego żądania do Supabase;
    - podglądy PR nie mają konfiguracji backendu, więc katalogu i 7 ramek nie da się wyrenderować;
    - to ograniczenie środowiska, nie tego diffu (zmiana nie dotyka `src/services`);
    - konfiguracji środowisk nie zmieniano.
- **Checki CI:** stan końcowy w tabeli H1 poniżej.
- **Historia przed PR:** praca w worktree `~/Developer/pinguino-shop-placeholder`, baza `814b04aa`; pliki SHOP identyczne z `origin/staging` `6e83b8d1`.
- **Źródło.** `~/Desktop/gellatti/APP/web pictures/product.png`: 1254 × 1254, RGBA, sha256 `30796d93…a2cc7e`. Plik nie został zmieniony.
- **Jeden wspólny plik.** `public/shop/single-placeholder.png`:
  - 512 × 512, PNG RGBA z zachowaną przezroczystością, 248 619 bajtów, sha256 `54b5b0203fccc2ef87739b18386a3231627fee279aa478d6ee8c6da4fc1e50bf`;
  - zmniejszony `sips -Z 512` z zachowaniem proporcji, bez napisów i logo.
- **Zmienione pliki kodu** (4, +167/−25; piąty plik to binarny PNG powyżej):
  - `src/features/shop/shopStarterShots.ts`: `SHOP_SINGLE_PLACEHOLDER_SRC = '/shop/single-placeholder.png'` oraz `SHOP_SINGLE_PLACEHOLDER_SKUS` z 7 SKU (GEL-DEX-500, GEL-FRU-500, GEL-INU-500, GEL-STB-500, GEL-YOL-500, GEL-SMP-500, GEL-CRP-500).
  - `src/features/shop/ShopPackaging.tsx`: ramka pokazuje najpierw własne `imageUrl` artykułu, potem placeholder (**tylko dla 7 SKU**), a na końcu pusty obrys.
    - `object-contain`, `alt=""`, `aria-hidden`, awaryjne `onError`.
    - Bez `mix-blend-multiply`.
    - Rozmiar, promień i kolor ramki bez zmian.
  - `src/features/shop/ShopProductCard.tsx`: przekazuje `sku` i `imageUrl`.
  - `src/features/shop/shopPresentationContract.test.ts`:
    - 7 SKU pokazuje placeholder, nieznany SKU nie;
    - własne zdjęcie ma pierwszeństwo;
    - zdjęcia Zestawu Startowego bez zmian.
- **Widoki.** Zdjęcia pojedynczych artykułów pokazuje tylko lista „Kup osobno” (`ShopProductCard`).
  - „W zestawie”, koszyk, potwierdzenie, zamówienia, konto, strona LSP i admin nie pokazują zdjęć artykułów. Nie dodano nowych sekcji.
  - Zdjęcia Zestawu Startowego (`ShopStarterOffer`) pozostały bez zmian (bajt w bajt).
- **Testy celowane (lokalnie, przed commitem).** `npx vitest run src/features/shop` → 47/47 PASS; prettier, eslint i `git diff --check` OK.
- **Pełne CI na commicie `3f4345ef`:** 7/7 PASS (typecheck, lint, cały zestaw testów, build i strażnicy repo); szczegóły w H1.
- **Podgląd statyczny** (HTML z CSS ramki, nie działająca aplikacja): `reports/evidence/SHOP_RECONCILIATION_2026-09-17/placeholder-preview/`.
  - Widać cały woreczek w dopasowaniu contain, bez przycięcia.
  - Przy 64 × 80 px kontrast z kremową ramką jest subtelny; woreczek czytelny głównie dzięki krawędziom i szaremu proszkowi.
- **Stan weryfikacji:**
  - 7 kart w działającym `/shop`: przed merge'em NOT_VERIFIED, bo podglądy PR nie wczytują katalogu, a `.env.local` nie był kopiowany. **Po merge'u sprawdzone na staging (sekcja H2).**
  - `onError` w przeglądarce (zachowanie przy nieudanym wczytaniu własnego zdjęcia): **NOT_VERIFIED**. Obsługa istnieje w kodzie, ale jej działanie nie było testowane.
- **Placeholder nie był i nie jest blokerem** infopaku ani zamówienia za 0 €.

### H1. Checki PR #383 na `3f4345ef` (przed synchronizacją z staging)

Odczyt 2026-09-17 po zakończeniu wszystkich checków (`gh pr checks 383`; przebieg `ci.yml` 35200328205, `conclusion: success`, `headSha` `3f4345ef`). Jedno uruchomienie, bez ponownych prób i bez zmian testów, workflow ani ochrony gałęzi.

| Check | Wynik | Czas |
|---|---|---|
| Typecheck, lint, tests, build | PASS | 21 min 14 s (08:33:46 → 08:55:00 UTC) |
| Owner-locked contracts + protected paths | PASS | 2 min 2 s |
| Solver time contracts (isolated) | PASS | 54 s |
| Starter-pack Direction rescue (isolated) | PASS | 5 min 58 s |
| Vercel – pinguino-staging (Preview) | PASS, „Deployment has completed” | n/d |
| Vercel – pinguino-intelligence (Preview, `production: false`) | PASS, „Deployment has completed” | n/d |
| Vercel Preview Comments | PASS | n/d |

- **Wynik:** 7/7 PASS, 0 błędów, więc nie ma czego klasyfikować jako „ten diff” albo „niezależne”.
- **Stan PR:** `OPEN`, `isDraft: true`, `mergeStateStatus: BEHIND`.
  - Po otwarciu PR `origin/staging` przesunął się o 1 commit: `6e83b8d1` → `b668349b` (PR #382, WWU phase 2, 15 plików).
  - Ten commit nie dotyka żadnego z 5 plików ani `src/features/shop` / `public/shop`. Próbne scalenie (`git merge-tree`, tylko odczyt) daje wynik bez konfliktów.
  - Gałęzi wtedy nie aktualizowano (poza ówczesnym zakresem zgody). Aktualizację wykonano później, na osobne polecenie właściciela (H2).
- **Checki nie dowodzą** wyglądu kart w działającym `/shop`; ten przegląd jest w H2.

### H2. Merge do staging i przegląd na staging (2026-09-17)

Polecenie właściciela z 2026-09-17: wyjście z draftu i merge **wyłącznie do `staging`**, normalny automatyczny deployment staging i przegląd zdjęć tylko do odczytu. Bez `main` i produkcji.

**Zasady merge'a** (odczyt API GitHub przed operacją):
- ochrona `staging`: `required_status_checks.strict: true` (gałąź PR musi być aktualna);
- jedyny wymagany check to „Owner-locked contracts + protected paths”;
- 0 wymaganych akceptacji, `enforce_admins: true`, brak rulesetów;
- dozwolone merge, squash i rebase.

**Synchronizacja (wymagana, nie z samego napisu BEHIND):**
- przy `strict: true` merge gałęzi, która jest w tyle, jest zablokowany;
- różnica `6e83b8d1..b668349b` (#382: raporty WWU, testy billing/referral/franchise, rollback SQL) nie dotyka `src/features/shop`, `public/shop` ani `package*.json`;
- wykonano zwykły merge `staging` do gałęzi PR, bez force-push: **`bfd3386582907894afa690c3f7bfb0c52e823e47`** (rodzice `3f4345ef` i `b668349b`);
- różnica względem `staging` to dokładnie 5 plików. Patch-id `6a8242ef…` jest identyczny z `3f4345ef`, więc treść zmiany się nie zmieniła.

**CI na `bfd33865`.** Nowy, automatyczny przebieg po pushu: bez ręcznych rerunów i bez przenoszenia PASS z `3f4345ef`.

| Check | Wynik | Czas (UTC) |
|---|---|---|
| Owner-locked contracts + protected paths (**wymagany**) | PASS | 09:37:03 → 09:39:03 |
| Solver time contracts (isolated) | PASS | 09:37:03 → 09:37:50 |
| Starter-pack Direction rescue (isolated) | PASS | 09:37:04 → 09:43:35 |
| Typecheck, lint, tests, build | PASS | 09:37:03 → 10:03:39 |
| Vercel – pinguino-staging / pinguino-intelligence (podglądy) | PASS | n/d |
| Vercel Preview Comments | PASS | n/d |
| Supabase Preview | pominięty (`skipped`) przez integrację | n/d |

**Merge.**
- Tuż przed operacją `staging` nadal wskazywał `b668349b`; `mergeStateStatus: CLEAN`.
- `gh pr ready 383`, potem squash z `--match-head-commit bfd33865`, o 10:04:09 UTC.
- **Merge SHA:** **`5ee5e4670d5b47f5e332334b10f5f55dec9e2c95`**:
  - jeden rodzic `b668349b`;
  - 5 plików, +167/−25;
  - patch-id `6a8242ef…`, identyczny z `3f4345ef`;
  - blob PNG `770f82c1…`.
- Gałąź PR pozostawiona.

**Deployment staging (automatyczny).**
- Vercel `pinguino-staging`, `dpl_EiXKEMD2KZyT9RjdFD5JQrB7pcGT`, stan READY.
- `meta.githubCommitSha` = `5ee5e4670d5b47f5e332334b10f5f55dec9e2c95`; alias `staging.pinguinoai.com`.
- Serwowany bundle `/assets/index-DUL-tmBT.js` zawiera pełny merge SHA (sprawdzone 10:05:29 UTC).
- Projekt produkcyjny `pinguino-intelligence` i `main` nie były dotykane.

**CI po merge'u na `staging`** (push, `5ee5e467`, przebieg 35208523862, `conclusion: success`):
- Owner-locked contracts: PASS (10:04:21 → 10:06:34);
- Solver time contracts: PASS (10:04:15 → 10:05:02);
- Starter-pack Direction rescue: PASS (10:04:15 → 10:10:14);
- **Typecheck, lint, tests, build: PASS** (10:04:15 → 10:22:15);
- Vercel – pinguino-staging i pinguino-intelligence: PASS.
- **Produkcja nietknięta:** w projekcie `pinguino-intelligence` powstał dla `5ee5e467` tylko podgląd (`dpl_EWeY88NenkL7we19utMWjAcNiENv`, `target: null`); `main` = `7fa36890`.

**Przegląd `/shop` na staging (tylko odczyt).**
- **Metoda:**
  - Chrome 153 headless sterowany przez DevTools Protocol (skrypt `evidence/SHOP_RECONCILIATION_2026-09-17/staging-review-pr383/shop_review_cdp.mjs`);
  - świeży profil bez logowania, język `pl-PL`, bez kliknięć, koszyka, zamówień i wyboru kraju;
  - dwa widoki: desktop 1440 × 900 @2x oraz mobile 390 × 844 @3x (emulacja dotyku i przeglądarki iPhone, nie fizyczny telefon);
  - ten sam skrypt uruchomiony **przed** merge'em (`b668349b`) i **po** nim (`5ee5e467`).
- **Żądania do bazy:** tylko odczyty.
  - `POST rpc/gellatti_shop_catalog_v1` → 200 (odczyt katalogu);
  - `GET shop_country_local_readiness` → 401 (niżej).

| Kontrola (desktop i mobile, wynik identyczny) | Wynik |
|---|---|
| Katalog wczytany, 7 kart „Kup osobno” | PASS; brak „Nie udało się wczytać sklepu” |
| Woreczek na właściwych artykułach | PASS: 7 obrazów `/shop/single-placeholder.png`, każdy w karcie `shop-card-<SKU>` jednego z 7 SKU (Dekstroza, Fruktoza, Inulina, Suszone żółtko jaja, Odtłuszczone mleko w proszku, Śmietanka w proszku 42%, Gellatti Stabilizer); 0 obrazów poza nimi |
| PNG wczytany poprawnie | PASS: `complete`, rozmiar naturalny 512 × 512; odpowiedź 200 `image/png`, 248 619 bajtów, sha256 `54b5b020…` = plik z commita |
| Cały obraz w ramce | PASS: `object-fit: contain`, pole obrazu w granicach ramki (treść 67,91 × 67,91 w ramce 67,91 × 83,98 na desktopie; 64 × 64 w 64 × 80 na mobile), bez przycięcia i rozciągnięcia, bez `mix-blend-mode` |
| Wygląd ramki | bez zmian względem stanu „przed”: te same wymiary i położenie (±0,02 px), tło `rgb(251, 250, 247)`, promień 12 px; jedyna różnica to `overflow: hidden` z PR |
| Starter Pack bez zmian | PASS: te same 3 zdjęcia (`starter-front.jpg`, `starter-angle-thumb.jpg`, `starter-side-thumb.jpg`), tekst i położenie; mobile: wycinek identyczny co do piksela (0 różnych pikseli) |
| Layout | PASS: brak poziomego przewijania, karty się nie nakładają; mobile: sekcja „Kup osobno” różni się od stanu „przed” wyłącznie wewnątrz 7 ramek (0 różnych pikseli poza nimi) |
| Konsola | 1 błąd, ten sam przed i po merge'u: 401 widoku gotowości |

- **Wizualnie** (obejrzane zrzuty): na obu widokach każda z 7 kart pokazuje cały biały woreczek z proszkiem, wyśrodkowany w kremowej ramce. Kontrast z ramką jest subtelny, co zgadza się z podglądem statycznym. Nazwy, ceny i przyciski są jak przed merge'em.
- **Zrzuty** (`evidence/SHOP_RECONCILIATION_2026-09-17/staging-review-pr383/`):
  - `after-5ee5e467/{desktop-1440x900,mobile-390x844}/02-kup-osobno-7-cards.png`: 7 kart;
  - `03-card-<n>-<SKU>.png`: każda karta osobno;
  - `01-starter-pack.png`, `00-full-page-css1x.png`;
  - dla porównania te same wycinki w `before-b668349b/`;
  - pomiary: `facts.json` w obu katalogach.
- **Ograniczenia:**
  - **Desktop:** porównanie pikselowe nie jest dowodem. Ułamkowe współrzędne układu 1440 px dają przesunięcia subpikselowe między przebiegami, więc tam dowodem są pomiary DOM i obejrzany obraz.
  - **`onError`:** nie testowano; samo istnienie obsługi w kodzie nie jest testem zachowania.
  - **Urządzenie:** emulacja w Chrome, nie fizyczny iPhone ani Safari.
  - **Stan strony:** widok bez logowania i bez wybranego kraju. Sekcja „Kup osobno” nie zależy od kraju (`src/features/shop/ShopCatalog.tsx:140-161`).
- **Niezależny błąd (nie naprawiany w ramach #383):** dla niezalogowanego gościa odczyt listy krajów zwraca 401, tak samo przed merge'em i po nim. Przyczyna, wpływ, dowód i najmniejsza naprawa: **sekcja L**. Nie ma związku ze zdjęciem.
- **CI na `5ee5e467` (stan końcowy, 2026-09-17 10:27 UTC):**
  - jeden przebieg `CI` (push, `staging`) 35208523862 zakończony sukcesem;
  - check-runy: 4 zadania CI i Vercel Preview Comments: sukces; Supabase Preview: pominięty;
  - statusy commita: `success` (Vercel ×2).
  - Bez ponownych uruchomień.
- **Opis PR #383 zaktualizowany (2026-09-17):**
  - bieżący stan: scalony do `staging`, nie na `main`; akceptacja właściciela: brak;
  - zakres: tylko zdjęcie, nie całe SHOP;
  - tabela wykonanych weryfikacji i lista niewykonanych;
  - dawne „draft” oraz „runtime/CI niesprawdzone” opisane jako zastąpiona historia.
- **OWNER_ACCEPTED_RUNTIME: NO**, do przeglądu właściciela.

---

## L. Błąd 401 przy wyborze kraju dla niezalogowanych (niezależny od #383)

Diagnoza 2026-09-17, tylko odczyt: kod `origin/staging` `5ee5e467` (`main` bez różnic w tych plikach), metadane bazy, powtórzenie błędu w wycofanej transakcji i zagregowane logi bramki (bez IP). Nic nie zostało zmienione.

**Które żądanie.**
- `GET /rest/v1/shop_country_local_readiness?select=iso2,name,active,physical_starter_pack_available,local_starter_pack_available,local_starter_pack_live,missing_components,components_required,components_ready`
- Wysyła je `getShopCountries()` (`src/services/shopCountries.ts:95-112`). Wywołuje je `ShopCountrySelector` przy wejściu na `/shop` (`src/features/shop/ShopCountrySelector.tsx:32-34`) oraz strona `/shop/local-starter-pack`.
- Błąd ma tylko rola `anon` (gość bez sesji). Rola `authenticated` dostaje 200.

**Przyczyna (potwierdzona w bazie).**
1. Widok ma `security_invoker=true`, więc polityki RLS tabel źródłowych działają z uprawnieniami gościa.
2. Publiczne polityki odczytu (`anon`, `authenticated`) na `shop_countries`, `shop_country_components`, `shop_products` i `shop_shipping_rates` mają warunek `(active = true) OR gellatti_admin_has_permission_v1('FINANCE', auth.uid())`; dla stawek `active AND enabled`.
   - Źródła: `20260829200000_gellatti_shop.sql:84-85`, `20260902150000_shop_country_and_shipping_authority.sql:50-51, 85-86, 125-126`.
3. `anon` nie ma `EXECUTE` na `gellatti_admin_has_permission_v1(text, uuid)`. `20260826120000_admin_partner_controlled_catalog.sql:41-43` odbiera je `public`, `anon` i `authenticated` i oddaje tylko `authenticated`; ACL dziś: `postgres`, `service_role`, `authenticated`.
4. Prawo wykonania funkcji jest sprawdzane przy przygotowaniu warunku, niezależnie od `OR`.
   - Powtórzenie jako `anon` (transakcja wycofana): `ERROR 42501: permission denied for function gellatti_admin_has_permission_v1`. PostgREST zwraca go gościowi jako 401.
   - Jako `authenticated`: 17 krajów, 1 „live”, bez błędu.
- Katalog produktów działa, bo `gellatti_shop_catalog_v1` to funkcja `SECURITY DEFINER` z `EXECUTE` dla `anon`.

**Rzeczywisty wpływ na wybór kraju i zakup.**

| Kto | Wybór kraju | Zakup |
|---|---|---|
| Gość (niezalogowany) | lista pusta: tylko „Wybierz kraj”, bez komunikatu błędu | Zestaw Startowy bez ceny i przycisku (tryb `none`). `/shop/local-starter-pack` pokazuje „Jeszcze nie w Twoim kraju”, także w US. „Kup osobno”: ceny i dodanie do koszyka działają. Płatność wymaga logowania. |
| Gość, który zaloguje się w oknie logowania bez przeładowania strony | **lista zostaje pusta**: po nieudanej próbie magazyn ma `loaded: true` (`src/features/shop/shopCountryStore.ts:42-53`), a po zalogowaniu nic go nie resetuje | przycisk płatności wysyła pusty kraj, a `shop-checkout` odpowiada `400 country_required` (`supabase/functions/shop-checkout/index.ts:144-147`), więc koszyk pokazuje błąd. Dotyczy też samych „Kup osobno”. Wyjście: ręczne przeładowanie strony. **Wynika z kodu; nie sprawdzone na żywo, bo wymaga logowania.** |
| Zalogowany już przy wejściu na stronę | działa (logi: odczyty `authenticated` → 200) | działa |

- **Produkcja:** ten sam kod klienta i ta sama baza, więc ten sam skutek dla gości. W 24-godzinnym oknie logów nie było odczytów tego widoku z domen produkcyjnych, więc brak dowodu z logów.

**Dowód, że błąd był przed #383.**
1. Pomiar „przed” na deployu `b668349b`, 09:41 UTC: 401 w `staging-review-pr383/before-b668349b/facts.json` (desktop i mobile).
2. Logi bramki Supabase (agregaty): `GET` tego widoku jako `anon` → 401 ×2 o 09:41 UTC, 23 min przed merge'em #383 (10:04:09 UTC). Odczyty `authenticated` o 07:34 i 09:30 UTC → 200.
3. Przyczyna leży w bazie: uprawnienia funkcji z 26.08, polityki z 29.08 i 02.09. #383 zmienia 5 plików frontu i żadnego obiektu bazy.

**Najmniejsza naprawa (propozycja, NIE wykonana).** Zgoda K6:
- Usunąć wywołanie funkcji administracyjnej z publicznych polityk odczytu. Bez `GRANT`, bez zmiany funkcji, widoku, danych i aplikacji.
- FINANCE zachowuje pełny odczyt: na 3 tabelach przez istniejące `*_admin_write` (`ALL`), a na `shop_products` przez nową politykę tylko dla `authenticated`.
- **Do świadomej akceptacji:**
  - gość zacznie faktycznie czytać aktywne wiersze 4 tabel, tak jak zakładają istniejące polityki `*_public_read`;
  - obejmuje to rekomendacje zakupowe `shop_country_components` (dziś 7 testowych wierszy US) i stawki wysyłki.
- **Węższa alternatywa:** funkcja `SECURITY DEFINER` zwracająca gościom tylko flagi krajów oraz zmiana klienta; to migracja i PR aplikacji, czyli większy zakres.
- **Osobno, opcjonalnie (kod aplikacji; nie w tym kroku):**
  - magazyn krajów nie powinien zapisywać `loaded: true` po błędzie, a wybór kraju powinien pokazywać błąd z ponowieniem;
  - bez tego każda przyszła awaria odczytu znowu zablokuje płatność do przeładowania strony.

---

## K. Pakiet zgody technicznej (przygotowany, NIE wykonany)

**Stan na 2026-09-17:**
- infopak: **ZAPLANOWANY**, nie wdrożony;
- zabezpieczenie przed testowymi rekomendacjami US w Lokalnym Zestawie Startowym: **PROPONOWANE**, nie wdrożone;
- zmiana zdjęć 7 produktów: **PR #383 scalony do `staging`** (`5ee5e467`), nie na `main` ani produkcji;
- naprawa 401 wyboru kraju dla gości (K6): **PROPONOWANA**, nie wdrożona.

**Zgoda na PR #383 (w tym jego merge do staging) nie obejmuje żadnej pozycji K1–K6.** Nic z tego nie zostało wykonane. Zgody dotyczące Growth/Stripe nie przenoszą się na SHOP.

Wspólne tło dla K1–K4 i K6:
- **Środowisko:** jeden projekt Supabase `tunabqqrwabacxjcxxkz` dla staging i produkcji (PR #336; `registry.json` `sharedWithProduction: true`). Każda zmiana w bazie, storage lub Edge działa od razu także dla produkcji.
- **Kod aplikacji:**
  - staging: Vercel `pinguino-staging` z gałęzi `staging`;
  - produkcja: Vercel `pinguino-intelligence` z `main` (`7fa36890`).

**Zakres do zatwierdzenia na wspólnej bazie.** Każdy wiersz to osobna zgoda; szczegóły w K1–K6.

| Zgoda | Co dokładnie zostanie wykonane | Istniejące dane | Skutek dla produkcji | Kiedy |
|---|---|---|---|---|
| **K6** (401) | 1 migracja: 4× `alter policy … using`, 1× `create policy shop_products_finance_read` | bez zmian | goście mogą wybrać kraj i zapłacić | niezależnie, od razu |
| **K1** | 1 migracja: `shop_orders` (typ, 4 kolumny, ograniczenie cyklu, indeks częściowy); tabela `shop_digital_documents`; filtr w `gellatti_my_shop_orders_v1` i `gellatti_admin_shop_orders_v1`; nowe RPC dokumentów; podsumowanie przychodów; odmowa zmiany realizacji dla dokumentu | 16 zamówień bez zmian | stary klient nie widzi nowych wierszy | przed merge'em K5 |
| **K2** | bucket `shop-documents` (prywatny, bez polityk klienta) i 1 obiekt PDF v1.1 | brak | ok. 3 MB w limicie storage | po akceptacji PDF v1.1 |
| **K3** | deploy 1 funkcji `shop-digital-document`; wiersz dokumentu z `availability = off` | brak | funkcja osiągalna, zamówienia zamknięte | po K1 i K2 |
| **K3: dostępność** | `off` → `allowlist` (konta testowe) → `on` | brak | `on` = infopak dostępny w obu środowiskach | po weryfikacji na staging |
| **K4** | nowa definicja widoku `shop_country_local_readiness` | bez zmian; historia LSP zostaje | oferta LSP w US wyłączona wszędzie | osobna decyzja |

### K1. Zamówienia dokumentów (G3)

Doprecyzowanie 2026-09-17: zgodność starego klienta sprawdzona w kodzie `origin/staging` `b668349b`; `main` `7fa36890` nie różni się w cytowanych plikach SHOP.

- **Zmiany:** migracja `shop_digital_document_orders`:
  - `shop_orders_order_type_check` + `DIGITAL_DOCUMENT`. Dziś baza przyjmuje tylko dwa typy (`20260902150000_shop_country_and_shipping_authority.sql:182-191`), więc zapis nowego typu jest odrzucany;
  - kolumny `document_key`, `document_version`, `document_sha256`, `document_path` (nullable);
  - nowa tabela `shop_digital_documents`:
    - kolumny `document_key`, `version`, `sha256`, `storage_path`, `availability` (`off`/`allowlist`/`on`), `allowlist_user_ids uuid[]`, `published_at`;
    - RLS włączone, bez polityk i grantów dla `anon` i `authenticated`; czyta ją tylko funkcja z K3;
  - ograniczenie cyklu życia na wzór `shop_orders_local_is_not_shipped` (`20260902190000_shop_order_type_lifecycle_separation.sql:14-24`):
    - dokument ma tylko stan `delivered` albo `cancelled`, 0 €, bez wysyłki, numeru przesyłki i `shipped_at`;
    - pola dokumentu są wymagane dla tego typu i zakazane dla pozostałych;
  - unikalny indeks częściowy `(user_id, document_key)`, gdy `order_type = 'DIGITAL_DOCUMENT' and status <> 'cancelled'`;
  - **`gellatti_my_shop_orders_v1` i `gellatti_admin_shop_orders_v1` pomijają `DIGITAL_DOCUMENT`**. Nowy klient (K5) czyta dokumenty osobnym RPC `gellatti_my_shop_documents_v1`. To **zastępuje punkt G3**, w którym v1 zwracało nowy typ;
  - podsumowanie przychodów: `orders`, `shipped` i `refunded` liczą dziś każdy typ (`20260902170000_shop_revenue_summary_split.sql:32, :37-38`). Nowy typ jest z nich wyłączony i ma osobny licznik;
  - zmiana realizacji (`20260831150000_shop_allergens_and_fulfilment_reads.sql:157-197`) aktualizuje po samym `id`. Dla `DIGITAL_DOCUMENT` odmawia; niezależnie blokuje to ograniczenie cyklu życia.
- **Zgodność starego klienta** (produkcja `main` oraz staging przed K5). **Bez filtrów z listy „Zmiany”:**
  - **Konto klienta.** `ShopOrdersPanel.tsx:270` rozpoznaje tylko `LOCAL_STARTER_PACK`; każdy inny typ trafia do widoku paczki `OrderRow` (`:149`).
    - Pokazuje chipy statusu i realizacji, pozycje, sumę, „Wysyłka do” (jeśli jest adres) i przycisk sprawdzenia płatności (przy `pending`).
    - Nie ma przycisku PDF.
    - Typ nie jest sprawdzany w działaniu: `src/services/shop.ts:112` tylko rzutuje odpowiedź.
  - **RPC.** `gellatti_my_shop_orders_v1` filtruje wyłącznie `user_id = auth.uid()` (`20260902160000_shop_orders_local_pack_read.sql:54`). Zamówienie dokumentu pojawiłoby się więc klientowi na produkcji jako paczka.
  - **Admin.**
    - `gellatti_admin_shop_orders_v1` nie filtruje typu (`20260902180000_admin_shop_orders_operational_view.sql:17-72`).
    - Kolejka (`src/features/admin/shopOrderQueue.ts:22-33`) kieruje opłacone zamówienie z `awaiting` do „Do wysłania”, zakładki domyślnej.
    - Karta pokazuje formularz wysyłki dla każdego typu (`src/features/admin/AdminShopOrderCard.tsx:224-260`).
  - **Inne skutki uboczne:** brak wyzwalaczy i zadań na `shop_orders`. Webhook Stripe dotyczy tylko zamówień `pending` z sesją płatności.
  - **Wniosek:** to, że 16 starych wierszy się nie zmienia, nie dowodzi braku wpływu.
    - Bez filtrów w v1 każde nowe zamówienie dokumentu byłoby widoczne w starym koncie jako paczka, a w adminie jako rzecz do wysłania.
    - Z filtrami stary klient w ogóle nie widzi nowych wierszy; pokazuje je dopiero kod K5.
- **Wpływ na istniejące zamówienia:**
  - 16 wierszy (8 LSP, 8 PHYSICAL) bez zmian; nowe kolumny są dla nich `null`;
  - ograniczenia dotyczą tylko nowego typu, a lista typów jest rozszerzana, nie zawężana;
  - v1 zwracają dla starych wierszy te same klucze co dziś. Do potwierdzenia testem porównującym odpowiedź RPC przed i po migracji.
- **Wpływ na produkcję:**
  - schemat zmienia się natychmiast;
  - kod `main` nie widzi nowych wierszy dzięki filtrom v1;
  - dopóki flaga dostępności z K3 jest wyłączona, nowych wierszy nie ma.
- **Wycofanie:** migracja odwrotna:
  - usunąć RPC dokumentów, indeks, ograniczenia i kolumny;
  - przywrócić `order_type_check` do `('PHYSICAL','LOCAL_STARTER_PACK')` oraz definicje RPC i podsumowania z `20260902160000`, `20260902170000` i `20260902180000`.
  - Warunek: brak wierszy `DIGITAL_DOCUMENT`. Jeśli powstały, najpierw decyzja właściciela co do nich (K2, K3).
- **Wymagane wdrożenie:** zastosowanie migracji na wspólnej bazie (osobna zgoda), zanim kod G2–G4 trafi na staging.

### K2. Plik dokumentu (G4)
- **Zmiany:**
  - prywatny bucket `shop-documents` bez polityk dla `anon` i `authenticated` (bez odczytu i listowania przez klienta; dostęp tylko przez funkcję z K3);
  - wgranie PDF v1.1 jako `gelato-base-ingredients/<wersja>/<sha256>.pdf`;
  - **każda nowa wersja to nowy obiekt**. Wersji, do której odsyła jakiekolwiek zamówienie, nie nadpisuje się i nie przenosi.
- **Właściwy użytkownik, uprawnienie i wersja:** plik nie ma własnego mechanizmu dostępu. Link podpisany wydaje tylko akcja `download` z K3, po sprawdzeniu właściciela zamówienia i dla wersji przypiętej w tym zamówieniu.
- **Wpływ na zamówienia:** brak.
- **Wpływ na produkcję:**
  - obiekt jest widoczny w tym samym projekcie, bez publicznego URL;
  - rozmiar ok. 3 MB wlicza się do globalnego limitu storage projektu (sprawdzić przed wgraniem).
- **Wycofanie:**
  - **przed pierwszym zamówieniem:** usunąć obiekt i bucket;
  - **po pojawieniu się zamówień nie wolno po prostu usunąć pliku**, bo to jedyna kopia dokumentu, do którego klienci dostali dostęp. Wycofanie oznacza:
    - zamknięcie nowych zamówień flagą dostępności (K3);
    - dalsze działanie `download` dla istniejących zamówień.
  - Usunięcie pliku wymaga obu warunków:
    - osobnej decyzji właściciela co do istniejących zamówień;
    - sprawdzenia, że żadne zamówienie nie wskazuje tej ścieżki (`document_path`).
- **Wymagane wdrożenie:** utworzenie bucketu i wgranie pliku (osobna zgoda), po G1 i zatwierdzeniu PDF v1.1.

### K3. Funkcja Edge `shop-digital-document` (G3 i G4)
- **Zmiany:** nowa funkcja z akcjami `order` i `download`.
  - **Autoryzacja** (wzór `supabase/functions/shop-local-pack/index.ts:58-67`):
    - samo `verify_jwt` bramki nie wystarcza, bo klucz anon też jest ważnym JWT;
    - funkcja wywołuje `auth.getUser()` z nagłówkiem wywołującego i bez użytkownika zwraca 401;
    - id użytkownika bierze wyłącznie z tokenu, nigdy z treści żądania.
  - **`order`:**
    - sprawdza flagę dostępności (niżej) oraz istnienie i sha256 pliku przed zapisem;
    - zapisuje idempotentnie: indeks z K1; powtórne wywołanie zwraca istniejące zamówienie;
    - bez adresu, kraju, wysyłki, stanu magazynowego, Stripe i prowizji.
  - **`download`:**
    - czyta zamówienie rolą serwisową po `id` i **`user_id` z tokenu**, z warunkami `order_type = 'DIGITAL_DOCUMENT'` i `status = 'paid'`. W przeciwnym razie zwraca 404 i nie ujawnia, że cudze zamówienie istnieje;
    - podpisuje wyłącznie `document_path` z wiersza zamówienia, nigdy ścieżkę z żądania, więc klient dostaje dokładnie wersję ze swojego zamówienia;
    - przed podpisem sprawdza zgodność `document_sha256`;
    - link ważny krótko, 300 s jak w `supabase/functions/admin-control/index.ts:108-113`, z `Cache-Control: no-store`.
  - **Wygasły link:**
    - linku podpisanego nie zapisuje się w bazie, w mailu ani na stałe w aplikacji;
    - mail prowadzi do konta, a „Pobierz PDF” za każdym razem przechodzi przez `download` (zalogowanie, właściciel, wersja) i dostaje nowy link.
  - Mail tylko z ustawionego `APP_PUBLIC_ORIGIN`.
- **Wpływ na zamówienia:** brak dla istniejących. Nowe zamówienia powstają dopiero po włączeniu flagi dostępności.
- **Wpływ na produkcję i kontrola udostępnienia** (poprawka poprzedniego zapisu „bez kodu klienta nikt jej nie wywoła”):
  - **Zasięg:** funkcja jest wspólna dla staging i produkcji i od deployu odpowiada pod publicznym adresem funkcji.
  - **Brak przycisku jej nie blokuje:** każdy zalogowany użytkownik może wywołać ją bezpośrednio.
  - **Dostępność:** kolumna `availability` w tabeli `shop_digital_documents` (K1), czytana przez funkcję przy każdym `order`:
    - `off` przy deployu;
    - `allowlist`: tylko użytkownicy z `allowlist_user_ids`, czyli konta testowe do weryfikacji na staging bez udostępniania klientom;
    - `on`: wszyscy zalogowani.
    - Każda zmiana to osobna decyzja właściciela i działa jednocześnie na staging i produkcji.
  - **Nie przez `shop_products`:** `gellatti_shop_catalog_v1` zwraca każdy aktywny produkt (filtr tylko `active`, `20260831150000_shop_allergens_and_fulfilment_reads.sql:29-68`).
    - Stary klient pokazałby wiersz `single` jako kartę „Kup osobno” za 0 € z „Dodaj do koszyka”, prowadzącą do płatnego checkoutu.
    - Dlatego infopak **nie dostaje wiersza w `shop_products`**, a oferta w aplikacji (G2) pochodzi z tekstów i z tej tabeli.
    - Uwaga: `shop-local-pack` dziś nie sprawdza `shop_products.active`.
  - **Limit:** indeks z K1 daje najwyżej jedno aktywne zamówienie na użytkownika i dokument.
  - **`download`** nie zależy od flagi, więc istniejące zamówienia zachowują dostęp.
  - **CORS** nie jest zabezpieczeniem.
- **Wycofanie:**
  - wyłączenie flagi zamyka nowe zamówienia; dane i pobieranie zostają;
  - wersja 503 lub usunięcie funkcji tylko wtedy, gdy nie ma zamówień. Gdy istnieją, najpierw decyzja właściciela, bo klienci straciliby dostęp.
- **Wymagane wdrożenie:** deploy funkcji z wyłączoną flagą i sprawdzenie `APP_PUBLIC_ORIGIN`, bez zmiany innych funkcji i sekretów (osobna zgoda).

### K4. Zabezpieczenie widoku gotowości Lokalnego Zestawu Startowego (G5)
- **Zmiany:** migracja `shop_local_readiness_excludes_test_rows`, czyli nowa definicja widoku `shop_country_local_readiness` z tymi samymi kolumnami.
  - Warunek „wypełniony” wyklucza hosty testowe (`.invalid`, `.test`, `.example`, `.localhost`, `example.*`) oraz nazwy i dostawców zaczynające się od „TEST”.
  - Uprawnienia widoku zostają ponowione.
- **To zmiana oferty, także na produkcji, a nie samo porządkowanie danych testowych.** Widok jest wspólny, więc skutek jest natychmiastowy w obu środowiskach. Stan US według odczytu 2026-09-17:
  - US to jedyny kraj z `local_starter_pack_live = true`;
  - US nie ma paczki fizycznej: `physical_starter_pack_available = false`.
- **Skutki po K4:**
  - tryb dla US zmienia się z `local` na `none` (`src/services/shopCountries.ts:69-74`);
  - **klient z US na `/shop`:**
    - widzi zdjęcia, nazwę i opis Zestawu Startowego;
    - wybór kraju pokazuje komunikat „Jeszcze nie w Twoim kraju” (`src/features/shop/ShopCountrySelector.tsx:38-44, :74-77`);
    - nie widzi ceny ani przycisku Lokalnego Zestawu Startowego;
  - `/shop/local-starter-pack` pokazuje ten sam komunikat (`src/pages/shop/LocalStarterPackPage.tsx:91-109`);
  - bezpośrednie wywołanie `shop-local-pack` jest odrzucane (`local_pack_not_available`, `supabase/functions/shop-local-pack/index.ts:118-131`);
  - admin pokazuje US jako NIEKOMPLETNY zamiast LIVE (`src/features/admin/AdminStarterCountriesSection.tsx:254-263`);
  - **w efekcie Lokalny Zestaw Startowy nie jest oferowany nigdzie**, dopóki jakiś kraj nie dostanie prawdziwych komponentów.
- **Historia (zachowana):**
  - **Konto klienta:** lista 8 zamówień LSP i ponowne pobranie PDF korzystają tylko z pól RPC i zapisanego snapshotu, nie z widoku (`ShopOrdersPanel.tsx:47, :101-118`; `src/services/localStarterPack.ts:66-83`).
  - **Admin:** korzysta z `20260902180000_admin_shop_orders_operational_view.sql:42-52`, również nie z widoku.
  - **Dane:** 7 wierszy testowych, flagi krajów i zamówienia nie są usuwane ani zmieniane, więc wycofanie przywraca stan 1:1.
- **Decyzja właściciela (osobna):** czy wyłączyć ofertę LSP w US na produkcji. Opcje:
  - (a) K4 teraz: oferta wyłączona do czasu prawdziwych komponentów;
  - (b) US pozostaje „live” do czasu zastąpienia testowych wierszy prawdziwymi. Ryzyko: nowy klient z US dostaje dokument z danymi testowymi.
- **Wycofanie:** przywrócić poprzednią definicję widoku z `20260902150000_shop_country_and_shipping_authority.sql:199-249`.
- **Wymagane wdrożenie:** zastosowanie migracji (osobna zgoda); kontrakt testowy w PR aplikacji. Niezależne od K1–K3.

### K5. Kod aplikacji infopaku (G2, G3 i G4 po stronie klienta, testy nowych kontraktów)
- **Zmiany:** PR do `staging` z plikami z sekcji G.
- **Wpływ:** po merge'u tylko staging; produkcja dopiero przez osobny release.
- **Wycofanie:** revert PR.
- **Wymagane wdrożenie:** merge do `staging` na wyraźne polecenie „merge” (po K1–K3), sprawdzenie na staging, akceptacja właściciela, potem osobna decyzja o produkcji.

### K6. Naprawa 401 wyboru kraju: polityki odczytu SHOP (sekcja L)
- **Zmiany:** jedna migracja, np. `supabase/migrations/<ts>_shop_public_read_without_admin_function.sql`, wyłącznie:

  ```sql
  alter policy shop_countries_public_read on public.shop_countries
    using (active = true);
  alter policy shop_country_components_public_read on public.shop_country_components
    using (active = true);
  alter policy shop_shipping_rates_public_read on public.shop_shipping_rates
    using (active = true and enabled = true);
  alter policy shop_products_public_read on public.shop_products
    using (active = true);
  create policy shop_products_finance_read on public.shop_products
    for select to authenticated
    using (public.gellatti_admin_has_permission_v1('FINANCE', auth.uid()));
  ```

  Bez `GRANT`/`REVOKE`, bez zmiany funkcji, widoku, danych i aplikacji.
- **Widoczność po zmianie:**
  - `anon`: aktywne wiersze (dziś błąd);
  - `authenticated` bez uprawnień: aktywne wiersze, bez zmian;
  - FINANCE: wszystkie wiersze, bez zmian (`*_admin_write` lub nowa `shop_products_finance_read`).
- **Wpływ na istniejące zamówienia:** brak; polityki `shop_orders` bez zmian.
- **Wpływ na produkcję:** natychmiast w obu środowiskach, bez deployu. Goście mogą wybrać kraj i widzą cenę Zestawu Startowego oraz wysyłki; zamawianie nadal wymaga logowania.
- **Weryfikacja (tylko odczyt):**
  - jako `anon` w wycofanej transakcji: `select count(*) from public.shop_country_local_readiness` → 17 zamiast błędu;
  - jako `authenticated` → 17;
  - gościnny `/shop` na staging: lista ma 17 krajów, brak 401 w konsoli.
- **Wycofanie:**

  ```sql
  drop policy shop_products_finance_read on public.shop_products;
  alter policy shop_products_public_read on public.shop_products
    using ((active = true) or public.gellatti_admin_has_permission_v1('FINANCE', auth.uid()));
  alter policy shop_countries_public_read on public.shop_countries
    using ((active = true) or public.gellatti_admin_has_permission_v1('FINANCE', auth.uid()));
  alter policy shop_country_components_public_read on public.shop_country_components
    using ((active = true) or public.gellatti_admin_has_permission_v1('FINANCE', auth.uid()));
  alter policy shop_shipping_rates_public_read on public.shop_shipping_rates
    using (((active = true) and (enabled = true)) or public.gellatti_admin_has_permission_v1('FINANCE', auth.uid()));
  ```

- **Wymagane wdrożenie:**
  - zastosowanie migracji na wspólnej bazie (osobna zgoda);
  - ten sam plik migracji w PR do `staging`, z testem kontraktu, że publiczne polityki SHOP nie wywołują funkcji administracyjnej.
  - Niezależne od K1–K5.

---

## I. Tabela statusów

Poziomy dowodu: CODE = CODE_PRESENT, MRG = MERGED, DB = DB_APPLIED, SRV = SERVED, TST = TESTED, OWN = OWNER_ACCEPTED_IMPLEMENTATION. Brak dowodu = UNKNOWN.

| Element | Obecny stan | Dowód / ścieżka / PR / SHA / data | Status | Poziomy dowodu | Następna czynność |
|---|---|---|---|---|---|
| Tabela v23 | zatwierdzona, 6 ról × 75 krajów | sha 37afaf6f… (3 kopie, 17.09); PR #319 4a5a7b4a, #324 eb9bb1e7 (12.09) | ALREADY_DONE | MRG YES (dokumenty) · DB NO (trasy v23) · OWN: tabela zatwierdzona | brak |
| Nowsza wersja tabeli | brak | dysk (v12, v23); v24+ NOT FOUND | ALREADY_DONE | n/d | brak |
| Dane PDF a tabela | zgodne | porównanie 17.09 (dowody w B) | ALREADY_DONE | TST: porównanie danych 17.09 (nie test PDF) | brak |
| 12 zapisów marki | wpis kraju w PDF | `dataset_vs_registry_v23.json` | ALREADY_DONE (bez zmian) | n/d | nie ujednolicać |
| 3 kontrole rejestru | bez wpływu na PDF | `build_guide.py@acdd8e7d` (arkusze 05 i 18 nieczytane) | ALREADY_DONE | n/d | brak zmian w SHOP |
| PDF v1: strony krajów | zgodne | sha e84ebd58…; 13/13 (12.09, historyczne) | ALREADY_DONE | CODE YES (gałąź raportów) · SRV NO · OWN UNKNOWN | zachować |
| PDF v1: front i cukier | „75”, obietnica produktu dla cukru, brak nazw lokalnych | C1–C2 | OPEN | CODE YES | G1 |
| PDF: czytelność | przegląd 12.09 | raport historyczny | NOT_VERIFIED dziś | TST historycznie | przegląd v1.1 |
| Teksty z 12.09 | nieaktualne | `SHOP_PRODUCT_COPY.md` | SUPERSEDED | n/d | D |
| Podglądy z 12.09 | dominuje „75” | sha 69a032ad… / dbc206ef… (obejrzane 17.09) | SUPERSEDED | n/d | E, G1 |
| Oferta infopaku w SHOP | brak | SELECT `shop_products`; `git grep` NOT FOUND | OPEN | CODE NO | G2 |
| Zamówienie 0 € dla dokumentu | brak | `order_type` check; checkout i LSP (C7) | OPEN | CODE NO | G3 |
| Dostęp do pliku infopaku | brak | brak storage i akcji pobrania | OPEN | CODE NO | G4 |
| LSP (historia) | 8 zamówień, snapshoty, pobranie z konta | PR #128/#132/#134 (staging i main); SELECT 17.09 | ALREADY_DONE | CODE YES · MRG YES · DB YES · SRV UNKNOWN · TST: testy źródłowe · OWN UNKNOWN | zachować |
| LSP dla nowych klientów | US live na danych testowych | SELECT 17.09 (7 wierszy „TEST PLACEHOLDER”) | OPEN (ryzyko) | DB YES · SRV NOT_VERIFIED | G5 (zgoda) |
| Idempotencja zamówień LSP | brak (deduplikacja tylko maila) | `shop-local-pack/index.ts:190-250`; `email_jobs.sql:164` | OPEN (poza infopakiem) | CODE YES | osobno |
| Mail LSP | link w kolejce; awaryjny adres staging | `shop-local-pack/index.ts:242-274` | NOT_VERIFIED (wysyłka) | CODE YES · SRV UNKNOWN | w infopaku bez awaryjnego adresu (G3) |
| Prowizja od darmowego zamówienia | nie jest naliczana | `localStarterPackContract.test.ts:150-162`; kalkulator tylko proponuje stawkę | ALREADY_DONE | CODE YES | ten sam kontrakt w G3 |
| Kraj klienta | spis A–Z i 80 zakładek w PDF | PDF s. 4–5 | PARTIAL (wystarczające) | CODE YES | opcjonalny `#page=N` |
| SHOP: infopak i zamówienie 0 € (całość) | nieukończone; zdjęcie #383 tego nie zamyka | sekcja „Stan ukończenia”; G, K | OPEN | CODE NO · DB NO · SRV NO | decyzje J1, J3–J8, J10 |
| Wybór kraju dla gości (401) | błąd sprzed #383 | sekcja L: `42501` na funkcji administracyjnej w politykach; logi 09:41 UTC; pomiar `b668349b` | OPEN | DB: przyczyna potwierdzona · FIX NO | K6 (zgoda) |
| Zdjęcie 7 produktów | scalone do `staging` (sekcje H, H2) | merge `5ee5e467` (PR #383, squash, 5 plików, patch = `3f4345ef`); deploy `dpl_EiXKEMD2…` = `5ee5e467`; CI 7/7 na `bfd33865`; przegląd `/shop` desktop i mobile: 7 właściwych kart z woreczkiem, cały obraz w ramce, Starter Pack bez zmian | PARTIAL (staging; bez `main` i produkcji; czeka na przegląd właściciela) | CODE YES · MRG YES (staging) · TST YES (CI) · SRV YES (staging, 7 kart) · `onError` NOT_VERIFIED · OWN NO · OWNER_ACCEPTED_RUNTIME NO | przegląd właściciela na staging; `main` tylko osobną decyzją |
| Kontrakty właściciela / SOL | brak pozycji SHOP; sprzeczność SOL-052/053 | `OWNER_LOCKED_CONTRACTS.md`; `GELLATTI_SOL_LEDGER.md:21` | ALREADY_DONE | n/d | bez nowej numeracji |
| Wspólna baza | potwierdzona | PR #336; `registry.json`; 1 projekt | ALREADY_DONE | n/d | każdy zapis traktować jak produkcyjny |
| Produkty v23 w aplikacji | niegotowe | PR #328 i #336 OPEN | OPEN (poza SHOP) | DB NO | tekst nie obiecuje gotowości |

---

## J. Decyzje konieczne do dalszego wdrożenia

Ustalone i niepytane ponownie: nazwa PL/EN, cena 0 €, źródło v23, zdjęcie woreczka, produkt w SHOP (nie publiczny link), „75 krajów” na drugim planie, istniejące logowanie, nazwy lokalne cukru (D-8/D-32), przypięcie wersji dokumentu.

1. **Start prac bez wspólnej bazy:**
   - G1: PDF v1.1 i grafiki w gałęzi raportów;
   - K5: PR aplikacji jako draft, bez merge'a;
   - bez zapisu do bazy, storage i Edge.
2. **K6: naprawa 401** (migracja polityk, dokładny SQL w K6). Obejmuje świadomą akceptację, że goście czytają aktywne wiersze 4 tabel SHOP. Niezależna od infopaku.
3. **K1: migracja zamówień dokumentów** na wspólnej bazie (zakres w K1).
4. **K2: bucket i wgranie PDF v1.1**, po Twojej akceptacji renderów v1.1 (G7).
5. **K3: deploy `shop-digital-document`** z dostępnością `off`.
6. **Merge K5 do `staging`** na polecenie „merge”, po K1–K3.
7. **Dostępność `allowlist`:** podaj konta testowe do weryfikacji na staging (G6 pkt 6).
8. **Dostępność `on`:** infopak dla klientów; ze względu na wspólną bazę jednocześnie w obu środowiskach.
9. **K4: czy wyłączyć ofertę Lokalnego Zestawu Startowego w US**, także na produkcji. Historia 8 zamówień zostaje. Niezależna od infopaku.
10. **Produkcja (`main`):** osobny release infopaku; PR #383 (zdjęcie) też jest dziś tylko na staging.

Akceptacje wizualne właściciela (nie decyzje techniczne) pozostają otwarte:
- zdjęcie woreczka na staging;
- rendery PDF v1.1;
- teksty PL/EN i miejsce bloku w SHOP;
- przepływ zamówienia na staging.

---
APPLICATION CODE CHANGED: YES — wyłącznie PR #383 (zdjęcie 7 produktów), scalony do staging jako 5ee5e467 · PDF / TABELA / REJESTR CHANGED: NO ·
DATABASE / STORAGE / EDGE CHANGED: NO (tylko SELECT) · STAGING CHANGED: YES (automatyczny deploy PR #383) · MAIN / PRODUCTION CHANGED: NO ·
MIGRACJE / MAILE / ZAMÓWIENIA: NO · MERGE: YES (tylko PR #383 → staging) · RĘCZNY DEPLOY: NO · K1–K6 APPLIED: NO · SHOP (INFOPAK + 0 €) COMPLETE: NO ·
OWNER ACCEPTED: NO · OWNER_ACCEPTED_RUNTIME: NO
