# Diagnostic Preview truth repair

Status przed deployem: **LOCAL GATES PASS / SERVED RETEST PENDING**.

## Root cause

Engine posiadał metrykę, wartość, band i severity, ale warstwa Preview
redukowała je do listy nazw i liczby naruszeń. UI mogło więc powiedzieć `1→1`
i „poprawa” bez pokazania, czy dystans do zakresu rzeczywiście się zmniejszył.

## Repair

`finishPreview` wyprowadza DTO wyłącznie z `calculateRecipe` i
`detectViolations`:

- before/proposed value;
- band min/max;
- distance before/after;
- improved/unchanged/worsened;
- hard/advisory;
- jednostkę `%` albo `pkt` i dystans `pp` albo `pkt`;
- band status/category/temperature fallback;
- dokładny powód wyłączonego Apply.

UI nie duplikuje matematyki Engine.

## Exact served-fixture local proof

| Metric      |   Before | Proposed |  Range | Distance before | Distance after | Apply state              |
| ----------- | -------: | -------: | -----: | --------------: | -------------: | ------------------------ |
| Udział lodu | 47.8421% | 50.4602% | 51–59% |       3.1579 pp |      0.5398 pp | disabled — hard residual |

Kandydat ma dokładnie 1000 g i zachowuje `1→1`, ale copy mówi wprost, że
wynik jest bliżej zakresu i nadal go nie osiąga. Nie jest prezentowany jako
wykonywalna receptura.
