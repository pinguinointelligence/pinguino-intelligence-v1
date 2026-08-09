# Recipe discovery — implementation ledger

Status date: 2026-08-08

Branch: `codex/lost-legendary-inspiration`

Worktree: `C:\Users\Absconsio\Desktop\pi-worktrees\lost-legendary-inspiration`

## 1. Requested scope

Separate product track for Lost & Legendary research, Natural Icons, deterministic restructuring of the existing 2,500 flavour inspirations, mobile-first discovery, and intent-only handoff to the current recipe flow. No staging deployment.

## 2. Completed work

- Audited the real 2,500-row XLSX and 80 existing images.
- Preserved/imported all rows into the existing flavour-catalogue architecture.
- Added deterministic 20-family clustering and concise direction selection.
- Added 29 curated candidates with feasibility, provenance, Mapper and seven-stage publication state.
- Replaced the `/recipes` placeholder with mobile-first discovery while preserving `/my-recipes`.
- Added direct `/start` intent handoff with no final grams.
- Added hard public gate and visible pink development states.

## 3. Files changed

See final `git diff --stat` and commit. Major areas: `src/data/recipes`, `src/pages/destinations/RecipesHubPage.tsx`, `src/features/customer-shell/CustomerShellV1.tsx`, `src/copy/en.ts`, importer/generated manifest, source/public recipe assets, tests and the six required documents.

## 4. Tests added or changed

- Catalogue import and full 2,500 metadata expectations.
- Clustering exact-once, max cards/directions, search and product-family guard.
- Curated publication gate, country guard, no forced geography, adaptation warning, canonical IDs and no grams.
- Inspiration-to-workbench parse/round-trip.
- Existing destination/non-production regression expectations retained.

## 5. Exact commands executed

- `npm ci`
- `npm run recipes:import`
- `npm run recipes:validate`
- `npx vitest run src/data/recipes src/features/customer-shell/startEntitlementChain.test.tsx src/features/customer-shell/startPersonaProjection.test.tsx src/features/customer-shell/hotfixRegressions.test.tsx`
- `npx vitest run src/data/recipes`
- `npx vitest run src/data/recipes src/pages/destinations/destinationPages.test.tsx src/features/design-review/nonProductionSurfaces.test.tsx src/app/routes.test.tsx`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- local browser QA at `http://127.0.0.1:4174/recipes` (390×844 mobile and default desktop viewport)

`npm test` and `npm run build` were repeated after moving the image audit to the public serving directory.

## 6. Test results

- Focused discovery/destination gate: **9 files / 97 tests passed**.
- Full suite: **399 files / 5,447 tests passed**.
- Typecheck: passed.
- Lint: passed with **0 errors** and two pre-existing Fast Refresh warnings in unchanged files.
- Catalogue validation: 2,500 rows, 80 mapped images, 2,420 missing images, 0 duplicate hashes.
- Production build: passed; Vite retained the existing large-chunk warning.
- Browser console: 0 errors and 0 warnings during discovery QA.
- Repository-wide `npm run format:check`: existing baseline failure across 775 files; new/changed discovery files were formatted selectively and the baseline was not mass-rewritten.

## 7. Previously accepted flows retested

Existing `/my-recipes` link, application routes, canonical Home/start regression suites, product-family guard, no-grams contract and non-production markers were retested. The full 5,447-test suite covers existing Pro/Home, Engine, formulation, Apply/Undo, canonical identity and Monitor regressions.

## 8. Deployment environment verified

No deployment was requested or performed. Work is isolated from staging and the ongoing Engine/Sorbet QA.

## 9. Remaining incomplete items

- No candidate is kitchen-tested, sensory-approved or published.
- 2,420 inspiration rows intentionally have no unique image; repetitive image generation was stopped.
- Four heritage candidates need stronger research; four were rejected.
- Four Natural Icons and multiple heritage candidates still need Mapper entries.
- Claude streams D–H were session-limited; their geographic research remains open.

## 10. Exact blockers / external actions

Owner/science team must approve Mapper ingredients, formulate, Engine-verify, kitchen-test and sensory-approve each future public card. Protected-name and lawful-sourcing checks are required before region-specific naming. Integration waits for the Engine QA checkpoint.

## 11. Git diff and commit status

Final implementation commit: appended after local commit. The only expected post-commit untracked file is the mandatory `.codex/run-review` marker. No push and no deploy are authorised in this task.
