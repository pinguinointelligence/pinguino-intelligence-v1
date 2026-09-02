# AGENT 1 — RUNTIME FORMULATION PATH FORENSICS (read-only)

**Program:** PINGÜINO ENGINE AUTHENTICITY — nightly, Agent 1
**Baseline:** `nightly/integration` = staging `6f8e680` (chore(staging): redeliver webhook for live-repair integration)
**Method:** static trace of every runtime entry into formulation + a live node spike
(temporary vitest file, run against the real pipeline, deleted, never committed) that
reproduced the owner's Strawberry-locked-900 result **byte-for-byte** and captured the
iteration diagnostics the pipeline itself reports. **No code was changed.**

---

## 1. The one runtime funnel

Every product surface that "recalculates with PI" funnels into ONE pipeline:

```
UI click („Przelicz z PI", workbar or in-flow button)
  → ProWorkspacePage.tsx:104 startRecalc()
  → constraintStudioStore.createOptimizePreview()          (constraintStudioStore.ts:363)
      → reconcile() → selectCanonicalDraft()               (constraintStudioStore.ts:90)
          → buildRecipeInput(recipeStore)                  (features/studio/buildRecipeInput.ts)
          → reconcileConstraints(items, §17 session)
  → buildOptimizePreview(input, set, now, {exclusions})    (applyPipeline.ts:804)
      → routeFormulationMode(input, set)                   (formulate.ts:80)
      ├─ 'unsupported'                → honest structured stop (no template for profile×temp)
      ├─ 'full_formulation' /
      │  'constrained_reformulation'  → buildFormulationPreviewInternal (applyPipeline.ts:660)
      │      → buildFormulationProposal (formulate.ts:291)  ← template seed + normalize()
      │      → iterateSolverToFixedPoint (applyPipeline.ts:565)
      │          → solveOneRound → proposeAutoFix/applyAutoFix (engine barrel)
      │          → mergeByCanonicalIdentity → ensureUniqueLineIds → restore (rescaleBatchToTarget)
      │      → acceptance (beatsBaseline — SKIPPED for constrained mode, applyPipeline.ts:740)
      │      → finishPreview → calculateRecipe (violations before/after)
      └─ 'local_correction'           → applyConstraintsToRecipe → restoreBatch
             → iterateSolverToFixedPoint → acceptance → withTemplateFallback (Phase 6)
  → Preview (ConstraintPreviewCard) → applyPreview()
  → commitPreview = VerifiedApply.commit                   (applyPipeline.ts:1185)
      gates: draftRevision, fingerprint, verifyConstraintsPreserved, duplicates,
             batch invariant (kind==='optimize'), beat-the-null (SKIPPED when hardConstrained)
  → recipeStore.applyVerifiedRecipeInput                   (recipeStore.ts:298; atomic + read-back)
```

The engine is genuinely called at every stage (`calculateRecipe`, `detectViolations`,
`proposeAutoFix`/`applyAutoFix` via the public barrel) — there is **no parallel engine**.
The authenticity problem is not a fake engine; it is **what the pipeline accepts as the
final answer when the engine solver contributes nothing** (§4).

---

## 2. Owner's table — every runtime entry into formulation

