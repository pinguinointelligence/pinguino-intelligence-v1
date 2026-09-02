# Protein Gelato calibration ledger

Run date: 2026-08-09
Branch: `codex/protein-gelato-final`
Batch: 1000 g
Target tolerance: ±0.1 percentage point
Statuses: `EXACT_10`, `SAFE_TARGET_MISS`, `HARD_INFEASIBLE`

All numbers below are emitted by
`src/features/protein-gelato/proteinCalibration.report.test.ts` through the
real formulation/Preview path. Main grams are asserted byte-exact, native
violations are checked, canonical duplicates are checked in the orchestration
suite, and hard-invalid results are proven non-applicable.

## Default 20% fixture results

| Fixture                     | Status           | Actual % | Residual pp | Score |     POD |     PAC |    NPAC |   Ice % | Water % | Solids % |  Fat % | Lactose % | Fibre % |
| --------------------------- | ---------------- | -------: | ----------: | ----: | ------: | ------: | ------: | ------: | ------: | -------: | -----: | --------: | ------: |
| Neutral −11                 | EXACT_10         |  20.0000 |      0.0000 |    10 | 12.0009 | 19.3996 | 33.1687 | 54.3219 | 58.8755 |  41.1245 | 5.0279 |    1.1776 |  0.1600 |
| Neutral −12                 | EXACT_10         |  20.0000 |      0.0000 |    10 | 13.7964 | 25.8908 | 46.4551 | 50.3377 | 56.0099 |  43.9901 | 5.0279 |    1.1776 |  0.1761 |
| Neutral −13                 | EXACT_10         |  20.0000 |      0.0000 |    10 | 12.6461 | 26.7110 | 49.5854 | 49.7933 | 55.0975 |  44.9025 | 5.1270 |    3.1603 |  0.1423 |
| Strawberry −13              | EXACT_10         |  20.0000 |      0.0000 |    10 | 14.0950 | 26.6688 | 48.7214 | 49.8184 | 55.0014 |  44.9986 | 5.0474 |    1.1726 |  0.7978 |
| Banana −13                  | EXACT_10         |  20.0000 |      0.0000 |    10 | 13.4615 | 28.1322 | 51.3782 | 49.7414 | 55.0057 |  44.9943 | 5.0482 |    1.1730 |  0.4094 |
| Vanilla −13                 | EXACT_10         |  20.0000 |      0.0000 |    10 | 12.6641 | 26.8077 | 49.8190 | 49.7866 | 55.0273 |  44.9727 | 5.0894 |    3.1500 |  0.1425 |
| Coffee −13                  | EXACT_10         |  20.0000 |      0.0000 |    10 | 12.2929 | 26.7422 | 48.0746 | 49.8371 | 55.8941 |  44.1059 | 5.2426 |    1.1699 |  0.4323 |
| Chocolate −13               | SAFE_TARGET_MISS |  14.0771 |     −5.9229 |     1 | 13.6052 | 26.7388 | 49.8447 | 49.7858 | 55.2957 |  44.7043 | 7.2825 |    3.3843 |  1.8000 |
| Pistachio −13               | SAFE_TARGET_MISS |  15.7419 |     −4.2581 |     1 | 12.0613 | 26.3571 | 49.1840 | 49.8050 | 55.0452 |  44.9548 | 7.6966 |    3.4212 |  1.0000 |
| Strawberry + Banana 1:1 −13 | EXACT_10         |  20.0000 |      0.0000 |    10 | 13.4231 | 27.9912 | 51.1230 | 49.7488 | 55.0044 |  44.9956 | 5.0518 |    1.1719 |  0.6944 |
| Strawberry + Banana 2:1 −13 | EXACT_10         |  20.0000 |      0.0000 |    10 | 12.5221 | 29.3843 | 53.6562 | 49.6753 | 55.0039 |  44.9961 | 5.0635 |    1.1689 |  1.0910 |
| Plant Rice −13              | EXACT_10         |  20.0000 |      0.0000 |    10 | 13.5328 | 26.6120 | 48.2490 | 49.8321 | 55.1556 |  44.8444 | 5.2133 |    0.0000 |  1.9919 |
| Plant Pea −13               | EXACT_10         |  20.0000 |      0.0000 |    10 | 12.1994 | 27.5798 | 48.2185 | 49.8329 | 57.1975 |  42.8025 | 5.5972 |    0.0000 |  1.1381 |
| Selected Skyr −13           | EXACT_10         |  20.0000 |      0.0000 |    10 | 12.0501 | 26.7432 | 48.6044 | 49.8218 | 55.3624 |  44.6376 | 5.5549 |    2.7361 |  0.8069 |
| Selected WPC60 −13          | EXACT_10         |  20.0000 |      0.0000 |    10 | 12.3873 | 27.2212 | 49.6755 | 49.7907 | 55.0099 |  44.9901 | 5.0252 |    9.4777 |  0.8035 |
| Selected MPC75 −13          | EXACT_10         |  20.0000 |      0.0000 |    10 | 12.7110 | 27.3425 | 50.5743 | 49.7647 | 55.0096 |  44.9904 | 5.0806 |    4.2540 |  0.7986 |
| Selected WPC80 −13          | EXACT_10         |  20.0000 |      0.0000 |    10 | 12.5218 | 28.4785 | 52.1125 | 49.7201 | 55.0074 |  44.9926 | 5.2446 |    4.1865 |  0.7939 |

