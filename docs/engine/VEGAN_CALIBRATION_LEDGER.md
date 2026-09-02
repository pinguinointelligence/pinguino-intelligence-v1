# Vegan Gelato Calibration Ledger

Runtime: Mapper dataset v1.0, 1000 g fixtures, canonical PINGÜINO Engine.
All numbers below are produced by `calculateRecipe`; values are rounded to three
decimals. `Score` is native technical fit, not Recipe Direction sensory fit.
FP and T50 are absent because the Engine does not implement those metrics.

Ingredient abbreviations used in compact recipes:

- `W`: Water `PI-ING-001409`;
- `O`: Oat drink `PI-ING-001565`;
- `A`: Almond drink `PI-ING-001587`;
- `CO`: refined coconut oil `PI-ING-000163`;
- `S`: sucrose `PI-ING-000514`;
- `D`: dextrose monohydrate `PI-ING-000494`;
- `I`: inulin `PI-ING-000456`;
- `T`: Tara gum `PI-ING-000492`.

## Canonical target/evidence ledger

| Temp. | Native POD | Native NPAC | Native ice | Native fat | Native solids | Native water | Regulator clean NPAC | Status |
|---|---|---|---|---|---|---|---|---|
| −11 | 13–25 | 35–52 | 45–61 | 0–12 | 30–43 | 54–72 | 40–47 | internal; owner validation pending |
| −12 | 13–25 | 44–59 | 46–60 | 0–12 | 30–43 | 52–70 | 48–54 | internal; owner validation pending |
| −13 | 13–25 | 50–64 | 46–58 | 0–12 | 30–43 | 50–67 | 53.5–60 | V02/external reference anchored |

## Neutral oat matrix

| Temp. | Exact recipe, g | POD | PAC | NPAC | Ice | Water | Solids | Fat | Protein | Fibre | Sugars | Score |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| −11 | W448.072 O228.908 CO48.071 S169.392 D54.938 I48.620 T2 | 21.618 | 27.642 | 41.495 | 45.533 | 66.615 | 33.385 | 5.105 | 0.092 | 4.536 | 22.932 | 10 |
| −12 | W397.4 O250 CO52.5 S145 D100 I53.1 T2 | 22.333 | 33.180 | 51.946 | 50.292 | 63.874 | 36.126 | 5.575 | 0.100 | 4.939 | 24.725 | 10 |
| −13 | W397.4 O250 CO52.5 S95 D150 I53.1 T2 | 20.737 | 36.921 | 57.442 | 49.566 | 64.274 | 35.725 | 5.575 | 0.100 | 4.939 | 24.325 | 10 |

## Strawberry matrix

Main is Strawberry `PI-ING-001553`, kept at 324.3 g.

| Temp. | Exact non-Main recipe, g | POD | PAC | NPAC | Ice | Water | Solids | Fat | Protein | Fibre | Sugars | Score |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| −11 | W156.042 O211.729 CO33.352 S195.549 D17.570 I59.459 T2 | 23.866 | 26.925 | 41.779 | 45.234 | 64.446 | 35.554 | 3.708 | 0.312 | 6.160 | 23.920 | 10 |
| −12 | W152.2 O213.3 CO33.6 S157 D57.7 I59.9 T2 | 22.749 | 30.092 | 46.633 | 50.336 | 64.530 | 35.470 | 3.735 | 0.312 | 6.200 | 23.764 | 10 |
| −13 | W152.2 O213.3 CO33.6 S107 D107.7 I59.9 T2 | 21.153 | 33.832 | 52.106 | 49.720 | 64.930 | 35.070 | 3.735 | 0.312 | 6.200 | 23.364 | 10 |

## Banana matrix

Main is Banana puree `PI-ING-001589`, kept at 324.3 g.

