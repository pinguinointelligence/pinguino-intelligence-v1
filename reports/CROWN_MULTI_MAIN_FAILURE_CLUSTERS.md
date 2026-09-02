# Crown / Multi-Main failure clusters — final

Ranking order: frequency, severity, shared systemic cause, regression risk.

## 1. Protein coupled frontier (19)

Classifications: HONEST_IMPOSSIBLE, AUTHORITY_BLOCKED.

Run IDs: PROTEIN-1C-02, PROTEIN-1C-03, PROTEIN-1C-04, PROTEIN-1C-06, PROTEIN-1C-09, PROTEIN-2C-03, PROTEIN-2C-04, PROTEIN-2C-05, PROTEIN-2C-08, PROTEIN-3C-04, PROTEIN-3C-05, PROTEIN-3C-08, PROTEIN-4C-10, PROTEIN-5C-09, PROTEIN-SESSION-01, PROTEIN-SESSION-02, PROTEIN-SESSION-03, PROTEIN-SESSION-04, PROTEIN-SESSION-05.

- PROTEIN-1C-02: 2 g → 534 g; ok
- PROTEIN-1C-03: 5 g → 5 g; product_behavior_invalid
- PROTEIN-1C-04: 10 g → 10 g; product_behavior_invalid
- PROTEIN-1C-06: 50 g → 50 g; product_behavior_invalid
- PROTEIN-1C-09: 10 g → 122 g; ok
- PROTEIN-2C-03: 1|200 g → none g; unsafe_proposal
- PROTEIN-2C-04: 200|1 g → 200|1 g; product_behavior_invalid
- PROTEIN-2C-05: 10|50 g → 10|50 g; product_behavior_invalid
- PROTEIN-2C-08: 600|600 g → none g; rescale_locked_sum
- PROTEIN-3C-04: 1|2|5 g → 1|2|5 g; product_behavior_invalid
- PROTEIN-3C-05: 600|1|2 g → none g; rescale_locked_sum
- PROTEIN-3C-08: 400|10|1 g → 400|10|1 g; ok
- PROTEIN-4C-10: 600|2|300|1 g → none g; unsafe_proposal
- PROTEIN-5C-09: 1|300|1|25|10 g → 1|300|1|25|10 g; ok
- PROTEIN-SESSION-01: 100|200|300 g → 103|206|309 g; ok
- PROTEIN-SESSION-02: 103|206|309 g → 104|209|313 g; ok
- PROTEIN-SESSION-03: 104|209|313 g → 105|210|315 g; ok
- PROTEIN-SESSION-04: 105|210|315 g → none g; impossible_under_constraints
- PROTEIN-SESSION-05: 105|210|315 g → 174|349|523 g; ok

## 2. Batch reduction or expansion (17)

Classifications: HONEST_IMPOSSIBLE.

Run IDs: GELATO-1C-07, GELATO-2C-07, GELATO-3C-07, GELATO-4C-07, GELATO-5C-07, SORBET-1C-07, SORBET-2C-07, SORBET-3C-07, SORBET-4C-07, SORBET-5C-07, VEGAN-1C-07, VEGAN-2C-07, VEGAN-3C-07, VEGAN-4C-07, VEGAN-5C-07, PROTEIN-2C-07, PROTEIN-4C-07.

- GELATO-1C-07: 100 g → 150 g; ok
- GELATO-2C-07: 400|600 g → 80|120 g; product_behavior_invalid
- GELATO-3C-07: 150|150|150 g → 56|56|56 g; product_behavior_invalid
- GELATO-4C-07: 150|150|150|150 g → 175|175|175|175 g; product_behavior_invalid
- GELATO-5C-07: 150|150|150|150|150 g → 115.38461538461537|115.38461538461537|115.38461538461537|115.38461538461537|115.38461538461537 g; product_behavior_invalid
- SORBET-1C-07: 100 g → none g; rescale_invalid
- SORBET-2C-07: 400|600 g → 150|225 g; product_behavior_invalid
- SORBET-3C-07: 150|150|150 g → 289|289|289 g; product_behavior_invalid
- SORBET-4C-07: 150|150|150|150 g → 115|115|115|115 g; ok
- SORBET-5C-07: 150|150|150|150|150 g → 225|225|225|225|225 g; ok
- VEGAN-1C-07: 100 g → 38 g; product_behavior_invalid
- VEGAN-2C-07: 400|600 g → 329|494 g; ok
- VEGAN-3C-07: 150|150|150 g → 115|115|115 g; ok
- VEGAN-4C-07: 150|150|150|150 g → 225|225|225|225 g; ok
- VEGAN-5C-07: 150|150|150|150|150 g → none g; rescale_invalid
- PROTEIN-2C-07: 400|600 g → 308|462 g; product_behavior_invalid
- PROTEIN-4C-07: 150|150|150|150 g → 59.99999999999999|59.99999999999999|59.99999999999999|59.99999999999999 g; ok

