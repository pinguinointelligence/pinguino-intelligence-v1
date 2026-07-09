# IF9/IF10 Exact Recalculation + Integration Flow wiring — preview only

_Created 2026-07-09 (Spine Slice 19). Companion to [BATCH_RESCUE_FLOW.md](BATCH_RESCUE_FLOW.md)
(IF9) and [STOCK_SHORTAGE_FLOW.md](STOCK_SHORTAGE_FLOW.md) (IF10)._

**Status: pure preview.** No persistence, no DB, no inventory read/write, no recipe save, no input
mutation. The accepted-correction migration is still NOT applied.

## 1. What is now wired into the Integration Flow

`src/spine/integrationFlowDispatch.ts` (`dispatchIntegrationFlow`) — a pure, thin dispatcher over
the three locked execution contexts:

| Context | Router | Payload required |
|---|---|---|
| `recipe_design` | the EXISTING `routeRecipeIntegrationFlow` (IF1–IF8) — **called verbatim, module untouched** | `IntegrationFlowInput` |
| `actual_batch_rescue` | `routeBatchRescue` (IF9) | `BatchRescueIntent` |
| `stock_shortage` | `routeStockShortage` (IF10) | `StockShortageIntent` |

A missing payload is `blocked_missing_data` — actual-batch and stock data are NEVER inferred from
another context. An unknown context is `not_supported`, never remapped. The default recipe flow is
provably unchanged: this slice does not modify `integrationFlowRouter.ts` at all (test-guarded).

## 2. Exact recalculation preview (`src/features/optimization/branchRecalculationPreview.ts`)

Statuses: `not_attempted` · `calculated` · `blocked_missing_data` · `unsafe` ·
`verification_failed` · `not_supported`. **Numbers appear ONLY on `calculated`** — on every other
status `exactActions` is empty and `proposedRecipeSnapshot` is null.

### IF9 (`previewBatchRescueRecalculation`)
Attempted only when ALL of: route decision feasible (`rescue_possible`/`rescue_with_tradeoff`),
action is `add_ingredients` (temperature adjustments are non-compositional; reprocess paths never
get addition grams), no outstanding physical measurements (icy/sandy always require measuring
first), and the gate maps to an engine metric. The solve then runs the REAL correction solver in
its **`actual_batch` context (add-only by construction)**, focused on the rescue metric, aiming at
the Temperature Regulator band via the Slice-14 `targetBandOverride`; the corrected recipe is
re-run through the REAL `calculateRecipe` and verified through the Temperature Regulator
(`verifyOptimizationRerun`). A failed verification exposes NO grams and claims nothing
(`verification_failed`); food safety is `unsafe` and never reaches the solver.

**Honest engine finding (Slice 19, kept visible):** for large NPAC gaps (e.g. the −12 too-hard
fixture), the solver's per-batch NPAC model moves the real per-water NPAC further than modelled,
overshooting the band — so the solver's own Golden-Middle verification REJECTS the single-shot
addition (`solver_found_no_safe_add_only_correction`). The engine refusing to fake a safe rescue is
correct; **Slice 20** answers it without bypassing anything:

### IF9 multi-step add-only walk (Slice 20 — `batchRescueStepSolver.ts`)

When (and ONLY when) the single-shot solve fails with that exact reason, the preview walks the gap
in smaller, individually-verified steps. Per step, an INTERMEDIATE target band is derived by moving
the band center a fraction of the REMAINING gap toward the true regulator center (fractions tried
smallest-first: 25% → 50% → 75% → 100%, i.e. the smallest verified improvement wins) and handed to
the REAL solver through the Slice-14 `targetBandOverride` — the solver still picks candidates from
its own catalog, sizes exact grams, and applies add-only (`actual_batch` context). Each applied step
is then verified OUTSIDE the solver against the TRUE regulator (`verifyOptimizationRerun`): kept
only on genuine improvement with no new/worsened hard gate.

