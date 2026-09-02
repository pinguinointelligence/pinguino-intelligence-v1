# Contextual learning + process guide completion ledger

Date: 2026-08-08

Branch: `codex/contextual-learning-process-guide`

Base commit: `93df6eb4bda7083b34f9d0203c443d4f79424f6f`

## 1. Requested scope

Implement only the reusable contextual education layer opened from recipe score/help surfaces: contextual cards, beginner sugar education, original ingredient-causal education, micro-ingredients, honest E-number/plant-origin education, evidence-only heat/cold classification, Fresh Gelato and canonical machine workflow education, and a non-live timing selector. Preserve Ingredient Table, row menu, Profile/Monitor layout, Production, Summary, Engine science, solver, target bands, Mapper values, Apply/Undo and scoring. Provide required data audits, desktop/mobile visual QA, tests, commit, and no deployment.

## 2. Completed work

- Replaced the duplicate score/tutorial dashboard and ice-circle with a maximum-three-card contextual hub plus three shared learning entries.
- Added one shared Home/Pro education model with audience-specific ordering and recipe-specific prioritisation.
- Added a three-step beginner sugar lesson whose first copy explains freezing before POD/PAC.
- Added distinct Mango, Milk and Pistachio causal interactions without competitor-style ingredient bars.
- Added Inulin, Stabilizer and Salt micro-lessons, plus exact-identity E410/E412/E417 plant-origin education and a PINK future-formula state.
- Added a pure, evidence-only process classifier with separate function/safety reasons, joint-state support, full-identity positive cold coverage and `UNKNOWN` as the safe default.
- Added canonical machine-derived Home workflows, heat-neutral Fresh Gelato education, simplified process comparison and PINK missing timing/recommendation states.
- Completed the three required audits and internal provenance map.
- Completed desktop and mobile runtime QA. Real runtime process state is `UNKNOWN`; non-runtime cold/heat visual states are plainly labelled QA fixtures and documented in `reports/visual-qa/README.md`.

## 3. Files changed

Product/source:

- `src/copy/education.pl.ts`
- `src/features/education/ContextualEducationView.tsx`
- `src/features/education/contextualEducation.ts`
- `src/features/education/index.ts`
- `src/features/education/ingredientEducation.ts`
- `src/features/education/machineEducation.ts`
- `src/features/education/processClassification.ts`
- `src/features/pro-workbench/RecipeProfilePanel.tsx`
- `src/styles/tokens.css`

Tests:

- `src/features/education/contextualEducationView.test.tsx`
- `src/features/education/educationModel.test.ts`
- `src/features/pro-workbench/proProfilePreflightUx.test.tsx`
- `src/pages/pro/finalProWorkbenchDesign.test.tsx`

Documentation/evidence:

- `docs/education/HEAT_PROCESS_DATA_AUDIT.md`
- `docs/education/MACHINE_PROCESS_DATA_AUDIT.md`
- `docs/education/INGREDIENT_EDUCATION_SOURCE_MAP.md`
- `reports/visual-qa/README.md`
- 21 PNG captures listed in `reports/visual-qa/README.md`
- `reports/CONTEXTUAL_LEARNING_PROCESS_GUIDE_COMPLETION_LEDGER.md`

## 4. Tests added or changed

- Added model tests for positive-evidence-only cold approval, `UNKNOWN`, provisional evidence rejection, functional/safety/both separation, no invented time/temperature, recipe contextuality, Home/Pro ordering, source integrity and canonical machine timing.
- Added rendered component tests for removal of the duplicated score/ice tutorial, maximum contextual cards, required sugar copy order, causal interactions, micro-lessons, E-number semantics, PINK readiness, no hidden target ranges and tap-based mobile interaction.
- Updated Profile preflight coverage for the contextual education entry.
- Updated the final design regression to require removal of the old ice-circle tutorial.

## 5. Exact test commands executed

Final gates:

