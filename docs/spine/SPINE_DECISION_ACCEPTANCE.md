# Spine Decision Layer — Acceptance Matrix & Status (Slice 25)

_Created 2026-07-11 (Spine Slice 25, branch `slice/spine-decision-completion`). Companion to
[BATCH_RESCUE_FLOW.md](BATCH_RESCUE_FLOW.md) (IF9), [STOCK_SHORTAGE_FLOW.md](STOCK_SHORTAGE_FLOW.md)
(IF10) and [BRANCH_RECALCULATION_PREVIEW.md](BRANCH_RECALCULATION_PREVIEW.md) (exact previews).
This document is the acceptance-status record for the PURE decision/calculation layer: what is
active, what is intentionally unsupported, which gates suppress numbers, which module owns each
decision, and which test pins each claim._

**Status: pure decision layer, preview-only.** No persistence in any module below; the only DB
write path in the wider slice family remains the Slice-24 accepted-corrections table (out of scope
here). Everything in this document is proven by vitest (fixtures + the real engine — no DB).

---

## 1. Decision ownership (one module per decision — no seconds)

| Decision | Owning module | Nothing else may decide it |
|---|---|---|
| Context dispatch (recipe_design / actual_batch_rescue / stock_shortage) | `src/spine/integrationFlowDispatch.ts` — the ONLY dispatcher | missing payloads block (never inferred); unknown context `not_supported` (never remapped) — `integrationFlowDispatch.test.ts` |
| Recipe-design decision (ready/warning/tradeoff/impossible/blocked) | `src/spine/integrationFlowRouter.ts` | `integrationFlowRouter.test.ts` |
| Profile × temperature target band | engine `selectTargetBand` over live `TARGET_BANDS` (CONFIG 0.6.0, 12 seeded cells) | classifier, solver violation detection, previews and the Slice-14 override all carry the SAME cell — `spineDecisionAcceptance.test.ts` (all 12 cells) |
| Regulator verdict (acceptable / hard-gate failures / correction goals) | `src/spine/evaluateTemperatureRegulator.ts` (settings from `temperatureRegulator.ts`, gate levels from the Product Profile Registry) | `evaluateTemperatureRegulator.test.ts`, `temperatureRegulator.test.ts` |
| Optimization routing (no_action_needed/tradeoff/impossible/blocked/optimized) | `src/spine/optimizationFlowRouter.ts` + rerun verdict `verifyOptimizationRerun` | `optimizationFlowRouter.test.ts` |
| IF9 rescue decision (direction-level, gram-free) | `src/spine/batchRescueRouter.ts` | `batchRescueRouter.test.ts` |
| IF10 shortage decision (strategy precedence, gram-free) | `src/spine/stockShortageRouter.ts` | `stockShortageRouter.test.ts` |
| Exact grams (ALL of them) | the engine: `proposeAutoFix`/`applyAutoFix`/`calculateRecipe` — invoked only from `src/features/optimization/*` pure preview modules | no spine module imports the engine; no module computes pod/npac/ice outside `calculateRecipe` (see §5) |
| Numbers visibility per tier | `optimizationPreviewPolicy.ts` + `branchWorkflowPolicy.ts` (+ engine-side demo redaction at source) | `optimizationPreviewPolicy.test.ts`, `BranchWorkflowPreviewPanel.test.tsx` |

## 2. Gates that suppress numbers (no exact grams / ratios / snapshots past these)

1. **Verification gate** — a failed regulator rerun (`impossible`: no gain, or any new/worsened
   hard gate) ⇒ `verification_failed`, `exactActions: []`, `proposedRecipeSnapshot: null`
   (`branchRecalculationPreview.test.ts` "exact grams appear ONLY on verified statuses…";
   `batchRescueStepSolver`/`batchRescueMultiLeverSolver` empty `cumulativeActions` on
   `verification_failed`).
