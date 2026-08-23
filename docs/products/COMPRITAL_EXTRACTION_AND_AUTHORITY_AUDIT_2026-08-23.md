# GELLATTI — Ekstrakcja tabel Comprital + audyt autorytetu ProductBehavior

**Data:** 2026-08-23 · **Gałąź:** `claude/intimport-mapper-first`
**Płatne wywołania wyszukiwania: 0 / 6.**

---

## E. WYNIK KOŃCOWY

```
COMPRITAL ROTATED-TABLE EXTRACTION:   BLOCKED

PROCESS VERIFIED BEFORE:              0
PROCESS VERIFIED AFTER:               0   (nic nie promowano — patrz §A)

DOSAGE EXACT / EQUIVALENT / CONFLICT: 16 / 0 / 35     (+62 UNREADABLE)

PRODUCTBEHAVIOR AUTHORITY ROOT CAUSE: most (bridge), nie brak danych —
                                      z jedną realną luką danych: podstawa dawki

PRODUCTS THAT COULD BECOME
TECHNICALLY AUTHORIZED FROM EXISTING
+ OFFICIAL COMPRITAL EVIDENCE:        0 dzisiaj
                                      367 po zbudowaniu mostu + ustaleniu podstawy

PAID SEARCH CALLS USED:               0 / 6
```

---

## KOREKTA, KTÓRĄ MUSZĘ ZGŁOSIĆ NAJPIERW

W poprzednim raporcie napisałem, że tabele katalogu są **obrócone o 90°**.
**To było błędne.** Sprawdziłem geometrię każdego fragmentu tekstu: na 5 354
fragmentów w dokumencie **dokładnie 5 jest obróconych, wszystkie na stronie 38,
żaden nie zawiera kodu produktu**. Ostrzeżenie pypdf dotyczyło elementu
dekoracyjnego, nie tabel. Tabele są pionowe.

Zbudowałem więc parser pozycyjny — i to on ujawnił prawdziwy problem.

---

## A. EKSTRAKCJA — BLOCKED, i dlaczego

### Co naprawdę jest nie tak z tym PDF-em

Katalog **nie zachowuje struktury wierszy**. Dla jednego produktu:

* kod stoi w kolumnie x≈42,
* nazwa i opis w x≈90,
* komórki liczbowe w x≈266,

i **każde z nich leży na innej linii bazowej**, w zmiennej kolejności.

Dwa dowody ze strony 8:

```
y=604.3  x= 90  'UNICA 100'              ← nazwa produktu
y=591.8  x=266  '100g/L' '2,5 4' 'Panna C/F A/V'   ← jego dane
y=586.3  x= 42  'B026D'                  ← jego kod, PONIŻEJ danych
```

```
y=640.7  x= 42  'B312'
y=618.5  x=266  '2,5 4' 'Panna C A/V'    ← wiersz danych BEZ dawki
y=614.0  x= 90  'Base tradizionale ... 100g/L'  ← dawka wewnątrz zdania opisu
```

Nagłówek strony podaje kolumny, ale ich x **zmienia się między stronami**
(Dose na x=88, 90, 192, 268 zależnie od strony) i nie pokrywa się z wierszami danych.

### Co zbudowałem

`scripts/comprital_catalogue_extract.py` — parser pozycyjny, który wiąże komórkę
z produktem przez **najbliższy kod w tym samym bloku tabeli**, i tylko wtedy, gdy
drugi kandydat jest co najmniej 1.8× dalej (`AMBIGUITY_MARGIN`). Poniżej tego
marginesu PDF po prostu nie mówi, do którego produktu należą liczby — i parser
też nie mówi.

Wynik: 127 kodów z jakimkolwiek związanym faktem, 68 z dawką, 95 z procesem,
42 kody dotknięte komórką niejednoznaczną.

### Dlaczego mimo to nic nie promuję do VERIFIED

Mam **wzorzec odniesienia**: Twój zbiór ma `Professional Dosage` dla 367/367
produktów. Porównanie mojej ekstrakcji z Twoimi danymi (§A2):