| Temp. | Exact non-Main recipe, g | POD | PAC | NPAC | Ice | Water | Solids | Fat | Protein | Fibre | Sugars | Score |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| −11 | W296.216 O154.395 CO24.321 S142.597 D12.812 I43.358 T2 | 22.206 | 26.316 | 38.136 | 49.079 | 69.006 | 30.994 | 2.633 | 0.386 | 4.062 | 22.039 | 10 |
| −12 | W248.309 O173.990 CO27.408 S128.066 D47.066 I48.861 T2 | 23.165 | 30.945 | 46.658 | 50.336 | 66.323 | 33.677 | 2.967 | 0.394 | 4.557 | 23.817 | 10 |
| −13 | W242.971 O176.174 CO27.752 S88.376 D88.954 I49.474 T2 | 22.056 | 34.308 | 51.725 | 49.731 | 66.329 | 33.671 | 3.004 | 0.395 | 4.613 | 23.711 | 10 |

## Pistachio matrix

Main is 100% pistachio paste `PI-ING-000614`, kept at 119.9 g.

| Temp. | Exact non-Main recipe, g | POD | PAC | NPAC | Ice | Water | Solids | Fat | Protein | Fibre | Sugars | Score |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| −11 | W331.6 O261.6 CO34.1 S167.4 D28.8 I54.6 T2 | 20.696 | 23.954 | 40.765 | 46.304 | 58.761 | 41.239 | 9.146 | 2.503 | 6.273 | 21.385 | 10 |
| −12 | W331.6 O261.6 CO34.1 S127.4 D68.8 I54.6 T2 | 19.420 | 26.946 | 45.608 | 50.345 | 59.081 | 40.919 | 9.146 | 2.503 | 6.273 | 21.065 | 10 |
| −13 | W331.6 O261.6 CO34.1 S77.4 D118.8 I54.6 T2 | 17.824 | 30.686 | 51.589 | 49.735 | 59.481 | 40.519 | 9.146 | 2.503 | 6.273 | 20.665 | 10 |

## Cocoa matrix

Main is alkalized cocoa `PI-ING-001578`, kept at 59.6 g.

| Temp. | Exact non-Main recipe, g | POD | PAC | NPAC | Ice | Water | Solids | Fat | Protein | Fibre | Sugars | Score |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| −11 | W370.797 O245.664 CO41.221 S206.009 D19.093 I55.615 T2 | 22.932 | 25.156 | 41.801 | 45.210 | 60.180 | 39.820 | 5.812 | 1.225 | 6.894 | 23.365 | 10 |
| −12 | W358.7 O250.9 CO42.1 S170.4 D59.5 I56.8 T2 | 22.143 | 28.683 | 47.980 | 50.325 | 59.782 | 40.218 | 5.907 | 1.227 | 7.000 | 23.543 | 10 |
| −13 | W358.7 O250.9 CO42.1 S120.4 D109.5 I56.8 T2 | 20.547 | 32.423 | 53.875 | 49.669 | 60.182 | 39.818 | 5.907 | 1.227 | 7.000 | 23.143 | 10 |

## Almond-base matrix

| Temp. | Exact recipe, g | POD | PAC | NPAC | Ice | Water | Solids | Fat | Protein | Fibre | Sugars | Score |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| −11 | W460.347 A223.798 CO46.998 S165.611 D53.712 I47.535 T2 | 21.357 | 27.479 | 40.999 | 46.056 | 67.025 | 32.975 | 5.192 | 0.157 | 4.505 | 22.221 | 10 |
| −12 | W397.4 A250 CO52.5 S145 D100 I53.1 T2 | 22.580 | 33.689 | 53.049 | 50.283 | 63.505 | 36.495 | 5.800 | 0.175 | 5.014 | 24.502 | 10 |
| −13 | W397.4 A250 CO52.5 S95 D150 I53.1 T2 | 20.984 | 37.429 | 58.570 | 49.533 | 63.904 | 36.095 | 5.800 | 0.175 | 5.014 | 24.102 | 10 |

## Multi-Main runtime proofs (−13°C)

Both recipes use W176.5 O213.3 CO33.6 S107 D107.7 I59.9 T2.

