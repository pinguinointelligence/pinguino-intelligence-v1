# Production + Master Label implementation ledger

Last updated: 2026-08-09.

## 1. Requested scope

Focused Production workspace, actual weighed quantities, Engine-verified batch rescue, coherent production completion, one Master Label data model, market profile architecture and system print preparation. No Recipe/Profile/Monitor redesign, no Engine/target/Mapper science change, no deployment.

## 2. Completed work

- Separate persisted `ProductionSession` with immutable plan and physical confirmation state.
- Actual defaults to plan; always-visible touch-first `− / value / + / ✓`.
- Live neutral/amber delta and explicit `Popraw zapis` path.
- Forecast built from confirmed actuals plus pending targets.
- Engine-only rescue gate for keep target, enlarge, leave and impossible.
- Confirmed-material non-reduction invariant.
- Solver top-ups folded into the existing canonical ingredient line; no parallel duplicate line.
- Coherent completion and frozen actual snapshot.
- One Master Label model sourced from the completed actual result.
- Market/language/UI-language separation and partial/research statuses.
- Best-before fail-closed state, allergen fail-closed state, facility seams, required/optional fields and preflight.
- Rectangle/round, copies and system print HTML adapter.
- Production/label stores cleared across account boundaries.

## 3. Files changed

Core additions live under:

- `src/features/production-workspace/`
- `src/features/master-label/`
- `docs/production/`
- `docs/labels/`

Focused integrations touch Ingredient Builder, Studio Engine Surface, Recipe Profile Panel, Pro Workspace header and account reset. Exact name-status is recorded in Git at handoff.

## 4. Tests added or changed

- Production session/physical reality and exact Engine-freeze proof.
- Production persisted store/account boundary.
- Rescue option safety and canonical top-up de-duplication.
- Touch-first production UI/static responsive contract and display precision.
- Master Label actual-source, market/language, allergen/date/preflight and print copies.
- Existing account-boundary test extended.

## 5–6. Exact commands and results

- `npm test -- --run src/features/production-workspace/productionSession.test.ts src/features/production-workspace/productionSessionStore.test.ts src/features/production-workspace/productionRescue.test.ts src/features/production-workspace/productionWorkspaceUi.test.tsx src/features/master-label/masterLabel.test.ts src/app/accountSessionReset.test.ts src/pages/pro/finalProWorkbenchDesign.test.tsx src/pages/pro/ProWorkspacePage.test.tsx src/pages/pro/proRecipeUxRepair.test.tsx` — **9 files / 74 tests passed** before the final canonical-fold regression was added.
- `npm test -- --run src/features/studio/studioResult.test.ts src/features/studio/buildRecipeInput.test.ts src/features/constraint-studio/staleDraftState.test.ts src/features/constraint-studio/currentDraftOptimization.test.ts src/features/constraint-studio/applyIntegrity.test.ts src/features/formulation/multiMainIngredient.test.tsx src/features/formulation/canonicalIngredientIdentityP0.test.tsx src/features/pro-core/productionRuns.migration.test.ts src/services/proCore/proCoreProduction.test.ts src/services/proCore/repositoryConformance.test.ts src/services/proCore/supabaseProduction.test.ts src/features/optimization/batchRescueMultiLeverSolver.test.ts src/features/optimization/branchRecalculationPreview.test.ts src/features/optimization/verifiedSubstituteContract.test.ts src/data/label/ingredientStatement.test.ts src/data/label/nutritionLabel.test.ts src/data/label/recipeExport.test.ts` — **17 files / 214 tests passed**.
- `npm test -- --run src/features/production-workspace/productionEngineFreeze.test.ts` — **1 file / 1 test passed**.
- `npm test -- --run src/features/production-workspace/productionRescue.test.ts src/features/production-workspace/productionSession.test.ts src/features/formulation/canonicalIngredientIdentityP0.test.tsx` — **3 files / 31 tests passed** after canonical top-up folding.
- `npm test -- --run src/features/production-workspace/productionWorkspaceUi.test.tsx src/features/production-workspace/productionRescue.test.ts` — **2 files / 9 tests passed** after the display-precision repair.
- `npm test` — first two complete attempts honestly failed to start the three Node OCR suites because the isolated worktree lacked vendored `eng`, then `spa`, language assets. All five exact lockfile-vendored assets were copied from the parent checkout's installed dependencies into ignored `node_modules`. Final result: **416 files / 5,547 tests passed; 0 failed**.
- `npm run typecheck` — **passed**.
- `npm run lint` — **passed with 0 errors and 2 pre-existing Fast Refresh warnings** in `src/app/router.tsx` and `src/features/pro-core/RecipeVersionsSection.tsx`.
- `npm run build` — **passed**; final bundles include `dist/assets/index-BPlg-0DD.js` and `dist/assets/index-C63vk1IS.css`.
- `git diff --check` — **passed**.

## 7. Previously accepted flows retested

Final workbench design, Pro workspace routing, current Recipe/Profile/Monitor tests, current-draft synchronization, Preview/Apply integrity, canonical ingredient identity, multi-Main, ProductionRepository/migration suites, batch-rescue solvers, label formatters and the full repository suite.

Browser QA at `http://127.0.0.1:4175/pro/production` covered exact confirmation, underweight, overpour, honest impossible, verified enlarge rescue, add-only apply, completion, actual-batch Master Label, EU/US/custom market states, date/preflight and desktop/mobile layouts. Mobile viewport had `scrollWidth === clientWidth`. Sixteen current screenshots are stored under `docs/production/screenshots/`.

The isolated Vite dev server warned that font files resolved from the parent checkout's `node_modules` were outside its serving allow-list. This is a worktree-only development warning; the production build included the Hanken Grotesk and IBM Plex Mono assets successfully.

## 8. Deployment environment verified

Local Vite environment on `127.0.0.1:4175` was verified by DOM and screenshot content. Deployment was not requested and was not performed. No production/staging configuration changed.

## 9. Remaining incomplete items

- `ProductionSession` is browser-persisted; it is not yet backed by per-line server commands/RPC.
- Existing production DB actual JSON does not guarantee an append-only physical ledger.
- Mid-production shortage/substitution, automatic process stages and topping roles remain pink.
- Allergen metadata rehydration by canonical ID is not implemented; live print readiness is therefore blocked honestly.
- EU/US/CA/UK/AU-NZ renderers are PARTIAL, not legally verified.
- US/Canada/AU-NZ prescribed nutrition panels are not implemented.
- Facility profile is a seam, not a complete account-backed model.
- No validated shelf-life engine exists.
- No direct printer model integration or real PDF artifact storage exists.

## 10. Exact blockers and required external actions

- Approve server data model and idempotent per-line confirmation/completion RPC.
- Approve/implement canonical ingredient label/allergen repository and evidence statuses.
- Legal/product review each versioned market renderer for concrete product/package/language scope.
- Provide facility/operator schema and account defaults.
- Provide validated shelf-life rules per product/process or require manual date basis.
- Approve Heat/Cold Process and topping role contracts before automating stages.

## 11. Git diff and commit status

Isolated branch: `codex/production-master-label-final`, based on `30daf295465bff1b53f9531a0851b44f26af3ad5`. The implementation is committed at handoff; the exact commit is reported in the final response. No Engine or Mapper file is changed. No deployment or push is performed by this task.
