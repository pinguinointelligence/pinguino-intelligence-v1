# PINGÜINO Pro — Base/Topping final Owner implementation ledger

Date: 2026-08-12  
Scope: staging only  
Implementation commit: `4fe5ac6`  
Initial ledger commit: `5d5ccbb03b1fbf76667f529879634dfaf9d11b37`

## 1. Requested scope

Complete the final Pro Owner contract over the newest legitimate staging state: separate Base and post-process Topping composition, scoped canonical uniqueness and ordering, final-product nutrition/cost/label authority, two-stage Production, persistent account recipe defaults, six-row regulator presentation, Main/Multi-Main flavour maximisation, practical whole-gram Preview/Apply/Undo and the existing trust/safety contracts. Home, customer production, Base Engine science and `mapper_basement` were excluded.

## 2. Completed work

- Added a product-layer `pinguino_composition_v1` document. Engine `RecipeInput.items` remains Base-only; Toppings never enter POD/PAC/NPAC, Base score, Direction, formulation or Batch Rescue.
- Added distinct `BAZA LODOWA` and `TOPPINGI PO PRODUKCJI` editor sections with one shared premium product picker, scoped duplicate handling, mouse/keyboard/touch interaction and accessible ordering controls.
- Preserved independent Base/Topping order outside Engine input and carried that order through save, reload, version restore, Preview, Apply, Undo and Production.
- Added final-product totals and nutrition/cost/allergen/label composition from Base plus Toppings, with actual Production values becoming authoritative after completion.
- Added Base-first then Topping Production stages. Topping deviations update final output only and never trigger Base Rescue.
- Added account-owned per-product defaults and a real `+ Nowa receptura` path that detaches the prior saved aggregate without mutating old recipes.
- Completed the six-regulator Profile family and preserved Monitor as read-only Base analysis.
- Completed deterministic Main/Multi-Main flavour maximisation, whole-gram frontier proof and trustless Apply re-derivation.
- Closed the Protein high-target monotonicity defect: raising an unreachable target from 25% to 30% no longer returns less actual protein than the lower target's verified frontier.
- Preserved stabilizer identity/dose controls, exact locks, percentage locks, ranges, Required, unavailable/excluded ingredients, substitutions, OPTIMAL/ECO, Vegan, Protein, Preview/Apply/Undo and production physical authority.

## 3. Files changed

Implementation commit `4fe5ac6` changes 89 files (6,261 insertions, 865 deletions). Principal areas:

- `src/features/recipe-composition/` — composition document, final product model, persistence/migration/UI tests;
- `src/features/ingredient-builder/` — scoped picker, Base/Topping rows and ordering;
- `src/features/constraint-studio/` — Main objective, practical/trustless Preview and Apply integration;
- `src/features/protein-gelato/` — monotonic best-achievable frontier and regressions;
- `src/features/pro-workbench/` — regulators, defaults, Monitor/Summary integration;
- `src/features/production-workspace/` and `src/features/master-label/` — two-stage actual authority and final product label;
- recipe/version/production Supabase services and `src/stores/recipeStore.ts`;
- `supabase/migrations/0042_recipe_composition_toppings_and_defaults.sql`;
- focused tests across accepted Pro flows.

No changed files exist under `src/engine`, `src/data/mapper_basement`, Home feature/page code or production deployment configuration.

## 4. Migration and data-model changes

Migration `0042_recipe_composition_toppings_and_defaults.sql`:

- adds validated nullable `product_composition` JSONB to saved recipes and immutable versions;
- adds owner-scoped `user_recipe_defaults` with RLS, grants and `updated_at` trigger;
- adds explicit process scope, canonical identity and scope position to frozen production-plan lines;
- adds per-run/per-scope canonical uniqueness;
- replaces the old first-save RPC overload with an atomic product-composition-aware overload while retaining `SECURITY INVOKER` and RLS.

Staging application proof:

- linked staging project: `tunabqqrwabacxjcxxkz`;
- committed migration SHA-256: `5DB86AFD0DF9F9F6863341EDDF50D7308DE30245F61803670261A309D1B18114`;
- applied remote version: `20260812034500`;
- post-apply dry-run: `Remote database is up to date`;
- migration list shows local/remote `20260812034500` matched.

## 5. Tests added or changed

Coverage includes Base/Topping pickers and scoped duplicates; Base plus same-canonical Topping; totals and final nutrition/cost/label; two independent orders; migration ambiguity/fail-closed hydration; Production Topping stage and actual deviations; account defaults/new-recipe behavior; regulator/profile confirmation; Main maxima, Multi-Main ratios and forged proofs; Protein target/frontier; stabilizer, locks, substitution, Apply/Undo and accepted flow regression.

## 6. Exact commands and results

