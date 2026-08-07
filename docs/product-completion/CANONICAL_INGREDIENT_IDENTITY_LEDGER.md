# CANONICAL INGREDIENT IDENTITY + CURRENT DRAFT INTEGRITY + APPLY BATCH GATE

Date: 2026-08-07

Environment: current staging only (`https://staging.pinguinoai.com`)

Implementation commit: `1157f26` (`fix(pro): unify canonical ingredient draft identity`)

Production: not changed

## 1. Requested scope

This P0 closes the owner-reported split between visible recipe grams and the Engine/Monitor input, unifies the eight approved formulation ingredients under stable Mapper identities, prevents semantic duplicate rows, and makes the target-batch invariant a trustless Preview and Apply gate.

Explicitly out of scope and unchanged:

- Engine science and ingredient composition;
- target bands, PAC/POD, ice, stabilizer and scoring formulas;
- Engine/config versions;
- mapper_basement data;
- Production, Export, Home, Demo and new product features;
- accepted white/black Pro workbench design, price/kg, readiness system, contextual tabs and canonical logo.

## 2. Owner failures reproduced

| Failure | Reproduction evidence | First observed result before repair |
|---|---|---|
| Visible 1000 g versus effective 995 g | Exact owner fixture retained visible/planned `[600, 135, 43, 86, 80, 54.1, 1.9]` and stale `actual_grams` `[600, 130, 35, 130, 44, 54, 2]` | DOM/planned total was 1000.0 g; Engine composition selected stale actual total 995.0 g |
| Wrong displayed/derived percentages | Engine/Monitor consumed the stale 995 g state while rows displayed the new planned values | Percentages described an older recipe rather than 60.00%, 13.50%, 4.30%, 8.60%, 8.00%, 5.41%, 0.19% |
| Duplicate Milk 3.5% proposal | Existing picker/Mapper milk used `PI-ING-000236`; toolbox correction milk used `milk_3_5`; merge/dedupe compared raw IDs | Formulation treated the same milk concept as absent and could append a second Milk row |
| Applicable 1193.7 g Preview | Synthetic owner proposal adds legacy Milk 193.7 g to the 1000 g recipe | Preview described 1193.7 g but its enabled state did not structurally depend on the final batch total |

## 3. Root cause

### Gram-state divergence

The first divergence was `src/features/studio/buildRecipeInput.ts`:

- `IngredientRow` displayed and edited `planned_grams`;
- the canonical request builder forwarded old `actual_grams` during ordinary Recipe editing;
- Engine composition intentionally evaluates `actual_grams ?? planned_grams`;
- therefore hidden production values silently overrode current visible values outside an actual-production context.

This was an `actual_grams` leak, not an Engine formula defect. The old values travelled with the in-memory/saved recipe representation; there was no separate scientific version of the recipe. Planning now clears actuals from the Engine request. Only the explicit `actual_batch` context preserves them.

### Milk and toolbox identity

- Live Mapper/picker Milk 3.5%: `PI-ING-000236`, Mapper provenance.
- Saved recipe: retained whichever raw ingredient representation had been persisted.
- Correction/toolbox Milk: `milk_3_5`, reference/toolbox provenance.
- Template role candidate: the toolbox registry candidate.
- Engine row: the supplied ingredient object, so raw identity could remain `milk_3_5`.

The toolbox was a separate legacy/reference registry. Dedupe, merge, exclusions and solver targeting used `ingredient.id`, so `PI-ING-000236` and `milk_3_5` were unequal even though they represented the same approved ingredient. No fuzzy/name matching was required or added.

### Why 1193.7 g passed Preview

The residual batch mismatch was presented diagnostically, but the Apply control was disabled only for the pre-existing `diagnosticOnly` condition. The final proposal sum was not a structural part of the Preview applicability gate on every path. Apply also relied on path-specific gates. Both surfaces now recompute the invariant independently.

## 4. Canonical identity map

The map is closed and exact. Mapper IDs are authoritative; labels, translations, order and fuzzy matching are never identity inputs.

