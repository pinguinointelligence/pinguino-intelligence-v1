# PINGUINO — Next Implementation Roadmap

_Created 2026-07-05, realigned 2026-07-06 alongside [PINGUINO_SPINE.md](PINGUINO_SPINE.md).
Sequencing map from the current repo state to the locked Spine v1.0 architecture. The locked
documents in [`docs/pinguino-spine/`](pinguino-spine/) define **what** each module must do; this
file only orders the work. The owner's official planning document remains
[PINGUINO_MASTERPLAN_V1.md](PINGUINO_MASTERPLAN_V1.md)._

Two independent critical paths exist today:

- **Human path (A → B):** Mapper calibration, then Mapper completion. Blocked on the team/owner;
  no code work unlocks it.
- **Code path (C → D):** the Spine's Recipe-Intelligence layer. Pure contracts + config on top of
  the frozen Base Engine; it does **not** wait for Mapper calibration and can start immediately.

They merge at Phase E (Studio uses both matched products and the new Spine flow).

---

## Phase A — Nicolas/team calibration (HUMAN — the current gate)

**Goal:** turn the 12 staged reference proposals into approved locked references, resolve the
4 owner picks, and confirm the products they unlock.

- Work from [mapper/OWNER_TEAM_CALIBRATION_HANDOFF.md](mapper/OWNER_TEAM_CALIBRATION_HANDOFF.md)
  (proposal table, owner-pick options with engine consequences, after-fill workflow, do-not list).
- Team fills PAC/POD per proposal (calibration pack export exists at `/dev/reference-proposals`).
- Owner decides the 4 parked picks (incl. the POD-spread and pac-variant ties).
- Seed-migration PREVIEW built from the filled values → owner approval → **human** applies the
  `mapper_basement` insert (the only approved write path).
- Rerun the matcher over the 43 null products (band/tiebreak pre-narrowing already implemented).
- Batch-confirm the newly unlocked products (~17 expected) via the review flow.

**Done when:** new PI-ING references are locked, the 4 picks are recorded, and every unlocked
product is confirmed or explicitly parked.
**Safety:** no app write path is ever added for this; product PAC/POD stays NULL regardless.

## Phase B — Mapper completion (after A)

**Goal:** close the remaining intake capabilities so any future product can be brought in.

- Revisit remaining nulls after A: new gap proposals if real coverage gaps remain.
- **Real OCR engine** behind the existing honest seam (`parseNutritionLabelImage` currently
  returns `not_implemented`) — keyless/LOCAL only, no paid vision API, no fabricated text; the
  `incomplete_text` red flag already guards partial OCR.
- **Barcode intake** hardening: EAN lookup → enrichment prefill is live; wire it into the standard
  intake path as products arrive.
- **Enrichment writes** in production use: reviewed merge is built and guarded (nutrition
  allowlist, never PAC/POD/identity/status, never overwrites PI Verified).
- **PI Verified flow** in practice: service-level guard already refuses `pi_verified` without
  reviewer + reason + independent-provenance + red-flags-clear attestations; first real
  verifications happen here.

**Done when:** every product is matched, rejected, or covered by a documented open proposal, and
label-image intake works end-to-end without faking data.

## Phase C — Recipe Intelligence Spine implementation (CODE — start any time)

**Goal:** build the Spine layer as pure, tested modules, in the locked order. No engine math
changes; no UI dependency yet.

1. **Contracts first:** `NormalizedRecipeIntent` (contractVersion 1.0.0), `RecipeDesignPlan`,
   `AccessContext`/`AccessCapabilities`, gate/warning code types — exactly as written.
2. **Product Profile Registry:** the 4 active profiles, alias normalization (unsupported inputs
   warn — never silently mapped), gate tables, profile→engine-category mapping.
3. **Recipe Intent normalization:** pure `normalizeRecipeIntent()`; explicit input → saved
   defaults → system defaults; `RecipeGoals` vocabulary mapped via the locked table, not renamed.
4. **Designer output:** intent → `RecipeDesignPlan` (strategy + optimizer constraints);
   flavor-driven routing; hero-ingredient policy by tier; slices D1–D8 per the doc.
5. **User Flow wiring:** the locked Polish-first conversational script (recognition → confirm →
   batch size → temperature → texture → sweetness → style → boosters → save defaults) driving
   Recipe Intent — product language only, never technical questions.