- `npm test` — **458 files / 5,962 tests passed** in 434.15 s.
- `npm test -- --run src/features/protein-gelato/proteinGelatoEngine.test.ts src/features/protein-gelato/proteinCalibration.report.test.ts --reporter=verbose` — **2 files / 60 tests passed**.
- focused shared contract wave (15 named Direction/formulation/stabilizer/Apply/Main/Vegan/composition/Production/Label files) — **15 files / 191 tests passed**.
- `npm run typecheck` — passed.
- `npm run lint -- --quiet` — passed, zero errors.
- `npm run build` — passed; bundle `index-Br3V7klc.js`, CSS `index-CRSEFiRP.css`; existing large-chunk advisory only.
- `npm run recipes:validate` — 2,500/2,500 imported, manifest exact.
- `npm run process:validate` — 2,088 rows, 2,088 unique IDs, exact Mapper alignment, zero differences.
- `npm audit --audit-level=high` — zero vulnerabilities.
- `git diff --check` — passed.

## 7. Previously accepted flows retested

Stabilizer/Tara freeze and safety clamp; Direction Sweetness/Softness; exact/percent/range locks; Main/Multi-Main identity and ratios; canonical deduplication; substitution authorization; OPTIMAL/ECO; Vegan; Protein; practical whole grams; Preview/Apply/Undo; save/reload/version; production actual immutability, Batch Rescue and Master Label blockers; Process and recipe catalogue validation.

## 8. Independent reviews

- Domain/product: final rereview **DEPLOY**, P0/P1/P2 none. Independent 25→30 proof: −11 20.9586→20.9330, −12 21.0190→21.0190, −13 21.0394→21.0394; hard-safe diagnostic candidates and blocked Apply where target is unreached. Mandatory Main boundaries unchanged: 677/678, 49/50, 140/141, 670/672 and 687/690.
- Interaction/design: **DEPLOY**, P0/P1/P2 none; five-second product hierarchy and responsive surfaces accepted.
- Data/security: **DEPLOY** after scoped identity, persistence, Production order and trust-boundary fixes; RLS/migration contract reviewed.
- Accessibility: **DEPLOY**, P0/P1/P2 none after picker focus, mobile geometry, handle-only drag, regulator semantics, Account controls, Production tabs and owner-mode gating fixes.

## 9. Fixes made after review

Closed stale picker selection, picker focus trap/Escape/portal geometry, full-row drag conflict, accessible reorder/status semantics, customer owner-review leakage, Production order and line-ID collisions, same-product label aggregation, new-recipe defaults, Summary actual authority, Main whole-gram maximality proof, trustless suggested-fix constraints, Vegan envelope, Protein performance and high-target monotonicity. No Base Engine formula or dataset changed.

## 10. Deployment environment verified

- `origin/staging` accepted `5d5ccbb03b1fbf76667f529879634dfaf9d11b37`.
- GitHub/Vercel status for that exact SHA is `success` / `Deployment has completed`.
- Vercel deployment `Production – pinguino-staging` is explicitly reported as `production_environment=false` by GitHub's deployment API.
- The other connected Vercel project received only `Preview – pinguino-intelligence`, also `production_environment=false`; customer production was not deployed.
- `https://staging.pinguinoai.com/` returns HTTP 200 and serves `assets/index-D8rqVz_H.js`.
- Served bundle SHA-256: `34A3BCBF2946A15E2F4EEB23F253929832587C61CCABA36064A26F87E5E5034A`; size 2,847,978 bytes.
- Bundle-content verification finds the final implementation contracts, including `Dodaj topping`, `POST_PROCESS_ADDON`, `Baza lodowa`, `Toppingi po produkcji`, `Produkt finalny`, `Dopasowanie techniczne receptury`, `Priorytet smaku.`, `Priorytet kosztu.`, `Domyślne ustawienia receptury` and `Zmiany niepotwierdzone`.
- Supabase staging migration is applied and current as documented in section 4.

## 11. Remaining incomplete items / blockers

There are no known code, test, database, deployment or independent-review P0/P1/P2 blockers. One external operational gate remains:

- the only connected browser session is not authenticated/entitled for Pro staging;
- direct served navigation to `/pro/recipe` shows the Pro entitlement gate, and its CTA routes to `/subscription`;
- exact served evidence is saved at `reports/qa/final-pro-topping-system/served-pro-auth-gate-1440x900.png`;
- therefore the mandatory served Owner interactions and screenshot package (Base/Topping pickers, same Milk in both scopes, 1000+130=1130, ordering, Main, regulators, Account defaults, pending Profile, Monitor/Topping summary, Production stages, Summary and Master Label) cannot be honestly claimed yet.

No authentication bypass, account creation, password entry or production access was attempted. Final status must remain `NOT READY — EXACT DEFECTS REMAIN` until an authenticated Pro staging browser session is available and the complete served QA passes.

## 12. Git diff and commit status

- base/newest `origin/staging`: `dd87e3a34ae9f0b740648ae0450896942f9a5b2f`;
- implementation commit: `4fe5ac6`;
- initial staging/ledger commit: `5d5ccbb03b1fbf76667f529879634dfaf9d11b37`;
- branch: `codex/final-pro-topping-system`;
- no merge/rebase conflicts; staging had not advanced beyond the branch base;
- the ledger itself is committed separately before the staging push.

## 13. Production unchanged

No production deployment, production domain, production credential, billing configuration, Base Engine science or Mapper dataset was changed.
