# GELLATTI — Pakiet 280 kart produktowych Biedronki

**Data:** 2026-08-23 · **Gałąź:** `claude/intimport-mapper-first`
**Płatne wywołania wyszukiwania: 0 / 6.** Bez wyszukiwania, bez crawlowania sklepu.

---

## 15. WYNIK BEFORE vs AFTER — CAŁY IMPORT 820

```
TOTAL PRODUCTS:                    820

BIEDRONKA URLS IN DATASET:         280
UNIQUE URLS:                       280
SUCCESSFULLY FETCHED:              276   (4 × HTTP niedostępne)

EXACT PRODUCT MATCHES:             253
EXACT EAN MATCHES:                 0     (karty nie publikują GTIN)
IDENTITY MISMATCHES:               3
IDENTITY AMBIGUOUS:                20

PRODUCTS WITH NUTRITION:           73
PER 100 G:                         62
PER 100 ML:                        11    (zachowane jako 100 ml, nie przeliczone)

FIELDS ESTIMATED → SOURCE_VERIFIED: 270
PRODUCTS MATERIALLY IMPROVED:       43

PRODUCTS WITH >=1 ESTIMATED FIELD BEFORE: 574
PRODUCTS WITH >=1 ESTIMATED FIELD AFTER:  574

ENGINE/COMPOSITION READY BEFORE:   5
ENGINE/COMPOSITION READY AFTER:    6

TOTAL OPERATIONALLY USABLE BEFORE: 5
TOTAL OPERATIONALLY USABLE AFTER:  6

STILL REVIEW:                      814
```

Miary uzupełniające, bo same „ready" nie oddają zysku:

| Miara | Przed | Po | Zmiana |
|---|---|---|---|
| Zweryfikowane pola silnikowe (suma po 820) | 625 | **831** | **+206** |
| Brakujące pola silnikowe (suma po 820) | 4 241 | **4 076** | **−165** |

---

## 20. ODPOWIEDŹ NA PYTANIE KLUCZOWE

> Ile z 820 produktów stało się materialnie pełniejszych / bardziej użytecznych
> dzięki 280 znanym kartom Biedronki, przy zerowym koszcie wyszukiwania?

**43 produkty zyskały realne, zmierzone wartości z etykiety — 270 pól przeszło
z oszacowania/nieznanego na potwierdzone źródłowo. Ale tylko 1 produkt więcej
przekroczył pełną gotowość silnikową (5 → 6).**

Powód jest strukturalny i wart zapamiętania:

**Karty detaliczne zamykają połowę „etykietową", nigdy połowę „formulacyjną".**

Karta podaje: energię, tłuszcz, kwasy nasycone, węglowodany, cukry, błonnik,
białko, sól — czyli dokładnie to, co nakazuje rozporządzenie o etykietowaniu.

Karta **nigdy** nie podaje: `water_percent`, `total_solids_percent`, `pod_value`,
`pac_value` — a to one są wąskim gardłem gotowości silnikowej w tym pliku.

Więc produkt przechodzi np. z „6 z 9 pól brakuje" na „4 z 9 brakuje": realnie
lepiej, ale nadal nie gotowy. Zysk jest prawdziwy i trwały, tylko nie objawia się
w liczniku „ready".

---

## 14. STANY KOŃCOWE KAŻDEGO URL-a

| Stan | Liczba |
|---|---|
| `FETCHED_NO_NUTRITION` | **180** |
| `FETCHED_MATCHED` | **62** |
| `FETCHED_AMBIGUOUS` | 20 |
| `PER_100_ML_ONLY` | 11 |
| `HTTP_NOT_AVAILABLE` | 4 |
| `FETCHED_IDENTITY_MISMATCH` | 3 |

**Najważniejsza liczba to 180.** Większość kart sklepu **w ogóle nie publikuje
tabeli odżywczej** — mają opis, czasem skład, ale bez wartości. Sonda, którą
zrobiłem wcześniej na karcie Alpro, trafiła na kartę bogatą; to nie jest norma.
To była moja optymistyczna ekstrapolacja z jednej próbki i chcę to powiedzieć
wprost: **oszacowanie „do 280 produktów" było zawyżone. Realnie 62.**

---

## 16. JAKOŚĆ ŹRÓDŁA — ROZDZIELONA

| Autorytet | Produkty | Pola zweryfikowane |
|---|---|---|
| `OFFICIAL_PRIVATE_LABEL` | 13 | **35** |
| `AUTHORITATIVE_RETAILER` | 49 | **235** |
| inne | 0 | 0 |

Autorytet nadawany **per produkt**, z Twojego własnego oznaczenia
`Product Type = private_label`, nigdy z domeny. Milka, Kinder, Lindt i Alpro w
tym samym sklepie pozostają `AUTHORITATIVE_RETAILER`. Żadna wartość nie jest
opisana jako pochodząca od producenta.

