# Crown / Multi-Main stress summary — baseline

Baseline/phase SHA: read from git closeout

## Totals

| Profile | Runs | PASS | Non-PASS |
|---|---:|---:|---:|
| Gelato | 0 | 0 | 0 |
| Sorbet | 0 | 0 | 0 |
| Vegan | 0 | 0 | 0 |
| Protein | 55 | 24 | 31 |

## Classification

| Class | Count |
|---|---:|
| AUTHORITY_BLOCKED | 8 |
| HONEST_IMPOSSIBLE | 23 |
| PASS | 24 |

## Extremes

- Worst ratio-share drift: 0.00393314 (PROTEIN-4C-04).
- Largest non-Main formulation drift: 714 g (PROTEIN-1C-02).
- Slowest Preview: 34855 ms (PROTEIN-2C-03).

## Non-PASS by Crown count

| Crown count | Count |
|---|---:|
| 1 | 5 |
| 2 | 5 |
| 3 | 11 |
| 4 | 6 |
| 5 | 4 |

## Non-PASS by temperature

| Temperature | Count |
|---|---:|
| -11 | 9 |
| -12 | 9 |
| -13 | 7 |
| Fresh | 6 |

## Non-PASS by sweetness/hardness

| Pair | Count |
|---|---:|
| -1/-1 | 1 |
| -1/-2 | 1 |
| -1/1 | 1 |
| -2/0 | 5 |
| -2/2 | 4 |
| 0/0 | 3 |
| 0/1 | 1 |
| 1/-1 | 2 |
| 2/-1 | 1 |
| 2/-2 | 8 |
| 2/0 | 1 |
| 2/2 | 3 |

## Non-PASS by family

| Family | Count |
|---|---:|
| chocolate_cocoa|vanilla|nut | 1 |
| fruit | 4 |
| fruit|chocolate_cocoa | 1 |
| fruit|chocolate_cocoa|fruit | 1 |
| fruit|chocolate_cocoa|fruit|nut | 1 |
| fruit|chocolate_cocoa|fruit|nut|vanilla | 1 |
| fruit|coffee|fruit|nut|vanilla | 1 |
| fruit|fruit | 4 |
| fruit|fruit|fruit | 9 |
| fruit|fruit|fruit|fruit | 3 |
| fruit|fruit|fruit|fruit|fruit | 2 |
| fruit|fruit|vanilla|nut | 1 |
| vanilla | 1 |
| vanilla|fruit|fruit|fruit | 1 |

## Exact non-PASS runs

- PROTEIN-1C-02: HONEST_IMPOSSIBLE; input 2 g → output 534 g; ok.
- PROTEIN-1C-03: AUTHORITY_BLOCKED; input 5 g → output 5 g; product_behavior_invalid.
- PROTEIN-1C-04: AUTHORITY_BLOCKED; input 10 g → output 10 g; product_behavior_invalid.
- PROTEIN-1C-06: HONEST_IMPOSSIBLE; input 50 g → output 50 g; product_behavior_invalid.
- PROTEIN-1C-09: HONEST_IMPOSSIBLE; input 10 g → output 122 g; ok.
- PROTEIN-2C-03: AUTHORITY_BLOCKED; input 1|200 g → output none g; unsafe_proposal.
- PROTEIN-2C-04: AUTHORITY_BLOCKED; input 200|1 g → output 200|1 g; product_behavior_invalid.
- PROTEIN-2C-05: HONEST_IMPOSSIBLE; input 10|50 g → output 10|50 g; product_behavior_invalid.
- PROTEIN-2C-07: HONEST_IMPOSSIBLE; input 400|600 g → output 308|462 g; product_behavior_invalid.
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
- PROTEIN-SESSION-03: HONEST_IMPOSSIBLE; input 104|209|313 g → output 105|210|315 g; ok.
- PROTEIN-SESSION-04: HONEST_IMPOSSIBLE; input 105|210|315 g → output none g; impossible_under_constraints.
- PROTEIN-SESSION-05: HONEST_IMPOSSIBLE; input 105|210|315 g → output 174|349|523 g; ok.
