# Heat / cold process data audit

Date: 2026-08-08
Scope: read-only audit performed before implementing recipe-process education.

## Decision

PINGÜINO can currently decide whether a recipe may use a cold process only **partially**. The application has enough data to explain general ingredient behavior and to identify an explicit, separately curated process requirement. It does **not** have enough canonical runtime data to approve the current recipe for a cold process by default.

The safe default for a recipe assembled from the current `RecipeInput` and `EngineIngredient` contracts is therefore:

`UNKNOWN — Brak wystarczających danych o procesie.`

Absence of a warning is not positive evidence. `COLD_PROCESS_OK` requires a verified, recipe-level approval covering every current ingredient, or verified ingredient-level approvals covering every current ingredient and the relevant process.

## Sources inspected

- `src/engine/types.ts` — `EngineIngredient`, `RecipeItem`, `RecipeInput`.
- `src/data/ingredients/ingredientRow.ts` — canonical runtime Mapper row.
- `src/data/ingredients/ingredientIntakeColumns.ts` — frozen intake contract.
- `src/data/ingredients/ingredientMapper.ts` — Mapper-to-Engine boundary.
- `docs/ingredients/validation/mapper_basement.csv` — active read-only Mapper inspection; no values changed. Historical v0.95 artifacts were not treated as current runtime data.
- `supabase/migrations/0004_ingredients.sql`, `0005_ingredients_final_v0_95_no_npac.sql`, `0006_mapper_basement.sql`, `0007_products.sql`.
- `src/features/formulation/stabilizerDosage.ts` and `docs/product-completion/STABILIZER_SELECTOR_SCIENCE.md`.
- `src/features/machine-catalog/*` and current recipe/machine settings.

## What the current contracts contain

Ingredient data contains stable identity, category/subcategory, composition, sugar split, POD/PAC, verification and source fields, allergens/diet flags, storage, shelf life, free-text usage/engine notes and a source URL. `EngineIngredient` intentionally receives a smaller calculation-facing subset.

The dataset sometimes contains words such as `pasteurized` or `UHT` in a display/internal name. That is useful source evidence for a human audit, but it is not a normalized process field and is not preserved in the Engine contract as a decision-grade fact.

Stabilizer data contains identity, composition, a generic activity marker, dosage windows and free-text notes. The existing project audit explicitly states that `stabilizer_activity` is a role flag, not potency or hydration metadata. The runtime contract has no approved hydration method or temperature.

Recipe data contains items, grams, locks, product category/mode, serving temperature, target batch, capacity and preference goals. It has no process plan, pasteurisation state, safety approval or hydration program.

## Required questions

| Question                                          | Current answer                                                                                                                                     | Why                                                                                                                                                                                           |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Can we identify pasteurised / UHT / raw?          | **Not reliably at runtime.**                                                                                                                       | Some names mention pasteurised/UHT, but there is no normalized treatment field, no closed vocabulary and no `EngineIngredient` field. Raw cannot be inferred from the absence of those words. |
| Can we identify raw egg?                          | **No.**                                                                                                                                            | Category/allergen data can identify egg presence, not raw-vs-treated state or the safety status of the current recipe.                                                                        |
| Can we identify functional hydration temperature? | **No, not from canonical runtime data.**                                                                                                           | There is no structured hydration method/temperature/source field. Free-text or a general gum fact must not be transferred to an unknown blend.                                                |
| Can we identify heat-sensitive ingredients?       | **No.**                                                                                                                                            | No structured sensitivity, maximum-process-temperature or degradation field exists.                                                                                                           |
| Can we identify machine/process compatibility?    | **Only machine workflow, not recipe heat safety.**                                                                                                 | Canonical machine technology identifies pre-freeze behavior. It does not prove that a mix may skip heat treatment.                                                                            |
| Which decisions are safe now?                     | **Explicit heat requirement with exact verified evidence; otherwise UNKNOWN.**                                                                     | A positive functional or safety requirement is safe to surface when assigned to the exact ingredient/process. Machine workflow can be explained independently.                                |
| Which remain UNKNOWN?                             | **Cold approval for ordinary current recipes, raw-egg safety, unstructured blend hydration, exact time/temperature and Fresh Gelato heat bypass.** | Required positive evidence is absent.                                                                                                                                                         |

## Missing canonical fields

The following data would be required before broad automatic process decisions can be enabled:

- normalized ingredient treatment: `raw`, `pasteurised`, `UHT`, `sterilised`, `unknown`;
- treatment evidence source, verification status and verification date;
- raw-egg / egg-product state and approved safety process reference;
- exact product/blend process requirement, including function vs safety;
- hydration method and, when approved, time/temperature with source and applicability;
- heat sensitivity / maximum approved process conditions;
- recipe-level process version and approval covering all ingredients;
- explicit cold-process approval and its coverage;
- machine/process compatibility separate from serving-temperature routing.

These fields are an audit recommendation only. This task does not add them to Mapper, Engine or persisted schemas.

## Safe classifier boundary

The education layer uses a separate, pure evidence contract. It never parses names to infer safety, never mutates an ingredient and never changes Engine output.

Safe precedence:

1. verified functional + verified safety heat evidence → `HEAT_REQUIRED_FOR_BOTH`;
2. verified functional heat evidence → `HEAT_REQUIRED_FOR_FUNCTION`;
3. verified safety heat evidence → `HEAT_REQUIRED_FOR_SAFETY`;
4. verified positive cold approval covering the complete recipe → `COLD_PROCESS_OK`;
5. anything else → `UNKNOWN`.

An explicit heat requirement remains useful even if other metadata is incomplete: it proves that heating is required for the stated reason. It does not claim that the supplied process is complete or safe. Exact time/temperature remains hidden unless included in an approved evidence record.

## Safety boundary

This classifier is educational decision support, not a food-safety certification. It must never invent pasteurisation guidance, validate a raw ingredient from its name, or treat Fresh Gelato / compressor / frozen bowl / frozen-container technology as permission to skip heat.
