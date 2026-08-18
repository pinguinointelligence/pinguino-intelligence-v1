# Extreme unlocked Main frontier repair

Status przed deployem: **LOCAL GATES PASS / SERVED RETEST PENDING**.

## Root cause

Frontier miał budżet jednego probe i zaczynał od górnej granicy. Dodatkowo
wcześniejsza projekcja batcha traktowała bieżące dodatnie Main jak tymczasowo
exact. Dla 1000/1200 g pierwszy punkt odpadał, a solver nie schodził do znanego
wykonalnego regionu.

## Repair

- wpisane gramy odblokowanego Main nie są lower bound ani blokadą;
- certyfikowany integer-linear upper bound jest tylko początkiem;
- solver sprawdza każdy whole-gram w dół do pierwszego kandydata przechodzącego
  pełny Engine, ProductBehavior, carrier, Required, lock/ratio i exact-batch;
- `X` jest maximum tylko przy certyfikowanym upper bound i odrzuceniu każdego
  wyższego punktu;
- locked Main nigdy nie jest automatycznie zmniejszany.

## Deterministic local proof

| Product           |                   Start g |     Final Main g | Final batch | Limiting rule                                    | Status         |
| ----------------- | ------------------------: | ---------------: | ----------: | ------------------------------------------------ | -------------- |
| Watermelon        | 1/80/300/600/700/900/1200 |              639 |        1000 | integer relaxation + POD/NPAC/lactose/fat/solids | EXACT MAXIMUM  |
| Kiwi              |    1/80/300/700/1000/1200 |              706 |        1000 | integer relaxation + lactose/fat/solids          | EXACT MAXIMUM  |
| Watermelon locked |                      1200 | 1200 (unchanged) |  impossible | locked mass > target batch                       | EXACT CONFLICT |

Watermelon 640 g i Kiwi 707 g są odrzucane przez certyfikowaną granicę/pełny
zestaw reguł. Historyczne 368/410 pochodziło z niepełnego jednopunktowego
searchu; nowe 639/706 jest wynikiem pełnej rebalansacji wszystkich dozwolonych
linii i kompletnej walidacji Engine.

ECO i OPTIMAL używają tej samej granicy technicznej i dają ten sam wektor dla
identycznej bieżącej receptury.
