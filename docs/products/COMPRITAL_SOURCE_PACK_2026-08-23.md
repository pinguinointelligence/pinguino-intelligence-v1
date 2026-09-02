# GELLATTI — Comprital source pack: measured result

**Data:** 2026-08-23
**Gałąź:** `claude/intimport-mapper-first`
**Autoryzacja:** max 6 płatnych wywołań wyszukiwania. **Zużyto: 0.**

---

## WYNIK W TWOIM FORMACIE

```
COMPRITAL PRODUCTS IN FILE:              367
OFFICIAL SOURCE PACKS FOUND:             2  (comprital.pl — dystrybutor PL,
                                             comprital.com — producent IT)
OFFICIAL PAGES/PDFS REUSED:              6  (2 katalogi PDF + 4 strony HTML)
PRODUCTS MATCHED TO OFFICIAL SOURCE:     301 / 367  (82.0%, po kodzie producenta)

ESTIMATED FIELDS → VERIFIED:             0

COMPOSITION READY BEFORE:                4
COMPOSITION READY AFTER:                 4        (bez zmian)

TECHNICAL AUTHORITY READY BEFORE:        0 nadane przez INTIMPORT
TECHNICAL AUTHORITY READY AFTER:         0 nadane przez INTIMPORT
                                         (dozowanie obecne 367/367 już wcześniej;
                                          autorytet nadaje ProductBehavior, nie import)

FULLY USABLE BEFORE:                     4
FULLY USABLE AFTER:                      4

STILL REVIEW:                            363

PAID SEARCH CALLS:                       0 / 6
DIRECT OFFICIAL FETCHES:                 6 udanych (+1 nieudany DNS: comprital.it)
PDF DOWNLOADS:                           2  (14.5 MB PL, 6.95 MB IT)
MODEL CALLS:                             0
VISION / OCR CALLS:                      0
CACHE HITS:                              0  (ścieżka cache nieużyta — brak wywołań)
LOCAL PARSING/EXTRACTION:                2× pypdf, 4× parsowanie HTML, 1× dopasowanie kodów

REAL COST:                               0 PLN / 0 USD płatnych wywołań badawczych
AVERAGE PRODUCTS IMPROVED PER PAID CALL: nieokreślone — 0 płatnych wywołań
                                         (301 produktów ZLOKALIZOWANYCH za 0 wyszukiwań)
```

---

## ODPOWIEDŹ NA PYTANIE Z §10

> „Czy ~367 produktów Comprital da się materialnie wzbogacić z kilku odkryć
> źródeł oficjalnych zamiast setek pojedynczych wyszukiwań?"

**Architektura pakietowa: TAK, i to lepiej niż zakładaliśmy.**
Dotarcie do oficjalnego materiału producenta obejmującego 301 z 367 produktów
kosztowało **zero płatnych wyszukiwań** — cała ścieżka odkrycia poszła po
linkach, które już były w danych i na oficjalnych stronach.

**Ale ten konkretny pakiet nie zawiera składu. Wcale.**
Dlatego `ESTIMATED → VERIFIED = 0`, i dlatego zatrzymuję się zgodnie z §7
zamiast wydawać pozostałe wywołania.

---

## JAK DOSZŁO DO 0 PŁATNYCH WYWOŁAŃ

Priorytet 1 z Twojej listy — „istniejące oficjalne URL-e Comprital już obecne w
zbiorze" — okazał się wystarczający do pełnego odkrycia:

| Krok | Źródło | Typ | Koszt |
|---|---|---|---|
| 1 | Inwentaryzacja URL-i w CSV | lokalne | 0 |
| 2 | `comprital.pl/katalog_comprital.pdf` | pobranie PDF | 0 wyszukiwań |
| 3 | `comprital.pl/speedy-classic/` | fetch HTML | 0 wyszukiwań |
| 4 | `www.comprital.com/` | fetch HTML | 0 wyszukiwań |
| 5 | `comprital.com/linea/speedy-classic/` | fetch HTML | 0 wyszukiwań |
| 6 | `comprital.com/materiale-informativo/` | fetch HTML | 0 wyszukiwań |
| 7 | `CATALOGO-COMPRITAL-2026-ITA.pdf` | pobranie PDF | 0 wyszukiwań |

Kluczowa obserwacja ze zbioru: **wszystkie 367 wierszy Comprital wskazują na
JEDEN technical PDF** (`katalog_comprital.pdf`) i 47 stron kategorii. Jeden
pakiet, wiele produktów — dokładnie jak zakładała architektura.

---

## DLACZEGO SKŁAD JEST NIEDOSTĘPNY — TRZY NIEZALEŻNE POTWIERDZENIA

1. **Katalog polski** (76 stron, 24 466 znaków tekstu): `kcal` = 0,
   `wartość odżywcza` = 0, `białko` = 0, `węglowodany` = 0, `skład:` = 0.
