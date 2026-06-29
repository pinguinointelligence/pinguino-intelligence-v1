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

## EXACT integration point (TODO for slice 1)
Inspected 2026-06-29. The Studio picker builds `EngineIngredient[]` in **`src/features/ingredient-builder/ingredientLibrary.ts` → `selectIngredientLibrary()`**, which maps `mapper_basement` rows (`IngredientRow`) via `ingredientRowToEngineIngredient`. Recipe items reference those `EngineIngredient`s; `buildRecipeInput` (`src/features/studio/buildRecipeInput.ts`) passes them to the engine. **Products (`PR-ING`) are never offered there.**

To wire products in (narrow, read-only):
1. In the Studio data layer, also fetch the user's **matched** products (`listMyProducts().filter(mapper_status==='matched')`) alongside the reference rows already loaded.
2. For each, call **`prepareProductEngineIngredient(product, byId.get(product.matched_basement_id))`** (`src/data/products/productEngineHandoff.ts`). When `ready`, push the returned `EngineIngredient` (id = `PR-ING-…`, reference-linked composition + pac/pod, `is_verified:false`) into the picker as a separate **"My products"** group/source.
3. Render the handoff's `not_independently_measured` + `blocked_by_red_flags` signals as a **provenance badge** ("reference-linked — not independently measured") on those picker entries (provenance UI = slice 2).
4. `rejected` / `null` / unresolved products never enter the picker (the adapter returns `ready:false`); red-flagged products show the warning. No product pac/pod is copied; no raw OCR/catalog text reaches the engine (the adapter only emits the reference profile).

The adapter + these guarantees are already covered by `productEngineHandoff.test.ts` (matched resolves; rejected/null blocked; red flags warn; no `npac_value`; no `detected_text`/`extracted_json` leak). **Remaining work is purely the Studio picker UI wiring** above (kept out of scope here as a broad, browser-only change).

## Hard rules (unchanged)
Do not copy PAC/POD to products. Do not compute from `total_sugars`. Matched = mapping confirmed only. Keep product PAC/POD NULL until a scientific source/provenance is implemented.
