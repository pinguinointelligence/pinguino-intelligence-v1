# ENGINE / CROWN / MANUAL-TARGET — FULL PROFILE AUDIT
**2026-09-02 · Gelato / Sorbet / Vegan / Protein · owner-ordered**

Audit of **every** Engine/Crown/manual-target change made in this session, not
only the open defect. Question answered per fix: was it proven on Gelato only,
and does it hold on Sorbet, Vegan and Protein?

## 0. What actually landed today

| # | Change | Commit | Live? |
|---|---|---|---|
| 1 | GEL-P0-027 Crown MAX: frontier = hard limit, path-independent, honest empty-sweep refusal | `f213a029` (#72) | **YES** (frozen) |
| 2 | Main safety band scoped to CAPABILITY, not to Crown | `8b7244eb` (#93) | **YES** |
| 3 | Crown-OFF soft-anchor rescue | `b88bd29f` (#102) | reverted |
| 4 | Crown-OFF perf: cheap candidate assert | `2389e242` (#105) | reverted |
| 5 | Crown-OFF: stabilizer authority out of the descent | `43697bfb` (#109) | reverted |
| 6 | Baseline restore (undoes 3–5, keeps #93) | `2c83e248` (#110) | **YES** |
| 7 | Freeze + findings (docs only) | `564110b5` (#86) | docs |

**Net live Engine change today = #72 + #93.** Everything else returned to the
pre-#102 baseline, so the audit surface is two fixes, not five.

## 1. Structural finding — the fixes cannot be profile-specific

`mainEnvelope.ts` contains **zero** references to `category` / profile, and the
#72 hunks in `applyPipeline.ts` contain none either. Profiles differ **only**
through published policy DATA resolved per product. Therefore no fix today can
be "Gelato-only" by construction — but its *observable effect* can differ per
profile, because the data does. That is what the matrix below measures.

## 2. The data that makes profiles differ
`product_behavior_policy_versions`, staging, `status='published'`:

| family | policies | `optimal = hard` | `optimal < hard` | requires dairy carrier |
|---|---|---|---|---|
| dairy (gelato) | 12 | 6 | **6** | **yes** (floor 30%) |
| non-dairy (sorbet / vegan / protein) | 16 | **16** | **0** | **no** (all 16) |

Two consequences, both proven, not assumed:

- **#72 is a provable no-op outside dairy gelato.** Moving the Crown frontier
  from `optimal_ceiling` to `hard_limit` can only change behaviour where the two
  differ — and they are equal in 16/16 published non-dairy policies.
- **#93's carrier band cannot fire outside dairy gelato.** Every non-dairy
  policy has `requires_liquid_dairy_carrier = false`, so `dairyFloor === null`
  and the check returns empty. The hard-limit half of #93 *does* bind everywhere.

## 3. PER-FIX PROFILE MATRIX

| FIX | SHARED / PROFILE-SPECIFIC | GELATO | SORBET | VEGAN | PROTEIN | GAP |
|---|---|---|---|---|---|---|
| **#72** Crown frontier = `hard_limit_percent` | SHARED code, profile-specific *effect* via data | ✅ binds (6 dairy policies have opt<hard, e.g. 35→45) | ✅ no-op by data (60/60) | ✅ no-op by data (74.7/74.7) | ✅ no-op by data (49.5/49.5) | was `milk_gelato`-only → **CLOSED** |
| **#72** preference ceiling opt-in (`enforceOptimalPreferenceCeiling`) | SHARED | ✅ off→allowed, on→`main_above_optimal_ceiling` | ✅ degenerate (opt=hard) | ✅ degenerate | ✅ degenerate | `milk_gelato`-only → **CLOSED** |
| **#72** empty sweep → typed `crownRefusal` (no echo of input) | SHARED | ✅ | ✅ | ✅ | ✅ | `milk_gelato`-only → **CLOSED** |
| **#93** hard limit binds on an UNCROWNED Main | SHARED | ✅ | ✅ | ✅ | ✅ | `milk_gelato`-only → **CLOSED** |
| **#93** band engages at `eco_floor_percent`; below it the policy stays out | SHARED | ✅ | ✅ (knife-edge: eco=hard=60) | ✅ | ✅ | `milk_gelato`-only → **CLOSED** |
| **#93** hard limit binds in ECO *and* OPTIMAL | SHARED | ✅ | ✅ | ✅ | ✅ | `milk_gelato`-only → **CLOSED** |
| **#93** carrier floor extended to uncrowned Mains | SHARED code, **PROFILE-SPECIFIC by data** | ✅ binds (30%) | ✅ cannot fire | ✅ cannot fire | ✅ cannot fire | **CLOSED** (asserted both ways) |
| **#93** complete-or-nothing capability group (Multi-Main) | SHARED | ✅ | ✅ | ✅ | ✅ (was the regression that forced the guard) | sorbet/vegan had no Multi-Main test → **CLOSED** |
| **#110** baseline restore | SHARED | ✅ | ✅ | ✅ | ✅ | none |

**Evidence:** `src/features/product-intelligence/mainSafetyProfileMatrix.test.ts`
— 36 assertions, 9 per profile, built from the REAL published policy numbers of
each profile. All green.

## 4. The OPEN defect, measured on all four profiles

Not a fix — the fractional-stabilizer-lock class, previously diagnosed on Gelato
only. Measured directly (real store, real starters, rescale to 670 g):

| | TARA GUM after rescale | whole? | LP **without** stabilizer hold | LP **with** hold |
|---|---|---|---|---|
| **GELATO** | `2.0100000000000002` | ❌ | certified, integer **TRUE**, 32 ms | certified, integer **FALSE**, **992 ms** |
| **SORBET** | `3` | ✅ | certified, integer FALSE, 319 ms | certified, integer FALSE, **2 ms** |
| **VEGAN** | `1.34` | ❌ | certified, integer **TRUE**, 8 ms | certified, integer **FALSE**, **1194 ms** |
| **PROTEIN** | `1.34` | ❌ | certified, integer **TRUE**, 42 ms | certified, integer **FALSE**, 1 ms |

**The synthetic template stabilizer hold flips integer certification TRUE→FALSE
in Gelato, Vegan and Protein.** `projectManualIngredientTarget` requires
`integerSolutionCertified`, so the manual-target search discards every candidate
in three of four profiles.

**Sorbet is immune, and that is the proof of the fix pattern:** batch rescale
re-projects the sorbet stabilizer system to whole grams
(`rescaleWithOwnerStabilizerSystem` → `planSorbetStabilizerSystemRescale`, PC-02
`1e9580e0`). Gelato / Vegan / Protein have no rescale-time projection, so the
whole-gram value written by `newRecipeStarter`
(`project*StabilizerSystemToWholeGramPreferred`) is lost at the first resize.

## 5. Regression status

- Engine/Crown/Main/stabilizer suite: **1899 passed, 19 skipped, 0 assertion failures** (1921 tests).
  Three timeouts occurred only because this audit ran CI's two *isolated* lanes
  (GEL-P0-024) inside one shared process; both files pass in isolation as CI runs
  them — `mainTechnicalMaximum` 46/46 (59 s), `directionRecoveryRegression` 6/6 (102 s).
- Profile suites (`protein-gelato`, `vegan-engine`): **230 passed, 0 failed**.
- New profile matrix: **36 passed**.

## 6. Verdict

Both live Engine fixes (#72, #93) are **SHARED authorities with no profile
branch**, and both now hold green on all four profiles with the real published
policy data. The only Gelato-shaped item left is the **open** fractional-lock
defect — and it is not Gelato-shaped either: it affects **Gelato, Vegan and
Protein**, with Sorbet as the control that already carries the correct pattern.

**Not closed by this audit:** the central fix itself (extending the sorbet
rescale projection to the other three profiles) — measured and specified, not
implemented, awaiting the owner's go.
