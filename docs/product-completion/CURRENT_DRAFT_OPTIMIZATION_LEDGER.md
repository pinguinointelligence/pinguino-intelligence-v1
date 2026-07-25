# CURRENT-DRAFT OPTIMIZATION — P0 LEDGER

**Owner brief:** CURRENT-DRAFT OPTIMIZATION P0 (Inulin case · one canonical score · machine context)
**Branch:** `fix/current-draft-optimization` (from `nightly/integration` = staging `1c5ca26`)
**Engine science:** UNCHANGED — `ENGINE_VERSION 0.4.0` / `CONFIG_VERSION 0.7.0` pinned (test 20).
**Date:** 2026-07-25

---

## 1. Owner failure reproduced

The owner's exact configuration was rebuilt as a real pipeline fixture: Gelato / Classic /
−11 °C, target **1000 g**, `fruit_gelato`, the complete fruit family plus
**INULIN · Specialty as a normal UNLOCKED line**, no constraints, no exclusions. The base
family weighs 945 g, so Inulin 10 g reproduces the owner's **955 g** draft and Inulin 100 g his
**1045 g** draft exactly.

Captured from real `buildOptimizePreview` runs on the pre-fix code
(`nightly/integration` = `1c5ca26`):

| Inulin | Draft total | Engine violations | technicalFit | matchScore (Monitor) | „Przelicz z PI" outcome | Stop reason |
|---|---|---|---|---|---|---|
| 0 g | 1000 g | `fat_low` (1) | **9/10** | **8/10** | `best_safe_result` | `template_fixed_point` |
| 10 g | 1010 g¹ | `fat_low` (1) | **9/10** | **8/10** | `best_safe_result` | `template_fixed_point` |
| 100 g | 1100 g¹ | 4 (`fat`, `protein_in_solids`, `aerating_protein`, `lactose`) | **8/10** | 8/10 | `best_safe_result` | `template_fixed_point` |
| 500 g | 1500 g¹ | 7 (+`pod`, `water`, `total_solids`) | **6/10** | 6/10 | `best_safe_result` | `template_fixed_point` |

¹ first capture used a 1000 g base; the committed fixture uses the 945 g base so the totals are
the owner's literal 955 / 1045 g. The outcome was identical in both.

Every run: `solverInvocations: 1`, `stopReason: fixed_point_no_proposal`,
`stopDetail: provisional_band_conflict`, attempted moves `[{ move: 'none', reason: 'missing_candidate' }]`,
message *„PI nie znalazło dalszej bezpiecznej poprawy. Obecna receptura jest najlepszym
zweryfikowanym wynikiem…"* with *„Powód zatrzymania: receptura odpowiada już wzorcowi
referencyjnemu"* and `Wzorzec odniesienia: fruit_gelato_ref_v1`.

Three owner statements are reproduced verbatim by these numbers:

* **the engine DOES see Inulin** — violations 1 → 1 → 4 → 7 and severity 0.324 → 0.335 → 1.148 →
  7.923 are four DISTINCT evaluations, which is why the live Monitor reacted;
* **the modal said 9/10 while the Monitor said 8/10** — `technical 88.34 → 9` vs
  `overall 82.14 → 8` on the identical draft;
* **an off-batch draft was called „the best verified result"** — 955 g / 1045 g against a
  1000 g target, with no Preview offered at all.

The machine warning was reproduced separately: `machine_capacity_grams` is persisted to
`localStorage` and **nothing ever cleared it**; `setMachineSelection` (professional AND home)
never touched it, so any value left by an earlier session kept firing the engine's
`machine_capacity_exceeded` critical warning on a 1000 g professional recipe.

---

## 2. Root cause — the owner's five questions, answered exactly

### Was Inulin omitted from the optimizer vector?

**There was no optimizer vector at all.** The pipeline's only optimizer is the canonical engine
solver, and it can reach an existing recipe line through exactly two doors:

* an **ADD** candidate from `DEFAULT_CORRECTION_CANDIDATES` whose id is hardcoded into the
  engine's `SELECTION_RULES` for the violated `(metric, direction)`
  (`src/engine/corrections/candidates.ts:182-208`) — everything else is silently skipped by
  `selectCandidates` (`pool.get(id)` → `if (!candidate) continue`);