Result: **15/17 = 88.2% EXACT_10** in the committed default-20 matrix.
The exact Owner recipe subset is **9/11 = 81.8% EXACT_10**; Chocolate and
Pistachio are safe misses, not hidden as 10/10.

## Exact 1000 g recipes

- Neutral −11: Cream 110; Protein Gel WPC 246.838; Water 505.163;
  Sucrose 80; Dextrose 56; Tara 2.
- Neutral −12: Cream 110; Protein Gel WPC 246.838; Water 472.962;
  Sucrose 68; Dextrose 100; Tara 2.201.
- Neutral −13: Milk 456.651; Cream 64.116; Protein Gel WPC 229.320;
  Water 93.806; Sucrose 51.182; Dextrose 103.147; Tara 1.778.
- Strawberry −13: Raspberry Main 100; Cream 110; Protein Gel WPC
  245.338; Water 376.815; Sucrose 64; Dextrose 102; Tara 1.847.
- Banana −13: Banana Main 100; Cream 110; Protein Gel WPC 245.462;
  Water 386.670; Sucrose 38; Dextrose 118; Tara 1.867.
- Vanilla −13: French Vanilla Main 5; Milk 455.221; Cream 63.008;
  Protein Gel WPC 229.411; Water 93.523; Sucrose 49.267; Dextrose
  102.789; Tara 1.781.
- Coffee −13: Roasted Ground Coffee Main 15; Cream 110; Protein Gel
  WPC 244.512; Water 468.796; Sucrose 38; Dextrose 122; Tara 1.691.
- Chocolate −13 safe miss: Cocoa Main 60; Milk 541.719; Cream 101.887;
  Protein Gel WPC 135.688; Sucrose 66.508; Dextrose 94.197.
- Pistachio −13 safe miss: Pistachio Main 100; Milk 612.194; Protein
  Gel WPC 146.271; Sucrose 36.912; Dextrose 104.622.
- Strawberry + Banana 1:1 −13: Raspberry Main 60; Banana Main 60;
  Cream 110; Protein Gel WPC 245.113; Water 365.033; Sucrose 40;
  Dextrose 118; Tara 1.855.
- Strawberry + Banana 2:1 −13: Raspberry Main 120; Banana Main 60;
  Cream 110; Protein Gel WPC 244.213; Water 311.851; Sucrose 14;
  Dextrose 138; Tara 1.937.