| Entry path | Runtime function | Engine called? | Solver called? | Template used? | Proportional scaling used? | Hardcoded values? | Final validation |
|---|---|---|---|---|---|---|---|
| **New recipe (starter/preset)** | `loadPreset` / `applyStarterRecipeInputToStudio` → `loadRecipeInput` (recipeStore.ts:468/475) | Yes (display via `useStudioResult`) | No (load only) | Yes — STARTER_TEMPLATES / demo presets, grams copied verbatim | No | Template grams (verbatim, labeled) | None needed — draft load; recalc goes through the funnel |
| **0 g selections (chosen-but-unfilled)** | `isEffectivelyLockedLine` (formulate.ts:57) → router → full formulation | Yes | Yes (iterated) | Yes | Seed only (normalize) — **plus §4 leak** | Zero-artifact rule (bare grams-lock@0 = unfilled) | `beatsBaseline` (unconstrained) + all commit gates |
| **Full formulation (hollow draft, no constraints)** | `routeFormulationMode` → `buildFormulationProposal` → `iterateSolverToFixedPoint` | Yes | Yes (≤12 verified-improvement rounds) | Yes (`selectFormulationTemplate`) | Seed only — template grams × batch/baseBatch, then `normalize()` | Template grams; `HARD_ROLES`; hollow-draft threshold `sum < 0.5·batch` (formulate.ts:142) | `beatsBaseline` MUST beat null (applyPipeline.ts:740) + commit improvement invariant |
| **Constrained reformulation (lock/range/exclusion present)** | Same path, mode `constrained_reformulation` | Yes | Invoked — but see §4 (can be structurally disabled) | Yes | **FINAL-OUTPUT VIOLATION — §4** | fruit_gelato template is `reference_derived` (staging-only, labelled) | `beatsBaseline` **SKIPPED** (740); commit improvement invariant **SKIPPED** when `hardConstrained` (1317-1329); locks byte-exact, batch, duplicates still gated |
| **Local correction (substantive unconstrained draft)** | `buildOptimizePreview` local branch (applyPipeline.ts:873-980) | Yes | Yes (iterated to fixed point) | No (unless fallback) | `restoreBatch` after each round (projection — §3.5) | `MAX_SOLVER_ROUNDS=12`; substantive threshold 0.5; ±25% baseline window (176-186) | Acceptance: fewer violations OR real-action severity drop; then all commit gates |
| **Exact lock (§17 padlock)** | `toggleLock` → constraint `{locked, grams}` + `lock_type:'grams'` → router `hard_constraints_present` | Yes | Invoked (adds of locked ingredient filtered) | Yes (constrained reformulation) | §4 | — | `verifyConstraintsPreserved` (Object.is, no epsilon) at commit |
| **Range (min/max)** | `setRangeConstraint` → validate → constrained reformulation; seed clamped `min(max(share,min),max)` (formulate.ts:364-371) | Yes | Yes | Yes | Seed clamp + re-normalize (2nd pass) — seed only | — | Range preserved at commit (`range_exceeded`) |
| **Unavailable / exclusion** | `removeItem` → `excludedIngredientIds` → `isToolboxCandidateExcluded` (toolboxCanonical.ts:52) | Yes | Yes | Yes — excluded candidate NEVER re-added; honest gap + recommendation | Seed only | Canonical toolbox↔Mapper id map (staging-verified, labelled) | Hard-role gap → `missing_required_role` stop (no preview) |
| **Removal (line delete)** | `removeItem` (recipeStore.ts:367) — draft-scoped exclusion; last-line removal resets exclusions | Yes (display) | On next recalc | On next recalc | — | — | Funnel gates on next recalc |
| **Batch scaling („Przeskaluj partię")** | `buildBatchRescalePreview` → `rescaleBatchToTarget` (constraintSet.ts:221) | Yes (result shown, violations counted) | No | No | **Yes — FINAL OUTPUT, sanctioned**: explicit user action; locked grams byte-kept, rest scaled by one factor | `BATCH_SUM_TOLERANCE_G = 0.1` | Honest refusals (actuals/no-scalable/locked-sum); finite-positive target gate at commit |
| **Suggested fix (§18.2 „Ustaw X g i przelicz")** | `buildSuggestedFixPreview` (applyPipeline.ts:1050) | Yes | Yes (optimize pass on adjusted lock) | Possibly | Via optimize path | — | **GAP:** on solver failure falls back to the bare `adjustedInput`; commit's batch + improvement invariants are `kind==='optimize'`-scoped, so a `suggested_fix` preview bypasses both (§5.3) |
| **Stock shortage (IF10)** | `BranchWorkflowPreviews` → `previewStockShortageRecalculation` | Yes | Route-dependent | No | Scale-down variant is explicit | Fixture intents | **Preview only — no Apply/Save exists** |
| **Rescue (IF9, poured actuals)** | Router `poured_actuals` → local corrector (add-only); panel: `solveBatchRescueSteps` (batchRescueStepSolver.ts:214) | Yes (per step) | Yes (focused, band-override walk) | No | No — add-only by construction | Step fractions | Per-step regulator verification; must move toward true band; **preview only** |
| **Template fallback (Phase 6)** | `withTemplateFallback` (applyPipeline.ts:839) after local `no_proposal`/`unsafe_proposal` | Yes | Yes (seeded rerun) | Yes (`localFallback:true` provenance) | Seed only | Band provenance rule (fallback-only violations → `best_safe_result`) | Same formulation gates; hard(native)-band failure keeps the honest local failure |
| **Saved-recipe recalc** | `supabaseRecipes` → `loadRecipeInput` (heals grams-lock@0 → unlocked; fresh §17 + exclusion context) → funnel | Yes | Yes | Route-dependent | §4 applies if constrained | — | Same funnel gates + `draftContextSeq` reset (stale-lock protection) |
| **Live corrections panel (Studio secondary)** | `useStudioResult` → `proposeCorrections` (display; demo redacted at source) | Yes | Yes (propose only) | No | No | Solver params (MIN_ACTION_GRAMS 0.05, MAX_ADDITION_FACTOR 2 — deterministic settings) | Display-only; never applies |
| **Optimization preview (Slice 15)** | `previewOptimization` → `makeRealRerunCorrection` | Yes | Yes | No | No | Regulator override bands | Rerun-verified; preview-only; save = audit record only |

---

## 3. Scaling / normalization / projection / template-gram-copy sites — classification

| # | Site | What it does | Classification |
|---|---|---|---|
| 3.1 | `formulate.ts:344` `roleTarget.grams * scale` | Template grams copied × (batch / baseBatchG) | **Initial-seed-only** (by design) — but see 3.2 leak |
| 3.2 | `formulate.ts:514-547` `normalize()` | Fixed lines keep grams; adjustable template lines scaled proportionally to fill the remainder (two passes, range clamps) | **FINAL-OUTPUT — THE VIOLATION.** Intended as seed-only, but becomes the shipped final result whenever `iterateSolverToFixedPoint` contributes nothing (§4 — proven at runtime) |
| 3.3 | `formulate.ts:361-373` locked/user grams carry-over; role share split | Byte-preserve / equal split of a role's target among the user's lines of that role | Seed-only; locks byte-exact ✓ |
| 3.4 | `applyPipeline.ts:176-186` `improvementBaseline` | Proportional projection (or equal split) of the draft to the batch | Comparison baseline ONLY — never output ✓ |
| 3.5 | `constraintSet.ts:221-267` `rescaleBatchToTarget` as `restore`/`restoreBatch` (applyPipeline.ts:711-715, 881-885) | After EVERY solver round, non-preserved lines rescaled by one factor back to the batch | **FINAL-OUTPUT projection, runs on the accepted result each round.** Legitimate as a batch invariant, but (a) it invalidates the solver's mass-change-aware exact grams every round, and (b) it runs AFTER the engine's capacity verify — the §4 disabling mechanism |
| 3.6 | `constraintSet.ts` `rescaleBatchToTarget` via `buildBatchRescalePreview` | Explicit „Przeskaluj partię" | FINAL OUTPUT **by sanctioned design** (explicit user action; honest refusals) ✓ |
| 3.7 | `intentRecipeDraft.ts` STARTER_TEMPLATES / `demoPresets` | Template grams into a fresh draft | Initial-seed-only ✓ |
| 3.8 | `formulate.ts:549-553` post-normalize `added[].grams` update | Reports auto-added grams | Reports the **SEED** grams; never refreshed after the solver iteration → §5.2 display divergence |
| 3.9 | `buildSuggestedFixPreview` fallback `adjustedInput` (applyPipeline.ts:1078-1089) | Single line set to fix grams, rest untouched | FINAL OUTPUT with **no batch normalization and no improvement gate** (§5.3) |

---

## 4. CRITICAL CASE — Strawberry locked 900 g, fruit_gelato, −11 °C, batch 1000 g

### 4.1 Reproduction (live spike, real pipeline, staging code 6f8e680)

Input: one line `STRAWBERRIES` 900 g, `lock_type:'grams'`, §17 constraint `{locked, 900}`,
category `fruit_gelato`, −11 °C, batch 1000 g, **machine_capacity_grams = 1000** (the
natural Pro setting: capacity = batch). Spike output — the pipeline's own diagnostics:

```
PREVIEW grams: strawberry 900 / milk_3_5 55.97 / cream_30 11.78 / smp 5.89
               / sucrose 16.20 / dextrose 5.16 / tara_gum 5        (sum 1000)
iteration: { solverInvocations: 1,
             rounds: [{round 0, violations 10, severity 22.647}],
             stopReason: 'fixed_point_no_proposal',
             stopDetail: 'provisional_band_conflict', capped: false }
```

**This is byte-for-byte the owner's reported result** — and it is EXACTLY the template
seed: fixed = 900 (lock) + 5 (tara, `adjustable:false`); remainder 95 g; adjustable
template mass 645 g (380+80+40+110+35); factor 95/645 = 0.147287 →
Milk 55.9690 / Cream 11.7829 / SMP 5.8915 / Suc 16.2016 / Dex 5.1550. Pure
`fruit_gelato_ref_v1` ratios proportionally scaled into the 100 g non-fruit envelope.
The seed is **composition-independent** — the spike used a raspberry-derived fruit and
still hit the owner's numbers exactly, proving no engine/science input touches the
initial gram assignment.

### 4.2 The EXACT call stack

1. `ProWorkspacePage.tsx:105` → `createOptimizePreview()` (`constraintStudioStore.ts:363`)
2. `selectCanonicalDraft()` (`constraintStudioStore.ts:90`) → `buildOptimizePreview` (`applyPipeline.ts:818`)
3. `routeFormulationMode` (`formulate.ts:80`): `hardConstraints=true`; `allLocked=true` but
   template hard roles NOT covered (only fruit present) → **`constrained_reformulation`**,
   template `fruit_gelato_ref_v1` (**status `reference_derived`** — staging-only, not approved science)
4. `buildFormulationPreviewInternal` (`applyPipeline.ts:660`) → `buildFormulationProposal`
   (`formulate.ts:291`): strawberry → role `fruit`, fixed 900 (constraint grams verbatim);
   `milk_3_5/cream_30/smp/sucrose/dextrose` auto-added at template grams; `tara_gum` 5 g fixed
   (`adjustable:false`) → **`normalize()` (`formulate.ts:514`) = the proportional projection** (§3.2)
5. `iterateSolverToFixedPoint` (`applyPipeline.ts:565`), round 1 → `solveOneRound`
   (`applyPipeline.ts:484`) → `proposeAutoFix` → `proposeCorrections` (`engine/corrections/solver.ts:287`)
   - 10 violations detected — **ALL on `category_fallback` bands** (fruit_gelato is UNSEEDED,
     `targets.ts:30-31`: scored with milk_gelato bands): ice_fraction 75.6 (45–54.5),
     npac 13.0 (33–42), pod 7.1 (12–17), water 83.2 (57–70), total_solids, fat,
     aerating_protein, protein_in_solids, lactose, lactose_sandiness — all soft
   - ADD candidates (dextrose 178.5 g, sucrose 392.1 g) → `verifyCorrectionProposal`
     (`verify.ts:124`) → **capacity gate `verify.ts:139-144`: hypothetical total 1178.5 g >
     capacity 1000 g → rejection `'capacity'`** — the capacity is judged on the PRE-restore
     mass; the pipeline's own batch restore (which would return the candidate to exactly
     1000 g) runs only AFTER the engine verify (§3.5)
   - REDUCE path (`solver.ts:456`): dominant contributor = the 900 g strawberry →
     `isReductionAllowed` = false (grams-lock) → blocking `'locked_ingredient'`
   - → only the actions-empty blocked proposal remains → `applied: null`
6. Iteration stops: `stopReason 'fixed_point_no_proposal'`, 1 invocation; band provenance
   reclassifies `stopDetail → 'provisional_band_conflict'` (`applyPipeline.ts:634-644`)
7. Acceptance `applyPipeline.ts:740`: `mode !== 'constrained_reformulation'` is FALSE →
   **`beatsBaseline` SKIPPED — constrained mode may equal the null by explicit design**
8. `finishPreview` → the SEED becomes the Preview; violations 10 → 10
9. `commitPreview` (`applyPipeline.ts:1185`): constraints preserved (900 `Object.is` ✓),
   no duplicates ✓, batch 1000 ✓, `hardConstrained=true` → **improvement invariant SKIPPED
   (`applyPipeline.ts:1317-1329`)** → `VerifiedApply` → `applyVerifiedRecipeInput` writes it.

### 4.3 Why the solver made zero improving moves — the three hypotheses answered

- **"Solver not invoked?"** — NO. Invoked exactly once (`solverInvocations: 1`); it returned
  only the blocked proposal (every ADD capacity-rejected on pre-restore mass; the only
  REDUCE candidate is the locked strawberry).
- **"Fallback bands give no gradient?"** — The bands DO give a numeric gradient. Spike
  control run WITHOUT the capacity cap (`machine_capacity_grams: null` or 1200): the solver
  accepts **12 capped rounds** chasing fallback-band severity (22.647 → 14.271, violations
  10 → 10, `stopReason 'iteration_cap'`) and the final preview is
  `milk 0.21 / cream 0.05 / smp 0.02 / sucrose 0.06 / dextrose 99.64 / tara 0.02` —
  a sugar-water absurdity in the 100 g envelope, **also accepted and appliable** through the
  same skipped gates. The gradient exists; it is scientifically meaningless for a 90 %-fruit
  recipe scored on milk_gelato bands.
- **"Constrained acceptance allows equal-to-null?"** — YES, at two sites:
  `applyPipeline.ts:740` (preview acceptance) and `applyPipeline.ts:1317-1329`
  (commit gate, `hardConstrained` exemption). Both are deliberate (owner P0 constrained
  semantics) — but combined with the capacity mechanism they let the raw proportional
  projection ship as the final "optimized" recipe with NO improving work performed.

**Deciding mechanism:** `machine_capacity_grams === target_batch_grams` structurally
disables the ADD half of the solver for EVERY at-batch recipe (any add of ≥ 0.05 g exceeds
capacity pre-restore), and a locked dominant line disables the REDUCE half. This applies to
the local-correction path too, not only formulation.

---

## 5. Secondary findings (runtime-verified or code-pinned)

1. **Iteration-cap drift (no capacity):** the same case without a capacity cap ships the
   Dekstroza-99.64 monster after 12 rounds (§4.3) — the cap is reported honestly
   (`capped: true`) but the RESULT is still presented and appliable.
2. **Preview display divergence:** `preview.formulation.added[].grams` are frozen at SEED
   values (`formulate.ts:549-553`; never refreshed after `iterateSolverToFixedPoint`),
   while the diff rows (`preview.lines`) show the post-solver truth. In the no-capacity run
   the card says „PI dodało Mleko 3,5% (55,97 g)" next to a diff row `Mleko → 0,21 g`.
3. **`suggested_fix` gate gap:** commit's batch invariant and improvement invariant are
   `kind === 'optimize'`-scoped (`applyPipeline.ts:1271, 1288, 1307`); a `suggested_fix`
   preview (whose fallback is the un-normalized `adjustedInput`) bypasses both.
4. **fruit_gelato template provenance:** `fruit_gelato_ref_v1` is `reference_derived`
   (goldenRecipes raspberry-premium proportions), explicitly NOT approved science; the
   Preview labels it, but it still drives real customer-visible formulation on staging.
5. **What already works honestly (verified in trace):** locks byte-exact (`Object.is`);
   exclusions never reintroduced (canonical + Mapper id); zero-gram artifact healing on
   load; duplicate merge by canonical identity + duplicate invariant at commit; batch
   invariant for optimize; atomic write with read-back rollback; rescue/shortage previews
   never write; demo redaction at source.

---

## 6. EXACT DEFECT STATEMENT — for Agent 3

> **DEFECT (constrained reformulation ships the proportional template projection as the
> final output).** In `buildFormulationPreviewInternal` (applyPipeline.ts:660), the
> template seed produced by `normalize()` (formulate.ts:514 — template ratios
> proportionally scaled into the non-locked remainder) becomes the ACCEPTED final recipe
> whenever `iterateSolverToFixedPoint` contributes nothing, because constrained mode is
> exempt from `beatsBaseline` (applyPipeline.ts:740) and from the commit improvement
> invariant (applyPipeline.ts:1317-1329). The solver is **structurally disabled** whenever
> `machine_capacity_grams === target_batch_grams`: `verifyCorrectionProposal` judges
> capacity on the PRE-restore hypothetical mass (verify.ts:139-144) while the pipeline's
> batch restoration (`rescaleBatchToTarget`) runs only AFTER the engine verify — so every
> ADD of ≥ 0.05 g is capacity-rejected, and with the dominant line locked, REDUCE is
> blocked too (`solveOneRound` → `applied: null`, 1 invocation). Reproduced exactly:
> strawberry locked 900 g / fruit_gelato / −11 / batch 1000 / capacity 1000 →
> Milk 55.97 / Cream 11.78 / SMP 5.89 / Suc 16.20 / Dex 5.16 / Tara 5 = seed shipped
> verbatim. WITHOUT the capacity cap the same case instead ships a 12-round
> fallback-band severity chase (`iteration_cap`) ending at Dekstroza 99.64 g / Mleko
> 0.21 g in the 100 g remainder — fruit_gelato is UNSEEDED and scored on milk_gelato
> `category_fallback` bands (targets.ts:30-31), a scientifically meaningless gradient for
> a 90 %-fruit mix. **Repair directions:** (a) verify capacity on the RESTORED candidate
> (or restore before verify); (b) a real constrained acceptance gate — the result must
> improve on the seed (violations or engine severity) OR return an honest
> `best_safe_result`/blocked state instead of a Preview; (c) never iterate to the cap on
> pure `category_fallback` bands for unseeded profiles — classify as provisional and stop
> honestly; (d) refresh (or re-label as seed) `formulation.added[].grams` post-iteration;
> (e) extend the batch/improvement commit invariants to `suggested_fix` previews.

---

## 7. Provenance

- Trace target: `nightly/integration` @ `6f8e680` (staging).
- Spike: temporary vitest file over the real modules (`buildOptimizePreview`,
  `buildFormulationProposal`, `routeFormulationMode`, `proposeAutoFix`,
  `rescaleBatchToTarget`, `classifyViolationBands`), demo-catalogue fruit ingredient;
  run twice (capacity 1000 / 1200 / null); file deleted after capture — **no src change,
  nothing committed to src**.
- Build-history cross-check: at `510659b` (owner's live-test build) the loop was ≤ 2
  rounds without the improvement check; at `d8cfd18`/`3316f2b` ≤ 2 rounds; the
  seed-as-final mechanism (§4) is identical in all of them — the capacity/lock zero-move
  case shows the seed on every build since `d8cfd18`.

AGENT 1 — docs-only. No production file touched.
