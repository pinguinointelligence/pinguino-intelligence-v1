# GELLATTI — goBIO: przebieg zerokosztowy

**Data:** 2026-08-23 · **Gałąź:** `claude/intimport-mapper-first`
**Płatne wywołania wyszukiwania: 0 / 6.** Nie użyłem też autoryzowanego 1 wywołania z §11.

---

## 10. WYNIK ZEROKOSZTOWY

```
goBIO PRODUCTS IN FILE:                    44
DIRECT OFFICIAL / BRAND-OWNER PAGES FOUND: 4  (1 strona marki + 3 karty produktu w sklepie)
EXACT PRODUCT MATCHES:                     1
GTIN MATCHES:                              1  (przez Open Food Facts, nie przez właściciela marki)
NAME/VARIANT EXACT MATCHES:                1
PRODUCTS WITH OFFICIAL NUTRITION FOUND:    0  od właściciela marki
                                           1  z bazy GTIN (Open Food Facts)
FIELDS ESTIMATED → VERIFIED:               0

READY BEFORE:                              0
READY AFTER:                               0
STILL REVIEW:                              44

PRIVATE-LABEL AUTHORITY VERIFIED:          YES

PAID SEARCH CALLS:                         0 / 6
DIRECT FETCHES:                            12  (w tym 4 nieudane/404/410)
MODEL CALLS:                               0
VISION / OCR CALLS:                        0
CACHE HITS:                                0
REAL COST:                                 0
```

**Odpowiedź na §15:** dla goBIO — **NIE**. Zerokosztowy pakiet pierwszej strony
nie podniósł ani jednego pola. Ale przebieg znalazł coś znacznie cenniejszego —
patrz §Rekomendacja.

---

## 4. WŁASNOŚĆ MARKI WŁASNEJ — POTWIERDZONA, z Twoich danych

Nie potrzebowałem zewnętrznego źródła. Dowód jest w pliku:

| Dowód | Wartość |
|---|---|
| `Product Type` | **44/44 = `private_label`** |
| `Manufacturer` | **14 wierszy: „Jeronimo Martins Polska S.A. – Kostrzyn" / „Jeronimo Martins Dystrybucja S.A."** |
| Strona marki | `biedronka.pl/pl/gobio` istnieje w domenie Biedronki obok innych marek własnych |

Jeronimo Martins jest właścicielem Biedronki. To wystarcza, by uznać goBIO za
markę własną JM — **bez wnioskowania z samego faktu, że produkt jest sprzedawany
w Biedronce**.

Dwie uwagi na uczciwość:
* 2 wiersze mają producenta kontraktowego (`Me gusto Sp. z o.o.`, `NÖM AG – Austria`).
  To normalne dla marki własnej i **nie osłabia** własności marki.
* 2 wiersze mówią wprost „goBIO (source does not expose the legal producer)".

Strona marki ujawniła też rodzeństwo marek własnych: `bakador`, `go-active`,
`baitz`, `bonitki`, `fruvita`, `mleczna-dolina`, `delikate`, `linda`, `meltie` —
co potwierdza moją wcześniejszą hipotezę o pozostałych pakietach z rankingu.

---

## 3. POPRAWKA KLASYFIKATORA AUTORYTETU — WDROŻONA

Nowa klasa `OFFICIAL_PRIVATE_LABEL`, ranga równa `OFFICIAL_BRAND`, poziom dowodu
`manufacturer`.

**Kluczowe: awans jest kluczowany na UDOWODNIONEJ własności, nie na domenie.**
Wywołujący podaje `privateLabelOwnerDomain`; bez tego nic się nie zmienia.

```
goBIO   @ zakupy.biedronka.pl + ownerDomain=biedronka.pl → OFFICIAL_PRIVATE_LABEL
Milka   @ zakupy.biedronka.pl (bez ownerDomain)          → AUTHORITATIVE_RETAILER
goBIO   @ zakupy.biedronka.pl + ownerDomain=lidl.pl      → AUTHORITATIVE_RETAILER
```

Cztery testy pilnują dokładnie tego rozróżnienia — w tym przypadek Milki, który
jest istotą Twojego §3.

---

## 2. CO ZNALAZŁ PRZEBIEG ZEROKOSZTOWY

| Krok | Źródło | Wynik |
|---|---|---|
| 1 | 44 wiersze goBIO w CSV | 29 → strona marki, 15 → `tabele-kalorii.pl`, 1 → Open Food Facts |
| 2 | `biedronka.pl/pl/gobio` | strona marketingowa, **0 wartości odżywczych**, brak kart produktów |
| 3 | `zakupy.biedronka.pl/szukaj` | **HTTP 410**; robots zabrania ścieżek wyszukiwania — uszanowane |
| 4 | `robots.txt` | brak deklaracji sitemap |
| 5 | `sitemap_index.xml` → `sitemap_0.xml` | 2 489 URL-i, **2 063 kart produktów** |
| 6 | filtr goBIO w sitemapie | **3 produkty goBIO online** |
| 7 | dopasowanie do 44 wierszy | **1 realne dopasowanie** |
| 8 | karta `Zaprawa owocowa` | skład **tak**, wartości odżywcze **nie** |
| 9 | Open Food Facts (GTIN z pliku) | pełna tabela, ale wszystkie makro = 0 |

