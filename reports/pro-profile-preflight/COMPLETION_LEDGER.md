# Completion ledger — Pro Profile preflight and six-axis UX

## 1. Requested scope

Implement only the canonical Pro work header, the `Profil receptury` hierarchy, one-card recipe preflight, machine-conditional settings, recipe/user-default persistence seams, and the compact six-axis target/current-state language. Preserve the ingredient table/menu, Monitor, Production, Summary, score education view, Engine/science/solver/target bands, Apply/Undo, canonical ingredient identity, nutrition math, and cost math. Do not deploy.

## 2. Completed work

- Reduced the work header to the unchanged canonical logo, one integrated `Przelicz z PI` state/action, and hamburger; removed the duplicate header score and work-header plan badge.
- Kept the sole technical score at the top of Profile and retained the existing educational-detail click path.
- Reordered Profile to Score → Recipe settings/preflight → Direction/current state → Nutrition/Cost.
- Added one compact preflight with product, machine, immediate machine-dependent context, combined current/target batch, quality, one confirmation, and a secondary user-default action.
- Implemented amber needs-confirmation, white confirmed, and reserved red hard-conflict semantics. Material setting changes invalidate confirmation; ingredient gram edits do not.
- Professional mode exposes `Świeże`, `−11°C`, `−12°C`, and `−13°C` immediately under the machine. Home machines hide that selector and expose physical cycle capacity plus reliable cycle splitting.
- Kept physical capacity separate from editable recipe target batch.
- Replaced the four large target dropdowns with reusable compact axes. Four axes move only the desired gold target via `−/+`; Structure and Stability are informational and have no controls. The independent actual marker is derived from existing monitor summary readings.
- Target movement marks recalculation pending and does not mutate ingredient grams or claim that solver reformulation happened.
- Added minimal recipe-specific Profile metadata and user-scoped new-recipe defaults without adding fields to Engine inputs or changing science/math.
- Preserved pink honesty states: `CZĘŚCIOWO PODŁĄCZONE` for Quality and `STEROWANIE W PRZYGOTOWANIU` for solver target steering.

## 3. Files changed

Application and tests:

- `src/pages/pro/ProWorkspacePage.tsx`
- `src/features/pro-workbench/RecipeProfilePanel.tsx`
- `src/features/pro-workbench/WorkbenchSettingsLine.tsx`
- `src/features/pro-workbench/ProfileDirectionAxes.tsx`
- `src/features/pro-workbench/RecipeAxisScale.tsx`
- `src/features/pro-workbench/recipeAxisModel.ts`
- `src/features/pro-workbench/recipeProfileStore.ts`
- `src/features/pro-workbench/recipeProfilePersistence.ts`
- `src/features/pro-workbench/proProfilePreflightUx.test.tsx`
- `src/features/recipes/useCanonicalRecipeSave.ts`
- `src/features/recipes/useCanonicalRecipeSave.test.ts`
- `src/features/studio/canonicalWorkbench.test.tsx`
- `src/pages/pro/finalProWorkbenchDesign.test.tsx`
- `src/stores/recipeStore.ts`

Evidence:

- `reports/pro-profile-preflight/screenshots/01-desktop-initial-unconfirmed.png`
- `reports/pro-profile-preflight/screenshots/02-desktop-confirmed.png`
- `reports/pro-profile-preflight/screenshots/03-desktop-professional-serving-minus12.png`
- `reports/pro-profile-preflight/screenshots/04-desktop-home-machine-capacity.png`
- `reports/pro-profile-preflight/screenshots/05-desktop-batch-actual-target-cycles.png`
- `reports/pro-profile-preflight/screenshots/06-desktop-six-axes-centered.png`
- `reports/pro-profile-preflight/screenshots/07-desktop-sweetness-target-left.png`
- `reports/pro-profile-preflight/screenshots/08-desktop-sweetness-target-right.png`
- `reports/pro-profile-preflight/screenshots/09-desktop-structure-stability-info-only.png`
- `reports/pro-profile-preflight/screenshots/10-desktop-full-profile-nutrition-cost.png`
- `reports/pro-profile-preflight/screenshots/11-mobile-profile-preflight.png`
- `reports/pro-profile-preflight/screenshots/12-mobile-axes-nutrition-cost.png`

