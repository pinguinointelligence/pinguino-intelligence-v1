# Availability UX deprecation — reconciliation record

Date: 2026-09-12

Owner workstream: hide availability from customer UI, preserve dormant internal capability

Clean base: `origin/staging` at `cd85009ecce27d4164bf9add8ba52dda46582b4a`

Working branch: `codex/availability-ux-deprecation`

Status: local implementation and execution gates passed; landing in progress

## Reconciliation boundary

- Transferred only UI-hiding changes attributable to this workstream.
- Preserved persisted availability fields, compatibility readers, store writers, internal types, historical metadata, Engine/Solver inputs and ProductBehavior routing.
- Removed the availability-only customer copy and the unused UI icon definition; neither is part of the dormant data capability.
- Preserved accepted non-availability controls and flows: Crown/Main, replace, percent/grams, information, reordering, price, lock, remove and completion.
- Preserved Mapper catalogue technical-unavailability handling; it is a distinct readiness/eligibility capability.
- Did not change database migrations, `mapper_basement`, secrets, credentials, billing, environments or production.

## Task-only files changed

- `src/features/ingredient-builder/IngredientRow.tsx`
- `src/features/ingredient-builder/IngredientLineControls.tsx`
- `src/features/studio/OwnerDiagnosticPanel.tsx`
- `src/copy/en.ts`
- `src/features/ingredient-builder/IngredientArticlePanel.runtime.test.tsx`
- `src/features/ingredient-builder/IngredientTableUx.test.tsx`
- `src/features/recipes/recipePayload.test.ts`
- `src/contracts/owner-locked/availabilityUxDeprecation.contract.test.ts`
- `docs/OWNER_LOCKED_CONTRACTS.md`
- `reports/AVAILABILITY_UX_DEPRECATION_CLOSURE_2026-09-12.md`

## Canonical focused test list

| ID | Test | Current status |
| --- | --- | --- |
| AVAIL-UX-001 | Mobile ingredient editing has no availability action or icon | PASS |
| AVAIL-UX-002 | Desktop ingredient editing has no availability action or icon | PASS |
| AVAIL-UX-003 | Legacy availability metadata renders no badge, status or row state | PASS |
| AVAIL-UX-004 | Old saved recipe retains sidecars and calculates safely | PASS |
| AVAIL-UX-005 | Central Search preserves canonical order, Recent and Favorites | PASS |
| AVAIL-UX-006 | ProductBehavior, Engine and Solver authorities remain connected | PASS |
| AVAIL-UX-007 | Mapper readiness and catalogue eligibility remain intact | PASS |
| AVAIL-UX-008 | Point 5B retains Crown, Replace, percent/grams and Info without availability | PASS |

The test definitions are in `src/contracts/owner-locked/availabilityUxDeprecation.contract.test.ts`, with render-level regressions in `src/features/ingredient-builder/IngredientArticlePanel.runtime.test.tsx` and `src/features/ingredient-builder/IngredientTableUx.test.tsx`, and saved-recipe compatibility in `src/features/recipes/recipePayload.test.ts`.

## Executed gates

1. Focused contracts and render regressions:
   `npx vitest run src/contracts/owner-locked/availabilityUxDeprecation.contract.test.ts src/features/ingredient-builder/IngredientArticlePanel.runtime.test.tsx src/features/ingredient-builder/IngredientTableUx.test.tsx src/features/recipes/recipePayload.test.ts`
   Result: PASS — 4 files, 67 tests.
2. Search, Recent and Favorites regressions:
   `npx vitest run src/features/ingredient-builder/ProductPickerPopover.catalogPresentation.test.tsx src/features/ingredient-builder/pickerSegmentOrder.test.ts`
   Result: PASS — 2 files, 34 tests.
3. Historical saved-recipe regressions:
   `npx vitest run src/features/recipes/recipePayload.test.ts src/stores/recipeStore.test.ts`
   Result: PASS — 2 files, 43 tests.
4. TypeScript:
   `npm run typecheck`
   Result: PASS.
5. Lint:
   `npm run lint`
   Result: PASS — 0 errors, 8 pre-existing warnings.
6. Build:
   `npm run build`
   Result: PASS.
7. Current staging gate:
   `npm run verify:staging`
   Result: PASS — 24 owner-locked files / 234 tests plus typecheck, lint and build.
8. Full required suite:
   `npm test`
   Result: PASS — 1,175 files and 15,255 tests passed; 25 files and 129 tests skipped; zero failures.
9. Served staging QA after merge: mobile and desktop editor, Search/Recent/Favorites, HOME/PRO selection, replacement, Scanner, Recipe Library and one old saved recipe containing availability metadata.
   Result: PENDING MERGE.

## Landing state

- Commit: not created.
- Pull request: not created.
- CI: not started.
- Merge: not performed.
- Canonical staging SHA containing this change: none.
- Production: untouched.
- Feature closure: local gates passed; pending commit, PR, CI, merge, canonical staging verification and served QA.
