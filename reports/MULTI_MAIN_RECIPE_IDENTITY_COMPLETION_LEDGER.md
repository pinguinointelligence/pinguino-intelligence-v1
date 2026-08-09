# MULTI-MAIN RECIPE IDENTITY — COMPLETION LEDGER

Date: 2026-08-08

Branch: `codex/multi-main-recipe-identity`

Isolated worktree: `C:\Users\Absconsio\Desktop\pinguino-intelligence-v1\.claude\worktrees\codex-multi-main`

Base commit: `7d33ec7c2d56936f1b6cc2e22e2526d60ab9e10b`

## 1. Requested scope

- Replace the singleton `Główny` behavior with a per-line Main set.
- Preserve every positive Main ingredient, its canonical/stable identity and the relative ratio of all positive Main lines through formulation, correction, batch reconciliation, Preview, Apply, Undo and save/reopen.
- Return an explicit non-applicable conflict when exact locks, ranges or unavailability conflict with Main identity.
- Permanently forbid the reproduced `100/100 -> 0/0` and `100/100 -> 0/positive` applicable proposals.
- Keep the existing crown design, do not implement OPTIMAL/ECO, do not modify Engine science, and do not deploy.

## 2. Completed work

- Root cause: `RecipeItem.lock_type === 'main'` already represented the role per line, but `recipeStore.setMainIngredient` explicitly demoted every other Main line to `unlocked`. There was no separate `primaryIngredientId`; the singleton was created by the store action.
- Solver root cause: once the first fruit was demoted, the current-draft candidate vector treated it as adjustable and explicitly searched reductions down to zero. The `milk_base_g18_minus13_v1` template has no fruit role, so the template could supply a technically valid milk structure without restoring the discarded fruit identity. Existing Engine reduction protection only applied to lines that still had `lock_type === 'main'`.
- `setMainIngredient` now changes only the selected stable line. Main -> Standard uses the existing per-line `setLockType` action and never resets the set globally.
- Added one formulation-intent contract that captures positive Main lines by stable line id plus canonical ingredient id, resolves one shared ratio scale, and trustlessly verifies identity/role/positive grams/ratio before Preview and Apply.
- Main groups are fixed as a group after their shared amount is resolved; batch normalization redistributes the technological envelope instead of independently scaling one flavour carrier.
- Exact locks and ranges constrain the shared Main scale. Incompatible constraints return `main_ratio_conflict`; no lock or ratio is silently rewritten.
- A Main ingredient explicitly marked unavailable leaves a canonical draft marker, blocks formulation with `main_ingredient_unavailable`, and regains its Main role if that same canonical ingredient is explicitly re-added.
- Batch Rescale, Suggested Fix, local correction, full/constrained formulation and the final Apply door now enforce the same contract. A forged proposal is rejected independently of preview metadata.
- Save/reopen/version load and Undo preserve the Main set, stable line ids and canonical ingredient ids.
- Existing crown markup was reused unchanged and rendered once for every Main line. The PINGÜINO design skill therefore caused no redesign; it reinforced the requirement to preserve the accepted visual component.

## 3. Files changed

- `src/features/formulation/mainIngredientContract.ts` — new canonical Main identity and ratio contract.
- `src/features/formulation/formulate.ts` — group-scale resolution and explicit unavailable/conflict results.
- `src/features/constraint-studio/applyPipeline.ts` — Main-safe normalization, Preview/Batch/Suggested Fix gates and trustless Apply gate.
- `src/features/constraint-studio/constraintStudioStore.ts` — unavailable-Main marker included in the canonical draft and optimization options.
- `src/features/constraint-studio/previewIssueMessage.ts` — explicit customer-facing conflict propagation.
- `src/stores/recipeStore.ts` — set semantics, unavailable-Main lifecycle and persistence.
- `src/features/formulation/multiMainIngredient.test.tsx` — fixtures A-G plus range, batch, suggested-fix, actuals and forged-Apply regressions.
- `src/features/constraint-studio/staleDraftState.test.ts` — canonical serialization expectation for `unavailableMains`.
- `reports/MULTI_MAIN_RECIPE_IDENTITY_COMPLETION_LEDGER.md` — this ledger.

No file under `src/engine` changed. `mapper_basement` was not modified.

## 4. Tests added or changed

The new 14-test multi-Main suite proves:

- two crowns/set semantics and one-line-only demotion;
- exact owner runtime at 1:1 and 2:1;
- three compatible Main ingredients at 1:1:1;
- exact-lock conflict and compatible-range preservation;
- Main-safe batch reconciliation and Suggested Fix refusal;
- production actual authority;
- save/reopen/version restoration;
- Preview -> Apply -> Undo preservation;
- Main + unavailable explicit stop and re-add restoration;
- trustless rejection of a forged zero/demotion payload;
- no duplicate canonical ingredient ids.

The pre-existing canonical draft test was extended with the new material field `unavailableMains`.

## 5. Exact test commands executed

