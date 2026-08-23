# GELLATTI — Audyt kontraktu Engine + przebieg domknięcia fizycznego

**Data:** 2026-08-23 · **Gałąź:** `claude/intimport-mapper-first`
**Płatne wywołania: 0 / 6. Zero web, zero model, zero vision.**

Zgodnie z Twoją korektą w trakcie zadania: **nic nie zostało zbudowane obok
istniejącego systemu.** To jest audyt + naprawa działającego pipeline'u.
Poniżej wprost, co jest naprawą, a co jedynym nowym plikiem i dlaczego.

---

## 1. MACIERZ KONTRAKTU ENGINE

Przeczytana z kodu (`src/engine`), nie z założeń.

| Pole | Wymagane jako wejście? | Wyprowadzalne? | Gdzie | Bramka wymagała? | Powinna? |
|---|---|---|---|---|---|
| `water_percent` | **tak (jedno z pary)** | tak, z suchej masy | domknięcie | tak | **jedno z pary** |
| `total_solids_percent` | **tak (jedno z pary)** | tak, z wody | domknięcie | tak | **jedno z pary** |
| `fat_percent` | **tak** | nie | composition, nutrition | tak | **tak** |
| `protein_percent` | **tak** | nie | composition, nutrition | tak | **tak** |
| `carbohydrate_percent` | **tak** | nie | composition, nutrition | tak | **tak** |
| `total_sugars_percent` | **tak** | nie | composition | tak | **tak** |
| `sucrose/dextrose/glucose/fructose/lactose` | warunkowo | nie | ścieżka POD/PAC | **nie** | **tak, gdy są cukry** |
| `polyol_percent` | warunkowo | nie | composition, nutrition (2,4 kcal/g) | nie | **tak, gdy obecne** |
| `fiber_percent` | opcjonalne | nie | composition, nutrition | tak | **nie** |
| `salt_percent` | opcjonalne | nie | composition, NPAC | tak | **nie** |
| `alcohol_percent` | warunkowo | nie | NPAC | nie | **tak, gdy obecny** |
| `saturated_fat_percent` | opcjonalne | nie | pole opcjonalne | nie | nie |
| **`pod_value`** | **NIE** | **tak** | ścieżka słodząca Engine | **tak ❌** | **nie ✅** |
| **`pac_value`** | **NIE** | **tak** | ścieżka zamrażająca Engine | **tak ❌** | **nie ✅** |
| **`kcal_per_100g`** | **NIE** | **tak** | nutrition (Atwater) | nie | nie |

Zapisane jako dane w `engineFieldContract.ts` — **jedyny nowy plik**, i to plik
bez zachowania. Decyzja o gotowości została w `productWorkingValues`, który już
ją posiadał.

### Dowody z kodu

* `ingredientRowToEngineIngredient` sprowadza każdy brakujący składnik do **0**
  na styku. Engine nie wywróci się na luce — ale zero to realny wkład, więc
  „przyjmuje" ≠ „ma sens". Dokładnie po to jest bramka gotowości.
* `pod_value` / `pac_value` / `de_value` są **nullowalne** w `EngineIngredient`.
  Ścieżka słodząca spada na typowe widmo cukrów, zamrażająca na kotwice DE, a
  potem też na widmo.
* **Ten fallback daje ZERO przy nieznanym widmie.** To jest niebezpieczny
  przypadek: produkt z 40 g cukru sformułowałby się tak, jakby cukier nic nie
  robił.
* `polyol_percent` jest pełnoprawnym polem composition i nutrition (2,4 kcal/g
  przeciw węglowodanom-minus-poliole), **ale `pod.ts` mówi wprost, że rozkład
  daje 0 dla polioli** — ich jedyna poprawna droga to wartość zapisana albo
  jeden z pięciu nazwanych polioli.

---

## 2/3. NAPRAWY W ISTNIEJĄCYCH MODUŁACH

Cztery naprawy, wszystkie w plikach, które już istniały:

| # | Plik | Naprawa |
|---|---|---|
| 1 | `productWorkingValues.ts` | **usunięte** własne wyprowadzanie kcal — było drugą kopią Atwatera, z innymi współczynnikami niż Engine (mój 9/4/4/2 ignorował regułę polioli 2,4). kcal jest `derived_by_engine`; Engine je liczy. |
| 2 | `productWorkingValues.ts` | gotowość **nie wymaga już POD/PAC** jako danych źródłowych; wymaga **rozstrzygalnej ścieżki** (`sweetnessPathOf`) |
| 3 | `productWorkingValues.ts` | woda + sucha masa liczone jako **jedna niewiadoma**, nie dwie — koniec podwójnej kary za ten sam brak |
| 4 | `mapperValueInference.ts` | kohorty **nie szacują już POD/PAC** — sąsiad nie jest dowodem o mocy zamrażającej tego produktu; Engine wyprowadza ją z jego własnych cukrów |

Model pól rozszerzony (nie zduplikowany) o widmo cukrów i poliole, żeby
**istniejąca** maszyneria kohort mogła je wnioskować. `productPlausibility`
dostał domknięcie cukrowe.

**Strażnik `studioBoundary` złapał mnie na gorącym uczynku** przy próbie importu
`ATWATER_KCAL_PER_G` do warstwy funkcji — i miał rację. Właściwą odpowiedzią było
skasowanie duplikatu, nie import stałej.

---

## 16. PEŁNY PRZEBIEG 820 — BEZ SIECI

