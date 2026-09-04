# Crown / Multi-Main stress summary — final

Baseline/phase SHA: read from git closeout

## Totals

| Profile | Runs | PASS | Non-PASS |
|---|---:|---:|---:|
| Gelato | 55 | 21 | 34 |
| Sorbet | 55 | 20 | 35 |
| Vegan | 55 | 28 | 27 |
| Protein | 55 | 24 | 31 |

## Classification

| Class | Count |
|---|---:|
| AUTHORITY_BLOCKED | 33 |
| HONEST_IMPOSSIBLE | 94 |
| PASS | 93 |

## Extremes

- Worst ratio-share drift: 0.15621716 (VEGAN-2C-06).
- Largest non-Main formulation drift: 842 g (PROTEIN-5C-10).
- Slowest Preview: 440788 ms (SORBET-3C-03).

## Non-PASS by Crown count

| Crown count | Count |
|---|---:|
| 1 | 21 |
| 2 | 21 |
| 3 | 43 |
| 4 | 23 |
| 5 | 19 |

## Non-PASS by temperature

| Temperature | Count |
|---|---:|
| -11 | 40 |
| -12 | 27 |
| -13 | 32 |
| Fresh | 28 |

## Non-PASS by sweetness/hardness

| Pair | Count |
|---|---:|
| -1/-1 | 1 |
| -1/-2 | 3 |
| -1/1 | 9 |
| -1/2 | 1 |
| -2/-1 | 1 |
| -2/0 | 19 |
| -2/1 | 1 |
| -2/2 | 7 |
| 0/0 | 15 |
| 0/1 | 3 |
| 1/-1 | 17 |
| 1/-2 | 1 |
| 1/2 | 1 |
| 2/-1 | 1 |
| 2/-2 | 29 |
| 2/0 | 3 |
| 2/2 | 15 |

## Non-PASS by family

| Family | Count |
|---|---:|
| alcohol | 1 |
| chocolate_cocoa|fruit|nut|coffee|fruit | 1 |
| chocolate_cocoa|vanilla|nut | 1 |
| coffee|chocolate_cocoa|fruit|nut | 1 |
| coffee|fruit|fruit | 1 |
| coffee|vanilla|fruit|fruit|nut | 1 |
| fruit | 19 |
| fruit|chocolate_cocoa | 1 |
| fruit|chocolate_cocoa|fruit | 1 |
| fruit|chocolate_cocoa|fruit|nut | 1 |
| fruit|chocolate_cocoa|fruit|nut|vanilla | 1 |
| fruit|coffee|fruit|nut|vanilla | 1 |
| fruit|fruit | 16 |
| fruit|fruit|alcohol | 1 |
| fruit|fruit|fruit | 36 |
| fruit|fruit|fruit|coffee|vanilla | 1 |
| fruit|fruit|fruit|fruit | 16 |
| fruit|fruit|fruit|fruit|fruit | 12 |
| fruit|fruit|vanilla|nut | 1 |
| fruit|nut | 2 |
| fruit|nut|fruit | 2 |
| fruit|nut|fruit|chocolate_cocoa | 1 |
| fruit|nut|fruit|nut | 1 |
| fruit|nut|fruit|nut|fruit | 1 |
| fruit|vanilla|fruit | 1 |
| nut|fruit | 1 |
| nut|fruit|fruit|fruit|fruit | 1 |
| vanilla | 1 |
| vanilla|fruit | 1 |
| vanilla|fruit|fruit|fruit | 1 |
| vanilla|fruit|nut|chocolate_cocoa | 1 |

## Exact non-PASS runs

