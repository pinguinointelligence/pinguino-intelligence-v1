# INGREDIENT TABLE UX — completion ledger

Date: 2026-08-08
Branch: `codex/ingredient-table-ux`
Base: `7d33ec7c2d56936f1b6cc2e22e2526d60ab9e10b`

## Before / after table structure

- Before: `Składnik | % | % lock | g | g lock | Rola | Dostępność | Cena/kg | …`.
- After: `Składnik | % + lock | Ilość + g/kg + lock | Cena/kg | …`.
- Recipe mode no longer repeats Role, Available, internal source or confidence labels in every row.
- Production mode retains its existing `Planowane | Faktycznie | Różnica | Status` surface.

## Implemented interactions

- Customer roles `Główny`, `Standardowy`, `Dodatek` moved under `…`.
- Main and Addition receive small name-side symbols; Standard stays visually quiet.
- Addition remains in final mass, Nutrition, cost, allergens and label through the unchanged canonical recipe line. Its distinct post-process formulation semantics are explicitly pink and not claimed as solved.
- Percentage value and final lock placement stay together. Percentage lock is disabled and pink because its solver contract is not connected.
- Quantity supports explicit `g`/`kg` presentation and converts edits back to canonical grams.
- Exact gram lock is charcoal/white, not red, and disables the quantity input.
- Availability is reversible UI metadata. The row remains at the same index and the Engine recipe line is not removed or silently excluded.
- Substitute opens a focused dialog. With no connected ranking it shows `W PRZYGOTOWANIU`, supplies no candidate and performs no mutation.
- Normal rows hide provenance noise. Estimated/incomplete rows show one amber dot. Full source, status, confidence and canonical ID are available in `Dane składnika`.
- `Oznacz jako już dodany` is absent from Recipe mode; Production actual-quantity behavior is unchanged.
- Private price remains under `…` and pink.

## Required ingredient removal flow

- Required is persisted as Recipe-table metadata and is separate from `lock_type`; it does not freeze grams.
- Non-required deletion continues through the existing atomic `removeItem` flow.
- Required deletion opens a guard before any mutation.
- Substitute-found contract: when valid candidates are supplied by a future approved finder, the guard offers `Znajdź zamiennik`; no candidate is silently applied.
- No-substitute contract: the dialog states `Brak odpowiedniego zamiennika` and offers `Zostaw składnik` or the destructive infeasible path.
- The destructive path requires a second explicit confirmation.
- Confirmed removal records an unresolved required role, shows `RECEPTURA NIEWYKONALNA`, and disables `Przelicz z PI` without calling the solver.
- Manually restoring the same missing ingredient clears the infeasible marker and re-enables PI recalculation.

## Pink / incomplete functionality

1. Percentage lock: final placement only; target percentage is not enforced by Preview, Apply or solver.
2. Addition: customer role metadata is ready, but Engine does not yet distinguish pre-freeze formulation from post-process inclusion. The line continues to participate in all current recipe calculations.
3. Substitute finder: ranking, compatibility science and Apply integration are not implemented. Runtime candidate list is deliberately empty.
4. My price: account persistence and cost override are not connected.
5. Table metadata persists in the local draft UX store. A canonical cross-device saved-recipe schema for Addition/Required/Unavailable metadata is still a future backend contract.

## Completion gate

### 1. Requested scope

Recipe-mode ingredient-table simplification only, including compact columns, contextual role/availability/data actions, unit presentation, truthful unfinished controls, and required-removal safeguards.

### 2. Completed work

All requested table interactions above are implemented. Engine formulas, solver mathematics, target bands, Monitor, scoring, Summary, global navigation and Production table were not redesigned.

### 3. Files changed

- `src/copy/en.ts`
- `src/features/ingredient-builder/IngredientBuilder.tsx`
- `src/features/ingredient-builder/IngredientRow.tsx`
- `src/features/ingredient-builder/ingredientTableUx.ts`
- `src/features/ingredient-builder/ingredientTableUxStore.ts`
- `src/features/ingredient-builder/IngredientTableUx.test.tsx`
- `src/features/ingredient-builder/ingredientTableUx.test.ts`
- `src/pages/pro/ProWorkspacePage.tsx`
- `reports/INGREDIENT_TABLE_UX_NORMAL.png`
- `reports/INGREDIENT_TABLE_UX_MENU.png`
- `reports/INGREDIENT_TABLE_UX_UNAVAILABLE.png`
- `reports/INGREDIENT_TABLE_UX_REQUIRED_GUARD.png`
- `reports/INGREDIENT_TABLE_UX_LEDGER.md`

### 4. Tests added or changed

