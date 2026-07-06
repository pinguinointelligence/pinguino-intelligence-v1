# PAC/POD & Engine-Handoff Plan

_How a matched product becomes usable by the recipe engines — without ever copying or
guessing PAC/POD. 2026-06-29._

## How engines resolve ingredient PAC/POD today
- Recipe engines consume `EngineIngredient[]` produced by `data/ingredients/ingredientMapper.ts` from `mapper_basement` rows (read-only via `services/ingredients.ts`).
- The engine is **stored-value-first**: `engine/pod.ts` uses the ingredient's `pod_value`; `engine/pac.ts` uses `pac_value` (then DE path, then typed sugar breakdown). Recipe-level PAC/NPAC is derived in recipe logic; no `npac_value` is read.
- **Products have no path into the engine.** Their `pac_value`/`pod_value` are NULL and there is no product→engine resolver — until now.

## Why products can't just get PAC/POD
- **Don't compute from `total_sugars`**: POD/PAC require the *sugar-type breakdown* (sucrose/dextrose/glucose/fructose/lactose/polyols), which EU labels don't carry. Assuming "all sugar = sucrose" is a fabrication.
- **Don't copy the reference's values onto the product**: that would (a) imply the product was independently measured, (b) duplicate/stale data if the reference is recalibrated, and (c) erase provenance. Forbidden by the project rules.

## Chosen approach — reference-linked resolution at handoff (no copy)
A matched product keeps `pac_value`/`pod_value` = NULL. At recipe-handoff time the engine resolves values **through** the product's `matched_basement_id`, read-only, with explicit provenance.

**Implemented (this block):** `data/products/productEngineResolver.ts` — pure, non-mutating:
```
resolveProductEngineValues(product, reference) -> {
  resolvable, pac_value, pod_value,
  provenance: 'product_measured' | 'reference_linked' | 'unresolved',
  basement_id, not_independently_measured, reason
}
```
Rules it enforces:
- Only a **`mapper_status === 'matched'`** product resolves via the reference link (needs_review / ambiguous / rejected / null → `unresolved`).
- Requires the reference to supply **both** pac and pod (never invents a missing one).
- A product's **own** measured pac/pod (future lab path) win → `provenance: 'product_measured'`, `not_independently_measured: false`.
- Reference-linked results are flagged **`not_independently_measured: true`** so UI/engine warn.
- Pure: no DB, no engine import, no `npac_value`, never reads `total_sugars`.

## Provenance + UI
- A matched product surfaced to a recipe must show: "engine values **linked from reference** `PI-ING-…` — not an independent measurement of this product."
- Internal confidence stays internal; customer copy uses the approved statuses, never "Mapper".

## Remaining slices (not yet built — each its own gated step)
1. **Wire the resolver into the recipe→product handoff** (where a recipe references a `PR-ING` product, resolve via the matched reference at calc time). Read-only; no product write.
2. **Provenance UI** — the "reference-linked, not independently measured" warning in Studio/handoff surfaces.
3. **PI Calculated / PI Verified status transitions** — only after (1)+(2) and the red-flag gate (`productRedFlags.blocksAutoVerify`) pass; red-flagged products (sweeteners/polyols/protein/conflicts/incomplete OCR) never auto-verify. **Requires status-rule sign-off.**
4. **Future technical-sheet / lab path** — when a real measured pac/pod for a product exists, store it on the product with provenance; the resolver already prefers it (`product_measured`).

## Integration point — DONE (2026-06-30)
The Studio picker builds `EngineIngredient[]` in `src/features/ingredient-builder/ingredientLibrary.ts` → `selectIngredientLibrary()` (reference rows). Products are now wired in alongside, exactly as planned below:

