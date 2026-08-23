# GELLATTI — Audyt pewności, audyt starych mapowań, pakiety źródeł

**Data:** 2026-08-23
**Gałąź:** `claude/intimport-mapper-first`
**Koszt zewnętrzny:** **0 web calls, 0 OpenAI calls, 0 Vision calls, 0 zapisów do bazy.**
**Odcisk Mappera po przebiegach:** `b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38` — bez zmian.

---

## 1. AUDYT 85% — odpowiedź jest jednoznaczna

Pytanie brzmiało: czy 0.45–0.60 to naprawdę słabe dowody fizyczne, czy produkt
jest karany tylko za to, że łączy kilka rozsądnych oszacowań pól?

**Odpowiedź: to naprawdę słabe dowody. Agregacja nie karze niczego.**

Dowód rozstrzygający — z `docs/products/confidence_audit.json`:

| Miara | Wynik |
|---|---|
| Produkty z kompletnym profilem 9 pól | 92 |
| Z nich poniżej progu 0.85 | 87 |
| **Produkty, w których KAŻDE pole ma ≥0.85, a produkt mimo to wypada poniżej** | **0** |
| Produkty poniżej progu mające co najmniej jedno pole poniżej progu | 87 (wszystkie) |

**Ani jeden** produkt nie jest odrzucany przez agregację. Każdy produkt poniżej
progu ma co najmniej jedno pole, które samo w sobie jest poniżej progu.

Co więcej, większość ma ich znacznie więcej niż jedno. Rozkład liczby pól poniżej
progu w produktach poniżej progu (wcześniejszy przebieg, 106 produktów):

| Pól poniżej progu | Produkty |
|---|---|
| 1 | 2 |
| 3–5 | 36 |
| **6** | **45** |
| 7–9 | 23 |

### Nie mnożę pewności

Obawa z Twojej wiadomości — „nie mnóż dziewięciu 90% aż produkt spadnie do 39%" —
jest słuszna jako zasada, ale **to nie jest to, co robi ten kod**. Agregacja
produktu to **minimum**, nie iloczyn. Dla porównania, na tych samych pewnościach pól:

| Agregacja | Produkty ≥0.85 |
|---|---|
| **minimum (wdrożone)** | **5** |
| średnia | 14 |
| mediana | 23 |
| iloczyn | 0 |

