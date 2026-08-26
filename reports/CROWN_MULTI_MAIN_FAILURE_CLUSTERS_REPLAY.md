# Crown / Multi-Main failure clusters — baseline

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

## 2. Main ratio / constraint conflict (10)

Classifications: HONEST_IMPOSSIBLE, AUTHORITY_BLOCKED.

Run IDs: PROTEIN-3C-02, PROTEIN-3C-03, PROTEIN-3C-10, PROTEIN-4C-02, PROTEIN-4C-03, PROTEIN-4C-08, PROTEIN-4C-09, PROTEIN-5C-02, PROTEIN-5C-03, PROTEIN-5C-08.

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

## 3. Batch reduction or expansion (2)

Classifications: HONEST_IMPOSSIBLE.

Run IDs: PROTEIN-2C-07, PROTEIN-4C-07.

- PROTEIN-2C-07: 400|600 g → 308|462 g; product_behavior_invalid
- PROTEIN-4C-07: 150|150|150|150 g → 59.99999999999999|59.99999999999999|59.99999999999999|59.99999999999999 g; ok