| Role | Legacy/toolbox ID | Picker / canonical Mapper ID | Template ID after resolution | Engine canonical row ID | Consistent |
|---|---|---|---|---|---|
| Water | `water` | `PI-ING-001409` | `PI-ING-001409` | `PI-ING-001409` | yes |
| Milk 3.5% | `milk_3_5` | `PI-ING-000236` | `PI-ING-000236` | `PI-ING-000236` | yes |
| Cream 30% | `cream_30` | `PI-ING-000180` | `PI-ING-000180` | `PI-ING-000180` | yes |
| Skimmed milk powder | `smp` | `PI-ING-000270` | `PI-ING-000270` | `PI-ING-000270` | yes |
| Sucrose | `sucrose` | `PI-ING-000514` | `PI-ING-000514` | `PI-ING-000514` | yes |
| Dextrose | `dextrose` | `PI-ING-000494` | `PI-ING-000494` | `PI-ING-000494` | yes |
| Inulin | `inulin` | `PI-ING-000456` | `PI-ING-000456` | `PI-ING-000456` | yes |
| Tara gum | `tara_gum` | `PI-ING-000492` | `PI-ING-000492` | `PI-ING-000492` | yes |

Every line can now expose:

- stable line ID;
- canonical ingredient ID;
- optional private Product ID;
- display label;
- provenance (`mapper`, `private_product`, `reference`, `demo`, `template`).

Private Products retain their Product ID and explicitly map to the stable canonical Engine identity when one exists.

## 5. Completed work

### One current planning draft

- `buildRecipeInput(state, 'planning')` is the default for Recipe, Profile, Monitor, formulation and Save.
- Planning requests use current planned grams and do not allow stale actuals to win.
- Production cockpit explicitly requests `buildRecipeInput(state, 'actual_batch')`.
- Canonical fingerprints include line ID, canonical/source/Product identity, provenance and the material recipe controls.
- Monitor and formulation diagnostics expose the same revision/fingerprint.

### Canonical reuse and persistence

- One exact canonical-identity module owns the eight approved mappings.
- Mapper, Product handoff, picker/store add, save/load, toolbox, template, formulation, exclusions and merge operations normalize through that seam.
- An existing exact canonical line wins before role fallback.
- Solver additions target the existing editable line ID; held/poured rows block replacement rather than creating a duplicate.
- Store and Apply reject duplicate canonical identities atomically.
- Save/load preserves canonical IDs, grams and Engine output.

### Preview and trustless Apply

- Preview recomputes final grams and becomes diagnostic-only if the target is missed or a canonical duplicate exists.
- Apply recomputes from the proposal payload rather than trusting a UI boolean.
- Gates cover stable IDs, canonical duplicates, finite non-negative grams, Engine success, exclusions, role trace, locks, current revision and target batch.
- A batch mismatch returns `batch_total_mismatch`; no partial recipe mutation occurs.

### QA diagnostics

Owner diagnostics now list line ID, canonical ID, Product ID, source/provenance, visible/effective/Engine grams and revision. Auto-add role traces include candidate ID, whether an existing line was reused, and the exact reason.

## 6. Same-input proof (Required Test A)

Planning context was intentionally built from a fixture containing the historical stale actual values. The request builder removed those hidden values before calculation.

| Ingredient | DOM/visible g | Store/planned g | Canonical draft g | Engine input g | Monitor g | Canonical ID | Percent |
|---|---:|---:|---:|---:|---:|---|---:|
| Milk 3.5% | 600 | 600 | 600 | 600 | 600 | `PI-ING-000236` | 60.00% |
| Cream 30% | 135 | 135 | 135 | 135 | 135 | `PI-ING-000180` | 13.50% |
| SMP | 43 | 43 | 43 | 43 | 43 | `PI-ING-000270` | 4.30% |
| Sucrose | 86 | 86 | 86 | 86 | 86 | `PI-ING-000514` | 8.60% |
| Dextrose | 80 | 80 | 80 | 80 | 80 | `PI-ING-000494` | 8.00% |
| Inulin | 54.1 | 54.1 | 54.1 | 54.1 | 54.1 | `PI-ING-000456` | 5.41% |
| Tara gum | 1.9 | 1.9 | 1.9 | 1.9 | 1.9 | `PI-ING-000492` | 0.19% |
| **Total** | **1000.0** | **1000.0** | **1000.0** | **1000.0** | **1000.0** | no duplicates | **100.00%** |