Safety stops (all surfaced as `stopReason`): `target_reached` · `no_improving_step` (nothing is
forced) · `diminishing_returns` (a verified-but-marginal step, < 0.25 metric points, is kept and the
walk stops) · `max_steps` (budget 4). Two direction guards: the preview refuses BEFORE any solve
when the observed problem contradicts the measured violation direction
(`observation_contradicts_measured_direction` — e.g. "too soft" reported while NPAC is measured
below band; the operator is told to re-measure), and the walk itself refuses steps that move the
metric opposite to the declared rescue direction.

Final statuses: `calculated` (targeted metric ENTERED its true regulator band AND the overall
before→after rerun proves improvement without regression), `partial_improvement` (≥1 verified step,
metric still outside band — grams ARE exposed because every step is regulator-verified, with
`not_fully_rescued_residual_gates_remain` warned), `verification_failed` (no step verified, or the
overall rerun failed — NO grams exposed). The single-shot reason stays visible alongside
(`singleShotReason`).

**Measured outcome on the −12 too-hard fixture:** single-shot rejected → the walk verifies ONE
25%-fraction step (`add Sucrose 74.4 g`, NPAC 25.33 → 35.54, per-step and overall regulator decision
`tradeoff`), then stops honestly (`no_improving_step`) → `partial_improvement`. The remaining gap to
[42,50] stays direction-only — real gelato batches this far out of band genuinely need more than one
lever.

### IF10 (`previewStockShortageRecalculation`)
- **`scale_down_possible` → `calculated`** (the proven exact path): uniform scaling by the limiting
  ratio is safe linear math — every composition percentage, hence every band verdict, is unchanged.
  The scaled snapshot is STILL verified: the real engine re-runs and the regulator evaluation of
  before/after must match (`scaleVerified`), else `verification_failed` with no snapshot.
- `substitution_possible` → `not_attempted (substitute_composition_not_in_contract_v01)` — the v0.1
  shortage contract carries safety flags, not a verified composition; an exact substitute solve
  without it would be fake.
- purchase / reformulation → `not_attempted` (nothing to calculate); safety-blocked substitution
  (dairy/allergen/alcohol/sweetener/unverified) → `unsafe`; a recipe carrying `actual_grams` is
  refused (`actual_batch_present_use_batch_rescue` — that is IF9's territory).

## 3. Cases still direction-only

IF9: icy/sandy (measurements first), temperature mismatch (guidance IS the action), frozen/
reprocess paths, direction-contradicting observations (re-measure first), and the residual gap when
the multi-step walk stops honestly (`partial_improvement` covers the verified part only). IF10:
substitution (until a verified-composition contract lands), purchase, reformulation. All keep their
locked user-decision menus and required next calculations.

## 4. Why no writes exist

Every module in this slice is preview-only: the spine dispatcher and routers are pure; the feature
orchestrator only reads the engine barrel; the DEV page (`/dev/branch-recalculation-preview`)
renders fixtures with no click handlers at all. Relation to persistence: an ACCEPTED rescue or
shortage decision would eventually persist through the same approval-gated write path designed in
[ACCEPTED_CORRECTION_PERSISTENCE_PLAN.md](ACCEPTED_CORRECTION_PERSISTENCE_PLAN.md) — which remains
design-only (migration NOT applied).

## 5. Surface

`/dev/branch-recalculation-preview` (DEV-only route + NotFound guard, dead-code-eliminated from the
production bundle; security-tested like the optimization preview page). Production Studio is
deliberately untouched this slice — branch UI is a future slice behind `canUseActualBatchRescue` /
`canUseStockShortageWorkflow` (both demo-false/paid-true), with the same redaction pattern as the
optimization preview.

## 6. Next slice options

1. Accepted-correction LIVE write (after the owner walks the Slice 16 approval checklist).
2. Branch UI for IF9/IF10 in Studio (paid-gated, redacted, with the locked user-decision menus).
3. ~~Multi-step add-only rescue solving~~ — landed in **Slice 20** (verified stepping; the −12
   fixture is now an honest `partial_improvement`). Remaining solver expansion: multi-LEVER steps
   (e.g. sugar + solids together, so residual gaps after single-lever walks can close) and a
   verified-composition substitute contract for IF10 substitution solves.