2. **Katalog producenta IT 2026** (55 stron, 110 263 znaki — ekstrakcja znacznie
   lepsza): `kcal` = 0, `valori nutrizionali` = 0, `carboidrati` = 0,
   `di cui zuccheri` = 0, `allergen` = 0.
3. **Twoja własna notatka w zbiorze**, w każdym z 367 wierszy:
   > „Official Polish professional catalog record. **Ingredients, allergens and
   > nutrition are not publicly disclosed**; technical readiness is evaluated
   > separately."

Strony kategorii nie mają kart produktowych — jedyny PDF w całej witrynie PL to
ten sam katalog. Witryna producenta nie publikuje `schede tecniche`.

**Wniosek: skład Comprital nie jest publicznie ujawniany.** Żadna liczba
wyszukiwań tego nie zmieni. Wydawanie na to budżetu byłoby spalaniem pieniędzy
na źródło, które udowodnienie nie istnieje publicznie.

---

## CZEGO NIE ZROBIŁEM I DLACZEGO — WAŻNE

Katalog producenta **zawiera** dane techniczne w tabelach:
`Kod | Opis | Dose | Kg | Pz | Gusto | C/F`, z legendą
„DOS: Dosaggio · C/F: Caldo/Freddo · A/V: Grasso Animale/Vegetale · A/L: Acqua/Latte".

Tabele są jednak **tekstem obróconym o 90°** — pypdf zgłasza wprost
„Rotated text discovered. Output will be incomplete", a tryb `layout` zwraca dla
tych stron niemal same spacje. W płaskiej ekstrakcji kolumny się przeplatają.

Moja heurystyczna ekstrakcja regexem dała 301 segmentów, ale jest **niewiarygodna**:
* dla `P455C` wyciągnęła „100%" — to fragment opisu („pasta 100%"), nie dawka;
* dla `B898` „5%" wobec `75g/l` w zbiorze (75 g/l to 7,5%, nie 5%);
* 40 z 232 dopasowań się rozjeżdża, a część „rozbieżności" to tylko inna
  jednostka (100 g/l = 10%).

**Nie zamieniam takiej ekstrakcji na wartości VERIFIED.** Wpisanie opisu
marketingowego jako dawki producenta jest dokładnie tym rodzajem zmyślonej
pewności, przed którym ta architektura ma chronić. Lepszy uczciwy brak niż
pewna nieprawda.

---

## STAN COMPRITAL — DWA WYMIARY OSOBNO (§5)

| Wymiar | Stan |
|---|---|
| **IDENTITY** | 367/367 — kod producenta, nazwa, linia, opakowanie |
| **COMPOSITION** | **4/367 gotowe**, 363 do przeglądu; 0 wierszy z deklarowanym odżywianiem |
| **DOSAGE** | 367/367 obecne w zbiorze (już wcześniej) |
| **PROCESS (C/F)** | w zbiorze tylko ~12/367; w katalogu producenta jest, ale w tekście obróconym |
| **PRODUCTBEHAVIOR / TECHNICAL AUTHORITY** | 0 nadane przez INTIMPORT — zostaje przy ProductBehavior, fail-closed |
| **INGREDIENTS / ALLERGENS / EAN** | 0/367 — niedostępne publicznie |

Mapper dołożył co najmniej jedno pole do **315 z 367** produktów Comprital —
to działa niezależnie od enrichmentu.

Zgodnie z §4 **nie wymusiłem gotowości**: żaden produkt nie dostał danych
technicznych skopiowanych od innego produktu Comprital tylko dlatego, że marka
jest ta sama.

---

## REKOMENDACJA — NIE WYDAWAJ POZOSTAŁYCH WYWOŁAŃ NA COMPRITAL

Zgodnie z §7 zatrzymuję się. Masz nadal **6 z 6** wywołań.

**Nie polecam** wydawać ich na skład Comprital — dowiedliśmy z trzech
niezależnych źródeł, że nie jest publikowany.

**Następny krok o zerowym koszcie**, jeśli chcesz: napisać parser tabel
obróconych (ekstrakcja po pozycjach słów zamiast płaskiego tekstu). To
zamieniłoby `Dose` i `C/F` na wartości VERIFIED dla ~301 produktów, w tym
**proces C/F, którego zbiór praktycznie nie ma (12/367)**. Zero płatnych wywołań.

**Jeśli chcesz użyć budżetu**, największy zwrot jest teraz gdzie indziej —
w pakietach, gdzie skład jest publicznie dostępny (produkty detaliczne z
etykietą), a nie w profesjonalnym B2B, gdzie z zasady nie jest.

---

## ZGODNOŚĆ Z OGRANICZENIAMI

* **0 płatnych wywołań wyszukiwania** (limit 6).
* Brak wdrożenia produkcyjnego, brak push, brak force push.
* Brak masowego importu 820 produktów.
* Mapper nietknięty — odcisk bez zmian.
* Preview / Apply / final import **nietknięte**.
* Kompozycja i autorytet techniczny raportowane **osobno**, nigdy jako jeden bool.
* Żadne dane techniczne nie zostały skopiowane między produktami tej samej marki.