## 3. 5-Crown scaling (12)

Classifications: AUTHORITY_BLOCKED, HONEST_IMPOSSIBLE.

Run IDs: GELATO-5C-03, GELATO-5C-04, GELATO-5C-05, GELATO-5C-08, GELATO-5C-09, GELATO-5C-10, SORBET-5C-02, SORBET-5C-06, SORBET-5C-08, VEGAN-5C-08, VEGAN-5C-09, VEGAN-5C-10.

- GELATO-5C-03: 400|300|200|150|100 g → none g; no_proposal
- GELATO-5C-04: 1|2|5|10|25 g → 1|2|5|10|25 g; product_behavior_invalid
- GELATO-5C-05: 600|1|2|5|10 g → none g; rescale_locked_sum
- GELATO-5C-08: 400|100|25|5|1 g → none g; rescale_locked_sum
- GELATO-5C-09: 2|400|100|25|2 g → none g; no_proposal
- GELATO-5C-10: 150|2|2|150|1 g → none g; no_proposal
- SORBET-5C-02: 100|150|200|300|400 g → 30|44|59|89|118 g; ok
- SORBET-5C-06: 25|50|100|150|200 g → 25|50|100|150|200 g; ok
- SORBET-5C-08: 400|100|25|5|1 g → 400|100|25|5|1 g; ok
- VEGAN-5C-08: 400|100|25|5|1 g → none g; no_proposal
- VEGAN-5C-09: 150|2|150|1|25 g → none g; unsupported_profile
- VEGAN-5C-10: 300|100|10|100|400 g → none g; unsupported_profile

## 4. Main ratio / constraint conflict (12)

Classifications: HONEST_IMPOSSIBLE, AUTHORITY_BLOCKED.

Run IDs: VEGAN-3C-05, VEGAN-SESSION-05, PROTEIN-3C-02, PROTEIN-3C-03, PROTEIN-3C-10, PROTEIN-4C-02, PROTEIN-4C-03, PROTEIN-4C-08, PROTEIN-4C-09, PROTEIN-5C-02, PROTEIN-5C-03, PROTEIN-5C-08.

- VEGAN-3C-05: 600|1|2 g → none g; main_ratio_conflict
- VEGAN-SESSION-05: 52|103|154 g → none g; main_ratio_conflict
- PROTEIN-3C-02: 100|200|300 g → none g; main_ratio_conflict
- PROTEIN-3C-03: 300|200|100 g → none g; main_ratio_conflict
- PROTEIN-3C-10: 300|50|200 g → none g; main_ratio_conflict
- PROTEIN-4C-02: 100|200|300|400 g → none g; main_ratio_conflict
- PROTEIN-4C-03: 400|300|200|100 g → none g; main_ratio_conflict
- PROTEIN-4C-08: 400|100|25|5 g → none g; main_ratio_conflict
- PROTEIN-4C-09: 5|300|200|5 g → none g; main_ratio_conflict
- PROTEIN-5C-02: 100|150|200|300|400 g → none g; main_ratio_conflict
- PROTEIN-5C-03: 400|300|200|150|100 g → none g; main_ratio_conflict
- PROTEIN-5C-08: 400|100|25|5|1 g → none g; main_ratio_conflict

## 5. HONEST_IMPOSSIBLE: product_behavior_invalid (9)

Classifications: HONEST_IMPOSSIBLE.

Run IDs: GELATO-2C-05, SORBET-1C-05, SORBET-1C-08, SORBET-2C-05, SORBET-2C-06, SORBET-3C-06, SORBET-3C-08, SORBET-SESSION-05, VEGAN-1C-08.

