# P1-C / P1-D / P1-E — LOCK-01, LOCK-02, LOCK-03 REPRODUCTION

Environment: `offline-staging-head` (7fe10d4c). Served staging unreachable → the served
half of these blocks is `[H]` (see P1-A). Every number below is the CORE answer of
`buildOptimizePreview(..., {directionFallbackPass:true})` through the real PRO door
(open official recipe → Maszyna profesjonalna 1000 g → PRZELICZ+Zastosuj → optional
gram lock on the largest sugar line → set the Direction axis → PRZELICZ).

Evidence: `scratchpad/p1/results/p1cde-locks-baseline.json`.

## P1-C — LOCK-01 · VERDICT: **CONFIRMED FALSE INFEASIBLE**

`classic-butter-pecan`, gram lock `SUCROSE SUGAR = 80 g`, sweetness **+1** (POD band **[15, 16]**).

| | POD | NPAC | native violations | Direction reached |
|---|---|---|---|---|
| draft | 13.7312 | 41.0004 | — | false |
| CORE proposal | **14.8421** | 40.9999 | **[]** | **false** (0.158 below the band) |
| engine-verified witness (this session) | **15.0191** | 40.7739 | **[]** | **TRUE** |

CORE proposal `673/95/22/80/79/43/1/5/2` — it collapses **PECANS 59 → 5 g** and
**BUTTER 30 → 1 g** and leaves **INULIN untouched at 43 g**.
Witness `723/68/22/80/85/1/1/18/2` (Σ 1000, whole grams, lock held at 80 g) —
POD 15.019 inside [15, 16], NPAC 40.774 inside [39, 41], `detectViolations` **[]**,
`assessRecipeDirection.reached = true`.

Stop trace: `stopReason fixed_point_no_proposal`, `stopDetail missing_candidate`, 7 rounds,
`draft_vector_no_improvement`. **Native violations at the stop are `[]`** — so unlike OD-28
the paired-exchange pass *did* run here and still could not escape. Different mechanism,
same class.

## P1-D — LOCK-02 · VERDICT: **CONFIRMED — the presented "nearest" is not nearest**

`classic-blood-orange-sorbet`, 1000 g. Distance = Σ Direction severity points
(the engine's own measure on the Direction-substituted bands).

| cell | CORE candidate | CORE distance | engine-verified candidate found this session | its distance | factor |
|---|---|---|---|---|---|
| A · sweet −1 | 598/194/79/70/55/4 · POD 19.0628 | **1.1110** | 561/194/68/70/103/4 · POD 17.9982 | **0.02323** | **47.8×** |
| A · sweet −2 | 598/194/79/70/55/4 · POD 19.0628 | **3.1110** | 597/127/35/77/160/4 · POD 16.0022 | **0.02000** | **155.5×** |
| B · sweet −1 | 598/186/104/53/55/4 · POD 20.3269 | **2.4812** | 153/527/104/69/143/4 · POD 18.0017 | **0.02021** | **122.8×** |
| B · hard −1 | 598/182/104/57/55/4 · NPAC 38.4703 | **0.6474** | 504/242/104/57/89/4 · NPAC 38.5148 | **0.02482** | **26.1×** |
| B · hard −2 | 598/178/104/61/55/4 · NPAC 39.6061 | **1.0145** | 463/268/104/61/100/4 · NPAC 39.4746 | **0.03536** | **28.7×** |

Every candidate in the right-hand column has `detectViolations = []`, Σ = 1000 g, whole
grams, and holds the 104 g lock where config B applies.

**Re-measured, not copied from the audit.** The audit's "38–274×" was measured against a
single-axis POD distance on a randomised witness search; the factors above are measured on
the **two-axis engine severity** with the deterministic search of P1-L, from the state CORE
itself gives up on. The audit's headline claim ("the presented nearest is not nearest,
by more than an order of magnitude") **survives re-measurement**; the exact multipliers are
**26×–156×**, not 38×–274×.

**Structural confirmation:** in all 8 cells the CORE candidate leaves `line-1` (BLOOD ORANGE)
at exactly **598 g** and `line-5` (INULIN) at exactly **55 g**, moving only WATER, SUCROSE and
DEXTROSE. Both lines **are** in the draft candidate vector with full ladders
(`line-1` rungs 1…698, `line-5` rungs 1…155) — they are generated and **rejected**, not missing.
Every nearer candidate above reaches the target through exactly those two lines.

## P1-E — LOCK-03 · VERDICT: **CONFIRMED — level saturation**

Config A: sweetness **−1** (centre 18) and **−2** (centre 16) return the **byte-identical**
proposal `598/194/79/70/55/4`, POD 19.0628, NPAC 37.4518.
Config B: sweetness **+1** (centre 22) and **+2** (centre 24) return the byte-identical
proposal `598/185/104/54/55/4`, POD 20.3996, NPAC 37.6258.

**Four requests, two answers.** The requested level changes only the *severity* of the
residual, never the *direction* of the local descent, so the strictly-improving search halts
at the same barrier for both levels and the level is never separately attempted.
