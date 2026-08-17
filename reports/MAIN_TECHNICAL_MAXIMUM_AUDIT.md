# Main Technical Maximum Audit

Status: LOCAL IMPLEMENTATION VERIFIED; FINAL SERVED STAGING CAPTURE PENDING.

- Starting origin/staging SHA: `9ffdb028ac3326be223850b252523f85eb447644`
- Final SHA: PENDING FINAL COMMIT
- Mapper data: unchanged
- Base Engine formulas: unchanged
- Home and Production implementation: unchanged

## Root cause and repair

The prior runtime treated historical sensory dose metadata as a hard Main envelope and also used the entered Main grams as a solver anchor. The repair makes the crown a technical whole-gram maximum objective, keeps exact/range/percentage locks independent, rebalances the complete recipe for every candidate, and revalidates the certified proof at Apply. Historical ECO/OPTIMAL/hard flavour percentages remain metadata only.

## Watermelon proof

- Exact product: `e3264816-1050-d2a6-cc55-149e0d363bbf`
- Version: `009d5b8a-f0bd-4c19-958b-3feec2f045f9`
- Mapper: `PI-ING-000405`
- Proven whole-gram maximum X: **639 g**
- Continuous technical relaxation: 639.822395 g
- Whole-gram integer bound: 639 g
- Integer proof nodes: 45
- Active limiting rules: integer_linear_relaxation, exact_batch, exact_lock:tara, pod_max, npac_min, lactose_min, fat_min, total_solids_min
- X passes: exact 1000 g and zero Engine violations.
- X + 1 fails: 640 g exceeds the certified whole-gram technical bound.

## Starting-point independence

| Start g | Final Main g | Batch g | Score | Limiting technical rule |
|---:|---:|---:|---:|---|
| 1 | 639 | 1000 | 10 | integer_linear_relaxation, exact_batch, exact_lock:tara, pod_max, npac_min, lactose_min, fat_min, total_solids_min |
| 80 | 639 | 1000 | 10 | integer_linear_relaxation, exact_batch, exact_lock:tara, pod_max, npac_min, lactose_min, fat_min, total_solids_min |
| 200 | 639 | 1000 | 10 | integer_linear_relaxation, exact_batch, exact_lock:tara, pod_max, npac_min, lactose_min, fat_min, total_solids_min |
| 300 | 639 | 1000 | 10 | integer_linear_relaxation, exact_batch, exact_lock:tara, pod_max, npac_min, lactose_min, fat_min, total_solids_min |
| 400 | 639 | 1000 | 10 | integer_linear_relaxation, exact_batch, exact_lock:tara, pod_max, npac_min, lactose_min, fat_min, total_solids_min |
| 500 | 639 | 1000 | 10 | integer_linear_relaxation, exact_batch, exact_lock:tara, pod_max, npac_min, lactose_min, fat_min, total_solids_min |
| 900 | 639 | 1000 | 10 | integer_linear_relaxation, exact_batch, exact_lock:tara, pod_max, npac_min, lactose_min, fat_min, total_solids_min |

## Strategy, role and lock comparison

- ECO Main maximum: 639 g.
- OPTIMAL Main maximum: 639 g.
- Standard unlocked 300 g finishes at 224 g and has no Main-max proof.
- Main locked 200 g remains 200 g.
- Main locked 900 g: impossible_under_constraints; nearest certified amount 639 g.

## Multi-Main local matrix

| Fixture | Start g | Final g | Group g | Batch g | Proof |
|---|---|---|---:|---:|---|
| MM-01 | 10/100 | 355/355 | 710 | 1000 | maximized |
| MM-02 | 300/1 | 355/355 | 710 | 1000 | maximized |
| MM-03 | 10/100 | 460/230 | 690 | 1000 | maximized |
| MM-04 | 10/100/300 | 237/236/236 | 709 | 1000 | maximized |
| MM-05 | 200/10 | 200/541 | 741 | 1000 | maximized |

## Evidence boundary

Local Engine/Preview/Apply/Undo and regression gates are recorded in the completion ledger. Authenticated served screenshots, Console/Network capture, Vercel deployment ID, served bundle hashes and production no-change proof remain pending until the final staging deployment.