- GELATO-2C-05: 10|50 g → 10|50 g; product_behavior_invalid
- SORBET-1C-05: 25 g → 25 g; product_behavior_invalid
- SORBET-1C-08: 150 g → 150 g; product_behavior_invalid
- SORBET-2C-05: 10|50 g → 10|50 g; product_behavior_invalid
- SORBET-2C-06: 25|100 g → 25|100 g; product_behavior_invalid
- SORBET-3C-06: 25|50|100 g → 25|50|100 g; product_behavior_invalid
- SORBET-3C-08: 400|10|1 g → 400|10|1 g; product_behavior_invalid
- SORBET-SESSION-05: 100|200|300 g → 162|323|485 g; product_behavior_invalid
- VEGAN-1C-08: 150 g → 150 g; product_behavior_invalid

## 6. AUTHORITY_BLOCKED: unsafe_proposal (9)

Classifications: AUTHORITY_BLOCKED.

Run IDs: SORBET-1C-03, SORBET-1C-04, SORBET-2C-03, SORBET-2C-04, SORBET-3C-03, SORBET-3C-04, SORBET-4C-04, VEGAN-2C-04, VEGAN-3C-04.

- SORBET-1C-03: 5 g → none g; unsafe_proposal
- SORBET-1C-04: 10 g → none g; unsafe_proposal
- SORBET-2C-03: 1|200 g → none g; unsafe_proposal
- SORBET-2C-04: 200|1 g → none g; unsafe_proposal
- SORBET-3C-03: 300|200|100 g → none g; unsafe_proposal
- SORBET-3C-04: 1|2|5 g → none g; unsafe_proposal
- SORBET-4C-04: 1|2|5|10 g → none g; unsafe_proposal
- VEGAN-2C-04: 200|1 g → none g; unsafe_proposal
- VEGAN-3C-04: 1|2|5 g → none g; unsafe_proposal

## 7. HONEST_IMPOSSIBLE: ok (9)

Classifications: HONEST_IMPOSSIBLE.

Run IDs: SORBET-3C-10, SORBET-4C-06, SORBET-4C-08, SORBET-4C-10, SORBET-SESSION-01, SORBET-SESSION-02, SORBET-SESSION-03, SORBET-SESSION-04, VEGAN-4C-09.

- SORBET-3C-10: 1|5|2 g → 67|335|134 g; ok
- SORBET-4C-06: 25|50|100|150 g → 25|50|100|150 g; ok
- SORBET-4C-08: 400|100|25|5 g → 400|100|25|5 g; ok
- SORBET-4C-10: 5|600|400|50 g → 2|236|157|20 g; ok
- SORBET-SESSION-01: 100|200|300 g → 100|200|300 g; ok
- SORBET-SESSION-02: 100|200|300 g → 100|200|300 g; ok
- SORBET-SESSION-03: 100|200|300 g → 100|200|300 g; ok
- SORBET-SESSION-04: 100|200|300 g → 100|200|300 g; ok
- VEGAN-4C-09: 400|400|5|300 g → 110|110|1|83 g; ok

## 8. HONEST_IMPOSSIBLE: no_proposal (8)

Classifications: HONEST_IMPOSSIBLE.

Run IDs: GELATO-2C-08, GELATO-2C-09, GELATO-3C-05, GELATO-3C-09, GELATO-4C-05, SORBET-3C-05, SORBET-4C-05, VEGAN-2C-08.

- GELATO-2C-08: 600|600 g → none g; no_proposal
- GELATO-2C-09: 1|300 g → none g; no_proposal
- GELATO-3C-05: 600|1|2 g → none g; no_proposal
- GELATO-3C-09: 400|5|200 g → none g; no_proposal
- GELATO-4C-05: 600|1|2|5 g → none g; no_proposal
- SORBET-3C-05: 600|1|2 g → none g; no_proposal
- SORBET-4C-05: 600|1|2|5 g → none g; no_proposal
- VEGAN-2C-08: 600|600 g → none g; no_proposal

## 9. HONEST_IMPOSSIBLE: rescale_locked_sum (7)

Classifications: HONEST_IMPOSSIBLE.

Run IDs: GELATO-1C-08, GELATO-3C-08, GELATO-4C-08, GELATO-SESSION-01, GELATO-SESSION-02, GELATO-SESSION-03, GELATO-SESSION-04.