- Plant Rice −13: Raspberry Main 100; Coconut Oil 40; Rice Protein
  236.667; Water 453.351; Sucrose 48; Dextrose 120; Tara 1.982.
- Plant Pea −13: Raspberry Main 100; Oat Drink 341.872; Coconut Oil
  29.479; Pea Protein 241.655; Water 159.450; Sucrose 52.592;
  Dextrose 73.081; Tara 1.872.
- Selected Skyr −13: Raspberry Main 100; Skyr 405.844; Cream
  141.332; Protein Gel WPC 183.560; Water 22.228; Sucrose 36.731;
  Dextrose 108.343; Tara 1.961.
- Selected WPC60 −13: Raspberry Main 100; Cream 90; WPC60 327.883;
  Water 384.198; Sucrose 6; Dextrose 90; Tara 1.918.
- Selected MPC75 −13: Raspberry Main 100; Milk 277.821; Cream
  130.963; MPC75 248.826; Water 94.907; Sucrose 48.655; Dextrose
  96.970; Tara 1.858.
- Selected WPC80 −13: Raspberry Main 100; Cream 160; WPC80 243.900;
  Water 346.302; Sucrose 38; Dextrose 110; Tara 1.798.

Zero-gram formulation placeholders are omitted from this readable list but
remain visible in raw test output.

## Bounded 10–30% Strawberry sweep

The required targets were run at all three temperatures. FP is listed as
`N/C` because the Base Engine deliberately does not expose a freezing-point
metric. `Ice %` is the canonical frozen-water fraction.