Iloczyn byłby katastrofą i nie jest używany. Średnia lub mediana przepuściłyby
produkty, w których 6 z 9 pól jest poniżej progu — czyli dokładnie to, czego
Twoja własna zasada zabrania („wartość robocza musi być obroniona na ≥85%").
Minimum jest jedyną agregacją zgodną z tą zasadą, i jest hojniejsze niż iloczyn.

### Skąd bierze się kara

Rozkład kary jest rozłożony dokładnie:

```
pewność pola = pułap_poziomu × (1 − 0.5 × (1 − zgodność_kohorty))
```

Średnie kary w produktach poniżej progu: **pułap poziomu 0.108, rozrzut 0.1528.**
Rozrzut — czyli realna niezgoda kohorty — dominuje.

Zgodność wiążącego (najsłabszego) pola w tych produktach:

| Zgodność kohorty | Produkty |
|---|---|
| 0.0–0.2 (rozrzut przy samej krawędzi pasma) | 38 |
| 0.2–0.4 | 31 |
| 0.4–0.7 | 16 |
| brak kohorty (słabe źródło deklaracji) | 10 |

Wiążące pola to najczęściej `total_sugars_percent` (25), `water_percent` (22),
`pac_value` (22), `fat_percent` (18) — czyli dokładnie te, które w heterogenicznej
kohorcie naprawdę się rozjeżdżają.

**Wniosek: nie zmieniam punktacji.** Nie ma czego naprawiać — niska pewność
odzwierciedla realnie rozrzucone dowody. Zgodnie z Twoim poleceniem nic nie
zostało zmienione w scoringu.

Osobna obserwacja: **10 produktów** ma najsłabsze ogniwo w *własnej deklaracji*
(niska autorytatywność źródła INTIMPORT), a nie w kohorcie Mappera. To są
najtańsze cele dla enrichmentu — wystarczy potwierdzić deklarację oficjalnym
źródłem, a `ESTIMATED → VERIFIED` podniesie całe minimum.

---

## 2. STARE 136 MAPOWAŃ — ile z tego było prawdziwe

Skoroszyt użyty **wyłącznie diagnostycznie**. Nie skopiowano żadnej wartości
pewności, nie przyjęto żadnej starej klasyfikacji, nie strojono niczego pod 614.

| Klasa | Liczba | Udział |
|---|---|---|
| **A** — nadal obronne | **11** | 8% |
| **B** — zastąpione bezpieczniejszym wnioskiem Mappera | **12** | 9% |
| **C** — wymaga źródła oficjalnego | **10** | 7% |
| **D** — **odrzucone jako niebezpieczne** | **103** | **76%** |

Klasyfikator złapał dokładnie te klasy błędów, które opisałeś:

* `Big-Active Herbata zielona Pure Green` → BLACK TEA — **D**
* `Herbapol Herbatka owocowa malinowa` → BLACK TEA — **D**
* `Jacobs Kronung Kawa mielona` → COFFEE BEAN ROASTED GROUND — **D**
* `Dilmah Herbata czarna Mango & Strawberry` → BLACK TEA — **D**

Klasa A po zaostrzeniu zawiera już tylko mapowania rzeczywiście tożsamościowe:
`Skyr Fruvita` → SKYR 0.2%, `Kiwi goBIO` → KIWI, `Tic Tac Drażetki orange` →
TIC TAC ORANGE, `Lipton Herbata czarna` → BLACK TEA.

**76% starego wkładu Mappera nie broni się pod nową architekturą.** To jest
ilościowa odpowiedź na „ile ze starego benchmarku było realne".

Pełne dane: `docs/products/reference_mapping_audit.json`.

---

## 3. DEFEKT ZNALEZIONY W MOIM WŁASNYM SYSTEMIE

Audyt starych mapowań ujawnił, że **mój** dobór kohorty miał tę samą wadę, którą
odrzucamy u starej heurystyki.

`Adalbert's Tea Herbata zielona z wyciągiem z...` trafiała do kohorty wierszy
BLACK TEA, bo token `tea` pochodził z **nazwy marki** („Adalbert's Tea"), nie z
substancji. Nazwa firmy nie może upodabniać produktu do surowca.

**Naprawione:** tokeny marki są teraz wykluczane z doboru kohorty. Skutek na
820 produktach: gotowość spadła z 13 do 7 — czyli w dół, bo usunięto niebezpieczne
dopasowania. To jest właściwy kierunek.

Bez tego audytu ta wada zostałaby w systemie.

---

## 4. WALIDACJA SPÓJNOŚCI MIĘDZYPOLOWEJ

Nowy moduł `productPlausibility.ts` sprawdza złożony produkt jako całość, bo
dziewięć pojedynczo obronnych liczb może być łącznie niemożliwe. Zasady:

| Reguła | Co sprawdza |
|---|---|
| `range` | każdy procent w 0–100, kcal w 0–900, POD/PAC w 0–400 pkt |
| `water_solids_balance` | woda + sucha masa + alkohol = 100 (±1) |
| `sugars_within_carbohydrate` | cukry ≤ węglowodany |
| `components_within_solids` | tłuszcz+białko+węgl.+błonnik+sól ≤ sucha masa |
| `energy_matches_macros` | kcal zgodne z Atwaterem (±40 kcal lub ±15%) |

**Sprzeczności są odrzucane, nigdy nie godzone.** Nic tu nigdy nie koryguje
liczby, żeby pasowała — po cichu dociągnięta wartość byłaby wymyślonym faktem.

* sprzeczność z udziałem oszacowania → **oszacowanie jest wycofywane** (było
  słabszym twierdzeniem; lepszy uczciwy brak niż pewna niemożliwość);
* sprzeczność wyłącznie między wartościami zmierzonymi → **nic nie jest
  wycofywane**, produkt idzie do REVIEW. To Twoje dane wymagają poprawki, nie
  nasze do nadpisania.

Wynik na 820 produktach — 23 realne niemożliwości, które wcześniej przechodziły:

| Reguła | Naruszenia |
|---|---|
| `components_within_solids` | 14 |
| `energy_matches_macros` | 7 |
| `water_solids_balance` | 1 |
| `sugars_within_carbohydrate` | 1 |

**2 produkty mają wewnętrznie sprzeczne własne deklaracje** — te wymagają Twojej
korekty w pliku źródłowym.

---

## 5. PAKIETY ŹRÓDEŁ — i ważna korekta

Nowy moduł `sourcePack.ts` grupuje produkty po **wspólnym pochodzeniu**:
zweryfikowana domena oficjalna → producent → marka → singleton.

| Miara | Wynik |
|---|---|
| Produkty wymagające doszukania | 817 z 820 |
| Pakiety do otwarcia | **145** |
| Szacowany koszt strategią pakietową | **209 wywołań** |
| Szacowany koszt gdyby badać produkt po produkcie | **1634 wywołania** |
| **Oszczędność** | **7.8×** |

Podział pakietów: 5 po domenie oficjalnej, 51 po producencie, 92 po marce.

### Korekta, którą muszę zgłosić

W pierwszym przebiegu zaraportowałem „145 ze 145 pakietów ma oficjalny punkt
wejścia". **To było błędne** — klasyfikowałem strony sieci handlowych jako
oficjalne. Po poprawce:

| Punkty wejścia | Pakiety |
|---|---|
| **Z prawdziwie oficjalnym źródłem** | **4** |
| Tylko źródła detaliczne lub słabsze | 141 |

To istotnie zmienia plan: dla 141 pakietów zapisane przez Ciebie URL-e to strony
sklepów, więc dotarcie do dowodów producenta wymaga **odnalezienia domeny**, a nie
tylko otwarcia tego, co już jest.

Jeden pakiet dominuje i jest realną wygraną:

| Pakiet | Produkty | Oficjalne PDF-y | Najlepsze źródło |
|---|---|---|---|
| **comprital.pl** | **367** | 48 | `OFFICIAL_TECHNICAL_PDF` |
| McCormick Polska | 28 | 0 | detalista |
| goBIO | 26 | 0 | detalista |
| Fruvita | 24 | 0 | detalista |
| BakaD'Or | 18 | 0 | detalista |

**Comprital to 45% pliku za jedną domeną, z 48 oficjalnymi kartami technicznymi.**
To jest oczywiste pierwsze uderzenie enrichmentu.

---

## 6. ODKRYCIE W `PL_Poland.xlsx`

Skoroszyt roboczy zawiera arkusze, których eksport CSV **nie niesie**:

* **`Evidence` — 2097 wierszy**, w tym **367 „manufacturer PDF catalog"** i
  **367 „manufacturer catalog page"**, z URL-ami i statusem. To **mapa źródeł**,
  nie wartości odżywcze — ale dokładnie to, czego potrzebuje etap pakietów.
* `Needs Review` — 360 wierszy (zgadza się z 360 dowodami `not_found`).
* `Offers` — 822 wiersze z cenami i URL-ami detalistów.

Ważne: `Evidence` **nie zawiera brakujących wartości liczbowych**, więc gotowość
nie rośnie za darmo. Zawiera natomiast dokładne adresy do odpytania.

---

## 7. STAN — DWA WYMIARY OSOBNO

Zgodnie z Twoim poleceniem gotowość kompozycji i autorytet techniczny są teraz
**rozdzielone** i raportowane osobno. `valueReadiness` mówi wyłącznie o liczbach;
`readiness` dokłada bramkę techniczną na wierzchu, fail-closed.

**Etap lokalny (0 płatnych wywołań), 820 produktów:**

| Stan | Produkty |
|---|---|
| Gotowe dla Engine z własnych źródeł (VERIFIED) | 0 |
| Gotowe jako oszacowane ≥85% | **5** |
| Częściowo wzbogacone przez Mapper (≥1 pole) | **574** |
| Nierozwiązane (Mapper nic nie dał) | 246 |
| Zablokowane autorytetem technicznym mimo kompletnych liczb | 4 |
| Do przeglądu | 815 |

---

## 8. CZEGO POTRZEBUJĘ, ŻEBY RUSZYĆ DALEJ

Etap enrichmentu jest **zbudowany i wyceniony, ale nie uruchomiony**.
Nie wydałem ani jednego wywołania i nie wydam bez Twojej zgody.

`INTIMPORT_MAX_EXTERNAL_CALLS_PER_IMPORT` stoi nadal na **6** (sufit QA z
poprzedniej fazy). Pełna strategia pakietowa to **209 wywołań**.

**Proponuję kolejność, gdy dasz budżet:**

1. **Comprital** — 1 pakiet, ~2 wywołania, potencjalnie 367 produktów.
   Najlepszy stosunek zysku do kosztu w całym pliku.
2. **10 produktów, w których wąskim gardłem jest tylko autorytatywność własnej
   deklaracji** — potwierdzenie oficjalnym źródłem podnosi całe minimum.
3. Pozostałe pakiety producenckie według liczby produktów.

Powiedz, jaki budżet wywołań autoryzujesz, a uruchomię od punktu 1.

## 9. Czego nie zrobiłem

* **Nie zmieniłem punktacji** — audyt dowiódł, że nie ma potrzeby.
* **Nie obniżyłem progu 85%.**
* **Nie wdrożyłem na produkcję, nie pushowałem.**
* **Nie podpiąłem warstwy pod INTIMPORT/Preview/Apply** — zgodnie z Twoim
  poleceniem to następuje dopiero po zamknięciu audytu i uzgodnieniu semantyki.
* **Nie zaimportowałem masowo 820 produktów.**
* **Nie skopiowałem niczego ze skoroszytu referencyjnego.**