| Klasa | Liczba |
|---|---|
| **MATCH** | **16** |
| **EQUIVALENT_UNIT** | **0** |
| **REAL_CONFLICT** | **35** |
| UNREADABLE (brak dawki w katalogu) | 56 |
| UNREADABLE (Twoja wartość nieliczbowa, np. „według uznania") | 6 |

Przykłady konfliktów:

| Kod | Twoje dane | Moja ekstrakcja |
|---|---|---|
| `B212` | 250 g/l | 50 g/L |
| `B150` | 300 g/l | 25% |
| `PC646P` | 100 g/l | 50 g/L |
| `B898` | 75 g/l | 50 g/L |

**Parser myli się częściej, niż trafia (35 konfliktów wobec 16 zgodności).**
Wiązanie „najbliższy kod" przypisuje dawkę sąsiedniemu produktowi.

Zgodnie z Twoją regułą A1 — „jeśli parser nie potrafi udowodnić relacji, zostaw
nierozstrzygnięte, bez zgadywania" — **nie promuję ani jednej wartości**.

**Procesu (C/F) też nie promuję**, mimo że wyekstrahowałem go dla 95 kodów.
Nie mam dla niego wzorca odniesienia, a pochodzi z **tej samej geometrii**, która
przy dawce myli się w 69% przypadków. Promowanie go byłoby przyjęciem, że ta sama
metoda jest wiarygodna tam, gdzie nie da się jej sprawdzić.

**PROCESS VERIFIED: 0 → 0. Zero konfliktów wprowadzonych do Twoich danych.**

### Co by to odblokowało

Potrzebny jest parser rekonstruujący wiersze z **ramek/linii tabeli albo z
kolejności strumienia rysowania**, nie z bliskości pionowej. To jest wykonalne,
ale to osobna robota — i wciąż zero płatnych wywołań.

---

## B. AUDYT AUTORYTETU PRODUCTBEHAVIOR

### 1. Jakie pola INTIMPORT mają te 367 produktów?

| Pole | Pokrycie |
|---|---|
| `Professional Dosage` | 367/367 (np. „100g/l", „450g/l", „według uznania") |
| `Technical Parameters` | 367/367 (tekst: „Kod producenta: B214A \| Linia: … \| Opis: … \| Smak: … \| Opakowanie zbiorcze: …") |
| `Technical PDF URL` | 367/367 (ten sam katalog) |
| `Net Quantity Value` | 367/367 |
| `Ingredients / Allergens / EAN / Nutrition` | 0/367 |

### 2. Które z nich są surowymi polami informacyjnymi?

**Wszystkie.** `Professional Dosage` i `Technical Parameters` to **wolny tekst**
na wierszu importu. Nie mają struktury, jednostki deklarowanej maszynowo,
podstawy odniesienia ani wersji źródła. Są dowodem, nie autorytetem.

### 3. Czego wymaga ProductBehavior?

Z `contracts.ts`:

```ts
SharedProductRecommendedDose {
  minPercent: number | null;      // PROCENT, nie g/l
  preferredPercent?: number | null;
  maxPercent: number | null;
  sourceVersion: string;          // wymagany, niepusty
  provenance?: string;
  policyId?: string; policyVersion?: number;
}
```

Walidacja w `productDosageAuthority.ts` odrzuca dowód z `missing_source_version`,
`invalid_minimum`, `invalid_maximum`, gdy procenty są spoza 0–100 lub min > max.

### 4. Dlaczego istniejąca `Professional Dosage` nie nadaje autorytetu?

Bo `recommendedDose` ma w tej chwili **dokładnie jedno źródło** — wiersz Mappera.
Z migracji `20260815152000_product_status_information_only.sql`:

```sql
case when m.recommended_dosage_percent_min is not null
      or m.recommended_dosage_percent_max is not null then jsonb_build_object(
  'minPercent', m.recommended_dosage_percent_min,
  'maxPercent', m.recommended_dosage_percent_max,
  'sourceVersion', m.dataset_version||':'||m.ingredient_id
) else null end
from public.mapper_basement m where m.ingredient_id = v_mapping ...
```

Dawka pochodzi **wyłącznie** z `mapper_basement`, przez powiązanie
`b.mapper_ingredient_id`. A schemat z `20260813110000_global_product_catalog.sql`
czyni te dwa byty **wzajemnie wykluczającymi**:

```sql
check ((entity_kind = 'pi_base'          and mapper_ingredient_id is not null and catalog_product_id is null)
    or (entity_kind = 'commercial_product' and catalog_product_id is not null and mapper_ingredient_id is null))
```

Zaimportowany produkt Comprital jest `commercial_product`, więc **z definicji nie
może mieć `mapper_ingredient_id`** — a więc gałąź budująca `recommendedDose`
nigdy dla niego nie zadziała. To nie jest błąd; to brakujący most.

### 5. Co dokładnie jest problemem?

| Kandydat | Werdykt |
|---|---|
| **Brak mostu ProductBehavior** | **TAK — główna przyczyna.** Brak ścieżki dawki innej niż Mapper |
| **Jednostki / podstawa dawki** | **TAK — realna luka danych.** `450 g/L` ≠ procent bez znanej podstawy |
| **Proweniencja** | **TAK.** `sourceVersion` ma dziś tylko słownik `dataset_version:ingredient_id`; brak tokenu „oficjalny katalog producenta 2026" |
| Proces (C/F) | Osobna oś (`ProductionThermalMode`), nie blokuje dawki |
| Zatwierdzenie serwerowe | NIE |
| Brak składu | NIE — dawka nie zależy od składu |
| Produkty nie istnieją serwerowo | TAK, ale wtórnie — Preview/Apply celowo nietknięte |

### 6. Przykład roboczy — `PL-COM-B214A` (BASE GIUBILEO CIOCCOLATO)

Stan dzisiaj:

* kod producenta `B214A` — dopasowany do katalogu ✓
* `Professional Dosage` = `100/250g/l` ✓ (Twoje dane)
* `Technical Parameters` = pełny opis linii i smaku ✓
* katalog oficjalny jako `Technical PDF URL` ✓
* skład / alergeny / EAN — brak (niepublikowane)

Czego brakuje, zanim ProductBehavior może być VERIFIED:

1. **Podstawa dawki (realna luka danych).** `100/250 g/l` znaczy 100–250 g na litr
   — ale litr **czego**? Miksu gotowego, bazy płynnej, mleka? `minPercent`/
   `maxPercent` wymagają procentu masowego. Bez zadeklarowanej podstawy
   przeliczenie jest zgadywaniem. To jedyna pozycja, której **nie da się załatwić
   kodem** — trzeba potwierdzenia producenta albo Twojej decyzji o konwencji.
2. **Ścieżka dawki spoza Mappera (most).** Rozszerzyć `recommendedDose` o źródło
   `official_manufacturer_document` z własnym `sourceVersion`
   (np. `comprital-catalogo-2026-ita:B214A`), bez naruszania fail-closed.
3. **Słownik proweniencji (most).** `provenance` musi umieć powiedzieć
   „oficjalny katalog producenta", a nie tylko „Mapper".
4. **Istnienie serwerowe (kolejność).** Produkt musi mieć `catalog_product_version`
   — czyli import, którego celowo jeszcze nie dotykamy.

**Odpowiedź na Twoje pytanie:** brakuje nam **mostu**, nie danych — z jednym
wyjątkiem, i to ważnym: **podstawa dawki to realna luka danych.** Wszystko inne
już mamy.

Nie osłabiłem żadnej reguły fail-closed.

---

## C. TOP 5 NASTĘPNYCH PAKIETÓW KONSUMENCKICH

Bez Comprital. Pełne dane: `docs/products/consumer_pack_ranking.json`.

| # | Pakiet | Produkty | Ready | Est. | Nieroz. | Deklar. odżywianie | GTIN | Oficjalne źródło | Wywołania | **Zysk/wywołanie** |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **goBIO** | 26 | 0 | 0 | **26** | 1 | 2 | 1 wiersz spoza detalu | 1 | **26** |
| 2 | Jeronimo Martins Polska | 14 | 0 | 0 | 14 | 8 | 0 | 10 wierszy | 1 | **14** |
| 3 | McCormick Polska (Kamis) | 28 | 0 | 0 | **28** | 6 | 1 | 0 | 2 | **14** |
| 4 | Fruvita | 24 | 0 | 0 | 24 | 15 | 9 | 0 | 2 | **12** |
| 5 | BakaD'Or | 18 | 0 | 0 | 18 | 13 | 4 | 0 | 2 | **9** |

Dalej: Lipton 15 (7.5/wyw.), GO Active 11 (5.5), Baitz 10 (5), Kinder/Lindt 8 (4).

### Obserwacja, która zmienia obraz

**goBIO, Fruvita, BakaD'Or i GO Active to marki własne Biedronki.** Zapisany
`biedronka.pl` **nie jest dla nich stroną obcego detalisty — jest stroną
właściciela marki**, czyli źródłem quasi-oficjalnym. Mój klasyfikator autorytetu
traktuje dziś `biedronka.pl` zawsze jako `AUTHORITATIVE_RETAILER`, co dla marki
własnej **zaniża** ocenę.

Jeśli ta hipoteza się potwierdzi, **goBIO da się wzbogacić za 0 płatnych wywołań**
— dokładnie jak Comprital, bo URL-e już są w danych i wystarczy bezpośredni fetch.

### REKOMENDACJA — JEDEN PAKIET

**goBIO (26 produktów, 26 nierozstrzygniętych).**

Uzasadnienie:
1. Największa liczba nierozstrzygniętych produktów na wywołanie w całym pliku.
2. Prawdopodobnie **0 płatnych wywołań** — jak wyżej.
3. Produkty detaliczne: skład i wartości odżywcze **są** publikowane, w
   przeciwieństwie do profesjonalnego B2B.
4. Przy okazji zweryfikuje realną poprawkę do klasyfikatora autorytetu
   (marka własna ≠ obcy detalista).

**Nie wydałem nic i czekam na Twoją decyzję.** Nadal **0 / 6**.

---

## D. OGRANICZENIA — ZACHOWANE

* **0 płatnych wywołań wyszukiwania** (limit 6).
* Preview / Apply / final import **nietknięte**.
* Brak masowego importu, brak produkcji, brak push, brak force push.
* Mapper nietknięty.
* Żadna reguła fail-closed ProductBehavior nie została osłabiona.
* Żadna wartość nie została promowana do VERIFIED bez dowiedzionego wiązania.
* Kompozycja i autorytet techniczny raportowane osobno.
