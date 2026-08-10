# GLOBAL MENU IA — COMPLETION LEDGER

Date: 2026-08-10

Branch: `codex/global-menu-ia-final`

Base: `origin/staging` at `4bd4f50f3c371e579d8b071567764ece0fffe51b`

## 1. Requested scope

Replace the universal, feature-heavy hamburger with a shallow destination-only menu that changes for Guest, Home and Pro. Consolidate Recipes, Production, Products, Machine and Account ownership, preserve contextual functionality/deep links, make no Engine/science changes, verify desktop/mobile, commit in an isolated worktree, and do not deploy.

## 2. Completed work

- Added exact capability-derived Guest, Home and Pro navigation outputs.
- Preserved the canonical right drawer, X, backdrop, Escape, focus trap, body scroll lock, touch sizing and bottom account block.
- Made the shell logo and plan title return to `/`, `/home` or `/pro/recipe` according to the resolved audience.
- Consolidated Recipes into `MOJE / PINGÜINO / INSPIRACJE`, with `+ Nowa receptura` as a contextual action.
- Consolidated Pro Production into `BIEŻĄCA / HISTORIA / ETYKIETY`; existing completed-session snapshot remains the authority for label review/reprint.
- Consolidated product entry under Products and retained the existing manual/OCR and file-import routes as contextual actions.
- Consolidated account-level Machine at `/machine`; recipe-specific machine/serving remains in Recipe Profile.
- Added shallow Account, How it works, Shop and Franchise route ownership without inventing data or purchase functionality.
- Removed API, Monitor, Versions, Costs, Exports, Advanced tools, create/import actions and readiness labels from normal global navigation.
- Preserved old URLs with redirects or contextual deep links.

## 3. Files changed

- Navigation/shell: `src/features/shell/appNav.ts`, `AppNavDrawer.tsx`, `AppShell.tsx`, associated shell tests and copy.
- Routing: `src/app/router.tsx`, `src/app/routes.test.tsx`.
- Canonical hubs: `src/pages/destinations/GlobalDestinationPages.tsx`, `RecipesHubPage.tsx`, destination exports/tests.
- Existing owners adapted: `MyRecipesPage.tsx`, `MachineProfilePage.tsx`, `ProWorkspacePage.tsx`, `MasterLabelEditor.tsx`.
- Regression expectations updated in design-review, Pro-workbench and authenticity tests.
- Evidence: 13 PNG files in `reports/screenshots/global-menu-ia/`.
- This completion ledger.

## 4. Tests added or changed

- Replaced the old universal-menu contract with exact Guest/Home/Pro capability matrices.
- Added active-state coverage for consolidated and legacy contextual URLs.
- Added tests for the canonical Recipes tabs, Products intake ownership, Production subnavigation, Account placement, Machine redirect model, public route ownership and Franchise separation.
- Updated accepted Pro and design-review tests so contextual readiness/workbench functions remain available but are not promoted globally.
- Hardened the DEV-route authenticity test to recognize formatted multi-line guarded routes.

## 5. Exact test commands executed

- Baseline: `npx vitest run src/features/shell/appNav.test.ts src/features/shell/canonicalShell.test.tsx src/features/shell/canonicalPro.test.tsx src/pages/pro/ProWorkspacePage.test.tsx src/pages/recipes/MyRecipesPage.test.tsx src/pages/destinations/destinationPages.test.tsx`
- Focused final: `npx vitest run src/features/shell/appNav.test.ts src/features/shell/canonicalShell.test.tsx src/features/shell/canonicalPro.test.tsx src/app/routes.test.tsx src/pages/pro/ProWorkspacePage.test.tsx src/pages/pro/finalProWorkbenchDesign.test.tsx src/pages/pro/proRecipeUxRepair.test.tsx src/pages/recipes/MyRecipesPage.test.tsx src/pages/destinations/destinationPages.test.tsx src/pages/destinations/GlobalDestinationPages.test.tsx src/pages/destinations/recipeDiscoveryProductReview.test.tsx`
- Full: `npm test`
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Production build: `npm run build`
- Integrity: `git diff --check`

## 6. Test results

- Baseline: 6 files / 47 tests passed before implementation.
- Focused final: 11 files / 105 tests passed.
- Full suite: 434 files / 5,697 tests passed; zero failures.
- Typecheck: passed.
- Lint: passed.
- Build: passed; 1,068 modules transformed.
- `git diff --check`: clean.
- Build retains the pre-existing Vite chunk-size advisory; it is not a failure.

## 7. Previously accepted flows retested

- Canonical Pro recipe/Monitor/Production contexts and workbar.
- Existing saved-recipe aggregate list and recipe loading ownership.
- Lost & Legendary / Natural Icons owner-review gate and normal customer hiding.
- Inspiration family/product filter behavior.
- Existing manual/OCR product entry and product-import route availability.
- Machine profile UI and recipe-specific machine control ownership.
- Production current context, completed snapshot authority and Master Label print gate.
- DEV-only route protection and engine-authenticity QA.

## 8. Deployment environment verified

No deployment was performed. No Vercel, staging or production state was changed. Browser QA used only `http://127.0.0.1:5173/`; production build completed locally. The local worktree used a dependency junction, so the development server reported font files outside Vite's allow-list; the production build bundled the official fonts successfully and the application had zero browser console errors.

## 9. Remaining incomplete items

- Shop and Franchise are intentionally route-ownership/inquiry surfaces, not fabricated commerce systems.
- Local QA had no authenticated saved-recipe backend, so `MOJE` truthfully displayed storage unavailable; its populated state remains covered by the existing mocked repository test.
- Local QA had no completed production snapshot, so History truthfully displayed an empty state. The completed-session snapshot and Master Label reprint path remain wired and regression-tested.
- Products does not invent a customer catalog when the external repository is unavailable; it exposes the existing intake paths and preserves the single private-price model boundary.

## 10. Exact blockers and required external actions

No code blocker remains for the requested information architecture. Owner verification may use the screenshots or run this branch with real authenticated Home/Pro accounts to review populated Recipes and Production history. Publishing requires a separate explicit deployment instruction.

## 11. Git diff and commit status

- Worktree: `C:/Users/Absconsio/Desktop/pi-worktrees/global-menu-ia-final`.
- Branch: `codex/global-menu-ia-final`.
- Engine/formulation/Mapper science diff: zero.
- Unrelated original-worktree changes were not touched.
- The implementation, tests, screenshots and this ledger are intended for one final branch commit; its SHA is reported in the owner handoff because a commit cannot self-reference its own SHA.
- Push, merge and deployment: not performed.