- GELATO-1C-03: AUTHORITY_BLOCKED; input 5 g → output 5 g; product_behavior_invalid.
- GELATO-1C-04: AUTHORITY_BLOCKED; input 10 g → output none g; already_clean.
- GELATO-1C-06: HONEST_IMPOSSIBLE; input 20 g → output none g; impossible_under_constraints.
- GELATO-1C-07: HONEST_IMPOSSIBLE; input 100 g → output 150 g; ok.
- GELATO-1C-08: HONEST_IMPOSSIBLE; input 150 g → output none g; rescale_locked_sum.
- GELATO-2C-03: AUTHORITY_BLOCKED; input 1|200 g → output none g; no_proposal.
- GELATO-2C-04: AUTHORITY_BLOCKED; input 200|1 g → output 200|1 g; product_behavior_invalid.
- GELATO-2C-05: HONEST_IMPOSSIBLE; input 10|50 g → output 10|50 g; product_behavior_invalid.
- GELATO-2C-07: HONEST_IMPOSSIBLE; input 400|600 g → output 80|120 g; product_behavior_invalid.
- GELATO-2C-08: HONEST_IMPOSSIBLE; input 600|600 g → output none g; no_proposal.
- GELATO-2C-09: HONEST_IMPOSSIBLE; input 1|300 g → output none g; no_proposal.
- GELATO-3C-03: AUTHORITY_BLOCKED; input 300|200|100 g → output none g; no_proposal.
- GELATO-3C-04: AUTHORITY_BLOCKED; input 1|2|5 g → output 1|2|5 g; product_behavior_invalid.
- GELATO-3C-05: HONEST_IMPOSSIBLE; input 600|1|2 g → output none g; no_proposal.
- GELATO-3C-07: HONEST_IMPOSSIBLE; input 150|150|150 g → output 57|56|56 g; product_behavior_invalid.
- GELATO-3C-08: HONEST_IMPOSSIBLE; input 400|10|1 g → output none g; rescale_locked_sum.
- GELATO-3C-09: HONEST_IMPOSSIBLE; input 400|5|200 g → output none g; no_proposal.
- GELATO-4C-03: AUTHORITY_BLOCKED; input 400|300|200|100 g → output none g; no_proposal.
- GELATO-4C-04: AUTHORITY_BLOCKED; input 1|2|5|10 g → output 1|2|5|10 g; product_behavior_invalid.
- GELATO-4C-05: HONEST_IMPOSSIBLE; input 600|1|2|5 g → output none g; no_proposal.
- GELATO-4C-07: HONEST_IMPOSSIBLE; input 150|150|150|150 g → output 175|175|175|175 g; product_behavior_invalid.
- GELATO-4C-08: HONEST_IMPOSSIBLE; input 400|100|25|5 g → output none g; rescale_locked_sum.
- GELATO-5C-03: AUTHORITY_BLOCKED; input 400|300|200|150|100 g → output none g; no_proposal.
- GELATO-5C-04: AUTHORITY_BLOCKED; input 1|2|5|10|25 g → output 1|2|5|10|25 g; product_behavior_invalid.
- GELATO-5C-05: HONEST_IMPOSSIBLE; input 600|1|2|5|10 g → output none g; rescale_locked_sum.
- GELATO-5C-07: HONEST_IMPOSSIBLE; input 150|150|150|150|150 g → output 115.38461538461537|115.38461538461537|115.38461538461537|115.38461538461537|115.38461538461537 g; product_behavior_invalid.
- GELATO-5C-08: HONEST_IMPOSSIBLE; input 400|100|25|5|1 g → output none g; rescale_locked_sum.
- GELATO-5C-09: HONEST_IMPOSSIBLE; input 2|400|100|25|2 g → output none g; no_proposal.
- GELATO-5C-10: HONEST_IMPOSSIBLE; input 150|2|2|150|1 g → output none g; no_proposal.
- GELATO-SESSION-01: HONEST_IMPOSSIBLE; input 100|200|300 g → output none g; rescale_locked_sum.
- GELATO-SESSION-02: HONEST_IMPOSSIBLE; input 100|200|300 g → output none g; rescale_locked_sum.
- GELATO-SESSION-03: HONEST_IMPOSSIBLE; input 100|200|300 g → output none g; rescale_locked_sum.
- GELATO-SESSION-04: HONEST_IMPOSSIBLE; input 100|200|300 g → output none g; rescale_locked_sum.
- GELATO-SESSION-05: HONEST_IMPOSSIBLE; input 100|200|300 g → output none g; rescale_invalid.
- SORBET-1C-03: AUTHORITY_BLOCKED; input 5 g → output 14 g; product_behavior_invalid.
- SORBET-1C-04: AUTHORITY_BLOCKED; input 10 g → output 27 g; product_behavior_invalid.
- SORBET-1C-05: HONEST_IMPOSSIBLE; input 25 g → output 25 g; product_behavior_invalid.
- SORBET-1C-06: HONEST_IMPOSSIBLE; input 50 g → output 50 g; product_behavior_invalid.
- SORBET-1C-07: HONEST_IMPOSSIBLE; input 100 g → output none g; rescale_invalid.
- SORBET-1C-08: HONEST_IMPOSSIBLE; input 150 g → output 150 g; product_behavior_invalid.
- SORBET-2C-03: AUTHORITY_BLOCKED; input 1|200 g → output none g; unsafe_proposal.
- SORBET-2C-04: AUTHORITY_BLOCKED; input 200|1 g → output none g; unsafe_proposal.
- SORBET-2C-05: HONEST_IMPOSSIBLE; input 10|50 g → output 10|50 g; product_behavior_invalid.
- SORBET-2C-06: HONEST_IMPOSSIBLE; input 25|100 g → output 25|100 g; product_behavior_invalid.
- SORBET-2C-07: HONEST_IMPOSSIBLE; input 400|600 g → output 150|225 g; product_behavior_invalid.
- SORBET-3C-02: HONEST_IMPOSSIBLE; input 100|200|300 g → output none g; unsafe_proposal.
- SORBET-3C-03: AUTHORITY_BLOCKED; input 300|200|100 g → output none g; unsafe_proposal.
- SORBET-3C-04: AUTHORITY_BLOCKED; input 1|2|5 g → output none g; unsafe_proposal.
- SORBET-3C-05: HONEST_IMPOSSIBLE; input 600|1|2 g → output none g; no_proposal.
- SORBET-3C-06: HONEST_IMPOSSIBLE; input 25|50|100 g → output 25|50|100 g; product_behavior_invalid.
- SORBET-3C-07: HONEST_IMPOSSIBLE; input 150|150|150 g → output 290|289|289 g; product_behavior_invalid.
- SORBET-3C-08: HONEST_IMPOSSIBLE; input 400|10|1 g → output 400|10|1 g; product_behavior_invalid.
- SORBET-3C-10: HONEST_IMPOSSIBLE; input 1|5|2 g → output 67|335|134 g; ok.
- SORBET-4C-03: AUTHORITY_BLOCKED; input 400|300|200|100 g → output none g; no_proposal.
- SORBET-4C-04: AUTHORITY_BLOCKED; input 1|2|5|10 g → output none g; unsafe_proposal.
- SORBET-4C-05: HONEST_IMPOSSIBLE; input 600|1|2|5 g → output none g; no_proposal.
- SORBET-4C-06: HONEST_IMPOSSIBLE; input 25|50|100|150 g → output 25|50|100|150 g; ok.
- SORBET-4C-07: HONEST_IMPOSSIBLE; input 150|150|150|150 g → output 116|116|115|115 g; ok.
- SORBET-4C-08: HONEST_IMPOSSIBLE; input 400|100|25|5 g → output 400|100|25|5 g; ok.
- SORBET-4C-10: HONEST_IMPOSSIBLE; input 5|600|400|50 g → output 2|236|157|20 g; ok.
- SORBET-5C-02: HONEST_IMPOSSIBLE; input 100|150|200|300|400 g → output 30|44|59|89|118 g; ok.
- SORBET-5C-06: HONEST_IMPOSSIBLE; input 25|50|100|150|200 g → output 25|50|100|150|200 g; ok.
- SORBET-5C-07: HONEST_IMPOSSIBLE; input 150|150|150|150|150 g → output 225|225|225|225|225 g; ok.
- SORBET-5C-08: HONEST_IMPOSSIBLE; input 400|100|25|5|1 g → output 400|100|25|5|1 g; ok.
- SORBET-SESSION-01: HONEST_IMPOSSIBLE; input 100|200|300 g → output none g; no_proposal.
- SORBET-SESSION-02: HONEST_IMPOSSIBLE; input 100|200|300 g → output none g; no_proposal.
- SORBET-SESSION-03: HONEST_IMPOSSIBLE; input 100|200|300 g → output none g; no_proposal.
- SORBET-SESSION-04: HONEST_IMPOSSIBLE; input 100|200|300 g → output none g; no_proposal.
- SORBET-SESSION-05: HONEST_IMPOSSIBLE; input 100|200|300 g → output 159|318|476 g; product_behavior_invalid.
- VEGAN-1C-03: AUTHORITY_BLOCKED; input 5 g → output 5 g; product_behavior_invalid.
- VEGAN-1C-04: AUTHORITY_BLOCKED; input 10 g → output 10 g; product_behavior_invalid.
- VEGAN-1C-06: HONEST_IMPOSSIBLE; input 50 g → output none g; impossible_under_constraints.
- VEGAN-1C-07: HONEST_IMPOSSIBLE; input 100 g → output 38 g; product_behavior_invalid.
- VEGAN-1C-08: HONEST_IMPOSSIBLE; input 150 g → output 150 g; product_behavior_invalid.
- VEGAN-2C-03: AUTHORITY_BLOCKED; input 1|200 g → output none g; unsupported_profile.
- VEGAN-2C-04: AUTHORITY_BLOCKED; input 200|1 g → output none g; unsafe_proposal.
- VEGAN-2C-07: HONEST_IMPOSSIBLE; input 400|600 g → output 329|494 g; ok.
- VEGAN-2C-08: HONEST_IMPOSSIBLE; input 600|600 g → output none g; no_proposal.
- VEGAN-2C-10: HONEST_IMPOSSIBLE; input 1|25 g → output none g; unsupported_profile.
- VEGAN-3C-03: AUTHORITY_BLOCKED; input 300|200|100 g → output none g; no_proposal.
- VEGAN-3C-04: AUTHORITY_BLOCKED; input 1|2|5 g → output none g; unsafe_proposal.
- VEGAN-3C-05: HONEST_IMPOSSIBLE; input 600|1|2 g → output none g; main_ratio_conflict.
- VEGAN-3C-07: HONEST_IMPOSSIBLE; input 150|150|150 g → output 116|115|115 g; ok.
- VEGAN-3C-08: HONEST_IMPOSSIBLE; input 400|10|1 g → output none g; impossible_under_constraints.
- VEGAN-3C-10: HONEST_IMPOSSIBLE; input 25|10|25 g → output none g; unsupported_profile.
- VEGAN-4C-03: AUTHORITY_BLOCKED; input 400|300|200|100 g → output none g; no_proposal.
- VEGAN-4C-05: HONEST_IMPOSSIBLE; input 600|1|2|5 g → output none g; no_proposal.
- VEGAN-4C-07: HONEST_IMPOSSIBLE; input 150|150|150|150 g → output 225|225|225|225 g; ok.
- VEGAN-4C-09: HONEST_IMPOSSIBLE; input 400|400|5|300 g → output 103|103|1|78 g; ok.
- VEGAN-4C-10: HONEST_IMPOSSIBLE; input 200|300|100|25 g → output none g; unsupported_profile.
- VEGAN-5C-07: HONEST_IMPOSSIBLE; input 150|150|150|150|150 g → output none g; rescale_invalid.
- VEGAN-5C-08: HONEST_IMPOSSIBLE; input 400|100|25|5|1 g → output none g; no_proposal.
- VEGAN-5C-09: HONEST_IMPOSSIBLE; input 150|2|150|1|25 g → output none g; unsupported_profile.
- VEGAN-5C-10: HONEST_IMPOSSIBLE; input 300|100|10|100|400 g → output none g; unsupported_profile.
- VEGAN-SESSION-03: HONEST_IMPOSSIBLE; input 60|119|178 g → output none g; no_proposal.
- VEGAN-SESSION-05: HONEST_IMPOSSIBLE; input 51|102|154 g → output none g; main_ratio_conflict.
- PROTEIN-1C-02: HONEST_IMPOSSIBLE; input 2 g → output 534 g; ok.
- PROTEIN-1C-03: AUTHORITY_BLOCKED; input 5 g → output 5 g; product_behavior_invalid.
- PROTEIN-1C-04: AUTHORITY_BLOCKED; input 10 g → output 10 g; product_behavior_invalid.
- PROTEIN-1C-06: HONEST_IMPOSSIBLE; input 50 g → output 50 g; product_behavior_invalid.
- PROTEIN-1C-09: HONEST_IMPOSSIBLE; input 10 g → output 122 g; ok.
- PROTEIN-2C-03: AUTHORITY_BLOCKED; input 1|200 g → output none g; unsafe_proposal.
- PROTEIN-2C-04: AUTHORITY_BLOCKED; input 200|1 g → output 200|1 g; product_behavior_invalid.
- PROTEIN-2C-05: HONEST_IMPOSSIBLE; input 10|50 g → output 10|50 g; product_behavior_invalid.
- PROTEIN-2C-07: HONEST_IMPOSSIBLE; input 400|600 g → output 308|461 g; product_behavior_invalid.
- PROTEIN-2C-08: HONEST_IMPOSSIBLE; input 600|600 g → output none g; rescale_locked_sum.
- PROTEIN-3C-02: HONEST_IMPOSSIBLE; input 100|200|300 g → output none g; main_ratio_conflict.
- PROTEIN-3C-03: AUTHORITY_BLOCKED; input 300|200|100 g → output none g; main_ratio_conflict.
- PROTEIN-3C-04: AUTHORITY_BLOCKED; input 1|2|5 g → output 1|2|5 g; product_behavior_invalid.
- PROTEIN-3C-05: HONEST_IMPOSSIBLE; input 600|1|2 g → output none g; rescale_locked_sum.
- PROTEIN-3C-08: HONEST_IMPOSSIBLE; input 400|10|1 g → output 400|10|1 g; ok.
- PROTEIN-3C-10: HONEST_IMPOSSIBLE; input 300|50|200 g → output none g; main_ratio_conflict.
- PROTEIN-4C-02: HONEST_IMPOSSIBLE; input 100|200|300|400 g → output none g; main_ratio_conflict.
- PROTEIN-4C-03: AUTHORITY_BLOCKED; input 400|300|200|100 g → output none g; main_ratio_conflict.
- PROTEIN-4C-07: HONEST_IMPOSSIBLE; input 150|150|150|150 g → output 59.99999999999999|59.99999999999999|59.99999999999999|59.99999999999999 g; ok.
- PROTEIN-4C-08: HONEST_IMPOSSIBLE; input 400|100|25|5 g → output none g; main_ratio_conflict.
- PROTEIN-4C-09: HONEST_IMPOSSIBLE; input 5|300|200|5 g → output none g; main_ratio_conflict.
- PROTEIN-4C-10: HONEST_IMPOSSIBLE; input 600|2|300|1 g → output none g; unsafe_proposal.
- PROTEIN-5C-02: HONEST_IMPOSSIBLE; input 100|150|200|300|400 g → output none g; main_ratio_conflict.
- PROTEIN-5C-03: AUTHORITY_BLOCKED; input 400|300|200|150|100 g → output none g; main_ratio_conflict.
- PROTEIN-5C-08: HONEST_IMPOSSIBLE; input 400|100|25|5|1 g → output none g; main_ratio_conflict.
- PROTEIN-5C-09: HONEST_IMPOSSIBLE; input 1|300|1|25|10 g → output 1|300|1|25|10 g; ok.
- PROTEIN-SESSION-01: HONEST_IMPOSSIBLE; input 100|200|300 g → output 103|206|309 g; ok.
- PROTEIN-SESSION-02: HONEST_IMPOSSIBLE; input 103|206|309 g → output 104|209|313 g; ok.
- PROTEIN-SESSION-03: HONEST_IMPOSSIBLE; input 104|209|313 g → output 104|209|313 g; ok.
- PROTEIN-SESSION-04: HONEST_IMPOSSIBLE; input 104|209|313 g → output none g; impossible_under_constraints.
- PROTEIN-SESSION-05: HONEST_IMPOSSIBLE; input 104|209|313 g → output none g; main_ratio_conflict.
