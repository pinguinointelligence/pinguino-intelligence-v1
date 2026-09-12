# Shared PR-ING onboarding / classification / context-binding audit

Date: 2026-09-12  
Branch: `codex/shared-pr-ing-pipeline`  
Base: `origin/staging` at `dd4c569d` (merged PR #306)  
Status: non-schema contract and runtime integration implemented; persistent country/concept and publication/safety separation require Owner-approved migration before closure.

## Authority flow

```text
source evidence adapter
  -> validateSharedProductOnboarding
       -> PRODUCT_PROFILE_V1 (evidence/provenance + optional Mapper numeric/reference knowledge)
       -> PRODUCT_BEHAVIOR_V1 (family/form/role + per-module permissions)
       -> PRODUCT_PRODUCTION_ACCURACY_V1 (role-specific readiness)
  -> exact PR/PM/CA product/version
  -> bindExactProductSemanticContext
       -> FINAL Mapper/Search release concepts
       -> exact product identity retained
       -> runtimeMapperIngredientId = null
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
| D             | `src/features/global-catalog/useGlobalCatalogPicker.ts:189-205,257-274`; `ProductPickerPopover.tsx:821-822,944-947,1094-1098`; `resolveCountryProductsForSlots` / `setUserPreferredExactProductForSlot`                          | Retained for generic canonical-slot defaults. Exact PR results continue to route directly by market without a PI requirement. A durable country→Search Concept→exact PR resolver still needs a schema/RPC migration.                                                                         |
| E             | `src/features/ingredient-builder/canonicalProductDiscovery.ts`                                                                                                                                                                   | Central binding now wins whenever present; unresolved/conflicting binding returns no semantic family. Legacy/PI presentation heuristics remain only as fallback for records without the new contract. PR #307 consumes this filter for hard Replace compatibility and is a merge dependency. |
| E             | catalogue `status='blocked'` used for both safety and public completeness                                                                                                                                                        | Kept fail-closed. Client-side relaxation was rejected because the field does not distinguish lifecycle/safety rejection from publication-only gaps. Requires explicit server fields and migration.                                                                                           |
| informational | favorites, recent-use keys, telemetry, audit pages, DTO fields, reports and tests                                                                                                                                                | Not readiness gates; retained.                                                                                                                                                                                                                                                               |

All historical migration occurrences were inspected as immutable history. No old migration was edited and no new migration was created or applied.

## Role-specific readiness

- Base: exact product identity + classified Base role + ProductBehavior Base permission + complete product-owned technical profile (or a genuinely authorized reference).
- Topping: exact product identity + classified Topping role + ProductBehavior Topping permission + the declared nutrition required by downstream recipe totals. Missing Base water/solids/PAC/POD and missing Mapper identity do not block it.
- Public catalogue/label: separate `publicCatalogue` readiness in `ProductSemanticBinding`; label gaps stay visible and do not silently become VERIFIED.
- Ambiguous semantics, a wrong Search release, no Search Concept, role conflict, blocked ProductBehavior, weak Recognition or insufficient exact identity all produce `UNRESOLVED`/`CONFLICT` and no private role readiness.

## First acceptance and controls

- Haribo EAN `8426617014254`, expected `PR-ING-007205`: bound to `SC-ING-000184` / `watermelon`, family `confectionery`, form `SOLID`, role `TOPPING_ONLY`; exact PR/version/EAN retained; Base false, private Topping true, public false when label gaps remain; no PI created.
- Hacendado EAN `8480000510716`: existing Queso rescue regression retained and executed.
- Hanuta/Ferrero EAN `8000500272480`: exact-product family-confirmation mobile regression now names the real fixture and executed.
- Negative controls: weak Recognition, missing Base physics and role conflict all remain fail-closed.
- No product-name, EAN or Haribo-specific production branch was introduced.

## Read-only backtest

The requested live PR-ING catalogue cohort was not available in this clean worktree and no database records were read or mutated. The available checked-in historical reference audit was evaluated conservatively:

- historical product rows: 136
- historical `SAFE` reference candidates: 8
- exact-context auto-applied: 0 (historical `SAFE` is not proof of current exact PR context)
- flagged for exact-context review: 136
- unsafe readiness escalations: 0
- duplicate product IDs: 0
- historical tally: 81 `SAFER_REPLACEMENT`, 16 `NO_LONGER_NEEDED`, 31 `REJECT`, 8 `SAFE`

This is evidence that the dry-run performs no unsafe promotion, not a substitute for the required database-backed PR-ING census before merge.

## Migration approval required for full closure

No migration has been created or applied. Full closure requires Owner approval for a forward-only migration that:

1. persists the versioned FINAL Search/semantic binding (including release ID and exact product/version) or exposes an equally durable server-owned projection;
2. exposes separate `safety_blocked` and `publication_ready` facts instead of overloading catalogue `status='blocked'`;
3. adds country/market resolution by Search Concept to an exact PR/PM/CA product without requiring a Mapper slot;
4. provides a read-only database backtest/RPC projection so all active and legacy PR-ING rows can be counted before any write.

The migration must not alter `mapper_basement`, create PI rows, auto-promote uncertain evidence or update products during the backtest.

## Owner-provided live staging evidence (2026-09-12)

The Owner confirmed that Haribo `8426617014254` / `PR-ING-007205` is correct immediately after Scanner Recognition/ProductBehavior, but the persisted catalogue and known-product projections lose `TOPPING_ONLY`, `TOPPING_READY` and exact 90 g presentation and disable recipe insertion.

Repository inspection identifies the matching persistence defect: the deployed classifier patch in `20260825233000_scanner_pm_product_owned_profile_seam.sql` still requires a non-null `referenceMapperIngredientId` plus a current `mapper_product_behavior_bindings` row before accepting Topping authority. PR #306 deliberately permits a strong, server-recomputed standalone Topping semantic authority without manufacturing that Mapper reference. A forward-only migration must reconcile the persisted SQL validator/classifier with the already accepted TS authority, preserve the full product/version/pack facts, and expose the role-specific projection to catalogue and known-product consumers. This Owner-provided evidence is mandatory acceptance input, not a live retest executed from this worktree.

## External dependency

PR #307 (`fix(search): close served G/H/I gaps`) already contains exact Scanner→Home identity preservation and hard Replace filtering. This branch intentionally does not duplicate those files. At audit time its owner-locked contracts check is failing and its main validation job is pending; it must be reconciled before declaring Home/Replace closure.