- `npm.cmd run typecheck`
- `npm.cmd test -- src/features/formulation/multiMainIngredient.test.tsx`
- `npm.cmd test -- src/features/formulation/multiMainIngredient.test.tsx src/features/formulation/nightlyP0.test.ts src/features/constraint-studio/applyIntegrity.test.ts`
- `npm.cmd test -- src/features/formulation/multiMainIngredient.test.tsx src/features/formulation/nightlyP0.test.ts src/features/constraint-studio/applyIntegrity.test.ts src/features/constraint-studio/currentDraftOptimization.test.ts src/features/constraint-studio/recalcDuplication.test.ts src/features/formulation/formulationAuthenticity.test.ts src/features/formulation/constrainedReformulation.test.ts src/features/formulation/liveRuntime.test.ts src/features/formulation/acceptanceAddendum.test.ts`
- `npm.cmd test -- src/features/formulation/multiMainIngredient.test.tsx src/features/formulation/nightlyP0.test.ts src/features/constraint-studio/applyIntegrity.test.ts src/features/constraint-studio/currentDraftOptimization.test.ts src/features/constraint-studio/recalcDuplication.test.ts src/features/formulation/formulationAuthenticity.test.ts src/features/formulation/constrainedReformulation.test.ts src/features/formulation/liveRuntime.test.ts src/features/formulation/acceptanceAddendum.test.ts src/stores/recipeStore.test.ts src/features/constraint-studio/constraintStudioStore.test.ts`
- `npm.cmd run lint`
- `npm.cmd test`
- `npm.cmd test -- src/features/constraint-studio/staleDraftState.test.ts src/features/ocr-intake/ocrEngine.node.test.ts src/features/ocr-intake/provider/tesseractProvider.node.test.ts src/features/ocr-intake/provider/tesseractProvider.it.node.test.ts`
- `npm.cmd test -- src/features/ocr-intake/ocrEngine.node.test.ts src/features/ocr-intake/provider/tesseractProvider.node.test.ts src/features/ocr-intake/provider/tesseractProvider.it.node.test.ts`
- `npm.cmd run build`
- `git diff --check`
- `git diff -- src/engine`

## 6. Test results

- Typecheck: PASS.
- Focused final multi-Main suite: 1 file, 14 tests PASS.
- Focused formulation/Apply/current-draft regression: 11 files, 185 tests PASS.
- Lint: PASS with 0 errors and two pre-existing Fast Refresh warnings in `src/app/router.tsx` and `src/features/pro-core/RecipeVersionsSection.tsx`.
- First full-suite run exposed one related stale serialization expectation and three isolated-worktree OCR asset-path failures: 390 files/5374 tests passed, 1 test plus 3 suites failed. The serialization contract was updated; the existing root language-model packages were made visible to the isolated worktree without application-code changes.
- OCR focused rerun: 3 files, 16 tests PASS. Tesseract printed the existing non-fatal `failed to load ./ita.special-words` diagnostic.
- Final full suite: 394 files, 5391 tests PASS.
- Production build: PASS, 1021 modules transformed. Existing Vite large-chunk warning remains visible.
- `git diff --check`: PASS.
- Engine science diff: empty.

## 7. Previously accepted flows retested

- Current-draft optimization and anti-staleness serialization.
- Canonical ingredient identity and duplicate prevention.
- Full and constrained formulation, approved-template routing and formulation authenticity.
- Exact Apply integrity, Preview -> Apply -> Undo and batch-total invariants.
- Recalculation duplication protection, local runtime behavior and nightly P0 cases.
- Recipe store persistence and constraint-studio session behavior.
- Full repository regression suite including OCR intake.

## 8. Deployment environment verified

No deployment was performed, as explicitly requested. No staging or production environment, Vercel project, credentials or environment files were changed. The local production build completed successfully.

## 9. Remaining incomplete items

- Percent lock remains explicitly marked in the UI as “not yet connected to the solver”. The request said “when fully implemented”; implementing it was outside this focused P0 and it was not falsely treated as functional.
- OPTIMAL/ECO, cost optimization and flavour maximization were intentionally not implemented.
- Owner/browser verification is still required before integrating this isolated branch.

## 10. Exact blockers and required external actions

No code blocker remains. Owner action: review the isolated commit and decide when it should be integrated. No deployment action was taken or is required to complete this branch-level task.

## 11. Git diff and commit status

- Branch: `codex/multi-main-recipe-identity`.
- Base: `7d33ec7c2d56936f1b6cc2e22e2526d60ab9e10b`.
- Engine diff: zero.
- Working diff is limited to the nine files listed above; generated `node_modules`/`dist` content is ignored and not part of the commit.
- At ledger creation the implementation, tests and ledger are ready to be committed together. The final commit id is reported in the owner handoff after the commit succeeds.

## Owner runtime proof

### Fixture A — 1:1, exact calculated recipe

| Ingredient | Grams | Role |
| --- | ---: | --- |
| Milk 3.5 % | 431.3289712791567 | Standard |
| Cream 30 % | 113.52184091829518 | Standard |
| Skimmed milk powder | 45.83680682996514 | Standard |
| Sucrose | 65.38858036893802 | Standard |
| Dextrose (monohydrate) | 101.71556946279247 | Standard |
| Inulin | 40.05050547597454 | Standard |
| Tara gum | 2.1577256648780545 | Standard |
| BANANA · Fresh Fruit | 100 | Main |
| STRAWBERRIES · Fresh Fruit | 100 | Main |

Calculated sum: `1000.0000000000001 g` (floating-point representation of 1000 g).

Banana / Strawberry: `1.000000000000`.

Engine proof: `all_bands_in_range`, violations after: `0`, solver invocations: `1`, diagnostic-only: `false`.

### Fixture B — 2:1, exact calculated recipe

| Ingredient | Grams | Role |
| --- | ---: | --- |
| Milk 3.5 % | 353.84733987481366 | Standard |
| Cream 30 % | 122.43919542898033 | Standard |
| Skimmed milk powder | 51.23080327868397 | Standard |
| Sucrose | 52.9814689125213 | Standard |
| Dextrose (monohydrate) | 99.91039027884179 | Standard |
| Inulin | 17.167770470936492 | Standard |
| Tara gum | 2.423031755222489 | Standard |
| BANANA · Fresh Fruit | 200 | Main |
| STRAWBERRIES · Fresh Fruit | 100 | Main |

Calculated sum: `1000 g`.

Banana / Strawberry: `2.000000000000`.

Engine proof: `all_bands_in_range`, violations after: `0`, solver invocations: `2`, diagnostic-only: `false`.