Canonical serialization equality is asserted across the Store-built request, planning draft, Engine request, Monitor source and save/load roundtrip. `actual_grams` is `null` for all seven lines in the planning request.

Raw Engine output recorded for this exact input (floating-point values are retained rather than rounded):

```json
{
  "engine_version": "0.4.0",
  "config_version": "0.7.0",
  "total_batch_g": 1000,
  "totals": {
    "water": 631.8081000000001,
    "solids": 368.1919,
    "fat": 61.853500000000004,
    "protein": 36.494,
    "lactose": 54.449999999999996,
    "sucrose": 86,
    "dextrose": 73.6,
    "fiber": 49.79250000000001,
    "salt": 1.224
  },
  "percent": {
    "water": 63.18081000000001,
    "solids": 36.81919,
    "fat": 6.185350000000001,
    "protein": 3.6494,
    "lactose": 5.445,
    "sucrose": 8.6,
    "dextrose": 7.359999999999999,
    "fiber": 4.97925,
    "salt": 0.1224
  },
  "pod": 15.571200000000001,
  "pac": 29.17784,
  "npac": 46.18149086724274,
  "ice_percent": 50.33998757610632,
  "scores": {
    "technical": 96.66666666666667,
    "flavor": 70,
    "cost": 100,
    "overall": 88.16666666666667
  },
  "nutrition_per_100g": {
    "kcal": 166.529,
    "fat_g": 6.18535,
    "carbohydrate_g": 21.88279,
    "sugars_g": 21.8378,
    "protein_g": 3.6494,
    "salt_g": 0.1224,
    "fiber_g": 4.97925
  },
  "cost": {
    "total": 2.2295,
    "per_kg": 2.2295
  },
  "warnings": []
}
```

The owner fixture uses the approved Mapper compositions without modifying the dataset or science. Full Engine item output is also compared exactly before and after save/load in Test C.

## 7. Apply proof (Required Test E)

Input state: exact 1000.0 g owner recipe.

Synthetic proposal: existing 1000.0 g plus legacy/reference Milk 3.5% at 193.7 g.

Computed proposal total: 1193.7 g.

Target: 1000.0 g.

Verified results:

- Preview is diagnostic-only and renders Apply disabled;
- click-time Apply recomputes the payload;
- result code is exactly `batch_total_mismatch`;
- recipe fingerprint and item array remain unchanged;
- the semantically duplicate Milk is independently rejected through canonical identity.

## 8. Tests added or changed

Primary regression suite:

- `src/features/formulation/canonicalIngredientIdentityP0.test.tsx`
- `src/features/formulation/__fixtures__/ownerSameInputFixture.ts`

It covers required Tests A-G: exact same input, existing Milk reuse, save/load roundtrip, all eight core mappings, 1193.7 rejection, 20 edit/formulate/apply-or-cancel cycles, and picker/toolbox/template/Engine parity.

Related existing tests were extended for planning-versus-actual context, canonical dedupe, Preview applicability, Apply atomicity, stale state, Monitor parity and QA output.

## 9. Exact test commands and results

| Command | Result |
|---|---|
| `npx vitest run src/features/formulation/canonicalIngredientIdentityP0.test.tsx src/features/studio/buildRecipeInput.test.ts src/features/studio/studioResult.test.ts src/features/formulation/constrainedReformulation.test.ts src/features/formulation/liveRuntime.test.ts src/features/formulation/nightlyP0.test.ts src/features/constraint-studio/constraintStudioUi.test.tsx src/features/constraint-studio/ownerMultiRemoveNoRefresh.test.ts src/features/constraint-studio/removalRecalc.test.ts src/features/constraint-studio/staleDraftState.test.ts src/features/pro-workbench/monitorParity.test.tsx src/features/pro-core/ProWorkbar.test.tsx src/pages/pro/finalProWorkbenchDesign.test.tsx src/features/design-review/designReview.test.tsx src/features/studio/demoScenario.test.ts` | PASS — 15 files, 207 tests |
| `npm test` | PASS — 393 files, 5373 tests |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS — 0 errors; two pre-existing `react-refresh/only-export-components` warnings in `src/app/router.tsx` and `src/features/pro-core/RecipeVersionsSection.tsx` |
| `npm run build` | PASS — TypeScript + Vite production build, 1020 modules transformed |
| `git diff --cached --check` (before implementation commit) | PASS |

