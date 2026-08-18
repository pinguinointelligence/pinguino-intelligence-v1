# Positive Standard presence repair

Status przed deployem: **LOCAL GATES PASS / SERVED RETEST PENDING**.

## Root cause

Generator wektora kandydatów uznawał każdą odblokowaną linię Standard za
`emptiable`, dodawał 0 g i sortował wartości rosnąco. Ranking znał wyłącznie
liczbę/nasilenie naruszeń technicznych, więc technicznie poprawne usunięcie
produktu mogło wygrać z poprawnym kandydatem zachowującym produkt.

## Repair

- dodatnia, widoczna intencja użytkownika zapisuje
  `user_intent_anchor_grams`;
- normalny search ma minimum 1 g, nigdy 0 g;
- ranking po techniczności/lockach/Main wybiera najmniejszą odległość od
  pierwotnego anchoru;
- LP respektuje `standard_presence_min`;
- Preview i Apply ponownie sprawdzają obecność;
- usunięcie wymaga session-only consent powiązanego z fingerprintem receptury;
- Undo przywraca dokładną linię, rolę, gramy, snapshoty i historię.

## Exact terminal

Tytuł: `Ten składnik trzeba usunąć albo zmienić.`

Akcje:

- `Usuń składnik i pokaż podgląd`
- `Wróć do receptury`

Terminal pokazuje bieżące gramy, najlepszą próbę >=1 g, metrykę limitującą i
zatwierdzony zakres. Brak consent albo stary fingerprint blokuje Apply bez
mutacji draftu.

## Local fixtures

| Fixture                                            | Standard start g |          Preview g |     Applied g | Removal consent used | Status                     |
| -------------------------------------------------- | ---------------: | -----------------: | ------------: | -------------------- | -------------------------- |
| Strawberry/Banana/Kiwi 120/180/240; Banana demoted |              180 |                >=1 | exact Preview | no                   | Engine-valid, batch 1000 g |
| Strawberry/Banana/Kiwi 100/100/100; Banana demoted |              100 |                >=1 | exact Preview | no                   | Engine-valid, batch 1000 g |
| Explicit user Inulin removal                       |               10 | removed in Preview |       removed | yes                  | Apply + exact Undo pass    |

Dokładne served gramy Banana zostaną wpisane po finalnym authenticated QA.