* a **REDUCE** of the single arg-max contributor to a HIGH violation
  (`src/engine/corrections/solver.ts:456-512`), and only that one line — if it is not
  reduction-allowed the function returns a blocking record and no reduce is generated at all.

The owner's draft violated `fat_low`, whose rule list is `['cream_30']`. Inulin is reachable only
from `total_solids_low`, `water_high`, `lactose_high`, `lactose_sandiness_risk_high` — none of
which fired. So Inulin was **structurally invisible to the optimizer as an adjustable quantity**,
at every amount. The same was true of Strawberries, Milk, Cream, SMP, Sucrose and Dextrose: the
optimizer could only ever *add from a fixed catalogue*, never *tune what the user actually
selected*. „Not in the reference template" really did mean „not adjustable".

### Did the solver use a stale/reference draft?

**No.** Instrumentation added for owner Phase 1 (`IterationDiagnostics.draftPlannedSumGrams`,
`draftLineGrams`, `candidateVector`, `startPlannedSumGrams`) proves the optimizer receives the
CURRENT draft: at Inulin 0/10/100/500 g it records exactly those grams and exactly the current
955 / 1045 g totals. The staleness hypothesis is **disproved** — regression test 2 pins it.

### Why did one pass claim optimum?

Two independent defects compounded:

1. **The batch restore was classified as „no improvement" and the WHOLE preview was discarded.**
   `buildOptimizePreview` reconciles the batch first (`working = restoreBatch(constrained.input)`,
   955 → 1000 g) and then applies the acceptance gate
   `improved = violationsAfter === 0 || violationsAfter < violationsBefore || (lastProposal && severityAfter < severityBefore)`.
   A pure batch restore is a proportional rescale, so per-100 g composition — and therefore both
   the violation count and the engine severity — are **invariant**. `improved === false` ⇒
   `unsafe_proposal` ⇒ `withTemplateFallback` ⇒ the template seed is also rejected ⇒
   `best_safe_result`. Net effect: an off-batch draft was left off-batch while the user was told
   it was the best verified result — a false statement about a recipe that does not even weigh
   what was asked for.
2. **Template similarity was accepted as a sufficient stop.** `stopReason: 'template_fixed_point'`
   was rendered as *„receptura odpowiada już wzorcowi referencyjnemu"*. Resemblance to a
   reference-derived template is not proof of optimality, and the message carried no evidence of
   what had actually been searched.

### Why did modal and Monitor differ?

The two surfaces used **two different adapters on the identical `RecipeResult`**:

| Surface | Seam | Expression |
|---|---|---|
| Recalculation modal, `OverallScoreCard`, §14.1 status badge, customer Home monitor | `recipeTechnicalFit` | `violations === 0 && !provisional ? 10 : min(9, round(scores.technical / 10))` |
| LIVE Monitor headline | `recipeMatchScore` via `monitorSummaryView.ts:47` | `clamp(round(scores.overall / 10))` |

`scores.overall` is the mode-weighted blend of technical + flavor + cost, always below
`technical`. The addendum-2 split adapter landed and every surface migrated **except** the
Monitor seam — whose own header comment said the integration would be „a rewire of THIS function
body only". That rewire had never been performed. `technical 88.34 → 9/10` next to
`overall 82.14 → 8/10` is the owner's report, exactly.

### Why did machine capacity leak?

`machine_capacity_grams` is persisted (`recipePersistPartialize`) and had **no provenance and no
lifecycle**. `setMachineSelection` — the only explicit machine action — never wrote it (the Home
branch routed the derived capacity into `target_batch_grams` instead), and
`setTargetTemperature` cleared every other machine field but not the capacity. So a value from
any earlier session (or a `0` typed into the Advanced field, which `Math.max(0, Number('0'))`
accepts) survived indefinitely and fed the engine's zero-tolerance
`totalBatchG > machine_capacity_grams` check forever. The engine warning is correct science; the
**value reaching it** was unowned.

---

## 3. Completed

### 3.1 Current-draft optimizer — all unlocked candidates

**New:** `src/features/constraint-studio/draftCandidateVector.ts`

