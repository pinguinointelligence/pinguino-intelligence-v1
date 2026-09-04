# Canonical Product Picker + Country Resolution v1.9 — completion ledger

Updated: 2026-09-04 (Europe/Madrid)

## Current state

- Workstream: **48 / 48 verified done = 100%**.
- Denominator unchanged: 48 capability gates.
- Status: **READY FOR OWNER QA**.
- Owner QA is separate, excluded from the denominator, and is not marked.
- Current canonical Git base observed: `origin/staging` at `d77005107c84c38df59379140d3364d1d1742f01` (PR #159).
- Working branch before the final report checkpoint: `codex/canonical-product-picker-v19` at `a2cbf9a4ac93f35013f1e204d7c9b1268228e5e7`; the final checkpoint commit is reported in chat.
- PR #159 changed only `src/styles/tokens.css` and `src/pages/pro/proResponsiveFrame.test.tsx`. It has no semantic overlap with Global Country, picker, CP-44 Replace, `IngredientBuilder`, `IngredientRow`, `ingredientTableUx`, `recipeStore`, or shared picker contracts. The refreshed CP-44 seam passes.
- Production/main and the production Supabase project were not touched.

## `9f0da18f` semantic reconciliation

- `9f0da18fe16491e11d412c746652b386002ce534` is not an ancestor of current staging and was not blindly merged.
- Its frozen Owner normalization was semantically ported onto the later base as `a2cbf9a4ac93f35013f1e204d7c9b1268228e5e7`.
- Both commits change the same nine files with the same behavior: raw `per_100ml` remains preserved; technical normalization is numerical 1:1; `ml/L` follows the frozen `g/L / 10` rule; no density subsystem exists.
- `git range-diff` shows only later-base formatting/context differences in `src/services/globalCatalog.ts`; no normalization rule was lost.

## Canonical authority and real data

`country_product_slot_assignments` is the only `country + canonical Mapper slot -> exact commercial product` authority. Version-bound `product_canonical_slot_reviews` proves product-to-slot eligibility; it is not a second country/default authority. CP-36 remains one deterministic `(user_id, mapper_ingredient_id) -> preferred_product_id` pointer.

Precedence: user preferred exact SKU -> approved primary-country default -> explicitly ranked safe same-country fallback -> existing generic Mapper fallback. Favorite, passive recency, price, brand, insertion/alphabetic order, and foreign products never select a winner.

| Country | Product | Exact identity | Catalog identity | Mapper slot | Engine-usable | Country authority |
| --- | --- | --- | --- | --- | --- | --- |
| ES | Hacendado Leche líquida entera | EAN `8402001047251` | `50c3d0e1-ca37-4891-a744-a3438d6b226a` / `PR-ING-007173` | `PI-ING-000236` | yes | active `PRIMARY_DEFAULT` |
| PL | Łaciate Mleko płynne 3,5% | EAN `5900820012434` | `8fc7869c-f779-43c6-b5e6-c25a845f7c0e` / `PR-ING-007172` | `PI-ING-000236` | yes | active `PRIMARY_DEFAULT` |
| FR | Alsace Lait Lait frais entier | EAN `3262970109108` | `db21c569-6427-4457-b1ae-6952a48f75ac` / `PR-ING-007174` | `PI-ING-000236` | yes | active `PRIMARY_DEFAULT` |

Acceptance-slot count: **ES 1 / PL 1 / FR 1 real Engine-usable exact SKU and 1 active primary assignment per country**. Products live in Product Catalog / Live Overlay, never Mapper. Manufacturer nutrition basis remains preserved.

Defaults are technically simple whole-milk fits backed by exact manufacturer/retailer evidence. Sources: `https://tienda.mercadona.es/product/10933/leche-entera-hacendado-botella`, `https://mercadona.tribbal.net/articulo/10933`, `https://mlekpol.com.pl/index.php/produkt/mleko-uht-laciate-35-2/`, `https://apothikiseven.com/en/products/laciate-%CE%B3%CE%AC%CE%BB%CE%B1-uht-3-5-1l-5900820012434`, `https://www.alsace-lait.com/nos-laits/fiche-produit/lait-frais-entier`, `https://www.auchan.fr/alsace-lait-lait-frais-entier/pr-C1752619`, `https://www.coursesu.com/p/lait-frais-pasteurise-entier-alsace-lait-brick-1l/4025793.html`.

## CP-32

**DONE.** Real exact products, immutable versions, product-owned behavior, version-bound slot reviews, real ES/PL/FR primary assignments, deterministic resolution, Engine usability, and fail-closed no-foreign behavior are live. Anonymous staging RPC resolves Hacendado for ES, Łaciate for PL, and Alsace Lait for FR.

## CP-48 served-staging matrix

Served identity: `https://staging.pinguinoai.com`, current staging `d77005107c84c38df59379140d3364d1d1742f01`, Vercel `pinguino-staging-e3rngvvdl-pinguinointelligence-7784s-projects.vercel.app` (Ready).

| Scenario | Status | Served evidence |
| --- | --- | --- |
| A. ES + Polish UI -> Spanish exact default | PASS | Polish UI, ES Product Country, `MILK 3.5%` displayed Hacendado. |
| B. PL + Spanish UI -> Polish exact default | PASS | Browser locale verified `es-ES`; explicit PL and query `leche` displayed Łaciate behind `MILK 3.5%`. |
| C. User preferred exact SKU wins | PASS | PRO settings showed primary ES; picker displayed Łaciate; live resolver returned `USER_PREFERRED`. |
| D. HOME exact-SKU parity | PASS | Same authenticated identity in HOME displayed Łaciate. |
| E. PRO exact-SKU parity | PASS | PRO picker displayed the same Łaciate exact product. |
| F. Brand discovery | PASS | Hacendado and Łaciate commercial identities were visible. |
| G. EAN discovery | PASS | `8402001047251` returned exactly Hacendado whole milk. |
| H. Contextual Replace | PASS | MILK row `Zamień produkt` kept dairy context and exposed replacement actions without mutation during inspection. |
| I. No foreign fallback | PASS | In ES, Polish EAN `5900820012434` returned 0; resolver also fails closed. |
| J. Guest country persistence | PASS | Signed-out explicit Product Country remained in the versioned device preference. |
| K. Reload persistence | PASS | Reload made 23 requests and 0 `/api/product-country` requests, so saved guest state prevented re-detection. |
| L. Guest -> account merge | PASS | Account UI showed `ES ↔ PL`; `Zachowaj kraj konta` cleared the conflict and preserved ES primary. |

Browser testing changed only isolated local test state: temporary guest Product Country PL and `es-ES` locale override. Account merge preserved the pre-existing ES account country.

## Verification

- Focused country/catalog/picker seam: **14 files / 164 tests passed**.
- Mapper + Scanner regression: **2 files / 93 tests passed**.
- Full regression: **953 files passed, 23 skipped; 11,989 tests passed, 122 skipped; exit 0**.
- `npm run verify:staging`: exit 0; guards passed; contracts **18/179**; typecheck passed; lint **0 errors / 7 baseline warnings**; build passed.
- Solver contracts: **1 file / 23 tests passed**.
- PR #159 CP-44 semantic seam: **8 files / 105 tests passed**.
- Live verifier passed guest ES/PL/FR defaults, HOME PL default, and PRO ES `USER_PREFERRED` Łaciate.
- Staging migrations paired locally/remotely: `20260904102817`, `20260904105754`, `20260904110935`.
- Staging `catalog-submit`: version **49**, `ACTIVE`, `verify_jwt=false`.
- Database lint retains unrelated legacy staging findings; new resolver/review functions have no reported lint issue.

## Active capability ledger

| # | Item | Status | Evidence / blocker |
| -- | ---- | ------ | ------------------ |
| 01 | Work isolated from active Cloud work | DONE | Dedicated branch/worktree; no production/main change. |
| 02 | PRO and HOME use the shared picker | DONE | Shared component and parity tests. |
| 03 | Non-Demo HOME/PRO use shared live catalog transport | DONE | Library/parity tests and served surfaces. |
| 04 | Canonical top-filter order | DONE | Domain/render tests. |
| 05 | Favorites default when present; All otherwise | DONE | Domain/render and served interaction. |
| 06 | Favorites search remains in Favorites | DONE | Rendered contract test. |
| 07 | Empty Favorite search exposes Search All | DONE | Interaction test. |
| 08 | Favorites do not reorder active-query results | DONE | Presentation/search tests. |
| 09 | Recency is empty-query-only | DONE | Presentation/search tests. |
| 10 | Taxonomy separates family, form, and role | DONE | Taxonomy tests. |
| 11 | Nut paste resolves under Nuts | DONE | Taxonomy tests. |
| 12 | Governed Sugar/Stabilizer/Inulin results | DONE | Taxonomy tests. |
| 13 | Contextual data-derived fruit-form filters | DONE | Domain/render tests. |
| 14 | Contextual data-derived technical filters | DONE | Domain tests. |
| 15 | Product taxonomy remains separate from recipe role | DONE | No role top filters; tests. |
| 16 | Multilingual Milk intent | DONE | Five-language tests and served `leche`. |
| 17 | Generic intent differs from brand/EAN/article intent | DONE | Projection tests and served EAN. |
| 18 | Technology-first Milk/Cream titles | DONE | Projection and served picker. |
| 19 | Numeric Milk percentage order | DONE | Projection tests. |
| 20 | Data-driven Cream percentage order | DONE | Projection tests. |
| 21 | Generic duplicates collapse to one Mapper slot | DONE | Projection tests. |
| 22 | No arbitrary commercial-only winner | DONE | Fail-closed regression and explicit authority. |
| 23 | Exact brand/EAN/article discovery remains | DONE | Tests and served Hacendado EAN. |
| 24 | Correct Add/Replace action | DONE | Rendered picker and served Replace. |
| 25 | Compact horizontally scrollable filter row | DONE | Responsive/source tests. |
| 26 | HOME/PRO discovery cannot diverge locally | DONE | Shared parity gate and served parity. |
| 27 | Locale-resource authority retained | DONE | Shipped-locale tests. |
| 28 | Mapper/Scanner/Engine/solver authority preserved | DONE | Guards, full regression, Scanner and solver suites. |
| 29 | Canonical technical ordering preserved | DONE | Server-order regression. |
| 30 | Primary Product Country account control | DONE | Served Account UI showed ES primary. |
| 31 | Integrate canonical Global Country schema/service | DONE | One non-competing authority on staging. |
| 32 | Resolve slot through approved primary-country SKU | DONE | Real ES/PL/FR data and live/served proof. |
| 33 | Prove no foreign commercial fallback | DONE | Served foreign EAN absence plus resolver guard. |
| 34 | Canonical safe same-country fallback | DONE | Explicit ranked fallback only; tests. |
| 35 | Preferred exact SKU before country default | DONE | PRO ES -> Łaciate `USER_PREFERRED`. |
| 36 | Deterministic user/slot preferred SKU authority | DONE | Unique validated pointer, RLS and tests. |
| 37 | Canonical country-base product relationship | DONE | Assignment plus version-bound slot review. |
| 38 | Exact SKU behind canonical title | DONE | Served canonical title with commercial secondary identity. |
| 39 | Reliable coarse first-country signal | DONE | Vercel endpoint and tests. |
| 40 | Remove browser/UI-language inference | DONE | Locale matrix and served `es-ES`/PL. |
| 41 | Explicit country survives travel/VPN/locale | DONE | Account-first tests and served locale override. |
| 42 | Signed-out Product Country persistence | DONE | Current served reload made no new detection request. |
| 43 | Guest-to-account country merge | DONE | Served ES↔PL conflict and keep-account resolution. |
| 44 | Contextual Replace | DONE | Current-base seam and served MILK flow. |
| 45 | HOME/PRO country-resolution parity | DONE | Shared resolver and served parity. |
| 46 | HOME/PRO user-override parity | DONE | Both showed Łaciate for the same identity. |
| 47 | Automated country/override matrix | DONE | Locale, guest/account, override/fallback, foreign tests. |
| 48 | Served-staging E2E | DONE | Scenarios A-L passed on current staging. |

## Frozen categories

- `DONE`: CP-01–CP-48.
- `IN PROGRESS`: none.
- `WAITING_ON_GLOBAL_COUNTRY`: none.
- `WAITING_ON_CLOUD_CONFLICT`: none.
- `OWNER_DECISION_REQUIRED`: none.
- `INTERNAL_SAFE_REMAINING`: none.
- `SERVED STAGING E2E`: DONE (CP-48).
- `OWNER QA`: not started and not marked.

## Completion ledger

1. Requested scope: finish CP-32/CP-48 with real country data, Engine-usable SKUs, current served staging, and no competing authority.
2. Completed work: ES/PL/FR research/data, readiness fixes, slot review, primary assignments, CP-36 preference, normalization, live resolver and served A-L.
3. Files changed: three migrations; seed/verifier scripts; migration/catalog/normalization tests; mapper donor regression; `catalog-submit`; this report.
4. Tests added/changed: migration/static-seed/readiness tests and dairy donor regression; existing country/picker/Scanner/solver suites retained.
5. Exact commands: focused `npm test -- --run ...`, `npm test -- --maxWorkers=1`, `npm run typecheck`, `npm run verify:staging`, `npm run solver:contracts`, live verifier, Supabase inspection/deploy, browser served checks.
6. Test results: all requested local gates and live resolver checks passed; exact counts above.
7. Accepted flows retested: discovery, CP-44 Replace, HOME/PRO parity, persistence/merge, Mapper, Scanner, Engine and solver.
8. Deployment verified: Vercel staging Ready; Supabase staging migrations live; `catalog-submit` v49 Active. Production untouched.
9. Remaining incomplete: Owner QA only; excluded from the 48-item denominator and not marked.
10. Blockers/external actions: none before Owner QA.
11. Git status: final normal commit and pushed dedicated branch are reported in chat; this checkpoint does not merge to staging/main.
