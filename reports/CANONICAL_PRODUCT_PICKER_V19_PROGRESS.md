# Canonical Product Picker + Country Resolution v1.9 — active checklist

Updated: 2026-09-03 (Europe/Madrid)

## Isolation baseline

- [x] Reconciled `origin/staging`: `285f15ed2ecf8836ae8365622f11bb906a4707b5`.
- [x] Isolated work on `codex/canonical-product-picker-v19` in a clean dedicated worktree.
- [x] Kept production/main untouched.
- [x] Did not modify Scanner, Engine, solver, product profiles, recipe mutation stores, or `mapper_basement`.
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

## Waiting on active Cloud authority

- [ ] **WAITING_ON_CLOUD — country default/base resolution.** `claude/global-country-readiness` currently owns `src/services/globalCatalog.ts`, `src/features/global-catalog/catalogIngredient.ts`, catalog ingest functions, and the new `country_local_products`, `country_default_bases`, and `country_base_components` migrations. The picker must consume that authority after it lands; creating another table/service now would violate the brief.
- [ ] **WAITING_ON_CLOUD — user-specific exact-product override precedence.** Existing owned products can be discovered exactly, but the active country schema and service must first define the approved country default seam. If several owned SKUs map to one slot, no current preference authority chooses a winner; the picker does not invent one.
- [ ] **WAITING_ON_CLOUD — automatic first-country detection.** Current staging falls back from account country to browser-language region inside `src/services/globalCatalog.ts`; that is explicitly forbidden by v1.9 and is in the active country branch's file set. No verified coarse deployment-country signal or signed-out persistence authority exists on staging.
- [ ] **WAITING_ON_CLOUD — contextual Replace wiring for recipe rows.** The pure Dextrose/Tara/GELLATTI Stabilizer/Inulin/Milk route contract is implemented and tested. `IngredientBuilder.tsx` overlaps PR #136 and `ToppingRow.tsx` is modified in the user's other active checkout, so row-context plumbing is intentionally not overwritten.
- [ ] **WAITING_ON_CLOUD — full HOME/PRO country and owned-product parity scenarios.** Shared UI/search semantics are live in code; country/default/override semantics cannot be truthfully gated until the active country authority lands.

## External/served verification still required

- [ ] Merge/rebase after the active country-readiness branch lands and resolve against its canonical schema/service.
- [ ] Add country-resolution tests for Spain + Polish UI, Poland + Spanish UI, explicit-country persistence, no foreign fallback, per-user override isolation, and multiple-owned-SKU ambiguity.
- [ ] Verify a reliable country-level deployment signal; never substitute UI/browser language.
- [ ] Define or reuse guest/local preference persistence before claiming signed-out Product Country.
- [ ] Run the required served-staging scenarios after integration and staging deployment.
- [ ] Staging deployment is not performed from this side branch; production deployment is expressly out of scope.

## Locale truth

- [x] New picker copy uses the repository locale-resource resolver rather than component literals.
- [x] The repository currently ships one application UI locale: `pl`.
- [ ] Additional UI locale resources do not exist in staging. Search aliases are multilingual, but no unsupported UI locale is falsely claimed as shipped.

## Frozen checkpoint capability ledger

Checkpoint denominator: 48 capability gates. `DONE = 28 / 48 = 58.3%`.
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
| CP-28 | DONE                      | Mapper, Scanner, Engine, solver, profiles, and recipe mutation authority remain untouched | Final diff audit, protected-path gate, full 11,793-test suite                    |
| CP-29 | INTERNAL_SAFE_REMAINING   | Prove/define canonical technical ordering for Sugars and Stabilizers                      | No complete family-specific ordering contract yet                                |
| CP-30 | INTERNAL_SAFE_REMAINING   | Rendered interaction acceptance for Primary Product Country Account control               | Pure preservation test/build exist; UI existence alone is not counted            |
| CP-31 | WAITING_ON_GLOBAL_COUNTRY | Integrate the final canonical Global Country schema/service                               | Active country work owns the files and tables                                    |
| CP-32 | WAITING_ON_GLOBAL_COUNTRY | Resolve canonical slot through approved primary-country/default SKU                       | Requires CP-31                                                                   |
| CP-33 | WAITING_ON_GLOBAL_COUNTRY | Prove no foreign commercial fallback                                                      | Requires final resolver and country fixtures                                     |
| CP-34 | WAITING_ON_GLOBAL_COUNTRY | Reuse a canonical safe same-country fallback, if the authority defines one                | Must not invent ranking                                                          |
| CP-35 | WAITING_ON_GLOBAL_COUNTRY | Apply one explicit user-preferred SKU before the country default                          | Requires final country seam and preference model                                 |
| CP-36 | OWNER_DECISION_REQUIRED   | Choose deterministic authority when several user-owned SKUs share one slot                | No winner authority exists; first/cheapest/newest are forbidden                  |
| CP-37 | WAITING_ON_GLOBAL_COUNTRY | Reuse country-base product relationships                                                  | Canonical tables are still active Cloud work                                     |
| CP-38 | WAITING_ON_GLOBAL_COUNTRY | Show resolved exact SKU/brand behind the canonical primary title                          | Requires deterministic resolution, not a UI guess                                |
| CP-39 | WAITING_ON_GLOBAL_COUNTRY | Prove a reliable coarse first-country signal                                              | Deployment/network signal not yet verified                                       |
| CP-40 | WAITING_ON_GLOBAL_COUNTRY | Remove browser/UI-language country inference                                              | Owning service file is in the active country workstream                          |
| CP-41 | WAITING_ON_GLOBAL_COUNTRY | Prove explicit Product Country survives travel/VPN/location changes                       | Requires persisted canonical authority                                           |
| CP-42 | WAITING_ON_GLOBAL_COUNTRY | Define/reuse signed-out Product Country persistence                                       | No verified guest setting authority exists                                       |
| CP-43 | WAITING_ON_GLOBAL_COUNTRY | Deterministically merge guest country into signed-in profile                              | Requires CP-42 and final profile seam                                            |
| CP-44 | WAITING_ON_CLOUD_CONFLICT | Wire contextual Replace from current recipe rows                                          | `IngredientBuilder.tsx` overlaps PR #136; `ToppingRow.tsx` is active elsewhere   |
| CP-45 | WAITING_ON_GLOBAL_COUNTRY | Prove HOME/PRO country-resolution parity                                                  | Requires CP-31 through CP-43                                                     |
| CP-46 | WAITING_ON_GLOBAL_COUNTRY | Prove HOME/PRO user-override parity                                                       | Requires CP-35/CP-36                                                             |
| CP-47 | WAITING_ON_GLOBAL_COUNTRY | Complete automated country/override acceptance matrix                                     | Country fixtures/resolver not canonical yet                                      |
| CP-48 | INTERNAL_SAFE_REMAINING   | Run served-staging E2E scenarios after integration/deployment                             | Separate from automated/local verification and still pending                     |

Frozen remaining categories:

- `WAITING_ON_GLOBAL_COUNTRY`: CP-31–CP-35, CP-37–CP-43, CP-45–CP-47.
- `WAITING_ON_CLOUD_CONFLICT`: CP-44.
- `OWNER_DECISION_REQUIRED`: CP-36.
- `INTERNAL_SAFE_REMAINING`: CP-29, CP-30, CP-48.