- Added 26 focused UX/contract regressions across `IngredientTableUx.test.tsx` and `ingredientTableUx.test.ts`.
- Updated the active-lock test fixture to prove `lock_type='grams'` itself disables the quantity input.
- No existing test was weakened, skipped or deleted.

### 5. Exact test commands executed

- `npm run typecheck`
- `npx vitest run src/features/ingredient-builder/ingredientTableUx.test.ts src/features/ingredient-builder/IngredientTableUx.test.tsx`
- `npx vitest run src/pages/pro/finalProWorkbenchDesign.test.tsx src/pages/pro/proRecipeUxRepair.test.tsx src/features/pro-core/ProWorkbar.test.tsx src/stores/recipeStore.test.ts src/features/constraint-studio/applyPipeline.test.ts src/features/constraint-studio/ownerMultiRemoveNoRefresh.test.ts src/features/constraint-studio/staleDraftState.test.ts src/features/formulation/nightlyP0.test.ts src/features/formulation/liveRuntime.test.ts`
- `npx eslint src/features/ingredient-builder/IngredientRow.tsx src/features/ingredient-builder/IngredientBuilder.tsx src/features/ingredient-builder/ingredientTableUx.ts src/features/ingredient-builder/ingredientTableUxStore.ts src/features/ingredient-builder/IngredientTableUx.test.tsx src/features/ingredient-builder/ingredientTableUx.test.ts src/pages/pro/ProWorkspacePage.tsx src/copy/en.ts`
- `npx vitest run src/features/constraint-studio/constraintStudioUi.test.tsx src/features/ingredient-builder/IngredientTableUx.test.tsx src/features/ingredient-builder/ingredientTableUx.test.ts`
- `npm test` (executed twice: first exposed an accessibility regression, then rerun after the fix)
- `npm run lint`
- `npm run build`
- Browser QA at `http://127.0.0.1:5173/pro/recipe`, 1440×900 desktop viewport.

### 6. Test results

- Focused ingredient-table contract: 26/26 passed.
- Focused accessibility + table rerun: 47/47 passed.
- Pro/Formulation/Apply/Undo/current-draft focused regression set: 126/126 passed.
- Final full suite: 395 files passed; 5,403 tests passed; 0 failed.
- Typecheck: passed.
- Build: passed. Existing Vite large-chunk warning remains visible.
- Lint: passed with 0 errors and 2 pre-existing Fast Refresh warnings in `src/app/router.tsx` and `src/features/pro-core/RecipeVersionsSection.tsx`.
- The first full-suite run had 1 failure because the prior screen-reader word `Zablokowana` was lost. It was restored, the focused test passed, and the entire suite passed on rerun.
- Test stderr still prints the existing non-failing OCR message `failed to load ./ita.special-words`; suite exit code is 0.

### 7. Previously accepted flows retested

- Canonical recipe store add/remove/deduplication.
- Current-draft no-refresh synchronization.
- Preview → Apply invariant.
- Apply verification and Undo.
- Exact §17 locks and exclusions.
- Pro workbar and one-screen two-scroll-surface contract.
- Existing Recipe/Production mode separation.
- Canonical recipe save tests included in the full suite.

### 8. Deployment environment verified

- Local served Vite environment verified at `http://127.0.0.1:5173/pro/recipe`.
- Browser console: 0 errors.
- No staging or production deployment was requested or performed.

### 9. Remaining incomplete items

Only the five pink/incomplete contracts listed above remain. No Engine or product-science implementation was invented in this task.

### 10. Exact blockers and required external actions

- Approved percentage-lock persistence and solver enforcement contract.
- Approved Engine semantics for post-process Addition lines.
- Approved substitute-ranking source, compatibility rules and Preview/Apply seam.
- Account-backed private-pricing persistence.
- Backend schema decision for cross-device saved Recipe-table metadata.

### 11. Git diff and commit status

- Work completed in isolated worktree `C:\Users\Absconsio\Desktop\pi-worktrees\ingredient-table-ux`.
- Branch: `codex/ingredient-table-ux` from exact base `7d33ec7`.
- No unrelated root-worktree files were touched.
- Commit and final clean-status evidence are recorded in the final task response.
- No push and no deployment.

## Browser QA evidence

- Desktop normal row: `reports/INGREDIENT_TABLE_UX_NORMAL.png`
- Context menu: `reports/INGREDIENT_TABLE_UX_MENU.png`
- Same-position unavailable row: `reports/INGREDIENT_TABLE_UX_UNAVAILABLE.png`
- Required-removal no-substitute guard: `reports/INGREDIENT_TABLE_UX_REQUIRED_GUARD.png`
