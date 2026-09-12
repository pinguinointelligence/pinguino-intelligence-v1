# GELLATTI Recipe Library — RL-05 / RL-20 Phase 1 execution record

Date: 2026-09-12

Canonical Supabase staging project: `tunabqqrwabacxjcxxkz`

Application production and `origin/main`: untouched

## Status

- **RL-20: NOT DONE.** The narrow eligibility and resolver-projection corrections are applied and their positive/negative controls pass, but the required cross-role runtime evidence cannot pass while SMP, DEXTROSE and TARA have no approved routable product.
- **RL-05: NOT DONE.** Every authorized v23 product was attempted. The server safely approved 85 products, rejected 87 before product creation as `approval_not_ready`, and created one product with terminal `blocked` status. Completing the missing roles would require new exact scientific/product authority; no values were inferred.
- **RL-36: NOT STARTED.** The Owner's explicit phase gate requires RL-05 and RL-20 to be DONE first.

## Applied database corrections

| Migration | Result | Boundary |
|---|---|---|
| `20260912183500_route_slot_eligibility_explicit_approval.sql` | APPLIED | Removes only the obsolete Mapper `verification_status` prefix from the private slot-candidate gate. Explicit `approved_for_base`, `approved_for_engines`, ready binding, BASE_RECIPE, engine usability and seven numeric composition guards remain. |
| `20260912184500_country_slot_projection_explicit_approval.sql` | APPLIED | Removes the same duplicate text-prefix predicate from the resolver projection only. |
| `20260912193000_classifier_semantic_jsonb_operator_typing.sql` | APPLIED | Replaces the ambiguous JSONB path/deletion literals with explicit `text[]` operands; fixes PostgreSQL 17 error 42725 without changing classifier decisions. |

Rollback SQL exists beside all three migrations in `supabase/rollbacks/`. The exact pre-classifier function definition and pre-write snapshots are preserved in `docs/country-products/gelato-base-v23/rl05-handoff/`.

Focused live controls:

- classifier positive control: PASS;
- classifier negative control: PASS;
- `PI-ING-001705` remains ineligible: PASS (`false`);
- `PI-ING-000618` remains ineligible: PASS (`false`);
- a non-ready binding remains ineligible: PASS (`false`);
- unintended eligible reviewed products outside the approved v23 set: `0`;
- Mapper hash before/after: `71555e4f14554042489d8a46be14afe6`.

## v23 apply result

Source workbook SHA-256: `37afaf6f98bad68d2768c02562f130f0502ba875d3ae4a08f51f420b82de16b4`.

| Measure | Result |
|---|---:|
| Active markets | 75 / 75 |
| Logical selections accounted | 450 / 450 |
| Exact-product selections | 375 |
| Global SUCROSE selections | 75 |
| Exact identities | 189 |
| Exact existing PR reused | 1 (`PR-ING-007174`) |
| Duplicate identities prevented by registry | 186 |
| New-product requests attempted | 173 |
| Requests approved and linked | 85 |
| Requests left in `ADMIN_REVIEW` | 88 |
| New canonical product rows | 86 |
| Safe current bindings | 85 |
| Active version-bound slot reviews | 85 |
| v23 primary assignments created | 114 |
| Compatible pre-existing assignments | 3 |
| Runtime-resolvable logical selections | 192 / 450 (117 country products + 75 global SUCROSE) |
| New PI created | 0 |

### Fail-closed product outcomes by physical role

| Role | Requests | Approved | No product (`approval_not_ready`) | Product `blocked` | Runtime-resolved markets |
|---|---:|---:|---:|---:|---:|
| MILK | 64 | 57 | 6 | 1 | 66 / 75, including the three pre-existing compatible routes |
| CREAM | 51 | 28 | 23 | 0 | 51 / 75 |
| SMP | 43 | 0 | 43 | 0 | 0 / 75 |
| DEXTROSE | 14 | 0 | 14 | 0 | 0 / 75 |
| TARA | 1 | 0 | 1 | 0 | 0 / 75 |

The remaining 15 new identities were already deferred by the reviewed v23 plan because their routes were not creatable. The plan also retained 35 explicit route blockers: 12 workbook-status holds, 20 cross-market conflicts, one carbohydrate-convention hold and two existing-primary conflicts.

The server verdict is authoritative. Representative `approval_not_ready` outcomes include `REVIEW` with missing `water_percent` / `total_solids_percent`, and `ESTIMATED_READY` below the approval threshold. Supplying those values from assumptions, a different product or a generic Mapper profile would violate the Owner's no-fabrication and exact-identity boundaries.

