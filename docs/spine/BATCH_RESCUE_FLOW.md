# Actual Batch Rescue — IF9 decision branch

_Created 2026-07-09 (Spine Slice 17). Companion to [PINGUINO_SPINE.md](../PINGUINO_SPINE.md);
grounded in the locked [Integration_Flow.md](../pinguino-spine/Integration_Flow.md) §16–§17._

**Status: pure, unwired v0.1.** `src/spine/batchRescueRouter.ts` (`routeBatchRescue`) exists as a
standalone spine module — not yet wired into the Integration Flow router, the engine, or any UI.
No DB, no Mapper, no persistence, no recipe mutation, **no exact grams**.

## 1. Why this is separate from normal optimization

Normal optimization corrects a PLANNED recipe: the solver may add or (in planning) reduce lines,
and everything is recomputed before anything physical happens. Batch rescue starts from an
**already-produced physical mass** with an **observed problem**. That changes the rules
(locked §16):

- already-added material can never be reduced — every rescue action is **add-only**;
- the batch's physical state gates what is even possible (frozen mass cannot take additions;
  dilution requires a liquid path; reprocessing may be unavailable);
- batch mass grows with every addition — machine capacity is a hard constraint and volume
  increase needs explicit user confirmation (§16), via the locked §17 five-option menu;
- food safety is checked FIRST and never overridden.

## 2. Exact inputs required (`BatchRescueIntent`)

| Input | Required | Notes |
|---|---|---|
| `productProfile` | yes | unsupported → `not_supported`, never remapped |
| `intendedServingTemperatureC` | yes | outside −11/−12/−13 → warning (batch is physical reality) |
| `batchSizeG` | **yes** | missing/≤0 → `blocked_missing_data` + `weigh_actual_batch_g` |
| `observation.problem` | **yes** | missing → `blocked_missing_data`; unknown → `not_supported` |
| `observation.observedServingTemperatureC` | for temp mismatch | missing → `blocked_missing_data` + measurement |
| `observation.foodSafetyConcern` | — | `true` → `discard_or_rebatch`, checked before everything |
| `constraints` (frozen / canReprocess / liquid / dry / served) | yes | physical-state gates |
| `recipeSnapshot` | optional | opaque, echoed as a trace flag only — never mutated |
| `expectedMetrics` | optional | cross-checked through `evaluateTemperatureRegulator` |

## 3. Decisions and supported cases (v0.1)

Decisions: `rescue_possible` · `rescue_with_tradeoff` · `reprocess_required` ·
`discard_or_rebatch` · `blocked_missing_data` · `not_supported`.

| Observed problem | Direction (add-only) | Levers (∩ profile) | Notes |
|---|---|---|---|
| `too_hard` | increase `npac` | dextrose, sucrose | risk: sweetness increases |
| `too_soft` | decrease `npac` | SMP, inulin, water | sorbet/vegan never get dairy levers |
| `icy` | increase `stabilizer` (water binding) | stabilizer, inulin | measurement required first |
| `sandy` | decrease `lactose_sanding` | inulin, water | measurement required first; warned on non-dairy profiles |
| `too_sweet` | decrease `pod` | water, milk, oat, coconut (liquid ONLY — never more sugar) | dilution risks flavor |
| `too_fatty` | decrease `fat` | milk, water, oat (liquid ONLY) | sorbet → water only |
| `serving_temperature_mismatch` | adjust cabinet toward intended | — (non-invasive) | works even for frozen batches |

Physical-state gates for composition problems: frozen → `reprocess_required` (with a
reprocess-and-rebalance action only when `canReprocess`; otherwise NO action is emitted and the
discard consequence is warned — a hardened batch is never pretended correctable in place);
unfrozen with no usable addition method → `reprocess_required` if possible, else
`discard_or_rebatch`.

Blocked / not supported: missing batch size or observation (`blocked_missing_data`); unknown
profile, already-served batch, and the v0.1-unrouted vocabulary (`not_sweet_enough`,
`stabilizer_issue`, `texture_differs_from_expected`) → `not_supported`; food-safety concern →
`discard_or_rebatch`.

## 4. What the output contains (and deliberately does not)

`BatchRescueResult` = decision + direction-level `recommendedActions` (kind, direction, target
metric, profile-gated lever families, method, `addOnly: true`) + risks + warnings +
`requiredMeasurements` (including the required NEXT CALCULATION
`rerun_base_engine_with_planned_addition_before_adding`) + the locked §17
`nextUserDecisionOptions` menu (only when a rescue path exists) + trace.

**No exact grams exist anywhere in the output** — there is no gram field on any action, so
nothing gram-shaped can leak to any tier and no fake solved rescue can be claimed. The exact
add-only gram solve is a later engine-verified step (the existing `targetBandOverride`-capable
solver + `verifyOptimizationRerun` are the intended machinery).

Cross-check: when `expectedMetrics` are supplied, they are evaluated at the intended temperature
through the existing pure `evaluateTemperatureRegulator` — an already-out-of-band recipe warns
`expected_metrics_already_out_of_band_recipe_correction_recommended` (fix the recipe for the next
batch; rescue only patches this one), and an in-band recipe with a diverging observed temperature
warns `serving_temperature_divergence_may_explain_observation`.

## 5. Capability / redaction

The spine access layer already defines `canUseActualBatchRescue` (demo: **false**, paid: **true**)
— UI wiring gates the whole flow on it. Because v0.1 output is structurally gram-free, the same
result is redaction-safe for every tier; when a later slice adds the exact gram solve, the
existing optimization display policy pattern (demo/free direction-only, Pro exact, DEV trace)
applies to it.

## 6. What remains before production UI

1. ~~Exact add-only gram solve~~ — **Slice 19** attempts it through the real solver
   (`actual_batch` add-only context + regulator-band override) with rerun verification; grams appear
   only when verified. Large-gap NPAC rescues are honestly rejected by the solver's Golden-Middle
   verification (see [BRANCH_RECALCULATION_PREVIEW.md](BRANCH_RECALCULATION_PREVIEW.md)); multi-step
   solving remains future work.
2. ~~Integration Flow wiring~~ — **Slice 19** adds `dispatchIntegrationFlow`
   (`actual_batch_rescue` context → IF9); the `actual_grams !== null` auto-detection into that
   context is UI wiring, still pending.
3. Studio UI (Pro-gated via `canUseActualBatchRescue`), including the §17 five-option
   confirmation flow for volume increases.
4. DEV fixtures page — landed in Slice 19 as `/dev/branch-recalculation-preview` (shared with IF10).
5. ~~Stock-shortage branch IF10~~ — landed (Slice 18).
