# Resolver consumer matrix

Canonical server entry: `resolve_product_behavior_v1(entity_kind, entity_id, context)`.
Canonical client adapter: `resolveProductBehaviorForSelection` followed by an immutable `ProductBehaviorSnapshot`.

Status is an audit of the current reconciliation branch, not a claim that the whole release is complete.

| Consumer | Current authority | Snapshot/version used | Direct reinterpretation remaining | Status / required action |
|---|---|---|---|---|
| Picker status | server resolver is called on selection | new Base/Topping lines receive a snapshot | result-list badges originate from search projection before selection | PARTIAL - selection is authoritative; search display is explanatory only. |
| Base recipe | server snapshot plus Mapper `EngineIngredient` | product/binding/taxonomy IDs persisted | general legacy Mapper rows without an explicit snapshot-obligation marker remain executable | BLOCK - persist `REVALIDATION_REQUIRED` per loaded recipe and pass those exact line IDs into Preview/Apply. |
| Main crown | `mainBehaviorBlockReason(snapshot)` | policy ID/version and envelope persisted | private/catalog Main without a snapshot is blocked; legacy Mapper Main still lacks explicit loaded-recipe revalidation state | PARTIAL - safe for new catalog/private lines, legacy marker still required. |
| OPTIMAL/ECO | `verifyMainEnvelope` in Preview/Apply | Preview fingerprint includes product behavior | missing policy resolves to `MAIN_BLOCKED_POLICY`; unmarked legacy Mapper Main can still use the accepted Engine frontier | BLOCK - bind only persisted revalidation obligations, without breaking demo/template fixtures. |
| Substitution | existing verified Mapper authorization and recipe fingerprint | substitute composition is frozen | replacement behavior is not resolved and attached before Preview | BLOCK - resolve and snapshot the replacement before Preview. |
| Cost | frozen Engine/topping cost plus caller-private override | label topping carries exact catalog version | Base price provenance is not explicitly joined to the behavior snapshot | PARTIAL. |
| Monitor | Engine input plus verification badges | current recipe snapshot remains in store | Monitor does not independently call the module gate | BLOCK - consume the frozen complete Base snapshot set explicitly. |
| Nutrition | frozen Engine input and frozen label topping facts | topping version is persisted | Base behavior completeness is inherited, not asserted locally | PARTIAL. |
| Save/version | `productBehaviorModuleGate(..., SAVE)` | snapshots persist in composition sidecar | missing legacy snapshots are not yet represented as required IDs | BLOCK. |
| Production | `productBehaviorModuleGate(..., PRODUCTION)` | production plan freezes composition | missing legacy snapshots are not yet represented as required IDs | BLOCK. |
| Batch Rescue | production frozen input plus practical audit | no behavior fingerprint on rescue authorization | rescue can replan without an explicit snapshot fingerprint recheck | BLOCK. |
| Master Label | frozen production/final-product ingredient and allergen facts | catalog topping version survives | Base snapshot completeness is inherited, not asserted locally | PARTIAL. |
| OCR post-save | catalog version trigger classifies | exact catalog version binding | OCR first writes the legacy owner product root | BLOCK - switch to the single server ingest. |

## Frozen trust boundary

Search rows may explain status, but never grant permission. Permission begins only at the server resolver and is frozen in a `ProductBehaviorSnapshot`. Preview/Apply reject a stale snapshot whose Mapper/catalog/private identity no longer matches the line, and private/catalog Main cannot proceed without authority. The remaining legacy requirement must be represented explicitly on loaded recipes rather than inferred from generic Mapper provenance, which would regress accepted demo/template/test flows. Engine formulas continue to consume only `EngineIngredient`/`RecipeInput`; the resolver is a product orchestration and trust boundary, not a second science engine.
