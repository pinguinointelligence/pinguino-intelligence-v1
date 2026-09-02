# Resolver consumer matrix

Canonical server entries:

- `resolve_product_behavior_v1(entity_kind, entity_id, context)` resolves one exact immutable product/Mapper version and returns shared facts plus a separate caller-private overlay.
- `validate_recipe_behavior_v1(lines, context)` re-resolves current version, binding, taxonomy, mapping and Main policy immediately before terminal operations.

Canonical client authority: `ProductBehaviorSnapshot` per line plus the recipe-wide `RecipeBehaviorAuthority`. Private prices/suppliers/notes/stock are never copied into the immutable shared snapshot.

| Consumer | Current authority | Exact enforcement | Status |
|---|---|---|---|
| Product Picker | Server resolver on every accepted Base/Topping selection, including the closed built-in-to-Mapper bridge | Blocked/unresolved selections never enter the draft; search badges are explanatory only | COMPLETE |
| Base creation | Exact product/Mapper snapshot attached to the new line | Required canonical/private/catalog/Mapper lines without authority fail closed | COMPLETE |
| Topping creation | Exact catalog-version snapshot; label-only facts remain outside Engine composition | Resolver TOPPING permission and immutable nutrition/allergen facts | COMPLETE |
| Main crown | `mainBehaviorBlockReason` and exact snapshot policy | Missing, legacy-reconstructed or denied authority blocks Main | COMPLETE |
| OPTIMAL / ECO | `verifyMainEnvelope` plus server-authority Preview/Apply wrappers | floor/ceiling/hard limit, ratio, carrier and current server binding; ECO price remains a transient private projection | COMPLETE |
| Substitution | Replacement is resolved against the whole proposed vector | replacement snapshot is persisted in Preview; stale/forged Apply is rejected | COMPLETE |
| Cost | Shared/reference price plus owner-private price projection | private > reference > missing; missing is never zero; private data is not part of shared snapshots | COMPLETE |
| Monitor | Recipe-wide MONITOR gate and frozen technical composition | POST_PROCESS_ADDON excluded; modern stale authority blocks; legacy reconstruction is read-only only | COMPLETE |
| Summary / Nutrition | SUMMARY and NUTRITION gates over frozen recipe/completion authority | completed batches use `ProductionCompletionSnapshot`, never the current draft or latest product | COMPLETE |
| Allergens / Process Guide | Frozen shared allergen/process evidence | no latest-product or latest-Mapper reinterpretation in recipe views | COMPLETE |
| Save / Recipe Versions | Local complete-set gate plus terminal server validation for Save; immutable sidecar for versions | required IDs, binding versions and facts fingerprints persist | COMPLETE |
| Restore | Exact historical `RESTORE` gate before appending a new immutable version | old version is not rewritten; unresolved legacy lines remain inspection-only | COMPLETE |
| Production | Local PRODUCTION gate plus terminal server validation | production source fingerprint freezes behavior authority | COMPLETE |
| Batch Rescue | BATCH_RESCUE gate over the candidate plus current server validation | added/replaced managed lines require an exact snapshot | COMPLETE |
| Master Label | MASTER_LABEL gate over completed frozen composition | actual Base + Toppings use the versioned facts frozen at completion | COMPLETE |
| Exports | EXPORT gate on the exact saved recipe/composition | refuses missing/stale nutrition or allergen authority | COMPLETE |
| OCR/manual/import intake | One Edge/service adapter into `ingest_product_v1` | product, version, evidence, behavior binding, relation and event commit or roll back together | COMPLETE |

## Legacy rule

Opening an old recipe never mutates its stored version. Resolvable lines receive in-memory `LEGACY_RECONSTRUCTED` snapshots for read-only Monitor/Summary/Nutrition/Allergens/Process/Label/Export/Cost inspection. Editing, Main, Preview, Apply, Save, Restore and new Production require fully `RESOLVED` authority; unresolved lines remain `REVALIDATION_REQUIRED` with their exact line IDs.

## Frozen trust boundary

Search rows may explain status but never grant permission. Engine formulas still consume `EngineIngredient`/`RecipeInput`; Unified Product Intelligence owns product identity, immutable facts, eligibility and policy. Terminal validation compares immutable IDs/fingerprints to current server authority, while historical saved and completed outputs continue to read their frozen snapshots.