| Main contract | Main grams | POD | PAC | NPAC | Ice | Water | Solids | Fat | Protein | Fibre | Sugars | Score | Apply |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Banana:Strawberry 1:1 | 150:150 | 22.925 | 36.266 | 57.272 | 49.571 | 63.322 | 36.678 | 3.682 | 0.340 | 5.851 | 25.113 | 10 | verified |
| Banana:Strawberry 2:1 | 200:100 | 23.572 | 37.159 | 59.268 | 49.513 | 62.697 | 37.303 | 3.667 | 0.355 | 5.751 | 25.743 | 10 | verified |

Canonical ids remain unique, both Main lines remain Main, and `commitPreview`
accepts both candidates without ratio drift.

## Optional plant-protein structural fixture (−13°C)

Recipe: W377.4 O250 CO52.5 S95 D150 I53.1 T2 plus 10 g pea protein
`PI-ING-000451` and 10 g rice protein `PI-ING-000452`.

| Batch | POD | PAC | NPAC | Ice | Water | Solids | Fat | Protein | Fibre | Sugars | Score | Lactose |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1000 | 20.737 | 37.213 | 59.726 | 49.499 | 62.306 | 37.693 | 5.715 | 1.757 | 5.003 | 24.325 | 10 | 0 |

The low-protein neutral recipe (0.100%) and this higher-protein variant both
pass, proving protein is structural/informational rather than a dairy gate.

## High-water boundary and rejected diagnostic

Initial verified fixture:

`O250 W550 CO20 S70 D55 I53 T2`

| State | POD | PAC | NPAC | Ice | Water | Solids | Fat | Protein | Fibre | Sugars | Score | Violations |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Before | 11.769 | 17.814 | 22.615 | 50.575 | 78.774 | 21.226 | 2.325 | 0.100 | 4.930 | 13.085 | 5 | NPAC, POD, water, solids |
| Solver diagnostic | 15.714 | 31.406 | 53.685 | 49.674 | 58.500 | 41.500 | 1.676 | 0.072 | 19.118 | 19.203 | 10 | none native |

The solver diagnostic recipe was O180.217 W396.478 CO14.417 S50.461
D145.848 I211.137 T1.442. It is **not** a rescue and cannot be Previewed or
Applied: inulin exceeds the owner calibration envelope of 83.1 g/1000 g and
Tara is below its 2.0 g minimum. This is an explicit unresolved blocker.

The owner's coconut-milk boundary fixture is also blocked before optimization
because Mapper `PI-ING-000148` is not Vegan-verified.

## Eligibility audit ledger

| Classification | Count |
|---|---:|
| VEGAN_VERIFIED | 1001 |
| VEGAN_FALSE | 793 |
| VEGAN_UNKNOWN | 278 |
| VEGAN_CONFLICT | 11 |

Conflict ids:

`PI-ING-000045`, `PI-ING-000333`, `PI-ING-000606`, `PI-ING-000804`,
`PI-ING-000856`, `PI-ING-001439`, `PI-ING-001441`, `PI-ING-001733`,
`PI-ING-001778`, `PI-ING-002012`, `PI-ING-002014`.

Tests also pin dairy milk, WPC, honey, unknown rows, contradiction handling,
plant-milk wording and precautionary cross-contact behavior.

## Persistence and integrity ledger

- Preview→Apply: accepted for all final Multi-Main fixtures.
- Batch: 1000 g for every final recipe (tolerance ≤0.1 g).
- Canonical identity: no duplicate canonical ingredient in final fixtures.
- Non-Vegan input: rejected before Preview.
- Forged Apply: rejected again by Vegan eligibility/profile constraints.
- Save/reopen: exact `RecipeInput`, category, temperature, Main identity and
  recalculated score round-trip.
- Version restore: version 1 restores exact input as version 3 and reproduces
  the same score.

## External evidence versus PINGÜINO results

External MyGelato observations are calibration references only. PINGÜINO keeps
its own Mapper composition, native formulas, exact Multi-Main ratio and verified
stabilizer constraints. It deliberately does not copy MyGelato's 0 g Tara result
or its Strawberry/Banana ratio drift.

Unimplemented external values FP and T50 are recorded as evidence only; they are
not reported as PINGÜINO runtime output until an approved Engine model exists.