```
TOTAL:                              820

SOURCE_VERIFIED ENGINE FIELDS:      625  →  831
ESTIMATED ENGINE FIELDS:          2 036  → 2 004
UNKNOWN REQUIRED FIELDS:          3 079  → 2 905

PRODUCTS WITH COMPLETE PHYSICAL PROFILE:  176  →  193
ENGINE/COMPOSITION READY:                   5  →    5
TECHNICAL AUTHORITY READY:                  0        (osobna oś, bez zmian)
FULLY OPERATIONAL:                          5
REVIEW:                                   815
```

Uwaga metodologiczna: „before" to stan **po** naprawie kontraktu, ale **przed**
danymi z kart Biedronki. Sama naprawa kontraktu przesunęła gotowość z 5 na 1, a
potem domknięcie widma cukrów i reszty suchej masy wróciło do 5 — **bramka jest
teraz surowsza i uczciwsza niż była**, bo wcześniej produkty przechodziły na
POD/PAC zmyślonych przez kohortę.

---

## 17. ROZBICIE BLOKERÓW — 815 produktów

| Bloker | Produkty |
|---|---|
| **brak wody / suchej masy** | **426** |
| brak wymaganego makroskładnika | 188 |
| **brak rozbicia cukrów** | **170** |
| słaba pewność pola (<85%) | 21 |
| sprzeczność fizyczna | 10 |
| poliole nieobsługiwane przez Engine | 0 (ujęte w rozbiciu cukrów) |
| tożsamość | 0 |
| wyłącznie techniczny | 0 |

---

## 18. WARTOŚĆ DANYCH Z BIEDRONKI — POŚREDNIA

**Zmierzona pośrednia korzyść: 0 produktów.**

Żaden produkt nie stał się gotowy *wyłącznie* dzięki temu, że dokładne makro z
etykiety pozwoliły słabemu oszacowaniu Mappera przekroczyć 85%.

Ale korzyść bezpośrednia jest realna i trwała:
**+206 zweryfikowanych pól silnikowych, +17 produktów z kompletnym profilem
fizycznym** (176 → 193). Karty detaliczne robią dokładnie to, do czego służą —
zamykają połowę etykietową.

---

## 22. ODPOWIEDŹ NA PYTANIE KLUCZOWE

> Ile z 820 produktów Gellatti może uczciwie użyć bez żadnego dodatkowego
> wyszukiwania w internecie?

**5 produktów jest w pełni operacyjnych.**
**193 mają kompletny profil fizyczny**, ale nie przechodzą bramki pewności lub
ścieżki mocy.

To jest liczba niska i chcę ją podać bez upiększania. Powód nie jest jednak
„Mapper jest słaby" — jest strukturalny i teraz dokładnie zmierzony:

**426 produktów nie ma ani wody, ani suchej masy, a 170 ma cukry nieznanego
rodzaju.** Ani etykieta detaliczna, ani katalog producenta tych rzeczy nie
publikują. To są wielkości **formulacyjne**, nie etykietowe.

### Co zrobiłem, żeby to ruszyć (i ile dało)

Domknięcie suchej masy z **własnych makroskładników produktu + reszty
niewymienionej zmierzonej na kohorcie** — nie z `100 − makro`, bo ta reszta
zawiera popiół, minerały i kwasy organiczne, których etykieta nie wymienia.
Kohorta mówi, ile takiej reszty dana rodzina naprawdę nosi.

Efekt: kompletne profile **113 → 176** (+63 produkty).

---

## 20. TESTY

344 testy przechodzą. Nowe pilnują m.in.:

* woda → sucha masa i odwrotnie, **bez podwójnej kary** za tę samą niewiadomą;
* POD/PAC **nie są wymagane**, a gotowość zależy od rozstrzygalnej ścieżki;
* produkt z cukrami nieznanego rodzaju **odrzucony** (Engine policzyłby zero);
* produkt bez cukrów/alkoholu/polioli **przyjęty**, moce dokładnie zerowe;
* **poliole odrzucone** jako nierozstrzygalne, nigdy nie traktowane jak sacharoza;
* nazwane cukry ponad deklarowany total **odrzucone**;
* **nierozpoznana reszta cukru dopuszczona** — uczciwa luka bije zmyślony rozkład;
* energia **nie jest** wyprowadzana lokalnie.

Znalazłem przy tym realny błąd we własnej wcześniejszej pracy: reguła zerowej
mocy nie sprawdzała polioli. Guma bez cukru (62,8 g polioli) dostałaby POD/PAC
równe zero. Nie odpaliła tylko przez przypadek — bo alkohol był `null`, nie `0`.
Naprawione i przybite testem.

---

## 21. OGRANICZENIA — ZACHOWANE

* 0 / 6 płatnych wywołań, zero sieci w tym etapie.
* Preview / Apply / import masowy — nietknięte. Produkcja — nietknięta.
* Mapper nietknięty. ProductBehavior nietknięty, nadal fail-closed, osobna oś.
* Karty Biedronki **nie były pobierane ponownie** — użyty zapisany wynik.
* Szerokie heterogeniczne kohorty nadal odrzucane przez bramkę rozrzutu.

## CO DALEJ — REKOMENDACJA

Największy zwrot to teraz **426 produktów bez wody/suchej masy**. Ich makro są
często znane, więc brakuje wyłącznie reszty niewymienionej. Dwie drogi, obie
lokalne i bezpłatne:

1. **Rozszerzyć kohorty reszty** o dopasowanie po makrach (§6) zamiast po
   rodzinie — reszta popiołowa zależy od typu produktu bardziej niż od nazwy.
2. **Wilgotność kategorialna** dla form fizycznych, gdzie jest fizycznie wąska
   (np. oleje ~0% wody, syropy, proszki).

Nie ruszam dalej bez Twojej decyzji.