- GELATO-1C-08: 150 g → none g; rescale_locked_sum
- GELATO-3C-08: 400|10|1 g → none g; rescale_locked_sum
- GELATO-4C-08: 400|100|25|5 g → none g; rescale_locked_sum
- GELATO-SESSION-01: 100|200|300 g → none g; rescale_locked_sum
- GELATO-SESSION-02: 100|200|300 g → none g; rescale_locked_sum
- GELATO-SESSION-03: 100|200|300 g → none g; rescale_locked_sum
- GELATO-SESSION-04: 100|200|300 g → none g; rescale_locked_sum

## 10. AUTHORITY_BLOCKED: product_behavior_invalid (6)

Classifications: AUTHORITY_BLOCKED.

Run IDs: GELATO-1C-03, GELATO-2C-04, GELATO-3C-04, GELATO-4C-04, VEGAN-1C-03, VEGAN-1C-04.

- GELATO-1C-03: 5 g → 5 g; product_behavior_invalid
- GELATO-2C-04: 200|1 g → 200|1 g; product_behavior_invalid
- GELATO-3C-04: 1|2|5 g → 1|2|5 g; product_behavior_invalid
- GELATO-4C-04: 1|2|5|10 g → 1|2|5|10 g; product_behavior_invalid
- VEGAN-1C-03: 5 g → 5 g; product_behavior_invalid
- VEGAN-1C-04: 10 g → 10 g; product_behavior_invalid

## 11. AUTHORITY_BLOCKED: no_proposal (6)

Classifications: AUTHORITY_BLOCKED.

Run IDs: GELATO-2C-03, GELATO-3C-03, GELATO-4C-03, SORBET-4C-03, VEGAN-3C-03, VEGAN-4C-03.

- GELATO-2C-03: 1|200 g → none g; no_proposal
- GELATO-3C-03: 300|200|100 g → none g; no_proposal
- GELATO-4C-03: 400|300|200|100 g → none g; no_proposal
- SORBET-4C-03: 400|300|200|100 g → none g; no_proposal
- VEGAN-3C-03: 300|200|100 g → none g; no_proposal
- VEGAN-4C-03: 400|300|200|100 g → none g; no_proposal

## 12. HONEST_IMPOSSIBLE: impossible_under_constraints (4)

Classifications: HONEST_IMPOSSIBLE.

Run IDs: GELATO-1C-06, SORBET-1C-06, VEGAN-1C-06, VEGAN-3C-08.

- GELATO-1C-06: 20 g → none g; impossible_under_constraints
- SORBET-1C-06: 50 g → none g; impossible_under_constraints
- VEGAN-1C-06: 50 g → none g; impossible_under_constraints
- VEGAN-3C-08: 400|10|1 g → none g; impossible_under_constraints

## 13. HONEST_IMPOSSIBLE: unsupported_profile (3)

Classifications: HONEST_IMPOSSIBLE.

Run IDs: VEGAN-2C-10, VEGAN-3C-10, VEGAN-4C-10.

- VEGAN-2C-10: 1|25 g → none g; unsupported_profile
- VEGAN-3C-10: 25|10|25 g → none g; unsupported_profile
- VEGAN-4C-10: 200|300|100|25 g → none g; unsupported_profile

## 14. AUTHORITY_BLOCKED: already_clean (1)

Classifications: AUTHORITY_BLOCKED.

Run IDs: GELATO-1C-04.

- GELATO-1C-04: 10 g → none g; already_clean

## 15. HONEST_IMPOSSIBLE: rescale_invalid (1)

Classifications: HONEST_IMPOSSIBLE.

Run IDs: GELATO-SESSION-05.

- GELATO-SESSION-05: 100|200|300 g → none g; rescale_invalid

## 16. HONEST_IMPOSSIBLE: unsafe_proposal (1)

Classifications: HONEST_IMPOSSIBLE.

Run IDs: SORBET-3C-02.

- SORBET-3C-02: 100|200|300 g → none g; unsafe_proposal

## 17. AUTHORITY_BLOCKED: unsupported_profile (1)

Classifications: AUTHORITY_BLOCKED.

Run IDs: VEGAN-2C-03.

- VEGAN-2C-03: 1|200 g → none g; unsupported_profile