The CURRENT-DRAFT candidate vector. For every currently selected line that is `unlocked`, has no
poured actuals and is not held by a §17 padlock, it generates a deterministic ladder of gram
moves (±0.5 %, ±1 %, ±2 %, ±5 %, ±10 % of the target batch, plus an explicit „to zero") expressed
as ordinary engine `CorrectionAction`s carrying `target_line_id`, applied through the engine's own
`applyCorrectionActions`. Lines at 0 g participate (they may receive grams).

This is **orchestration, not science**: no band, no PAC/POD, no ice anchor, no coefficient is
read, invented or re-derived. The engine remains the only judge — every candidate state is scored
by `calculateRecipe` + `detectViolations` in the pipeline's existing acceptance loop.

Bounds, all mirroring rules that already existed:

* exact-locked / range-held lines are never offered (and are refused again by the engine's own
  top-up/reduce rules);
* an ingredient the user marked unavailable may be **reduced but never increased**
  (never-reintroduce);
* the approved Mapper stabilizer-dosage window is honoured by the same
  `violatesApprovedStabilizerDosage` clamp the solver rounds use;
* the last carrier of a HARD technological role may be reduced but **never emptied** — the same
  contract `buildFormulationProposal` already enforces via `missingHardRoles`. (Without it the
  search legitimately drove Strawberries 350 g → 0 g in a *fruit* gelato: the bands do not encode
  „keep the fruit", the role model does.)

### 3.2 Iterative orchestration (Phase 7 preserved)

`iterateSolverToFixedPoint` now runs **two tiers**, canonical solver first:

1. the engine solver round — unchanged, and it keeps absolute priority, so whenever it produces
   an improving move the behaviour is byte-identical to before;
2. only where it stops (no admissible move, or a move that verifiably improved nothing) does the
   optimizer perform ONE deterministic **coordinate-descent sweep** of the current-draft vector.

Convergence is guaranteed by two guards, both orchestration-level siblings of the existing
`MAX_SOLVER_ROUNDS = 12`:

* **monotonicity** — a sweep may never increase the number of out-of-band metrics (the engine's
  own „fewer violations OR lower severity" rule allowed a fine gram search to trade a violation
  for severity and oscillate 3 → 4 → 3 → 4 forever);
* **material gain** — a whole sweep must remove a violation or cut the engine's severity by at
  least `DRAFT_SWEEP_MIN_RELATIVE_GAIN = 2 %` of what it started from; an immaterial sliver is the
  fixed point, not another round. Without it, hard constrained cases (strawberry-700) chased an
  asymptote into the round cap, and `iteration_cap` can never be labelled best-achievable proof
  (ACCEPTANCE ADDENDUM 1).

No loops, no batch growth, no duplicate rows, no proposal reapplication, no stale-revision use:
every accepted state passes the existing `mergeByCanonicalIdentity` + `ensureUniqueLineIds` +
`restore` normalization before it is measured.

### 3.3 §17 line hold (defect found and closed in passing)

The engine's REDUCE path picks its target from `lock_type` alone and is **blind to the §17
padlock layer**. With the richer search this surfaced immediately: a `locked`-at-160 g Sucrose
line was moved to 108.19 g *inside a Preview* (the Apply door then refused it — honest, but a
dead end). `solveOneRound` now refuses any action whose `target_line_id` is §17-held, with the
new `constrained_line_blocked` rejection reason in the QA move log. Locked grams are byte-exact
in the Preview itself.

### 3.4 Target-batch equality — the batch-reconciliation door

`buildOptimizePreview` gains `withBatchReconciliation`, applied to **both** terminal branches
after `withTemplateFallback`. An off-batch draft now produces a real Preview that reaches exactly
the target batch, labelled truthfully.

The discriminator (`isBatchReconciliation`, exported, and **re-derived trustlessly at the Apply
door** — never read from a preview flag) requires all of:

1. the draft really was off batch by more than `BATCH_SUM_TOLERANCE_G`;
2. the draft is NEAR its target — exactly the frozen ±25 % band `improvementBaseline` already
   uses, so **no new threshold was invented**. Outside it the null hypothesis IS the proportional
   projection (the forbidden 8 × 125 g class) and the door stays shut;
3. the draft is DIFFERENTIATED — a uniform equal-split shape projects onto 8 × 125 g and is
   rejected even when it sits near the batch (976 g of 8 × 122 g);
4. the proposal really lands on the target batch;
5. the proposal is not worse on either engine measure.

Engine-safety (no hard-native residual) and the batch invariant remain enforced by the existing
gates. The preview carries `batchReconciliationOnly` + `batchBeforeGrams`, and the card renders
*„Receptura ważyła 955 g przy celu partii 1000 g — PI wyrównało ją dokładnie do celu. Nie
potwierdzono dalszej poprawy technicznej: proporcje składników pozostają twoje."* — it is never
called a technical improvement.

`beatsBaseline`, the proportional-scaling detector, the hard-residual door and every frozen pin
stay green; four dedicated tests pin that the 8 × 125 g door did not re-open.

### 3.5 A stop must be proven (Phase 4)

* `stopReason.template_fixed_point` no longer says *„receptura odpowiada już wzorcowi
  referencyjnemu"*. It now reads *„ani solver lokalny …, ani reformulacja od wzorca nie znalazły
  dalszej zweryfikowanej poprawy."*
* `best_safe_result` carries a new required `evidence: BestSafeEvidence` — solver invocations,
  current-draft sweeps, iterations, **the user's own adjustable ingredients with the exact gram
  range each was tested across**, the limiting metrics and the provisional-profile flag. The
  recalculation panel renders all of it.
* Template similarity survives only as separately labelled provenance:
  „Zgodność ze wzorcem referencyjnym — Wzorzec odniesienia: `<id>`". It is never the score and
  never the reason.

### 3.6 ONE canonical score (Phase 5)

`monitorSummaryView.monitorScoreView` — the single, test-pinned score seam of the Monitor
summary layer — now returns `recipeTechnicalFit(result)`. `MonitorLiveSummary` renders
`TECHNICAL_FIT_DISPLAY_NAME` („Dopasowanie techniczne") with `TECHNICAL_FIT_TOOLTIPS`, so the
headline number, the status badge beside it and the `OverallScoreCard` inside it finally read the
same dimension. The `match.score === null` semantics `buildMonitorAssessment` depends on are
preserved. Identical input can no longer render two integers.

### 3.7 Machine-context repair (Phase 8)

The engine is untouched. What is repaired is the value reaching it:

* new `RecipeState.machine_capacity_source: 'machine' | 'manual' | null` (persisted);
* `setMachineSelection` is now AUTHORITATIVE — professional ⇒ capacity `null`; home ⇒ the
  machine's own usable capacity (`ProMachineSelector` passes `capacityGrams`), source `'machine'`;
* `setMachineCapacity` (the Advanced field) records source `'manual'`; clearing it removes the
  limit; `loadRecipeInput` treats a saved recipe's capacity as `'manual'`;
* `setTargetTemperature`, which clears the machine context, now also clears a **machine-derived**
  capacity while leaving an explicit manual one alone;
* `buildRecipeInput` — the ONE seam every consumer (Monitor, optimizer, `selectCanonicalDraft`,
  Save, QA) already used — passes `effectiveMachineCapacityGrams(state)`, which returns `null`
  for an unprovenanced value. Stale persisted numbers are therefore **inert**, and a warning can
  only fire after an explicit selection with a real smaller capacity.

### 3.8 Files

| File | Change |
|---|---|
| `src/features/constraint-studio/draftCandidateVector.ts` | **new** — the current-draft candidate vector + deterministic sweep |
| `src/features/constraint-studio/applyPipeline.ts` | two-tier iteration, Phase-1 instrumentation, §17 line hold, `isBatchReconciliation` + `withBatchReconciliation`, `BestSafeEvidence`, trustless door acceptance |
| `src/features/constraint-studio/constraintStudioCopy.ts` | batch-reconciliation copy, honest stop reasons, evidence lines, „Zgodność ze wzorcem referencyjnym" |
| `src/features/constraint-studio/ui/ConstraintPreviewCard.tsx` | renders the batch-reconciliation note |
| `src/features/pro-core/ProRecalcPanel.tsx` | renders the searched evidence; template similarity relabelled as provenance |
| `src/features/pro-workbench/monitorSummaryView.ts` | the score-seam rewire to `recipeTechnicalFit` |
| `src/features/pro-workbench/MonitorLiveSummary.tsx` | canonical name + tooltip |
| `src/features/studio/buildRecipeInput.ts` | `effectiveMachineCapacityGrams` — the machine-context gate |
| `src/stores/recipeStore.ts` | `machine_capacity_source` + capacity lifecycle across the machine actions |
| `src/features/pro-core/ProMachineSelector.tsx` | Home selection passes its real capacity |
| `src/features/constraint-studio/currentDraftOptimization.test.ts` | **new** — all 20 owner tests, fixtures A–F, the 8 × 125 g guard, determinism |

### 3.9 Tests

* **New:** `currentDraftOptimization.test.ts` — 31 tests: owner tests 1–20, fixtures A–F, four
  batch-reconciliation guard tests, determinism.
* **Updated with deliberate, documented supersessions** (each comment names the owner decision):
  `engineAuthenticity.test.ts` (full T1–T19 re-pin), `nightlyP0.test.ts`,
  `optimizerIteration.test.ts`, `acceptanceAddendum.test.ts`, `constrainedReformulation.test.ts`,
  `formulationAuthenticity.test.ts`, `recalcDuplication.test.ts`, `monitorSummaryView.test.ts`,
  `buildRecipeInput.test.ts`.

**Every T1–T19 drift-detector outcome is equal or strictly better; not one is worse on any axis**
(score, violation count, hard-safety, batch equality). Sixteen improved, twelve now reach every
approved band. T9 is unchanged — the 900 g strawberry lock in a 1000 g batch is genuinely
infeasible and still returns the honest `impossible_under_constraints`.

| Case | before → after (10-pt) | before → after (violations) | outcome |
|---|---|---|---|
| T1 | 9 → 9 | 1 → **0** | all bands in range |
| T2 | 9 → 9 | 0 → 0 | unchanged |
| T3 | 8 → 8 | 1 → **0** | all bands in range |
| T4 | 8 → 8 | 4 → **0** | all bands in range |
| T5 | 7 → **8** | 5 → **0** | all bands in range |
| T6 | 7 → **8** | 5 → **0** | all bands in range |
| T7 | 7 → 7 | 7 → **1** | verified fixed point, applicable |
| T8 | 6 → **7** | 7 → **3** | verified fixed point, applicable |
| T9 | 5 → 5 | 10 → 10 | honest impossible (unchanged) |
| T10 | 8 → 8 | 1 → **0** | all bands in range |
| T11 | 8 → **9** | 2 → **0** | all bands in range |
| T12 | 8 → 8 | 1 → **0** | all bands in range |
| T13 | 8 → 8 | 1 → **0** | all bands in range |
| T14 | 7 → 7 | 1 → **0** | all bands in range; inulin still exactly 0 g |
| T15 | 7 → **8** | 5 → **3** | verified fixed point, applicable |
| T16 | — | 0 | honest missing role (unchanged) |
| T17 | 9 → 9 | 0 → 0 | unchanged |
| T18 | 9 → 9 | 1 → **0** | all bands in range |
| T19 | 7 → 7 | 1 → **0** | all bands in range |

---

## 4. Owner acceptance click-tests

1. **Inulin 0 g** (draft 945 g) → real Preview, total exactly 1000 g, the user's own line
   identities preserved, no silent template reset. *(fixture A)*
2. **Inulin 10 g** (draft 955 g) → real Preview, total exactly **1000 g**, changed lines listed,
   canonical technical score before/after never regresses. *(fixture B)*
3. **Inulin 100 g** (draft 1045 g) → real Preview, total exactly **1000 g**, lines really change
   — never an identical no-op. *(fixture C)*
4. **Inulin 500 g** → never called optimal: either a real proposal that verifiably improves the
   engine's own measure and lands on 1000 g, or an honest structured conflict. *(fixture D)*
5. **Inulin EXACT-locked 100 g** → byte-preserved at 100 g while the rest reaches exactly 1000 g
   (or an exact infeasibility proof). *(fixture E; test 7 covers 0 / 10 / 100 g)*
6. **Monitor ↔ modal consistency** → the same draft renders the same integer everywhere; the
   Monitor seam no longer reads the `overall` blend at all. *(tests 12, 13)*
7. **Professional context** → a 1000 g professional recipe with no Home machine produces
   `machine_capacity_grams === null` and NO `machine_capacity_exceeded` warning; a stale
   persisted value is inert; an explicitly selected 500 g Home machine still warns honestly.
   *(test 19)*

---

## 5. Gates

| Gate | Result |
|---|---|
| `npx tsc -b` | clean |
| `npx eslint .` | **0 errors** (2 pre-existing `react-refresh` warnings, untouched) |
| `npx vitest run` | **385 files / 5222 tests passed** (baseline 384 / 5186 — +1 file, +36 tests, none lost) |
| `npm run build` | success |