The full suite emitted its known OCR dependency line `Error: failed to load ./ita.special-words`; Vitest still completed successfully with exit code 0 and all 5373 tests passing. Vite reported its existing large-chunk advisory; build completed successfully.

## 10. Previously accepted flows retested

- exact gram display and Monitor parity;
- planned versus explicit actual-production behavior;
- ingredient add/remove and multi-remove;
- lock/hold/poured protections;
- constraint Preview, Cancel, Apply and Undo;
- stale-draft rejection;
- formulation templates and repeated formulation;
- save/load identity roundtrip;
- Demo hiding/fixture behavior;
- current Pro workbench layout, navigation, compact/mobile behavior and design-review guards.

All focused and full regression suites passed.

## 11. Files changed

P0 runtime/data-integrity implementation:

- `src/data/ingredients/canonicalIngredientIdentity.ts`
- `src/data/ingredients/ingredientMapper.ts`
- `src/data/products/productEngineHandoff.ts`
- `src/engine/types.ts`
- `src/features/studio/buildRecipeInput.ts`
- `src/features/studio/useStudioResult.ts`
- `src/features/studio/StudioEngineSurface.tsx`
- `src/features/studio/OwnerDiagnosticPanel.tsx`
- `src/features/formulation/toolboxCanonical.ts`
- `src/features/formulation/formulate.ts`
- `src/features/constraint-studio/applyPipeline.ts`
- `src/features/constraint-studio/constraintStudioStore.ts`
- `src/features/constraint-studio/ui/ConstraintPreviewCard.tsx`
- `src/stores/recipeStore.ts`

P0 fixture/tests and related regression updates are identified in commit `1157f26`. That commit also preserves and publishes the already-accepted, previously staged Pro design work rather than discarding or rewriting it.

This ledger is the only additional completion artifact.

## 12. Deployment environment verified

- Git target: `origin/staging` only.
- Remote staging advanced from `83ae19e` to implementation commit `1157f26` with a normal, non-force push.
- Public URL: `https://staging.pinguinoai.com/` returned HTTP 200.
- The served asset changed from prior `/assets/index-DEt3-CMa.js` to `/assets/index-B0d5JIJJ.js`.
- Served asset `Last-Modified`: `Fri, 07 Aug 2026 10:49:12 GMT`.
- Served JS length: `1,428,717` bytes.
- Served-content checks all returned true for:
  - `PI-ING-000236`;
  - `PI-ING-000514`;
  - `canonical_ingredient_id`;
  - `private_product_id`;
  - `batch_total_mismatch`;
  - `existingLineReused`.
- Verification edge request: `X-Vercel-Id cdg1::qnq6p-1786099751952-ace90c5c5358`.
- No new Vercel project/configuration was created.
- Production was not deployed or changed.

## 13. Remaining incomplete items

No P0 implementation, test or current-staging deployment item remains incomplete. The PINGÜINO-versus-MyGelato scientific comparison remains intentionally paused; this task only establishes authentic identical PINGÜINO input.

The two pre-existing lint warnings and existing Vite chunk-size advisory remain visible and were not hidden. They are outside this focused data-integrity repair and do not fail their gates.

## 14. Exact blockers and required external actions

None for this P0. No production action is authorized or required.

## 15. Git diff and commit status

- Implementation commit: `1157f26`.
- Implementation was pushed to `origin/staging`.
- No force push, production push, production deployment or secret/environment change occurred.
- Unrelated pre-existing untracked repository files were preserved and were not included in the implementation commit.
