# P1-G — CANONICAL WITNESSES

Every witness below is a **whole-gram** vector, **engine-verified in this session**
(`calculateRecipe` + `detectViolations` + `assessRecipeDirection`), and is
re-checkable automatically by the regression tests. Distances are Σ Direction
severity points on the engine's own Direction-substituted bands.

## OD-28 — HOME gelato · Ninja Deluxe 2 containers · 1340 g · strawberries 507 g gram-locked · sweetness −1

| | milk 3.5 % | cream 30 % | SMP | sucrose | dextrose | tara gum | strawberries | Σ |
|---|---|---|---|---|---|---|---|---|
| CORE **before** the fix | 453 | 94 | 99 | 128 | 55 | 4 | 507 | 1340 |
| witness (product-reached, path B) | 365 | 200 | 102 | 82 | 80 | 4 | 507 | 1340 |
| CORE **after** the fix | 178 | 389 | 106 | 87 | 69 | 4 | 507 | 1340 |

* before — POD **16.050** (band [13, 14]), NPAC 39.083, native `fat:low 3.462`, **not reached**, distance **4.540**
* witness — POD **13.983**, NPAC **39.198**, violations `[]`, **reached**
* after — POD **13.751**, NPAC **39.537**, violations `[]`, **reached**, `diagnosticOnly false`

Save gate: `practicalRecipeAuditMatchesInput` returns **true** for the witness
(the exact predicate `useCanonicalRecipeSave.ts:137/:292` uses).

## LOCK-01 — `classic-butter-pecan` · PRO · 1000 g · `SUCROSE = 80 g` gram lock · sweetness +1 (POD [15, 16])

| | milk | cream | SMP | sucrose | dextrose | inulin | butter | pecans | tara | Σ |
|---|---|---|---|---|---|---|---|---|---|---|
| CORE **before** | 673 | 95 | 22 | 80 | 79 | 43 | 1 | 5 | 2 | 1000 |
| witness | 723 | 68 | 22 | 80 | 85 | 1 | 1 | 18 | 2 | 1000 |
| CORE **after** | — | — | — | 80 | — | — | — | — | 2 | 1000 |

* before — POD **14.842**, NPAC 41.000, violations `[]`, distance **0.3159**
* witness — POD **15.019**, NPAC **40.774**, violations `[]`, **reached**
* after — POD **14.986**, NPAC 40.900, violations `[]`, distance **0.0290** (**10.9× nearer**), still not reached

The lock is held byte-exact at 80 g in every row.

## LOCK-02 / LOCK-03 — `classic-blood-orange-sorbet` · PRO · 1000 g

Config A = no lock; config B = `SUCROSE = 104 g` gram lock (held byte-exact throughout).

| cell | CORE before (distance) | CORE after (distance) | factor |
|---|---|---|---|
| A · sweetness −1 | 598/194/79/70/55/4 — **1.1110** | 18.690 POD — **0.8020** | 1.4× |
| A · sweetness −2 | 598/194/79/70/55/4 — **3.1110** | 18.736 POD — **2.8550** | 1.1× |
| B · sweetness −1 | 598/186/104/53/55/4 — **2.4812** | 18.921 POD — **1.0200** | 2.4× |
| B · softness −1 | 598/182/104/57/55/4 — **0.6474** | 20.008 POD / 38.539 NPAC — **0.0490** | **13.2×** |
| B · softness −2 | 598/178/104/61/55/4 — **1.0145** | 20.037 POD / 39.402 NPAC — **0.1350** | **7.5×** |
| B · sweetness +1 | 598/185/104/54/55/4 — **1.7260** | **1.6910** | 1.0× |
| B · sweetness +2 | 598/185/104/54/55/4 — **3.7260** | **3.6910** | 1.0× |

Every "after" candidate has `detectViolations = []`, Σ = 1000 g, whole grams.

**LOCK-02's structural claim is broken by the fix.** Before, `line-1` (BLOOD ORANGE)
sat at exactly **598 g** and `line-5` (INULIN) at exactly **55 g** in all 16 cells.
After, `line-1` moves in every improved cell (225 / 366 / 433 / 544 / 629 g).

**LOCK-03 config A** now returns **different** proposals for −1 and −2 (POD 18.690 vs
18.736). **Config B +1 / +2 remain byte-identical** — see the closure note in
`P1-L-fix-design.md`.

## Negative controls (P1-O) — all four still refuse

| control | construction | verdict after the fix |
|---|---|---|
| C1 | butter-pecan, every line but one gram-locked, sweetness +2 | `no_proposal`, `BLOCKED_WITH_EXACT_ACTION`, no fallback, no rescue |
| C2 | blood-orange sorbet, softness −2 (the audit's one true dead end) | still refuses; distance 0.020; **no rescue offered** |
| C3 | crema-di-buontalenti, POD-carrying lines pinned, sweetness +2 | `no_proposal`, `BLOCKED_WITH_EXACT_ACTION` |
| C4 | blood-orange sorbet, every line but two locked, sweetness −2 | `no_proposal`, `BLOCKED_WITH_EXACT_ACTION` |

The solver was **not** made "always feasible".