6. **Account Access capabilities:** resolve and consume `AccessContext`; capability gates shape
   output visibility; redaction stays at source (already in the solver). Login/billing stay
   external (see the pending `docs/account-access/` pack — owner review required).
7. **Integration Flow router:** the 16-step execution order incl. decision routing
   (final / warning / tradeoff / impossible) and the rerun-verification loop.
   **[landed — Phase C Slice 6]** The pure decision router `src/spine/integrationFlowRouter.ts`
   (+ `baseEngineMetricsAdapter.ts`) connects intent → designer check → product profile → Base
   Engine metrics → Temperature Regulator evaluation → one decision
   (`ready`/`warning`/`tradeoff`/`impossible`/`blocked`) + next action + surfaced correction goals.
   **[landed — Phase C Slice 7]** `src/spine/optimizationFlowRouter.ts` adds the pure Optimizer
   routing over the `tradeoff` branch: router decision + surfaced correction goals → profile-gated
   `CorrectionPlan`s (target metric, direction, allowed ingredient classes, Golden Middle rank,
   feasibility) with advisory-goal + no-lever rejection, plus a `verifyOptimizationRerun` seam that
   re-evaluates before/after metrics through the Temperature Regulator → optimized/tradeoff/impossible.
   **[landed — Phase C Slice 8]** `src/spine/optimizationRerunPreview.ts` connects the Optimizer
   routing to the REAL `src/engine/corrections` solver + `calculateRecipe` rerun through a pure
   dependency-injection seam (`runOptimizationRerunPreview` + an injected `rerunCorrection`): it
   adapts the real corrected Base Engine result and re-verifies via the Temperature Regulator, with
   honest `rerun_not_connected` / `solver_no_correction` / `rerun_incomplete` states and never a faked
   `optimized`. Its test injects the real `proposeAutoFix`/`applyAutoFix`/`calculateRecipe` to prove
   the true pipeline end-to-end.
   **[landed — Phase C Slice 9]** `src/features/optimization/*` (a NON-spine orchestrator, allowed to
   import the `@/engine` barrel) wires the seam to the REAL solver + `calculateRecipe` and renders the
   five decision states over deterministic sample recipes on a DEV-gated page, `/dev/optimization-preview`
   — no DB / save / Mapper / auth.
   **[landed — Phase C Slice 10]** a reusable `OptimizationPreviewPanel` + a pure capability/redaction
   policy (`optimizationDisplayPolicy`: demo/free redacted, Pro full grams + before/after, DEV trace
   additive) plus `previewOptimization`/`studioIntentFromRecipe` (live-recipe entry) are wired **DEV-gated**
   into `StudioPage` on the LIVE recipe (click-triggered, nothing saved/mutated).
   **[landed — Phase C Slice 11]** `temperatureAwareCorrectionTargets` derives the regulator target per
   profile×temperature and detects whether the solver aims at it (`base_engine_seeded` when aligned —
   only milk_gelato −11 — vs `not_connected` on the −11/category fallback, warned
   `temperature_target_not_connected`), shown in the DEV page + Studio panel. The solver/engine are
   unchanged: this is target-aware INSTRUMENTATION, not a truly temperature-aware solver.
   **[landed — Phase C Slice 12]** `temperatureAwareTargetBands` adds a NON-live shadow target-band
   source (from the locked regulator settings) and a read-only comparison against the engine's selected
   band (`selectTargetBand`) per profile×temperature, with the full gap audited in
   [engine/TEMPERATURE_AWARE_TARGET_BANDS_PLAN.md](engine/TEMPERATURE_AWARE_TARGET_BANDS_PLAN.md). Live
   `TARGET_BANDS` and solver behavior are UNCHANGED.
   **[landed — Phase C Slice 13]** `solverTargetInjection` prototypes migration path (2) in PREVIEW ONLY:
   `analyzeSolverTargetInjection` clones the real `calculateRecipe` result, replaces only the HARD-gate
   indicator bands with the regulator bands (advisory gates untouched; unsupported profile/temperature
   blocked, never remapped), and re-runs the engine's own exported `detectViolations` to compare what the
   solver targets today (engine-seeded) vs under the regulator bands — surfaced in the DEV page + Studio
   panel with a "global engine target bands unchanged" warning, Demo redaction intact. It re-targets the
   solver's DETECTION only; the exact-gram solve is not yet re-run against injected bands, and the global
   `TARGET_BANDS`/`calculateRecipe`/solver are UNCHANGED.
   **[landed — Phase C Slice 14]** migration path (2) is now implemented for PREVIEW: the engine solver
   gains an ADDITIVE optional `targetBandOverride` (on `CorrectionRequest`/`proposeAutoFix`, applied via an
   internal immutable `applyTargetBandOverride`) so the real exact-gram solve can aim at injected bands while
   the APPLIED result stays the real `calculateRecipe` and the rerun verdict stays honest. Default (no
   override) is byte-identical — all engine tests pass unchanged, the export allowlist is untouched, and no
   global config changes. `optimizationPreviewRunner` now runs BOTH the engine-seeded and the
   regulator-shadow gram solves (`regulatorTargetOverride` map; advisory gates excluded, unsupported blocked)
   with a `solveComparison` (correctionDiffers / regulatorShadowImproved), surfaced in the DEV page + Studio
   panel (Demo hides grams, Pro shows the comparison). Global `TARGET_BANDS` UNCHANGED, no CONFIG_VERSION bump.
   **[landed — Phase C Slice 15]** the optimization preview is PROMOTED into production Studio: the
   `import.meta.env.DEV` gate around the Studio panel is removed, so it renders in the normal Studio flow for
   every tier — capability-gated (demo/free redacted + "Exact grams available on Pro"; Pro full), click-triggered
   (never auto), with visible disclaimers ("Preview only — nothing is saved", "corrections are not applied
   automatically", "regulator-shadow target preview", "global engine target bands unchanged"). NOTHING is
   saved/applied/persisted; the DEV debug trace stays gated to dev builds (`{ dev: import.meta.env.DEV }`), and
   `/dev/optimization-preview` remains a separate DEV tool. The prod bundle now INCLUDES the Studio preview but
   still excludes the DEV page. Global `TARGET_BANDS`, `calculateRecipe` and default solver behavior UNCHANGED.
   The remaining **owner decision / next slices**: (a) accepted-correction PERSISTENCE (save an applied
   correction — the first real write path), or (b) bake −12/−13 into the engine `TARGET_BANDS` (CONFIG_VERSION
   bump + golden re-baseline) so the DEFAULT solver is temperature-aware. Then actual-batch-rescue /
   stock-shortage (IF9/IF10).
   **[landed — Phase C Slice 16]** accepted-correction persistence is DESIGNED, not opened: a pure,
   non-writing draft contract (`src/features/optimization/acceptedCorrectionDraft.ts` —
   `buildAcceptedCorrectionDraft` / `validateAcceptedCorrectionDraft`; Pro-only via `exactCorrectionGrams`,
   only rerun-verified `optimized`/`tradeoff` solves, closed top-level key set so no PAC/POD/Mapper field can
   ride along, deterministic source-recipe hash for drift detection, snapshots — never a mutation of a
   persisted recipe), a NON-applied migration proposal at `docs/spine/proposals/accepted_corrections_table.proposal.sql`
   (owner-scoped RLS `auth.uid() = user_id`, write-once audit — no update policy or grant, delete-own,
   rollback plan; test-guarded to stay OUTSIDE `supabase/migrations`), and
   [docs/spine/ACCEPTED_CORRECTION_PERSISTENCE_PLAN.md](spine/ACCEPTED_CORRECTION_PERSISTENCE_PLAN.md)
   (architecture audit + approval checklist). The Studio "Save correction" UI was deliberately SKIPPED —
   no dead controls in production; it lands with the live write. NO migration applied, NO DB write.
   **Next:** owner walks the approval checklist → the live write slice (copy the proposal to
   `supabase/migrations/0012_accepted_corrections.sql`, apply, add `services/acceptedCorrections.ts` using the
   draft contract as its input gate, wire the Pro-only save button, verify RLS negatively). Alternatively (b)
   above, then actual-batch-rescue / stock-shortage (IF9/IF10).
   **[landed — Phase C Slice 17]** the Actual Batch Rescue DECISION branch (IF9) as a pure, unwired spine
   module: `src/spine/batchRescueRouter.ts` (`routeBatchRescue`) — observed batch problem + physical state →
   one of rescue_possible / rescue_with_tradeoff / reprocess_required / discard_or_rebatch /
   blocked_missing_data / not_supported. Locked-doc grounding: Integration_Flow.md §16 (actual-batch is
   ADD-ONLY — every action is an addition, no reduce path exists) and §17 (the five-option user-decision
   menu, offered on every feasible rescue). Food safety is checked FIRST and never overridden; a frozen
   batch is never pretended correctable in place (reprocess_required, with the discard consequence warned
   when reprocessing is unavailable); dilution problems (too_sweet/too_fatty) are liquid-only and never
   "more sugar"; levers are profile-gated (sorbet/vegan never see dairy); unsupported profiles/problems are
   reported, never remapped. Output is STRUCTURALLY gram-free (no gram field exists) — the exact add-only
   gram solve is a later engine-verified step, surfaced as required next calculations. Optional
   expected-metrics cross-check runs through the existing `evaluateTemperatureRegulator` (recipe-already-
   out-of-band vs temperature-divergence warnings). +26 tests; docs in
   [spine/BATCH_RESCUE_FLOW.md](spine/BATCH_RESCUE_FLOW.md). The DEV preview page was deliberately skipped.
   **Next after this:** exact add-only gram solve + Integration Flow wiring (`actual_grams !== null` →
   IF9) + Pro-gated Studio UI (`canUseActualBatchRescue`), or the stock-shortage branch IF10, or the
   approved accepted-correction live write.
   **[landed — Phase C Slice 18]** the Stock Shortage DECISION branch (IF10) as a pure, unwired spine
   module: `src/spine/stockShortageRouter.ts` (`routeStockShortage`) — per-line shortage observation +
   constraints → one of substitution_possible / scale_down_possible / purchase_required /
   reformulation_required / production_blocked / blocked_missing_data / not_supported, with a FIXED
   strategy precedence (substitution → scale-down → purchase/wait → reformulation → blocked).
   Locked-doc grounding: Integration_Flow.md §18 + Optimizer.md §7A.1 — missing stock is never invented;
   the hero ingredient is never silently reduced; substitution is NEVER silent (verified ingredient data
   required per acceptance 28; dairy into sorbet/vegan is a hard block that no approval flag overrides;
   allergen / alcohol / sweetener-polyol-HIS substitutes each require an explicit approval flag; unknown
   substitute families are blocked, never remapped); the quality tier is echoed untouched. Output is
   STRUCTURALLY gram-free — batch scaling is a dimensionless limiting-line ratio (uniform scaling keeps all
   composition percentages, hence all bands, unchanged) plus required next calculations; nothing fakes a
   recalculated recipe. Every feasible decision offers the LOCKED five-option `StockShortageUserDecision`
   menu verbatim; production_blocked honestly limits it (keep_batch_and_mark_missing /
   stop_and_buy_missing_product) with the reason. `canUseStockShortageWorkflow` (demo false / paid true) is
   surfaced as the UI capability gate. No DB, no inventory read/write, no Mapper, no persistence, no recipe
   mutation. 31 tests in `stockShortageRouter.test.ts` (+2 spine-contract file checks); docs in
   [spine/STOCK_SHORTAGE_FLOW.md](spine/STOCK_SHORTAGE_FLOW.md). The DEV
   preview page was deliberately skipped (same rationale as IF9). An adversarial review (4 lenses) found
   and fixed pre-commit: a duplicate-lineId pairing bypass (lines now paired by index AND duplicate ids
   blocked), an unverifiable scale-bounds honesty gap (now always flagged `scaled_batch_bounds_unverified`),
   and a locked-name collision (the router union is `StockShortageRouteDecision`; the locked doc name
   `StockShortageDecision` maps to `StockShortageUserDecision`).
   **Next after this:** IF9/IF10 exact recalculation + Integration Flow wiring + paid-gated Studio UI, or
   the accepted-correction live write once the owner walks the Slice 16 approval checklist.
   **[landed — Phase C Slice 19]** IF9/IF10 are WIRED into the Integration Flow and gain a
   verification-gated exact-recalculation PREVIEW — still pure, still no writes. `src/spine/integrationFlowDispatch.ts`
   dispatches the three locked contexts (`recipe_design` → the EXISTING `routeRecipeIntegrationFlow`
   verbatim — that module is untouched by the slice, test-guarded; `actual_batch_rescue` → IF9;
   `stock_shortage` → IF10); missing branch payloads are `blocked_missing_data` (actual-batch/stock data
   NEVER inferred), unknown contexts `not_supported`. `src/features/optimization/branchRecalculationPreview.ts`
   attempts exact numbers ONLY where they verify: IF9 add-only rescues run the REAL solver in its
   `actual_batch` (add-only) context, focused on the rescue metric, aiming at the regulator band via the
   Slice-14 `targetBandOverride`, then verify through the Temperature Regulator rerun — a failed
   verification exposes NO grams (honest engine finding: large-gap NPAC rescues are rejected by the
   solver's own Golden-Middle verification because the per-batch solve model amplifies on the per-water
   NPAC basis; these stay `not_attempted (solver_found_no_safe_add_only_correction)` — the engine refuses
   to fake a safe rescue). IF10 scale-down is the proven `calculated` path: the deterministic limiting
   ratio scales the recipe, the real engine re-runs it, and the regulator verdict must be preserved
   (`scaleVerified`); substitution stays `not_attempted` until a verified-composition contract lands;
   safety-blocked cases are `unsafe` and never reach a solver. DEV page
   `/dev/branch-recalculation-preview` (8 fixtures, render-only, zero click handlers), security-tested,
   excluded from the prod bundle. Docs: [spine/BRANCH_RECALCULATION_PREVIEW.md](spine/BRANCH_RECALCULATION_PREVIEW.md).
   **Next:** accepted-correction live write (after owner approval), production branch UI for IF9/IF10
   (paid-gated), or exact-solver expansion (multi-step add-only rescue; verified-composition substitutes).
   **[landed — Phase C Slice 20]** the IF9 MULTI-STEP add-only rescue walk
   (`src/features/optimization/batchRescueStepSolver.ts`), answering the Slice 19 finding without bypassing
   the engine: when — and only when — the single-shot solve fails with
   `solver_found_no_safe_add_only_correction`, intermediate target bands move a FRACTION of the remaining
   gap toward the true regulator center (25% → 50% → 75% → 100%, the smallest verified fraction wins) and
   are handed to the REAL solver via the Slice-14 `targetBandOverride`; every applied step is verified
   against the TRUE regulator (`verifyOptimizationRerun`) and kept only on genuine improvement with no
   new/worsened hard gate. Hard stops surfaced (`target_reached` / `no_improving_step` /
   `diminishing_returns` / `max_steps` 4); add-only + positive grams structurally enforced; TWO direction
   guards (a contradictory observation — e.g. "too soft" while NPAC measures below band — is refused BEFORE
   any solve with `observation_contradicts_measured_direction` + a re-measure warning; the walk never moves
   a metric opposite its declared direction). Final statuses: `calculated` only when the targeted metric
   ENTERS its regulator band AND the overall before→after rerun proves improvement without regression;
   `partial_improvement` exposes only regulator-verified steps (residual honestly warned);
   `verification_failed` exposes NO grams. Measured on the −12 too-hard fixture: one verified step
   (add Sucrose 74.4 g, npac 25.33 → 35.54, per-step + overall `tradeoff`), then an honest stop →
   `partial_improvement`. The single-shot reason stays visible (`singleShotReason`); IF10 and the default
   recipe flow are unchanged. DEV page shows single-shot vs multi-step per fixture.
   **Next:** production IF9/IF10 branch UI (paid-gated), accepted-correction live write (after owner
   approval), or multi-LEVER stepping + the IF10 verified-composition substitute contract.
   **[landed — Phase C Slice 21]** the PRODUCTION IF9/IF10 branch UI — paid-gated preview, no
   persistence: `BranchWorkflowPreviews` mounts in the Studio right rail (below the optimization
   preview) with two EXPLICIT-CLICK buttons ("Preview actual batch rescue" / "Preview stock shortage")
   over MINIMAL, LOCAL, NON-PERSISTED measurement forms — IF9: observed problem, measured batch g,
   observed serving °C, physical-state + food-safety flags; IF10: the short line picked from the LIVE
   recipe (required g = the line's real planned grams), available stock g, strategy flags; NO substitute
   is declarable, so no unsafe substitute can appear; empty measurements flow to the routers' honest
   `blocked_missing_data` — nothing invented. Demo/Free see the section + "available on Pro" affordance
   and no runnable buttons (mirrors the spine `canUseActualBatchRescue`/`canUseStockShortageWorkflow`
   demo-false/paid-true contract via the existing `useAccess` pro capability). Rendering goes through the
   display-only `BranchWorkflowPreviewPanel` + pure `branchWorkflowDisplayPolicy`: exact grams, the exact
   scale ratio and numeric metrics are Pro detail; the DEV trace is additive-only; hard display rules
   test-pinned — "Preview only — nothing is applied", "No inventory is changed", "No recipe is saved",
   ZERO Apply/Save/Update-inventory controls, `partial_improvement` always labelled "partial improvement
   — not fully rescued", "verified" reserved for `calculated`. Exact previews visible in production:
   IF10 scale-down (verified ×ratio) and IF9 multi-step partial improvement (verified add-only grams).
   +19 UI tests. **Next:** IF10 verified-composition substitute contract (+ multi-LEVER stepping),
   accepted-correction live write after owner approval, or branch apply/save after the persistence
   design is approved.
   **[landed — Phase C Slice 22]** the IF10 VERIFIED-COMPOSITION substitute contract — substitution now
   earns exact numbers, but only through the strictest gate in the codebase:
   `src/features/optimization/verifiedSubstituteContract.ts` (`validateVerifiedSubstitute`) requires
   allowlisted provenance (`internal_reference_catalog` / `owner_verified_entry`; **Mapper product rows
   and PI Calculated products are explicitly denied** — match candidates and calculated values are never
   calibrated references), a recognized verification status, a COMPLETE finite engine composition
   (water+solids consistency checked), the dairy hard block (sorbet/vegan — no approval flag overrides),
   explicit allergen / alcohol / sweetener-polyol-HIS approvals, and family rules (same functional family
   unless cross-family is EXPLICITLY approved; unknown or profile-forbidden families block, never guessed).
   `previewVerifiedSubstituteRecalculation` re-routes IF10 with flags DERIVED from the validation (one
   source of truth), builds the locked §18 split-swap in an in-memory clone (available original grams kept,
   the substitute covers the shortfall), and verifies through the REAL engine + Temperature Regulator: any
   NEW hard-gate failure ⇒ `verification_failed` with no numbers exposed; otherwise `calculated` with an
   `acceptable` or honestly-`tradeoff` verdict; a hero-line substitution always warns
   `hero_ingredient_substitution_changes_product_identity`. Measured on the sorbet fixture: strawberry short
   240/600 + the verified raspberry reference → keep 240 g + substitute 360 g → `calculated`. Studio offers
   NO substitute input in ANY build ("substitutes can never be typed in by hand" — the calibrated-catalog
   hint shows instead; the fixture module never enters the Studio graph, keeping it out of the production
   bundle); the `/dev/branch-recalculation-preview` scenario proves the path end-to-end; Demo/Free
   redaction hides all substitute detail; Pro sees the split + provenance + verdict. No spine change.
   **Next:** multi-LEVER IF9 stepping, the accepted-correction live write after owner approval, or (later)
   inventory integration + the production reference substitute catalog.
   **[landed — Phase C Slice 23]** the IF9 MULTI-LEVER rescue expansion
   (`src/features/optimization/batchRescueMultiLeverSolver.ts`): after ANY partial outcome (the Slice-20
   single-lever walk or a verified-but-overshooting single shot), the walk works the REMAINING failing hard
   gates across lever families — per iteration it reads the true regulator evaluation's residual gates,
   generates add-only candidates per gate over fractions {0.125 → 1.0} in two band constructions (centered
   intermediate + the plain true-band aim retried from each new state), verifies EVERY candidate outside the
   solver against the true regulator (improvement with no new/worsened hard gate — the Golden-Middle stop),
   and takes the best verified candidate deterministically (fewer hard failures → larger target-distance
   gain → fewer added grams). Hard stops surfaced: target_reached / no_improving_candidate /
   diminishing_returns / max_steps (6) / max_additions_reached (50% of the entry batch mass). UNIFIED
   `calculated` semantics across all rescue stages: `calculated` now ALWAYS means the Temperature Regulator
   ACCEPTS — the −11 single shot (Dextrose 92.6 g, npac lands 47.08 ABOVE [33,43]) is reclassified from the
   looser Slice-19 `calculated` to honest `partial_improvement (single_shot_partial_residual_gates_remain)`
   and cascades into the lever search. Measured, engine-decided, test-pinned outcomes: a diluted sorbet with
   three COMPATIBLE failing gates (npac+solids+water) FULLY RESCUES in two levers — add Dextrose ~36 g
   (fails 3→2) then add Inulin ~80 g (fails 2→0) → `calculated`, overall rerun `optimized`; the −12
   too-hard npac dead zone honestly yields no_improving_candidate (small aims produce no violation, larger
   aims overshoot on the per-water basis — a characterized ENGINE solve-model boundary; closing it needs an
   engine-level change, out of preview scope). DEV page + panel trace show the lever sequence; grams remain
   Pro-gated; nothing applies or persists. +9 solver tests, fixtures +rescue-too-hard-11.
   **Next:** the accepted-correction live write after owner approval, branch apply/save after the
   persistence design is approved, or (later) inventory integration + the production reference substitute
   catalog; the NPAC solve-model fix is an owner-approved ENGINE slice if ever prioritized.
   **[landed — Phase C Slice 24]** the accepted-correction LIVE WRITE PATH — the first real write —
   opened under the locked owner decisions A–I
   ([persistence plan §0](spine/ACCEPTED_CORRECTION_PERSISTENCE_PLAN.md)): migration
   `supabase/migrations/0012_accepted_corrections.sql` (the approved proposal verbatim except the header —
   test-pinned equivalence) APPLIED to the live project; post-apply verification + transaction-scoped
   negative RLS tests all green (plan §8: anon insert/select denied; owner insert/select/delete work;
   a different uid sees 0 rows and deletes 0 rows; UPDATE denied even for the owner — no policy AND no
   grant; every test rolled back, table left empty). `src/services/acceptedCorrections.ts` =
   createAcceptedCorrection / listMyAcceptedCorrections / deleteAcceptedCorrection, NO update on purpose;
   signed-in + owner-match + full draft re-validation as the input gate; explicit CLOSED camelCase→
   snake_case mapping (unknown draft keys can never reach the insert — test-pinned). Studio gains
   `SaveCorrectionControl` (below the optimization preview): signed-in Pro only; unsigned sessions see
   "Sign in to save corrections" (proven in the preview browser, including with the DEV Pro override
   active — capability alone never unlocks it); signed-in Free renders nothing; default engine_seeded
   solve, regulator_shadow selectable only when itself verified-saveable; explicit click; honest stored
   record id on success, honest error text on failure; the recipe is NEVER changed. Decision F recorded:
   v1 tier enforcement is service/client-side (owner-scoped RLS protects ownership, not tier) — an
   Edge-Function-mediated insert is REQUIRED hardening before wider production scale. Baseline
   re-verified untouched (mapper_basement 542, products 69, PAC/POD 0/69, pi_calculated 1). The ONLY
   blocked proof: the end-to-end signed-in save click (owner browser session unavailable — documented in
   plan §8.3, not faked; a 5-minute owner action).
   **Next:** the owner performs the first real signed-in save (plan §8.3) and re-runs the §8 baseline
   query; Edge-Function tier hardening before scale; branch apply/save for IF9/IF10 stays future work.

Acceptance tests (groups A–M from [Acceptance_Tests.md](pinguino-spine/Acceptance_Tests.md))
are implemented alongside each step, not at the end.

**Done when:** the full chain runs headless (intent → plan → profile → engine → regulator
evaluation → router) with acceptance tests green.
**Safety:** ENGINE math frozen; no UI rewiring yet.

## Phase D — Engine expansion (after C1–C4)

**Goal:** make product × temperature evaluation and correction first-class.

**Landed (pure, unwired):** the Temperature Regulator config registry (Phase C Slice 4) and the
Temperature Regulator **evaluation layer** (Phase C Slice 5, `src/spine/evaluateTemperatureRegulator.ts`)
— a pure interpretation function that reads Base Engine metrics + locked settings and returns
status / npacStatus / acceptable / hard-gate failures / advisory flags / correction goals / score,
with a no-fallback block for unsupported profile or temperature. Base Engine untouched; still not
wired into the Integration Flow router.

- **Temperature Regulator config registry:** per-product × per-temperature settings for
  Standard Gelato / Sorbet / Vegan / Chocolate at −11/−12/−13 °C, exactly from the four regulator
  docs (−11 = zero-delta base). One shared Base Engine — never per-temperature engines. **[done — Slice 4]**
- **Golden references as tests:** G12/G17/G18 (+G15/G11), S01/S02/S03, V02 fixed, C01 — the
  formulas and expected outputs are fully specified in the regulator docs. **[done — Slice 4; reused as evaluation fixtures in Slice 5]**
- **Optimizer profile-aware policy:** allowed/forbidden correction families per profile, chocolate
  protein-share soft/advisory handling, stabilizer hard policy — extending the existing solver,
  never bypassing its verify-by-recalc.
- **Batch rescue / actual batch:** the 5 explicit rescue decisions consumed as policy input
  (`BatchRescuePolicy`/`BatchRescueResult`); add-only for actual-added lines; machine capacity
  hard; volume increase only with user confirmation.
- **Stock shortage flow:** the 5 shortage decisions; no invented stock, no silent hero reduction,
  replacements only from verified data.
- Ice-curve anchors beyond `milk_gelato@−11` as calibration data arrives; CONFIG_VERSION bumps per
  registry addition.

**Done when:** all four profiles evaluate and correct at all three temperatures with locked bands
and golden tests green.

## Phase E — Studio / UI on the Spine

**Goal:** deliver the new flow to users.

- Improved recipe flow: the conversational User Flow replaces the single-form entry.
- My Products UX: picker growth, provenance labels, post-calibration product availability.
- Labels / print / export from the final verified recipe.
- Saved recipes (full for paid, redacted drafts for demo) and saved defaults.
- Batch scaling UX (1–50 kg / custom / machine capacity) + actual-batch rescue UI (5 options) +
  stock-shortage UI (5 options).
- Demo vs paid redaction shaped by capabilities end-to-end; upgrade-reason codes surfaced,
  price-neutral copy.

**Done when:** the User Flow acceptance list (39 items) and Account Access acceptance list
(43 items) pass in the UI.

## Phase F — Commercial layer

**Goal:** connect live commercial infrastructure as the **external capability provider**.

- Auth integration: login state → resolved `AccessContext` (Recipe Intelligence never implements
  login itself — locked boundary).
- Pricing/admin: plan and pricing administration (admin panel scope is drafted in the pending
  `docs/account-access/` pack — requires owner review before it becomes truth).
- Billing portal: subscription lifecycle, cancellation/expiry → capability downgrades (data is
  never deleted on downgrade; visibility follows current capability).
- Home / Pro / Franchise access tiers mapped to capabilities; Free Preview → demo capabilities.
- Customer onboarding: first-use flow, saved defaults, upgrade paths.
- Server/API-side capability enforcement (client-side hiding is not sufficient — locked Rule 1).

**Done when:** the demo/paid boundary holds end-to-end against the Account Access acceptance list
with live plans.

## Phase G — Franchise / SOP / future

- Standardized recipes for franchise consistency.
- SOP PDFs / downloads layer.
- Shop visibility per [PINGUINO_COMMERCIAL_ECOSYSTEM_V1.md](PINGUINO_COMMERCIAL_ECOSYSTEM_V1.md).
- PU/Umami extension — requires its own future locked documents; not active.
- Future profiles (granita, protein, fresh, −18 °C storage, frozen drinks) — each requires its own
  locked document set (profile + regulator + designer sections) before any code.
- Multi-language beyond PL/EN copy as markets demand.

---

## Standing rules that bind every phase

```text
Locked docs are the spec — if a rule is missing, stop and ask; never guess values.
AI explains and routes; AI never calculates exact recipe values.
One shared Base Engine — temperature/product differences live in config + regulator only.
mapper_basement inserts: human-approved seed migrations only.
Product PAC/POD: NULL until independently measured AND explicitly approved.
Demo never shows exact grams / exact Auto Fix / exact before-after values.
Never name external benchmark tools in code, docs, prompts or UI.
No new dependencies without explicit approval.
```
