# Shared PR-ING onboarding / classification / context-binding audit

Date: 2026-09-12
Branch: `codex/shared-pr-ing-pipeline`
Base: `origin/staging` at `6057d786` (through merged PR #309)
Status: shared runtime and forward-only persistence migration implemented locally; PR/CI, staging-only apply and live acceptance remain pending.

## Authority flow

```text
source evidence adapter
  -> validateSharedProductOnboarding
       -> PRODUCT_PROFILE_V1 (evidence/provenance + optional Mapper numeric/reference knowledge)
       -> PRODUCT_BEHAVIOR_V1 (family/form/role + per-module permissions)
       -> PRODUCT_PRODUCTION_ACCURACY_V2 (role-specific readiness)
  -> bindExactProductSemanticContext proposal
       -> FINAL Mapper/Search release concepts
       -> provisional server-only product/version sentinels
       -> runtimeMapperIngredientId = null
  -> exact PR/PM/CA product/version transaction
       -> exact database product UUID / PR code / version bound into snapshot
       -> roleReadiness persisted on the version-bound ProductBehavior binding
  -> Home / Pro / Topping / Replace discovery consumers
```

`validateSharedProductOnboarding` is the single server orchestration boundary. Scanner and `catalog-submit` call it directly. `catalog-submit` now invokes it for INTIMPORT, manual, admin, OCR/barcode, retailer, spreadsheet, supplier, shop, franchise, internal-subproduct and future-integration sources. Source adapters retain their real evidence authority (`user_confirmed`, `label`, `retailer`, `manufacturer` or `source_file`); they do not convert every import into a user confirmation. No source owns a second profile/readiness classifier.

The binding contract retains product UUID, article code, version, EAN, brand, name, variant, pack and market countries. It adds FINAL Search Concept IDs/keys, family, form, intended role and ProductBehavior fingerprints. It never emits a PI identity and explicitly fixes `runtimeMapperIngredientId` to `null`.

## `mappedIngredientId` / `matched_basement_id` hard-gate audit

Class legend:

- A — genuine exact-PI or immutable Mapper-row authority requirement.
- B — Mapper-dependent numeric or technical behavior requirement.
- C — removable legacy readiness coupling.
- D — country/default routing through a canonical Mapper slot.
- E — competing/local semantic resolver or ambiguous mixed-purpose gate.

| Class         | Active locations                                                                                                                                                                                                                 | Verdict                                                                                                                                                                                                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A             | `src/services/productPicker/mapperSearch.ts:140-154`; PI branch of `src/features/ingredient-builder/mapperOnlyCatalog.ts:69-76`; `src/services/productReview.ts:27-77`                                                           | Retained. These paths explicitly request/load/review an exact PI row.                                                                                                                                                                                                                        |
| B             | `src/data/products/productEngineResolver.ts:96-116`; `productEngineLibrary.ts:67-70`; `productEngineHandoff.ts`; `productIntelligenceResolver.ts:515-540`; `productActivationPlan.ts:256-264`; `supabaseProductCatalog.ts:44-45` | Retained for Base/Engine physics only. These paths must have product-owned physics or a validated reference row. They are not TOPPING readiness gates.                                                                                                                                       |
| B             | `src/features/product-intelligence/productBehaviorAuthority.ts` reference binding validation                                                                                                                                     | Retained as audit/behavior reference. `runtimeMapperIngredientId` remains null and standalone exact TOPPING semantic authority is accepted.                                                                                                                                                  |
| C             | `src/services/globalCatalog.ts` client projection of `usableAsTopping`                                                                                                                                                           | Removed. The client no longer requires mapping plus label completeness after the server already returned `TOPPING=true`.                                                                                                                                                                     |
| C             | `src/features/global-catalog/catalogIngredient.ts` ingredients/allergens requirement                                                                                                                                             | Removed from private Topping construction. Required nutrition remains because recipe mass/label totals consume it; missing public text remains explicit.                                                                                                                                     |
| C             | `src/features/recipe-composition/recipeCompositionPersistence.ts` `catalog:`-only identity and non-empty public label text                                                                                                       | Replaced. Exact PR/PM/CA identity persists, and empty public label text does not invalidate a private saved Topping.                                                                                                                                                                         |
| C             | `src/features/ingredient-builder/productPickerModel.ts:202-210`                                                                                                                                                                  | Narrowed to Base only. A TOPPING_ONLY article in the Base picker now reports the correct alternate context instead of a false missing-mapping diagnosis.                                                                                                                                     |
| D             | `src/features/global-catalog/useGlobalCatalogPicker.ts:189-205,257-274`; `ProductPickerPopover.tsx:821-822,944-947,1094-1098`; `resolveCountryProductsForSlots` / `setUserPreferredExactProductForSlot`                          | Retained for generic canonical-slot defaults. Exact PR results route directly without a PI requirement. The new snapshot also preserves FINAL Search concepts and normalized market countries for shared-source projections.                                                                  |
| E             | `src/features/ingredient-builder/canonicalProductDiscovery.ts`                                                                                                                                                                   | Central binding now wins whenever present; unresolved/conflicting binding returns no semantic family. Legacy/PI presentation heuristics remain only as fallback for records without the new contract. PR #307 consumes this filter for hard Replace compatibility and is a merge dependency. |
| E             | catalogue lifecycle/publication state versus private role readiness                                                                                                                                                              | Kept fail-closed for public publication. The migration exposes separate version-bound `roleReadiness` and `productSemanticBinding.readiness`; only trusted TOPPING readiness bypasses a missing Mapper reference.                                                                              |
| informational | favorites, recent-use keys, telemetry, audit pages, DTO fields, reports and tests                                                                                                                                                | Not readiness gates; retained.                                                                                                                                                                                                                                                               |

All historical migration occurrences were inspected as immutable history. No old migration was edited. Migration `20260912120000_shared_pr_ing_semantic_binding.sql` is new and has not yet been applied.

## Role-specific readiness

- Base: exact product identity + classified Base role + ProductBehavior Base permission + complete product-owned technical profile (or a genuinely authorized reference).
- Topping: exact product identity + classified Topping role + ProductBehavior Topping permission + the declared nutrition required by downstream recipe totals. Missing Base water/solids/PAC/POD and missing Mapper identity do not block it.
- Public catalogue/label: separate `publicCatalogue` readiness in `ProductSemanticBinding`; label gaps stay visible and do not silently become VERIFIED.
- Ambiguous semantics, a wrong Search release, no Search Concept, role conflict, blocked ProductBehavior, weak Recognition or insufficient exact identity all produce `UNRESOLVED`/`CONFLICT` and no private role readiness.

## First acceptance and controls

- Haribo EAN `8426617014254`, expected `PR-ING-007205`: local deterministic acceptance binds `SC-ING-000184` / `watermelon`, family `confectionery`, form `SOLID`, role `TOPPING_ONLY`; exact PR/version/EAN retained; Base false, private Topping true; no PI created.
- Hacendado EAN `8480000510716`: existing Queso rescue regression retained; final staging live acceptance pending.
- Hanuta/Ferrero EAN `8000500272480`: existing exact-product family-confirmation regression retained; final staging live acceptance pending.
- Negative controls: weak Recognition, missing Base physics and role conflict all remain fail-closed.
- No product-name, EAN or Haribo-specific production branch was introduced.

## Read-only evidence and backtest

Canonical staging was inspected read-only through the Supabase Management API. Haribo currently resolves to product `59803b04-d0a1-4151-bb87-505db292d85a`, `PR-ING-007205`, version 1, EAN `8426617014254`, brand Haribo and exact `90 g` version facts. Its current behavior is `UNKNOWN_REQUIRES_EVIDENCE`, all recipe permissions are false and no semantic binding exists. No row was mutated during this inspection.

The available checked-in historical reference audit was also evaluated conservatively:

- historical product rows: 136
- historical `SAFE` reference candidates: 8
- exact-context auto-applied: 0 (historical `SAFE` is not proof of current exact PR context)
- flagged for exact-context review: 136
- unsafe readiness escalations: 0
- duplicate product IDs: 0
- historical tally: 81 `SAFER_REPLACEMENT`, 16 `NO_LONGER_NEEDED`, 31 `REJECT`, 8 `SAFE`

This is evidence that the dry-run performs no unsafe promotion, not a substitute for the required post-deploy live cases.

## Forward-only migration contract

The Owner-approved migration is implemented but not applied. It:

1. admits a null reference only for a server-recomputed, conflict-free `TOPPING_ONLY` authority with `TOPPING_READY` plus a `RESOLVED` FINAL Search proposal;
2. persists exact product UUID, article code, product-version UUID, EAN, name, brand, variant, pack, Search Concepts, family/form/role, ProductBehavior fingerprint and role readiness;
3. keeps Base and Substitution on their pre-existing independent fail-closed authority;
4. gives an existing exact-EAN PR one request-driven immutable version bump only when the new binding passes; an already-current binding is a no-op;
5. exposes the version-bound snapshot in catalogue search and exact known-product RPCs.

It contains no migration-time product backfill, no `mapper_basement` mutation and no PI creation. All textual patch anchors were compared read-only against canonical staging after the final rebase: every anchor occurs exactly once.

## Owner-provided live staging evidence (2026-09-12)

The Owner confirmed that Haribo `8426617014254` / `PR-ING-007205` is correct immediately after Scanner Recognition/ProductBehavior, but the persisted catalogue and known-product projections lose `TOPPING_ONLY`, `TOPPING_READY` and exact 90 g presentation and disable recipe insertion.

Repository inspection identifies the matching persistence defect: the deployed classifier patch in `20260825233000_scanner_pm_product_owned_profile_seam.sql` still requires a non-null `referenceMapperIngredientId` plus a current `mapper_product_behavior_bindings` row before accepting Topping authority. In addition, the existing-PR branch of `gellatti_upsert_customer_added_product_v1` returns the old product before creating a revalidated version. PR #306 deliberately permits strong standalone Topping semantic authority. The new migration narrows both seams without reopening Recognition or Rescue.

## External dependency

PR #307 (`fix(search): close served G/H/I gaps`) and PR #309 are merged into the current base. Final closure now depends only on this branch's PR/CI, staging-only migration/function deployment and the five required live acceptance cases.