### Dlaczego tylko 1 dopasowanie

Sklep internetowy Biedronki ma ograniczony asortyment — 3 z 44 produktów goBIO.
Z tych trzech:

* `Zaprawa owocowa z sokiem cytrynowym 200 ml` → **dopasowane** do `PL-BIE-00118`
* `Jaja 9 szt.` → brak odpowiednika w imporcie
* `Mleko 3,9% 1 l` → w pliku jest **`Mleko goBIO 2%`**. **To inny produkt.**
  Nie dopasowałem — inna zawartość tłuszczu to inna kompozycja, a §5 zabrania
  kopiowania danych między produktami.

### Dlaczego 0 pól awansowało do VERIFIED

**Karta jedynego dopasowanego produktu nie zawiera tabeli odżywczej** — ma tylko
skład: „Woda 74%, sok z cytryny BIO 20%, kwas cytrynowy 6%".

**Nie zmapowałem „Woda 74%" na `water_percent`.** To deklaracja QUID — proporcja
receptury, nie zawartość wody w produkcie. Sok z cytryny to w ~90% woda, więc
rzeczywista zawartość wody wynosi ok. 92%, nie 74%. Wpisanie 74 jako
zweryfikowanej wody byłoby błędem zaniżonym o 18 punktów — dokładnie ten rodzaj
cichej fabrykacji, którego architektura ma zakazywać.

Zapis składu to realny dowód i pozostaje jako taki; po prostu nie jest liczbą
kompozycyjną.

### Open Food Facts — dlaczego też nie awansowałem

`5903240220625` (Herbata z naparu biała z jaśminem) ma w OFF komplet pól, ale
**wszystkie makroskładniki równe dokładnie 0**. Dla naparu herbacianego zero jest
fizycznie prawdopodobne — ale komplet dokładnych zer to również typowy artefakt
pustego wpisu użytkownika. OFF jest bazą współtworzoną, klasy
`STRUCTURED_PRODUCT_DATABASE`, nie właściciela marki.

Przy jednym produkcie i takim wzorcu **nie promuję**. Zgłaszam jako dostępne do
Twojej decyzji.

---

## 6/7/8. ZASADY UTRZYMANE

* **Reguła 100 ml zachowana.** 7 z 44 wierszy goBIO ma odżywianie per 100 ml.
  Nic nie zostało przeliczone na 100 g — brak defensywnej gęstości.
* **12 wierszy** ma deklarację per 100 g i pozostaje jak było.
* Mapper dołożył co najmniej jedno pole do **28 z 44** produktów goBIO —
  niezależnie od enrichmentu.
* Żadna karta nie została użyta dla innego produktu niż ten, którego dotyczy.

---

## ZNALEZISKO WAŻNIEJSZE NIŻ goBIO

Sondując format kart sklepu, sprawdziłem istniejący URL z Twojego pliku
(`Alpro napój owsiany`) i karta zawiera **pełną, ustrukturyzowaną tabelę
odżywczą z jawnie zadeklarowaną podstawą**:

```html
<th>W 100 ml</th>
Wartość energetyczna kcal   44 kcal
Zawartość tłuszczów         1.5 g
Kwasy tłuszczowe nasycone   0.2 g
Zawartość węglowodanów      6.4 g
Cukry                       0 g
```

plus skład, alergeny i EAN.

**W Twoim pliku jest już 280 różnych URL-i kart produktowych `zakupy.biedronka.pl`.**

To znaczy: do **280 produktów** można potencjalnie wzbogacić **za 0 płatnych
wywołań wyszukiwania** — same bezpośrednie pobrania adresów, które już masz.
Podstawa (100 g / 100 ml) jest w nagłówku tabeli, więc reguła z §7 jest wykonalna
maszynowo, bez zgadywania.

To jest ~34× większy zasięg niż goBIO i nie kosztuje ani grosza z budżetu.

---

## REKOMENDACJA

**Nie wydawaj tego 1 wywołania na goBIO.** Dowody mówią, że właściciel marki nie
publikuje wartości odżywczych goBIO online: strona marki ich nie ma, sklep ma 3
z 44 produktów, a jedyny dopasowany nie ma tabeli. Wyszukiwanie najpewniej zwróci
`tabele-kalorii.pl` — który już masz w pliku i który nie jest źródłem oficjalnym.

**Zamiast tego proponuję pakiet „280 kart `zakupy.biedronka.pl`":**
bezpośrednie pobrania adresów już obecnych w danych, 0 płatnych wywołań,
autorytet nadawany per produkt — `OFFICIAL_PRIVATE_LABEL` dla marek własnych JM,
`AUTHORITATIVE_RETAILER` dla Milki, Kindera czy Alpro.

Czekam na Twoją decyzję. **Nadal 0 / 6.**

---

## 14. OGRANICZENIA — ZACHOWANE

* Preview / Apply / final import **nietknięte**.
* Brak masowego importu, produkcji, push, mutacji Mappera.
* ProductBehavior nietknięty i nadal fail-closed; most świadomie niezbudowany.
* Comprital zamknięty — bez dalszych wywołań i bez obejścia ograniczenia
  `commercial_product` / `pi_base`.
* Żadne pole nie zostało promowane bez dowiedzionego wiązania.