1. ✅ `useIngredientLibrary` (`src/features/ingredient-builder/useIngredientLibrary.ts`) fetches `listMyProducts` (Pro-only, off `/demo`) and builds the group via **`buildProductEngineLibrary`** (`src/data/products/productEngineLibrary.ts`), linking each product to its reference row.
2. ✅ Each confirmed product → `prepareProductEngineIngredient(product, reference)` → an `EngineIngredient` (id = `PR-ING-…`, reference-linked composition + pac/pod, `is_verified:false`), exposed on `IngredientLibrary.products` + `productProvenance`.
3. ✅ `IngredientPicker` renders a separate **"My Products"** optgroup + a provenance note: status label · "Reference-linked profile · PAC/POD from approved reference · not independently measured"; red-flagged → "pending verification". No internal confidence %, never the word "Mapper".
4. ✅ `rejected` / `null` / `draft` / unresolved products never enter the group (gated in `buildProductEngineLibrary` + the adapter's `ready:false`). No product pac/pod is copied; no raw OCR/catalog text reaches the engine.

**Proven by tests:** `productEngineLibrary.test.ts` (gate), `IngredientPicker.test.tsx` (group + provenance, no %/Mapper), `productEngineLibrary.recipe.test.ts` (a product calculates **identically** to its reference; product pac/pod stay null; no raw text in the engine ingredient or result). Remaining: a Pro signed-in session is required to render the group (the data path + UI are SSR-tested).

## Amendment (2026-07-06) — class-anchored derivation (owner-approved, pure slice landed)
The PI audit confirmed that reference-linking alone leaves every no-reference product parked even
when a chemically sound same-class derivation exists (skim milk along the calibrated milk fat
series; plain/greek yogurt and kefir from same-class anchors). The owner approved a bounded rule
amendment, now implemented as the pure, UNWIRED `data/products/productIntelligenceResolver.ts`:

```
resolveProductIntelligence({ product, candidateReferences, matchedReference }) -> {
  outcome: 'reference_linked' | 'pi_calculated' | 'pi_generated' | 'blocked',
  value_basis: 'reference_linked' | 'class_derived' | 'label_derived' | 'none',
  recommended_status, engine_ready, confidence, rule_id, basis_reference_ids,
  derived (EPHEMERAL pac/pod) | null, provenance_inputs, warnings,
  blocked_reason, blocked_class
}
```

Class-anchored DERIVATION is allowed ONLY when every condition holds: same chemistry class ·
explicit tested rule (derivation rule ids `milk_fat_series_v1` / `plain_yogurt_class_anchor_v1` /
`greek_yogurt_fat_variant_v1` / `kefir_fermented_dairy_v1`) · label composition complete enough ·
provenance + confidence carried on the result · **derived values stay EPHEMERAL** (consumed at
handoff time only — never written to products, never to `mapper_basement`). The separate
`nut_species_label_v1` rule derives NO values at all — it only stages a species-exact label
composition (`pi_generated`, `derived: null`, never engine-ready).

**Where class-derived PAC/POD lives:** nowhere persistent — it is resolution output, exactly like
today's reference-linked values. No new table is needed; the deferred `calculated_profile_json` /
`source_values_json` columns (0008) are **still not required** and stay absent — they would only
matter if derived values ever need to be visible outside recipe-time (a future owner decision).
If/when a status write is driven by a resolver outcome, the provenance audit goes through
`products.review_notes` via `setProductLifecycleStatus` — the future caller MUST write the rule id
+ basis reference ids into that note (a convention the next slice must implement; nothing records
it automatically today). The `product_snapshots` trail covers source-data changes only (price/
package/text/nutrition) and has no status/note fields — it is NOT the provenance mechanism here.
Either way: no schema change.

**Proposed handoff consumption (NOT implemented — next gated slice):** `productEngineLibrary`
gains a branch for `outcome === 'pi_calculated'` products → `EngineIngredient` built from the
basis reference's composition with the class-derived pac/pod and a distinct provenance label
("Class-derived · interpolated from calibrated references · not independently measured");
`pi_generated` (label-staged) and `blocked` never enter the library. `reference_linked` behavior
is byte-identical to today.

Hard-blocked classes (unchanged, tested): hydrolysed-lactose / lactose-free dairy ·
high-intensity sweeteners · polyols · protein-fortified · composites/jams/blends ("a la taza") ·
torrefacto coffee · red-flagged products.

## Hard rules (updated 2026-07-06 by the amendment above)
Do not copy PAC/POD to products. Do not compute PAC/POD from `total_sugars` (or any single label
field) — unchanged. Matched = mapping confirmed only. Keep product PAC/POD NULL — class-derived
values are ephemeral resolution output, never a product write. Class-anchored derivation is
permitted ONLY through the explicit tested rules above, never improvised.