## 4. Tests added or changed

- Added `proProfilePreflightUx.test.tsx` for preflight states, conditional professional/home-machine UX, capacity/target separation, default/saved-recipe behavior, six-axis target/actual independence, pending recalculation, unchanged grams, and information-only axes.
- Updated `finalProWorkbenchDesign.test.tsx` for the canonical work header, sole Profile score, preserved educational affordance, compact Profile hierarchy, and removed legacy settings UX.
- Updated canonical-save source contracts to require Profile metadata attachment after canonical `buildRecipeInput(state)` construction.
- Updated canonical workbench source contract for the combined batch presentation.

## 5. Exact test commands executed

```text
npm test -- --run src/features/recipes/useCanonicalRecipeSave.test.ts src/features/studio/canonicalWorkbench.test.tsx
npm test -- --reporter=dot
npm run typecheck
npm run lint
npm run build
git diff --check
git diff --name-only 92e2d84 -- src/engine src/features/ingredient-builder src/features/pro-workbench/MonitorPanelContent.tsx src/features/pro-workbench/MonitorLiveSummary.tsx src/features/pro-workbench/monitorSummaryView.ts src/features/studio/StudioEngineSurface.tsx
```

The focused Profile/design suites were also executed during implementation before the final full suite; the final full suite contains all of them.

## 6. Test results

- Focused canonical-save/workbench contracts: 2/2 files, 24/24 tests passed.
- Full suite: 396/396 files, 5417/5417 tests passed.
- Typecheck: passed.
- Lint: passed with 0 errors and 2 pre-existing Fast Refresh warnings in `src/app/router.tsx` and `src/features/pro-core/RecipeVersionsSection.tsx`.
- Production build: passed; 1025 modules transformed. Main bundle: `dist/assets/index-UdMwI_iZ.js`; CSS: `dist/assets/index-CIYfBD1x.css`.
- `git diff --check`: passed.
- Protected-scope diff command: empty.

Existing test-environment diagnostics were not hidden: unavailable Zustand storage warnings, an existing `failed to load ./ita.special-words` message, and unconfigured DEV-backend warnings occurred while the suite remained fully green.

## 7. Previously accepted flows retested

- Current-draft optimization and exact current amounts.
- Preview/Apply invariants, exact locks/exclusions, and complete Undo restoration.
- Canonical ingredient identity/deduplication and multi-cycle no-duplicate stability.
- Machine routing and the six frozen customer-visible serving choices; no `Ninja 2` label introduced.
- Existing score education affordance.
- Ingredient-table contracts, Monitor contracts, Nutrition/Cost rendering and math, recipe save/load, current-draft synchronization, Production, and Summary through the full regression suite.
- Browser QA verified target movement from 50% → 0% → 100% while Sucrose remained exactly `130 g`.

## 8. Deployment environment verified

No deployment was requested or performed. Browser QA used the local Vite application at `http://127.0.0.1:4173/pro/recipe` with explicit 1440×900 desktop and 390×844 mobile viewports. At desktop, document/body client and scroll height were both exactly 900 px with `scrollY = 0`, proving no normal-workflow page scroll. Browser console had no runtime errors; the only warning was the expected unconfigured DEV backend read.

## 9. Remaining incomplete items

- Directional target values intentionally do not yet drive solver Preview/Apply; the final control/state seam is present and explicitly pink.
- Quality levels retain the audited partial connection to cost/booster policies and remain explicitly pink.
- Product-specific scientific validation beyond current legitimate behavior remains outside this UX task.

## 10. Exact blockers and required external actions

There is no blocker to owner review. Owner visual/product verification is required before integration. A future separately approved Engine contract is required before the four direction targets may legitimately steer solver reformulation. No production/staging action is required for this task.

## 11. Git diff and commit status

- Isolated branch: `codex/pro-profile-preflight`.
- Base: `92e2d84bdae5a8e509a276bbf7b4bfb00fe86d7f`.
- Protected-scope diff: empty.
- This implementation, regression updates, QA screenshots, and ledger are intended to be committed together after final inspection.
- No push and no deployment.