Nowe podstawy proweniencji w modelu prawdy, w kolejności siły:

```
official_manufacturer  >  mapper_exact  >  private_label_card
                       >  product_declared  >  retailer_card  >  derived  >  mapper_*
```

---

## 4. BRAMKA TOŻSAMOŚCI — CO ODRZUCIŁA

253 kart potwierdziło tożsamość, **23 nie**:

* **3 × MISMATCH** — karta dotyczy innego produktu lub innego wariantu.
* **20 × AMBIGUOUS** — najczęściej karta nie potwierdzała opakowania z wiersza
  albo tylko jedna ze stron podawała wariant procentowy.

Z tych 23 **nie wzięto ani jednej liczby**. Obecność URL-a w wierszu nie jest
dowodem tożsamości — eksport zapisuje, gdzie właściciel zajrzał, a nie czym ta
strona się okazała.

Bramka pilnuje w szczególności przypadku `mleko 2%` vs `mleko 3,9%`: te same
marka, nazwa i gramatura, inny produkt. Test jednostkowy przybija ten przypadek.

---

## 6/7. REGUŁY UTRZYMANE

* **11 kart per 100 ml** — zapisane jako dowód per 100 ml, **zero przeliczeń** na
  100 g. Bez gęstości takie przeliczenie wymyśliłoby pomiar.
* **Scalanie pole po polu.** Wartość zadeklarowana w wierszu nie została nadpisana
  przez kartę sprzedawcy — `product_declared` stoi wyżej niż `retailer_card`.
  Dlatego 62 karty dały wkład, ale tylko 43 produkty zyskały **nowe** pola:
  w 19 przypadkach karta potwierdziła to, co już było zweryfikowane.
* **Woda i sucha masa nadal z Mappera** tam, gdzie karta milczy — i tak zostaje.
* **Poliole** wyekstrahowane z kart (np. guma bez cukru: 62,8 g/100 g) są
  zapisane w dowodach, ale **nie** trafiają do pól roboczych — `polyol_percent`
  nie jest dziś polem roboczym, a dopisywanie go po cichu zmieniłoby POD/PAC.
* **QUID nie jest kompozycją.** Żaden procent ze składu nie stał się
  `water_percent`.

## 11. BRAMKA SPÓJNOŚCI FIZYCZNEJ

Po każdym scaleniu przeliczane są: stan pola, pewność, domknięcie arytmetyczne,
gotowość i osobno autorytet techniczny. Bramka spójności działa na złożonym
profilu — dane z karty są mocniejsze, więc przy sprzeczności wycofywane jest
oszacowanie Mappera, nigdy pomiar.

---

## 17. KOSZT

```
PAID SEARCH CALLS:   0 / 6      ← bez zmian
DIRECT FETCHES:      281        (280 kart + 1 robots.txt)
MODEL CALLS:         0
VISION:              0
CACHE HITS:          0
REAL PAID COST:      0
```

Zachowana grzeczność wobec serwisu: 1,5 s odstępu między żądaniami, jeden wątek,
`robots.txt` respektowany — ścieżki wyszukiwania i zapytań nietykane.

---

## CO TO ZNACZY DLA STRATEGII

Ten przebieg dowodzi ekonomiki pakietów źródłowych i jednocześnie pokazuje jej
granicę:

1. **Karty detaliczne są tanie i skuteczne dla makroskładników.** 270 pól za zero
   złotych.
2. **Nie odblokują gotowości silnikowej same z siebie**, bo nie zawierają wody,
   suchej masy ani POD/PAC.
3. **Wąskim gardłem 820-produktowego pliku pozostaje formulacja, nie etykieta.**

Jeśli celem jest podnieść licznik „engine ready", największy zwrot da teraz nie
kolejny pakiet detaliczny, lecz **domknięcie wody/suchej masy** — albo z gęstości
i wilgotności dla kategorii, albo z rozszerzenia kohort Mappera. To praca
lokalna, bez płatnych wywołań.

**Nie wydałem nic i nie ruszam dalej bez Twojej decyzji. Nadal 0 / 6.**

---

## 19. OGRANICZENIA — ZACHOWANE

* Brak masowego importu 820, Preview/Apply nietknięte, brak produkcji.
* Mapper nietknięty, ProductBehavior nietknięty i nadal fail-closed.
* Brak wyszukiwania płatnego, brak crawlowania sklepu, brak użycia wyszukiwarki
  sklepu (zabronionej przez `robots.txt`).
* Żadne pole nie zostało promowane bez potwierdzonej tożsamości i zadeklarowanej
  podstawy.
