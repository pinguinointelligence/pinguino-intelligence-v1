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
   `TARGET_BANDS`/`calculateRecipe`/solver are UNCHANGED. The next step is an **owner decision** between the
   two documented migration paths — (1) extend the engine `TARGET_BANDS` with seeded −12/−13 (and
   per-category) bands (CONFIG_VERSION bump + golden re-baseline), or (2) promote the solver-injected target
   to a real gram solve (a solver-API target override, no global config change) — after which the shadow
   comparison becomes the acceptance oracle. Then production Studio (capability-gated) + persistence, then
   actual-batch-rescue / stock-shortage (IF9/IF10).

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