| Temp | Target | Status           |  Actual | Score |     POD |     PAC |    NPAC |   Ice % | Water % | Solids % |  Fat % | Lactose % | Fibre % | Stabilizer g |
| ---- | -----: | ---------------- | ------: | ----: | ------: | ------: | ------: | ------: | ------: | -------: | -----: | --------: | ------: | -----------: |
| −11  |     10 | EXACT_10         | 10.0000 |    10 | 13.4573 | 20.7843 | 33.1773 | 54.3128 | 64.5949 |  35.4051 | 6.5590 |    2.7715 |  0.8571 |        2.589 |
| −11  |     15 | EXACT_10         | 15.0000 |    10 | 13.2589 | 20.4091 | 34.6205 | 52.7895 | 60.6400 |  39.3600 | 5.4217 |    2.8084 |  0.8571 |        2.589 |
| −11  |     20 | EXACT_10         | 20.0000 |    10 | 13.0740 | 19.0312 | 33.3562 | 54.1240 | 57.4402 |  42.5598 | 5.0474 |    1.1726 |  0.8571 |        2.589 |
| −11  |     22 | SAFE_TARGET_MISS | 17.7358 |     1 | 12.6810 | 19.2582 | 34.4866 | 52.9308 | 57.7999 |  42.2001 | 5.9088 |    3.2810 |  0.6500 |            0 |
| −11  |     25 | SAFE_TARGET_MISS | 17.7358 |     1 | 12.6810 | 19.2582 | 34.4866 | 52.9308 | 57.7999 |  42.2001 | 5.9088 |    3.2810 |  0.6500 |            0 |
| −11  |     30 | SAFE_TARGET_MISS | 17.7358 |     1 | 12.6810 | 19.2582 | 34.4866 | 52.9308 | 57.7999 |  42.2001 | 5.9088 |    3.2810 |  0.6500 |            0 |
| −12  |     10 | EXACT_10         | 10.0000 |    10 | 14.6451 | 25.4519 | 42.1759 | 50.3734 | 61.9030 |  38.0970 | 7.3379 |    2.7689 |  0.7993 |        1.867 |
| −12  |     15 | EXACT_10         | 15.0000 |    10 | 16.9786 | 27.5087 | 49.5088 | 50.3123 | 56.6748 |  43.3252 | 5.0752 |    2.6847 |  0.7993 |        1.867 |
| −12  |     20 | EXACT_10         | 20.0000 |    10 | 12.4651 | 27.8136 | 49.8900 | 50.3091 | 56.0077 |  43.9923 | 5.0474 |    1.1726 |  0.7993 |        1.867 |
| −12  |     22 | SAFE_TARGET_MISS | 18.3725 |     2 | 12.5957 | 23.6442 | 42.9819 | 50.3667 | 56.5217 |  43.4783 | 5.6438 |    3.2211 |  0.6500 |            0 |
| −12  |     25 | SAFE_TARGET_MISS | 18.3725 |     1 | 12.5957 | 23.6442 | 42.9819 | 50.3667 | 56.5217 |  43.4783 | 5.6438 |    3.2211 |  0.6500 |            0 |
| −12  |     30 | SAFE_TARGET_MISS | 18.3725 |     1 | 12.5957 | 23.6442 | 42.9819 | 50.3667 | 56.5217 |  43.4783 | 5.6438 |    3.2211 |  0.6500 |            0 |
| −13  |     10 | EXACT_10         | 10.0000 |    10 | 14.9089 | 28.7002 | 48.0316 | 49.8384 | 61.1018 |  38.8982 | 7.2321 |    2.7403 |  0.7978 |        1.847 |
| −13  |     15 | EXACT_10         | 15.0000 |    10 | 16.7524 | 29.8462 | 53.8995 | 49.6683 | 56.3841 |  43.6159 | 5.0365 |    2.6633 |  0.7978 |        1.847 |
| −13  |     20 | EXACT_10         | 20.0000 |    10 | 14.0950 | 26.6688 | 48.7214 | 49.8184 | 55.0014 |  44.9986 | 5.0474 |    1.1726 |  0.7978 |        1.847 |
| −13  |     22 | SAFE_TARGET_MISS | 17.2661 |     1 | 14.4920 | 28.0080 | 51.6080 | 49.7347 | 55.4993 |  44.5007 | 5.4803 |    3.1134 |  0.6500 |            0 |
| −13  |     25 | SAFE_TARGET_MISS | 17.2661 |     1 | 14.4920 | 28.0080 | 51.6080 | 49.7347 | 55.4993 |  44.5007 | 5.4803 |    3.1134 |  0.6500 |            0 |
| −13  |     30 | SAFE_TARGET_MISS | 17.2661 |     1 | 14.4920 | 28.0080 | 51.6080 | 49.7347 | 55.4993 |  44.5007 | 5.4803 |    3.1134 |  0.6500 |            0 |

The separate 1-percentage-point orchestration matrix proves 19%, 20% and 21%
are exact/native-safe at −11/−12/−13. Therefore the highest exact target in the
tested integer grid is **21%** at each temperature; 22% is a safe miss. This is
a tested bounded frontier, not a claim about every 0.1% value.

## Selected high-protein food proof

For the Strawberry + selected Skyr route, the final recipe retains **405.844 g
Skyr** and needs **183.560 g** Protein Gel WPC. With ordinary milk in the
comparison fixture, the starting protein is lower and the formulation requires
more WPC. The regression test asserts both facts and exact target reach; it
does not treat the two milks as nutritionally identical.

No verified, engine-approved high-protein dairy milk exists in the versioned
Mapper used by this branch. A local Mapper candidate remains
`approved_for_engines = FALSE`; it is reported as blocked, not activated.

## Safe miss and hard-invalid policy

Chocolate and Pistachio demonstrate safe target misses: Main remains exact,
native Engine bands pass, score is below 10, and ordinary Apply is withheld
until an explicit compromise-consent contract exists.

Hard-invalid candidates are never applicable. The test matrix invokes
`commitPreview` for a hard-invalid diagnostic and asserts rejection.

## Coverage still missing

The exhaustive cross product of all flavours × all sources × all six targets ×
all three temperatures is not complete. Sensory Direction Target combinations
are also not executable until their separate calibration/science gates are
approved. These are explicit blockers; they are not represented as passing
calibration.
