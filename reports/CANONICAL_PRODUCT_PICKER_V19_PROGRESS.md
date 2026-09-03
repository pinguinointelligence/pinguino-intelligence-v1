# Canonical Product Picker + Country Resolution v1.9 — active checklist

Updated: 2026-09-03 (Europe/Madrid)

## Isolation baseline

- [x] Reconciled current `origin/staging`: `79423cd6f3391639bc09375971324dbacb54c5da` (including canonical #136 at `4a8822cf0540e0579496fd4e6aa036bf4143c8ce` and #146 Settings disclosure / recipe overflow work).
- [x] Isolated work on `codex/canonical-product-picker-v19` in a clean dedicated worktree.
- [x] Kept production/main untouched.
- [x] Did not modify Scanner, Engine, solver, product profiles, or `mapper_basement`; the recipe store gained only the explicit, tested atomic CP-44 replacement mutation.
- [x] Rechecked open PRs and the active `claude/global-country-readiness` worktree before country work.

## Safe implementation

- [x] One shared HOME + PRO picker presentation and domain path.
- [x] HOME uses the live catalog transport when not in Demo; Demo stays local.
- [x] Canonical top row: Favorites, All, Fruits, Dairy, Nuts, Chocolate, Technical.
- [x] Removed Fresh, Dry, Pastes, and recipe-role concepts from the permanent top row.
- [x] Favorites opens by default when favorites exist; All opens otherwise.
- [x] Favorites search remains scoped to favorites and exposes an explicit Search All action on no match.
- [x] Favorite state no longer creates a query-time presentation section or client rank boost.
- [x] Forward-only search migration removes favorite/recency ordering while a query is active.
- [x] Empty-query recency remains available.
- [x] Contextual Fruit form filters are derived only from forms present in the current result authority.
- [x] Technical contextual filters: Sugars, Stabilizers, Inulin.
- [x] Nut paste remains under Nuts; GELLATTI Stabilizer remains under Stabilizers when present.
- [x] Generic family detection is separate from exact brand/EAN/article intent.
- [x] Milk aliases cover Polish, English, German, Spanish, Italian, and French search terms.
- [x] Generic Milk/Cream results use canonical technology-first titles and numeric percentage ordering.
- [x] Equivalent commercial hits collapse into one Mapper-backed technological slot for generic queries.
- [x] New percentage variants are data-driven from approved product metadata/name, not enumerated in UI code.
- [x] Exact brand/EAN/article queries preserve exact commercial result identity.
- [x] Picker result action is invocation-specific: `+` for Add, `Zamień` for Replace.
- [x] Account Settings now exposes the existing `primary_market` authority as Primary Product Country while preserving additional enabled countries.
- [x] Added a HOME↔PRO shared-component/live-transport parity gate.
- [x] Proved that Sugar and Stabilizer projections preserve canonical server relevance order; favorites and recency do not create a second client ranking authority.
- [x] Added rendered Account Settings acceptance for changing Primary Product Country while retaining all other enabled countries.
- [x] Added the owner-approved per-user/Mapper-slot exact-product preference authority with one-pointer enforcement, explicit set/get/clear RPCs, RLS, and current-binding validation.
- [x] Existing recipe-row Replace opens the shared picker in contextual REPLACE mode and atomically replaces the selected row without creating a duplicate.

## Continuation checkpoint and audits

- Initial checkpoint commit: `7fbf846b3b92dc4abfcead4343522fe9c1de923b`, pushed only to `origin/codex/canonical-product-picker-v19`.
- Refreshed semantically through canonical #136 and current staging #138. #136's `editRefusal`/ProductBehavior row metadata is retained and extended with `replaceContext`; #138's practical-save verification method and CP-44's replacement method coexist in `recipeStore.ts`.
- The source product model still permits any number of distinct owned products to share one Mapper slot. The new `user_preferred_product_slots` table adds the owner-approved, unique `(user_id, mapper_ingredient_id) -> preferred_product_id` pointer without changing product or country authority.
- Preference changes occur only through an explicit authenticated setter. `favorite`, `recently_used_at`, and generic recency remain informational and never participate.
- The active getter returns `NULL` if the stored product is deleted, inactive, merged, blocked, inaccessible, no longer on its current version/binding, or no longer bound to the requested Mapper slot. It never selects another user product.
- The Vercel and Netlify configurations expose no application-consumed coarse-country signal. The current client service has an account-country then browser-locale fallback, but no signed-out Product Country persistence or guest-to-account merge contract.
- Because `src/services/globalCatalog.ts` is owned by the active Global Country workstream, the forbidden browser-language fallback was audited but not modified here.

## Continuation verification

- Focused acceptance: `npm test -- --run src/features/ingredient-builder/canonicalProductDiscovery.test.ts src/features/global-catalog/AccountProductMarkets.test.ts src/features/global-catalog/AccountProductMarkets.render.test.tsx` — 3 files / 18 tests passed.
- Full regression: `npm test` — 933 files / 11,802 tests passed; 23 files / 122 tests skipped.
- Local staging gate: `npm run verify:staging` — owner-locked guard passed, protected-path guard passed, 18 contract files / 179 tests passed, typecheck passed, lint passed with 0 errors / 7 existing warnings, and production-style build passed.
- Served-staging E2E was not run and is not implied by the local staging gate.
- CP-36 focused migration contracts: 5 files / 56 tests passed. A 16-assertion pgTAP suite was added; local execution is unavailable because this checkout has no running Supabase/Postgres container and Docker/Podman is not installed.
- CP-44 + current-staging seam verification: 13 files / 174 tests passed after merging current staging, including contextual picker routing, atomic replacement, #136 refusal/edit behavior, and #138 save-gate tests.
- Final full regression on current staging integration: `npm test` — 939 files / 11,864 tests passed; 23 files / 122 tests skipped. An earlier saturated-host run timed out one 60-second constraint test after 81 seconds; its exact isolated rerun passed 46/46 in 47.4 seconds, and the final idle-host full run passed it in the complete corpus.
- The final no-overlap staging advance from `7cb84701` to `b51107a5` changed only production-workspace/language-map files; its tests plus the CP-44 seam suite passed 11 files / 109 tests after the merge.
- Base refresh from `b51107a5` to `79423cd6` had one same-file presentation overlap in `IngredientBuilder.tsx`: staging moved the stabilizer-limit disclosure to the shared `GellattiNotice`; CP-44 replacement hunks were untouched. The accepted CP-44 seam suite plus that notice-shell regression passed 9 files / 65 tests after the merge.
- Final local staging gate: `npm run verify:staging` — owner-locked guard passed, protected-path semantic changes acknowledged, 18 contract files / 179 tests passed, typecheck passed, lint passed with 0 errors / 7 existing warnings, and production-style build passed.

## Waiting on active Cloud authority

- [ ] **WAITING_ON_CLOUD — country default/base resolution.** `claude/global-country-readiness` currently owns `src/services/globalCatalog.ts`, `src/features/global-catalog/catalogIngredient.ts`, catalog ingest functions, and the new `country_local_products`, `country_default_bases`, and `country_base_components` migrations. The picker must consume that authority after it lands; creating another table/service now would violate the brief.
- [ ] **WAITING_ON_CLOUD — user-specific exact-product resolver precedence.** The isolated preference authority now deterministically selects one user/slot SKU. Inserting it before the approved country default still waits for the final Global Country resolver seam.
- [ ] **BLOCKED / ARCHITECTURE GAP — automatic first-country detection.** Current staging falls back from account country to browser-language region inside `src/services/globalCatalog.ts`; that is explicitly forbidden by v1.9 and is in the active country branch's file set. No verified coarse deployment-country signal exists in the Vercel/Netlify SPA configuration or application code.
- [ ] **WAITING_ON_CLOUD — full HOME/PRO country and owned-product parity scenarios.** Shared UI/search semantics are live in code; country/default/override semantics cannot be truthfully gated until the active country authority lands.

## External/served verification still required

- [ ] Merge/rebase after the active country-readiness branch lands and resolve against its canonical schema/service.
- [ ] Add country-resolution tests for Spain + Polish UI, Poland + Spanish UI, explicit-country persistence, no foreign fallback, per-user override isolation, and multiple-owned-SKU ambiguity.
- [ ] Verify a reliable country-level deployment signal; never substitute UI/browser language.
- [ ] **BLOCKED / ARCHITECTURE GAP:** define or reuse guest/local preference persistence before claiming signed-out Product Country; signed-out reads currently return defaults and saves require authentication.
- [ ] **BLOCKED / ARCHITECTURE GAP:** define the deterministic guest-to-account merge contract after a guest store exists.
- [ ] Run the required served-staging scenarios after integration and staging deployment.
- [ ] Staging deployment is not performed from this side branch; production deployment is expressly out of scope.

## Locale truth

- [x] New picker copy uses the repository locale-resource resolver rather than component literals.
- [x] The repository currently ships one application UI locale: `pl`.
- [ ] Additional UI locale resources do not exist in staging. Search aliases are multilingual, but no unsupported UI locale is falsely claimed as shipped.

## Current capability ledger

Denominator unchanged: 48 capability gates. `DONE = 32 / 48 = 66.7%`.
Owner QA is excluded from the denominator and is not marked.

| ID    | Status                    | Capability                                                                                | Acceptance evidence                                                              |
| ----- | ------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| CP-01 | DONE                      | Work isolated from active Cloud work                                                      | Dedicated worktree/branch at canonical staging SHA; final conflict refresh clean |
| CP-02 | DONE                      | PRO and HOME use the shared picker component                                              | `productDiscoveryParity.test.ts`                                                 |
| CP-03 | DONE                      | Non-Demo HOME and PRO use the shared live catalog transport                               | `ingredientLibrary.test.ts`, `productDiscoveryParity.test.ts`                    |
| CP-04 | DONE                      | Canonical top-filter order                                                                | Domain and rendered picker tests                                                 |
| CP-05 | DONE                      | Favorites default when favorites exist; All otherwise                                     | Domain and rendered picker tests                                                 |
| CP-06 | DONE                      | Favorites search stays inside Favorites                                                   | Rendered picker test with favorite-only query contract                           |
| CP-07 | DONE                      | Empty Favorite search exposes explicit Search All                                         | Rendered picker interaction test                                                 |
| CP-08 | DONE                      | Favorites do not reorder active-query results                                             | Presentation tests and forward-only search migration test                        |
| CP-09 | DONE                      | Recency is empty-query-only and cannot distort active-query order                         | Presentation tests and search migration test                                     |
| CP-10 | DONE                      | Top taxonomy does not mix family, form, or recipe role                                    | Canonical filter-order/domain tests                                              |
| CP-11 | DONE                      | Nut paste resolves under Nuts                                                             | Canonical taxonomy tests, including category/form fallback                       |
| CP-12 | DONE                      | Technical contains governed Sugar, Stabilizer, and Inulin results                         | Canonical taxonomy tests                                                         |
| CP-13 | DONE                      | Fruit form subfilters are contextual and data-derived                                     | Domain and rendered picker tests                                                 |
| CP-14 | DONE                      | Technical subfilters are contextual and data-derived                                      | Domain tests including GELLATTI Stabilizer                                       |
| CP-15 | DONE                      | Product taxonomy remains separate from recipe role                                        | No Topping/Base top filters; domain tests                                        |
| CP-16 | DONE                      | Requested multilingual Milk terms resolve to one canonical intent                         | `ingredientSearch.test.ts` covers Polish, English, German, Spanish, Italian      |
| CP-17 | DONE                      | Generic technological intent is distinct from brand/EAN/article intent                    | Canonical projection tests                                                       |
| CP-18 | DONE                      | Generic Milk/Cream use technology-first primary titles                                    | Canonical projection tests                                                       |
| CP-19 | DONE                      | Milk percentage order is numeric ascending                                                | Canonical projection tests                                                       |
| CP-20 | DONE                      | Cream percentage order and new percentage values are data-driven                          | Canonical projection tests include 3.7%                                          |
| CP-21 | DONE                      | Generic duplicate commercial hits collapse through a canonical Mapper slot                | Canonical projection tests                                                       |
| CP-22 | DONE                      | Ambiguous commercial-only slots do not invent a first-row winner                          | Explicit fail-closed regression test                                             |
| CP-23 | DONE                      | Exact brand, EAN, and article discovery remains available                                 | Exact-intent projection tests and existing catalog search suite                  |
| CP-24 | DONE                      | Add and Replace invocations expose one appropriate result action                          | Rendered picker test; existing Topping Replace callback retained                 |
| CP-25 | DONE                      | Permanent filter row is compact and horizontally scrollable                               | Rendered/source contracts, responsive implementation, build                      |
| CP-26 | DONE                      | HOME/PRO category and search implementation cannot diverge locally                        | Shared-component/live-transport parity gate                                      |
| CP-27 | DONE                      | New visible picker concepts use current locale-resource authority                         | `productDiscovery.test.ts`; every shipped locale covered                         |
| CP-28 | DONE                      | Mapper, Scanner, Engine, solver, profiles, and recipe mutation authority remain untouched | Final diff audit, protected-path gate, full 11,802-test suite                    |
| CP-29 | DONE                      | Prove/define canonical technical ordering for Sugars and Stabilizers                      | Regression proves the client preserves server relevance order despite favorite/recency state |
| CP-30 | DONE                      | Rendered interaction acceptance for Primary Product Country Account control               | jsdom interaction selects ES, retains PL/DE, and saves the exact preference       |
| CP-31 | WAITING                   | Integrate the final canonical Global Country schema/service                               | `WAITING_ON_GLOBAL_COUNTRY`; active country work owns the files and tables        |
| CP-32 | WAITING                   | Resolve canonical slot through approved primary-country/default SKU                       | `WAITING_ON_GLOBAL_COUNTRY`; requires CP-31                                      |
| CP-33 | WAITING                   | Prove no foreign commercial fallback                                                      | `WAITING_ON_GLOBAL_COUNTRY`; requires final resolver and country fixtures         |
| CP-34 | WAITING                   | Reuse a canonical safe same-country fallback, if the authority defines one                | `WAITING_ON_GLOBAL_COUNTRY`; must not invent ranking                             |
| CP-35 | WAITING                   | Apply one explicit user-preferred SKU before the country default                          | `WAITING_ON_GLOBAL_COUNTRY`; pointer exists, resolver precedence seam does not   |
| CP-36 | DONE                      | Choose deterministic authority when several user-owned SKUs share one slot                | Owner-approved unique user/Mapper-slot pointer, guarded RPCs, RLS, and isolated tests |
| CP-37 | WAITING                   | Reuse country-base product relationships                                                  | `WAITING_ON_GLOBAL_COUNTRY`; canonical tables are active Cloud work               |
| CP-38 | WAITING                   | Show resolved exact SKU/brand behind the canonical primary title                          | `WAITING_ON_GLOBAL_COUNTRY`; requires deterministic resolution                   |
| CP-39 | BLOCKED                   | Prove a reliable coarse first-country signal                                              | Architecture gap: no geo header/edge signal is consumed by the current SPA       |
| CP-40 | WAITING                   | Remove browser/UI-language country inference                                              | `WAITING_ON_GLOBAL_COUNTRY`; owning service file is active Cloud work             |
| CP-41 | WAITING                   | Prove explicit Product Country survives travel/VPN/location changes                       | `WAITING_ON_GLOBAL_COUNTRY`; requires persisted canonical authority               |
| CP-42 | BLOCKED                   | Define/reuse signed-out Product Country persistence                                       | Architecture gap: signed-out read returns defaults; save requires auth; no guest store |
| CP-43 | BLOCKED                   | Deterministically merge guest country into signed-in profile                              | Architecture gap: no guest source or merge contract exists                       |
| CP-44 | DONE                      | Wire contextual Replace from current recipe rows                                          | Shared picker opens in REPLACE mode with canonical context; 13-file seam suite, atomic-store tests, and final full regression pass |
| CP-45 | WAITING                   | Prove HOME/PRO country-resolution parity                                                  | `WAITING_ON_GLOBAL_COUNTRY`; requires CP-31 through CP-43                         |
| CP-46 | WAITING                   | Prove HOME/PRO user-override parity                                                       | `WAITING_ON_GLOBAL_COUNTRY`; preference infrastructure exists, resolver parity does not |
| CP-47 | WAITING                   | Complete automated country/override acceptance matrix                                     | `WAITING_ON_GLOBAL_COUNTRY`; resolver/fixtures not canonical                     |
| CP-48 | WAITING                   | Run served-staging E2E scenarios after integration/deployment                             | Separate from automated/local verification and still pending                     |

Frozen remaining categories:

- `DONE`: CP-01–CP-30, CP-36, and CP-44.
- `WAITING_ON_GLOBAL_COUNTRY`: CP-31–CP-35, CP-37–CP-38, CP-40–CP-41, CP-45–CP-47; CP-39 and CP-42–CP-43 are confirmed architecture gaps the canonical authority must address.
- `WAITING_ON_CLOUD_CONFLICT`: none.
- `OWNER_DECISION_REQUIRED`: none.
- `INTERNAL_SAFE_REMAINING`: none.
- `SERVED_STAGING_PENDING`: CP-48.