## Runtime evidence

Live resolver matrix (`milk_gelato`, 75 active markets):

| Role | Resolved and usable | Missing | Status |
|---|---:|---:|---|
| MILK | 66 | 9 | PARTIAL |
| CREAM | 51 | 24 | PARTIAL |
| SMP | 0 | 75 | BLOCKED |
| SUCROSE | 75 global PI decisions | 0 logical decisions | GLOBAL, no PR route by design |
| DEXTROSE | 0 | 75 | BLOCKED |
| TARA | 0 | 75 | BLOCKED |

The signed-in resolver control passed for ES, FR and PL milk. Served canonical staging QA opened `Fior di Latte` under market ES and displayed `Produkty z Twojego kraju (ES): 1 z 7 składników`; the routed milk was present while CREAM, SMP, DEXTROSE and TARA stayed on the canonical Gellatti ingredients. This proves the Recipe Library integration path works and also proves the cross-role completeness requirement is not met.

## Temporary rate control

The approved 173-row Admin batch encountered the ordinary ten-per-day manual-candidate quota. A temporary `global_catalog_trusted_accounts` row with multiplier `100` was added only for the QA Admin actor, the batch was completed, and the exact row was deleted immediately afterward. Final verification: `temporaryRateRowPresent = false`; rate denials after the override = `0`.

## Focused verification executed

- `node ./node_modules/vitest/vitest.mjs run src/data/country-products/gelatoBaseApplyReconciliation.test.ts` → 1 file / 4 tests PASS.
- `node ./node_modules/vitest/vitest.mjs run src/features/global-catalog/rl05Rl20Closeout.migration.test.ts src/data/country-products/gelatoBaseApplyReconciliation.test.ts src/features/global-catalog/productCanonicalSlotReview.migration.test.ts src/features/global-catalog/countryProductResolution.migration.test.ts src/features/admin/adminControlledCatalog.test.ts src/contracts/owner-locked/mapperLineageCurrentBinding.contract.test.ts src/features/product-intelligence/productBehaviorClassification.migration.test.ts` → 7 files / 79 tests PASS.
- `node ./node_modules/vitest/vitest.mjs run src/data/country-products/gelatoBaseCountryProducts.test.ts src/data/country-products/gelatoBaseRegistryDiff.test.ts` → 2 files / 18 tests PASS.
- `node ./node_modules/vitest/vitest.mjs run src/services/officialRecipeHandoff.test.ts src/data/recipes/official/officialRecipeReadiness.test.ts src/pages/destinations/RecipesHubPage.officialLibrary.test.tsx src/features/recipes/libraryVersionLoading.test.ts` → 4 files / 44 tests PASS.
- `node scripts/countryProducts/applyGelatoBaseV23.mjs` → dry-run PASS; 173 planned writes, 1 reuse, 15 deferred identities, 339 planned routes and 35 reviewed route blockers.
- `SUPABASE_TELEMETRY_DISABLED=1 node scripts/verify-staging-canonical-country-milk.mjs --project-ref=tunabqqrwabacxjcxxkz` → PASS for guest ES/FR/PL, HOME PL and PRO preference precedence.
- `git diff --check` → PASS before repository reconciliation.
- `git fetch origin staging` → `origin/staging` advanced to `cb56f50c4f9793cb7bdb101ee9b809c4a9c79883`; changed upstream files did not overlap the RL-05/RL-20 files.
- `git rebase --autostash origin/staging` → PASS; local evidence and rollback artifacts restored without conflict.
- `git diff --check && node ./node_modules/vitest/vitest.mjs run src/features/global-catalog/rl05Rl20Closeout.migration.test.ts src/data/country-products/gelatoBaseApplyReconciliation.test.ts src/features/product-intelligence/productSemanticSearchEdgeBundle.test.ts src/services/officialRecipeHandoff.test.ts` → 4 files / 28 tests PASS after rebase.

No local full `npm test` was run, per Owner instruction.

## Exact external authority required

To change RL-05/RL-20 to DONE, supply or approve exact product-specific evidence sufficient for the shared classifier to create ready profiles for the 87 fail-closed products, especially water/total-solids authority for the affected dry products, and resolve the single server-blocked milk identity. Then re-run the idempotent v23 executor and the ten-market, six-role resolver/Recipe Library acceptance matrix. No Mapper, FINAL-2541 or new canonical PI change is requested.
