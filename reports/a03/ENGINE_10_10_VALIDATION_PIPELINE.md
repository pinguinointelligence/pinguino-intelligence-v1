# Engine 10/10 validation pipeline — preparation (D-27)

Owner rule: exact country products → actual PI/PR facts → Engine/Solver → required score 10/10 → freeze the exact country
grams → versioned country recipe/base. **No country base is FINAL before 10/10.**

This page prepares that pipeline. It implements nothing and changes no application code. The engine facts below were
read from the app source on branch `claude/pl-country-product-set`, read-only.

## What the app already has (read-only findings)

| piece | where | what it gives the pipeline |
|---|---|---|
| Engine entry point | `src/engine/calculateRecipe.ts` — `calculateRecipe(input: RecipeInput): RecipeResult` | deterministic recipe numbers |
| Input | `RecipeInput` = `items`, `mode`, `category`, `target_temperature_c`, `target_batch_grams`, `machine_capacity_grams`, `goals?` | one country base = one input |
| Ingredient | `EngineIngredient` — `id` / `canonical_ingredient_id` (the Mapper `PI-ING` identity), `composition` (per 100 g), `pod_value`, `pac_value`, `de_value`, `cost_per_kg`, `cost_currency`, flags | where exact PR facts enter |
| Composition per 100 g | `IngredientComponentProfile` — water, solids, fat, saturated fat (optional), protein, carbohydrate, sugar, sucrose, glucose, dextrose, fructose, lactose, polyol, fiber, salt, alcohol, kcal | the label facts a PR must carry |
| Result | `RecipeResult` — `engine_version`, `config_version`, totals, percentages, sugar breakdown, POD/PAC/NPAC points, ice fraction, `indicators`, `scores` (technical, flavor, cost or null, overall; 0–100), nutrition, costs, `warnings` | the evidence to freeze |
| The "10/10" measure | `src/features/constraint-studio/applyPipeline.ts` — solver stop reason `all_bands_in_range` ("10/10 — nothing left out of band"); the rescue advisor prints `score/10` | the acceptance gate |

To confirm with the Engine owners: that the required "10/10" is the existing `all_bands_in_range` outcome of the solver,
not a new score. SHOP defines no scoring.

## Pipeline, per market

1. **Selection input.** Take the Owner's complete Excel rows for the market, after `tooling/reconcile_owner_excel.py` passes
   s1–s9. Any REPORT_BACK row stops that market; nothing is substituted.
2. **Product facts.**
   - Take each selected PR's composition per 100 g from its label or technical sheet.
   - Keep the raw basis. Normalize per the owner-frozen rule 1 ml = 1 g (g/L ÷ 10); never require a density.
   - Record VERIFIED / DERIVED / ESTIMATED / UNKNOWN per field.
   - Where the PR differs from its PI, the exact PR facts win, as the routing contract says.
3. **Engine ingredients.**
   - Each line becomes an `EngineIngredient`: `canonical_ingredient_id` = the PI-ING, and `composition` = the exact PR facts.
   - POD/PAC come from the Mapper values where they exist.
   - For the STABILIZER slot, use the actually selected PI and product. Stabilizers are not gram-for-gram substitutes: the
     3 g TARA reference never carries over to GUAR, LBG or a blend.
4. **Recipe input.**
   - GELATO base at 1000 g; mode, category and target temperature from the base profile.
   - The starting grams are the Owner Excel's; they are not a result.
5. **Solve.**
   - Run the engine and the existing solver.
   - Accept only the stop reason `all_bands_in_range`, with no hidden calibration or fallback warnings.
   - Keep `indicators`, `scores`, `warnings`, `engine_version` and `config_version`.
6. **Freeze.**
   - Store the exact grams as a versioned country base.
   - Record: market, base id, Owner Excel SHA-256, Mapper 2541 SHA-256 (`6db7fbe0…`), a hash of each PR's facts,
     engine/config versions, the solver stop reason, and the date.
7. **PDF 0€.**
   - The customer PDF shows only frozen country bases.
   - Each line names the product the calculation actually used (D-18), with its verified purchase link (D-10).

## Readiness gates carried into the pipeline

- Mapper flags `approved_for_base` and `approved_for_engines` must be TRUE for every PI; the reconciler checks this in s6.
- Processing readiness per the processing rules: GUAR works cold; LBG needs heat to hydrate; TARA is conditional;
  commercial blends are product-specific. The Processing owners confirm each selected stabilizer before step 5.
- PR-ING identities must be assigned before a base is frozen. v7/v9 still say "AUTO PO AKCEPTACJI" or leave them blank.
- Label facts must be complete enough for the engine (D03).

## Open points for the Engine/Processing owners

1. Confirm "10/10" = the solver's `all_bands_in_range`.
2. Choose where the harness lives. It needs app code (engine + solver), so it belongs in the app's own test/tool lanes,
   not in `reports/`.
3. `RecipeInput` notes that liters are converted "via density config"; the label normalization above uses the
   owner-frozen 1 ml = 1 g rule. Confirm the two never meet on ingredient facts.