2. **Safety gate** — food-safety concern (IF9) and safety-blocked substitution (IF10, incl. dairy
   into sorbet/vegan) ⇒ `unsafe`; the solver is never invoked
   (`branchRecalculationPreview.test.ts` "food-safety concern is unsafe…", "an unsafe
   (dairy-into-sorbet) substitute is unsafe…").
3. **Missing-data gate** — missing batch size / stock quantities / observed temperature /
   duplicate line ids ⇒ `blocked_missing_data`; nothing is invented (router tests + preview tests).
4. **Physical gate** — frozen batch (no additions), outstanding physical measurements (icy/sandy),
   non-compositional actions (cabinet temperature) ⇒ `not_attempted`, no grams.
5. **Direction gate** — an observation contradicting the measured metric direction is refused
   BEFORE any solve (`observation_contradicts_measured_direction`; the walks additionally refuse
   any step that moves a metric opposite its declared direction).
6. **Provenance gate** — substitution numbers require `validateVerifiedSubstitute`: allowlisted
   provenance only (`internal_reference_catalog`/`owner_verified_entry`); Mapper rows and
   PI-Calculated products are DENIED; hand-typed compositions cannot enter production Studio
   (bundle-purity-checked) (`verifiedSubstituteContract.test.ts`).
7. **Tier gate** — Demo/Free never see exact grams / scale ratios / before-after metrics; the DEV
   trace is additive and never relaxes redaction (`branchWorkflowPolicy`,
   `optimizationPreviewPolicy` tests).

## 3. Forbidden fallbacks (each one is test-pinned to NOT happen)

| Forbidden | Pinned by |
|---|---|
| Chocolate silently using milk bands | `statuses.test.ts` "chocolate / sorbet / vegan select their own bands — no milk fallback"; `spineDecisionAcceptance.test.ts` "chocolate NEVER silently reuses the milk bands" (band inequality at all 3 temperatures) |
| Sorbet/vegan falling back to dairy behavior | dairy gates disabled in bands + regulator (`statuses.test.ts` "sorbet/vegan bands omit the regulator-DISABLED dairy gates"); dairy correction candidates category-gated OUT (`solver.test.ts` "NO dairy candidate for sorbet or vegan_gelato — any metric, direction or ranking") — **fixed in this slice, see §6** |
| Unsupported profile/temperature remapped | routers/regulator/previews all block with a reason (`granita-blocked` fixture; router tests "never remapped") |
| Unseeded categories silently treated as calibrated | fruit/nut/alcohol keep the DOCUMENTED milk fallback, ALWAYS flagged `category_fallback` (`spineDecisionAcceptance.test.ts`; `statuses.test.ts`) |
| Advisory gates escalated to hard | chocolate protein-share stays advisory in routing, injection and shadow solves (`optimizationFlowRouter.test.ts`, `solverTargetInjection.test.ts`) |
| Pre-branch (stale) values reported after a recipe change | the after-state is always a FRESH regulator evaluation of the FULL resulting recipe (`spineDecisionAcceptance.test.ts` §"fresh regulator evaluation"; preview-equals-engine tests) |
| A tradeoff/partial presented as fully optimized/rescued | `verifyOptimizationRerun` decisions; `BRANCH_STATUS_LABEL` "partial improvement — not fully rescued" (`BranchWorkflowPreviewPanel.test.tsx`); "never faked optimized" tests in `optimizationRerunPreview.test.ts` |
| An impossible outcome fabricating a correction | `buildBlockedProposal` (engine) + "impossible never fabricates" paths (`optimizationRerunPreview.test.ts`, `batchRescueMultiLeverSolver.test.ts` "honest, no grams") |

## 4. Acceptance matrix (B1)

Profiles: **standard** (milk_gelato) · **chocolate** · **sorbet** · **vegan**. Temperatures:
**−11 / −12 / −13**. Legend: **T** = tested before this slice (file · test), **N** = newly tested in
this slice, **U** = intentionally unsupported (honest deterministic outcome, pinned).

### 4.1 Band/dispatch grid — all 12 profile × temperature cells

| Output | Status | Evidence |
|---|---|---|
| Own seeded band, no category/temperature fallback (12/12 cells) | **N** | `spineDecisionAcceptance.test.ts` "every cell selects its OWN seeded band" |
| Engine band ≡ regulator band (shadow ALIGNED, 12/12) | **N** (spot cells were **T**: `temperatureAwareTargetBands.test.ts` std −11/−12/−13, choc −13, sorbet −12, vegan −13) | `spineDecisionAcceptance.test.ts` "every cell is ALIGNED…" |
| Slice-14 override ≡ engine npac band (12/12; ONE documented residual: std −11 engine [33,42] vs regulator [33,43], center Δ0.5 ≤ tolerance 1) | **N** | `spineDecisionAcceptance.test.ts` "…one documented residual" |
| Dispatcher routes the three contexts; missing payload blocks; unknown context not_supported | **T** | `integrationFlowDispatch.test.ts` (12 tests) |
| Unseeded fruit/nut/alcohol → flagged milk fallback (calibration-pending) | **T**/**N** | `statuses.test.ts:136`; `spineDecisionAcceptance.test.ts` "unseeded categories…" |

### 4.2 Starting states × outcomes

| Starting state | standard | chocolate | sorbet | vegan |
|---|---|---|---|---|
| **In-band → no action needed** | **T** `optimizationFlowRouter.test.ts` "a ready recipe needs no action (idempotence)"; `optimizationRerunPreview.test.ts` "ready → no_action_needed and never calls the solver" | **T** acceptable-with-advisory ⇒ warning, never a blocker: `optimizationPreviewRunner.test.ts` "the chocolate advisory case never becomes a hard blocker"; pure-level golden C01 in `temperatureRegulator.test.ts` | **T** real-engine end-to-end: `optimizationPreviewRunner.test.ts` "the sorbet fixture is ready/warning → no action needed" | **T** pure level (`temperatureRegulator.test.ts` V01/V02 goldens; `integrationFlowRouter.test.ts` "Vegan uses the vegan regulator"); real-engine in-band state: `batchRescueMultiLeverSolver.test.ts` "an already-acceptable state needs no steps and never claims false failure" |
| **One-lever correctable** | **T** real solver+rerun: `optimizationPreviewRunner.test.ts` "the tradeoff fixture…real solver + Base Engine rerun" / "…never faked optimized"; `optimizationRerunPreview.test.ts` "a correction that fully fixes the recipe → optimized" | shared solve path (chocolate uses its own bands — §4.1; dairy levers legal for chocolate); no chocolate-specific exact-solve fixture — the chocolate-specific behaviors (own band, advisory protein share) are pinned separately | **N** IF9 sorbet too_soft → NON-dairy water solve, `partial_improvement`: `branchRecalculationPreview.test.ts` "sorbet too_soft: a REAL out-of-band sorbet is rescued with NON-dairy additions only" | **N** IF9 vegan too_soft → verified water solve, **`calculated`**: `branchRecalculationPreview.test.ts` "vegan too_soft: …VERIFIED water rescue — never dairy" |
| **Multi-lever correctable** | **T** measured two-lever full rescue: `batchRescueMultiLeverSolver.test.ts` "COMPATIBLE residual gates step and FULLY RESCUE with two different levers (measured)" | shared path (see left) | **T** the measured two-lever fixture is the diluted-sorbet composition | **U** vegan `fat_low` has NO engine candidate (no plant-fat entry in the catalog; adding one would mean inventing a composition) ⇒ honest `no_valid_correction`/impossible; empty candidate set pinned by `solver.test.ts` "NO dairy candidate…" |
| **Add-only rescue (IF9)** | **T** −12 partial (`branchRecalculationPreview.test.ts` "too-hard rescue: single-shot honestly rejected, multi-step walk…"); −11 overshoot ⇒ partial (`batchRescueMultiLeverSolver.test.ts` "unified semantics…PARTIAL, never calculated") | route level **T** (`batchRescueRouter.test.ts` — profile-gated levers); no chocolate exact-rescue fixture (shared solve path) | **N** exact preview (see one-lever row); route-level dairy-free levers **T**: `batchRescueRouter.test.ts` "sorbet / vegan never get dairy levers for too_soft" | **N** exact preview `calculated` (see one-lever row) |
| **Scale-down (IF10)** | strategy is profile-independent (uniform ratio); router precedence **T** `stockShortageRouter.test.ts` | ← same | **T** exact verified scale-down: `branchRecalculationPreview.test.ts` "scale-down produces the verified scaled snapshot with the exact ratio"; **N** per-line ×ratio coherence: `spineDecisionAcceptance.test.ts` | ← same (router level) |
| **Tradeoff (never oversold)** | **T** `optimizationRerunPreview.test.ts` "a partial correction…→ tradeoff"; labels number-free `optimizationPreviewPolicy.test.ts` | **T** advisory stays warning | **N** partial labelled partial (sorbet rescue) | **T** rescue `rescue_with_tradeoff` route + honest labels |
| **Impossible (never fabricated)** | **T** `gelato-impossible` fixture: `optimizationPreviewRunner.test.ts` "the impossible fixture stays impossible (a no-lever hard gate, no correction plan)" | **U** structural cocoa goals are `approximate`, feasibility-labelled; never silently solved (`optimizationFlowRouter` GOAL_SPECS + advisory tests) | **T** −12 npac dead zone: `batchRescueMultiLeverSolver.test.ts` "the stuck −12 npac state finds NO improving candidate — honest, no grams" (ENGINE solve-model boundary, documented in [BRANCH_RECALCULATION_PREVIEW.md](BRANCH_RECALCULATION_PREVIEW.md)) | **T** dairy goal for vegan rejected → impossible: `optimizationFlowRouter.test.ts` "a hard goal with no allowed lever (dairy for a vegan) is rejected → impossible, never remapped" |
| **Verified substitute (IF10)** | contract is profile-agnostic; family/safety gates **T** `verifiedSubstituteContract.test.ts` | ← same | **T** raspberry split-swap `calculated`: `verifiedSubstituteContract.test.ts` "the verified raspberry substitute recalculates through the REAL engine and regulator"; **N** swap-mass + engine-equality pins: `spineDecisionAcceptance.test.ts` | **T** dairy-into-vegan hard block (no flag overrides): `verifiedSubstituteContract.test.ts`, `stockShortageRouter.test.ts` "vegan NEVER receives a dairy substitute" |
| **Verification failure → NO numbers** | **T** IF9: `branchRecalculationPreview.test.ts` "exact grams appear ONLY on verified statuses…"; walk-level empty actions on `verification_failed` (`batchRescueStepSolver`/`batchRescueMultiLeverSolver` tests) | ← same mechanism (shared) | **T** substitution breaking a hard gate ⇒ `verification_failed`, no snapshot (`verifiedSubstituteContract.test.ts` "unsafe contract…never calculated") | **T** (shared mechanism) |

### 4.3 Outputs (columns of the matrix) — where each is pinned

| Output | Pinned by |
|---|---|
| Dispatcher route | `integrationFlowDispatch.test.ts` |
| Selected bands | `spineDecisionAcceptance.test.ts` 12-cell grid + `statuses.test.ts` |
| Branch result / decision | per-router test files (§1) |
| Recalculated recipe = direct `calculateRecipe` | **N** `spineDecisionAcceptance.test.ts` "every exact preview equals a DIRECT calculateRecipe re-run" (IF9 partial, IF9 calculated, IF10 scale-down, IF10 substitution) |
| Batch/normalized totals coherent | **N** `spineDecisionAcceptance.test.ts` "batch totals stay coherent…" (add-only mass ledger; per-line ×ratio; swap preserves line + batch mass) |
| Exact preview statuses | `branchRecalculationPreview.test.ts` (25+ tests) |
| Violation state is fresh, never stale | **N** `spineDecisionAcceptance.test.ts` "the after-state is ALWAYS a fresh regulator evaluation" |
| Deterministic traces / ordering | "is deterministic" tests in every router/preview file; multi-lever ordering spec (fewer failures → distance gain → fewer grams → stable tiebreak) documented in `batchRescueMultiLeverSolver.ts` |
| Verification state | rerun tests (`optimizationFlowRouter.test.ts` §verifyOptimizationRerun; preview tests) |
| Numbers visible? | tier policies + structural gram-free router outputs (`batchRescueRouter.test.ts` "NO exact grams anywhere…", `stockShortageRouter.test.ts` "output is gram-free…") |

### 4.4 Intentionally unsupported (each with its honest, pinned outcome)

| Cell | Honest outcome | Pinned |
|---|---|---|
| IF9 problems `not_sweet_enough` / `stabilizer_issue` / `texture_differs_from_expected` (v0.1) | `not_supported` + `problem_recognized_but_not_supported_in_v01` | `batchRescueRouter.test.ts` "vocabulary members not yet routed (v0.1)" |
| IF10 substitution WITHOUT a verified-composition contract | `not_attempted` + `substitute_composition_not_in_contract_v01` (route decision stays `substitution_possible`; numbers only via the Slice-22 contract) | `branchRecalculationPreview.test.ts` "a viable substitution is honestly not_attempted…" |
| Mixed shortage strategies (substitute one line, scale another) | not combined in v0.1 — warned `mixed_shortage_strategies_not_combined_v01` | `stockShortageRouter.ts` + router tests |
| Large-gap −12 NPAC single-shot rescue | engine Golden-Middle verification rejects (per-batch vs per-water NPAC model); walk finds `no_improving_candidate`; no grams forced | `batchRescueMultiLeverSolver.test.ts` "stuck −12 npac…honest, no grams" |
| Vegan/sorbet `fat_low` exact solve | no non-dairy fat-up candidate exists in the engine catalog (a plant-fat candidate would require inventing a composition) → `no_valid_correction` | `solver.test.ts` dairy-gate tests (empty candidate set) |
| Unseeded categories (fruit/nut/alcohol) as calibrated cells | milk fallback, ALWAYS flagged `category_fallback` (calibration-pending) | `spineDecisionAcceptance.test.ts`; `statuses.test.ts` |
| Granita / protein / fresh / −18 storage / frozen drinks | `blocked` / `not_supported`, never remapped | `normalizeProductProfile.test.ts`; `granita-blocked` fixture |
| IF10 scale verification divergence | defense-in-depth only: uniform scaling is exact linear math, so the `verification_failed` guard is not reachable with valid inputs; kept as a tripwire | code path in `previewStockShortageRecalculation` (guard + warning) |
| Reprocess-required / purchase / reformulation numbers | `not_attempted` — grams for these strategies would be fake | `branchRecalculationPreview.test.ts` frozen/strategy tests |

## 5. Single-calculator audit (B2)

`calculateRecipe` is the ONLY recipe-math engine. Verified 2026-07-11 by sweep:

- Modules invoking the canonical engine (`calculateRecipe`/`proposeAutoFix`/`applyAutoFix`):
  `src/engine/**` and the pure preview layer `src/features/optimization/**` (runner, both rescue
  walks, branch previews, solver injection, shadow bands) plus app consumers
  (`useStudioResult`, `recipeStore`, `intentRecipeDraft`, dev pages) — all via the `@/engine` barrel.
- **No parallel pod/npac/ice computation exists** outside the engine. The one place engine formulas
  are mirrored is `src/spine/baseEngineMetricsAdapter.ts` (protein-share & lactose-sanding
  fallbacks, documented "per the Base Engine status stage") — it READS engine results (indicators
  first) and never recalculates a recipe; a null core metric becomes NaN + `missingFields`, never a
  silent zero (`integrationFlowRouter.test.ts` adapter suite).
- The comparison-only layers are labelled: `temperatureAwareTargetBands` (shadow, non-live) and
  `solverTargetInjection` (preview injection; the applied result is always the real, un-overridden
  `calculateRecipe`).
- The engine solver reads its target bands ONLY from `RecipeResult.indicators[].band`
  (= `selectTargetBand` over live `TARGET_BANDS`) plus the additive Slice-14 override; no
  hard-coded band exists in the solver (`solver.ts` `bandOf`; override-equality test
  "the Slice-14 override seam still works and equals the default when given the same band").

## 6. Defect found & fixed in this slice (the one code change)

**Dairy correction candidates reached sorbet/vegan exact solves.** The IF9/IF10 ROUTERS were always
dairy-safe (profile-gated lever families), but the ENGINE candidate catalog gated only `water` by
category — `npac_high`/`ice_fraction_low`/`pod_high`/`fat_high`/`total_solids_low` listed dairy
candidates (smp/cream/milk) with no `allowed_categories`. Because sorbet/vegan regulator settings
DISABLE the dairy gates (metrics-level verification cannot see ingredient identity), a too-soft
sorbet exact preview emitted `add Milk 3.5% ≈525 g` (`partial_improvement`) and a too-soft vegan
batch `add Milk 3.5% ≈691 g` reported as **`calculated`** — violating the locked hard rule that no
flag can put dairy into sorbet/vegan.

Fix (minimal, mechanism-consistent, in `src/engine/corrections/candidates.ts`):
1. `milk_3_5`, `cream_30`, `smp` gained `allowed_categories: DAIRY_ALLOWED_CATEGORIES` (every
   category EXCEPT `sorbet`/`vegan_gelato`);
2. `water` was appended LAST to the `npac_high` and `ice_fraction_low` rules — water is already
   category-gated to sorbet/vegan/fruit and the solver consumes at most the first THREE candidates
   per violation, so **every dairy-category solve is byte-identical to before** (pinned:
   `solver.test.ts` "dairy categories are UNCHANGED…"), while sorbet/vegan keep the physically
   correct non-dairy dilution lever instead of a dairy proposal.

Proof: `solver.test.ts` (engine gate, all metrics × directions × rankings),
`branchRecalculationPreview.test.ts` (IF9 sorbet/vegan end-to-end, no dairy anywhere incl. walks
and snapshots), `optimizationPreviewRunner.test.ts` (planning-context solves, both engine-seeded
and regulator-shadow). Full suite green (2,135 tests), goldens untouched, `TARGET_BANDS` untouched,
CONFIG_VERSION unchanged (data-only candidate gating; no band or formula change).

## 7. Gate results (this slice)

`npx tsc --noEmit` · `npm run lint` · `npx vitest run` (163 files / 2,135 tests) · `npm run build`
— all green at commit time. New tests: +22 (3 engine candidate-gate, 3 IF9 profile-safety,
2 planning-path profile-safety, 14 acceptance pins in
`src/features/optimization/spineDecisionAcceptance.test.ts`).

```text
If a rule is missing, stop and ask. (Locked-document convention — applies to this file too.)
```