```text
npm run typecheck
npm run lint
npx prettier --check src/copy/education.pl.ts src/features/education/*.ts src/features/education/*.tsx src/features/pro-workbench/RecipeProfilePanel.tsx src/features/pro-workbench/proProfilePreflightUx.test.tsx src/pages/pro/finalProWorkbenchDesign.test.tsx src/styles/tokens.css docs/education/*.md
npx vitest run src/features/education src/features/pro-workbench/proProfilePreflightUx.test.tsx src/pages/pro/finalProWorkbenchDesign.test.tsx src/features/constraint-studio src/features/formulation src/engine/corrections/apply.test.ts src/stores/recipeStore.test.ts
npm test
npm run build
git diff --check
git diff --name-only -- src/engine src/features/constraint-studio src/features/formulation src/data/ingredients src/data/mapper_basement docs/ingredients
```

Additional focused iterations were run while implementing the view. The repository-wide `npm run format:check` was also evaluated earlier and remains a known baseline failure across approximately 760 pre-existing files; all files touched by this task pass the explicit Prettier check above.

## 6. Test results

- Typecheck: PASS.
- Lint: PASS with 0 errors and 2 pre-existing Fast Refresh warnings in `src/app/router.tsx` and `src/features/pro-core/RecipeVersionsSection.tsx`.
- Changed-file formatting: PASS.
- Focused education/design/formulation/Apply/draft/canonical regression: 29 files, 437/437 tests PASS.
- Full suite: 400 files, 5,417/5,417 tests PASS.
- Production build: PASS; final JS `dist/assets/index-C1iGR-c8.js`, CSS `dist/assets/index-B3dNIJS7.css`.
- Build retains the existing large-chunk advisory; it is not caused by a build failure.
- `git diff --check`: PASS.
- Protected-area diff command: empty output; PASS.

## 7. Previously accepted flows retested

- Current-draft optimisation, exact locks/exclusions and no-refresh draft behavior through the full constraint-studio suite.
- Preview/Apply integrity and Undo-related formulation/store behavior through constraint-studio, formulation, Engine apply and recipe store suites.
- Canonical ingredient identity/deduplication through formulation and full-suite regressions.
- Profile entry behavior and final Pro design regression.
- Complete Engine, PAC/POD/NPAC/ice, machine-routing and application regression through the 5,417-test full suite.
- Frozen product naming/routing rules remained untouched.

## 8. Deployment environment verified

No staging or production deployment was requested or performed. QA used a local Vite runtime at `127.0.0.1:5174`; desktop and mobile screenshots were captured through the in-app Browser. The temporary viewport override was reset and the browser tab finalized.

## 9. Remaining incomplete items

- Current recipe heat/cold automation remains `UNKNOWN` until canonical process evidence is supplied.
- Future proprietary stabilizer blend remains PINK `FORMUŁA W PRZYGOTOWANIU`.
- Machine-specific timing, machine recommendation and the “Kiedy chcesz jeść lody?” recommendation remain PINK `DO PODŁĄCZENIA`.
- No current canonical Fresh Gelato profile or verified timing exists.

## 10. Exact blockers and required external actions

Required data work before live process decisions:

- normalize raw/pasteurised/UHT/sterilised treatment with provenance and verification date;
- provide raw-egg/product safety state and approved process source;
- provide exact ingredient/blend hydration requirements and heat sensitivity with source;
- add recipe-level approved process coverage and explicit positive cold approval;
- verify exact machine timing and Fresh Gelato metadata per model/category.

Food-science/product owners must approve those records. This task intentionally did not add them to Mapper, Engine or persistence.

## 11. Git diff and commit status

- Work performed in isolated worktree `C:\Users\Absconsio\Desktop\pi-worktrees\contextual-learning-process-guide`.
- Branch base and pre-commit HEAD: `93df6eb4bda7083b34f9d0203c443d4f79424f6f`.
- Protected Engine/solver/formulation/Mapper/ingredient-value paths have no task diff.
- At ledger generation the reviewed task diff is uncommitted and ready to stage; the final commit hash is reported in the final handoff after commit creation.
- No push and no deployment are authorised or performed.
