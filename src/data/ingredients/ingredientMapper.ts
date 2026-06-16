/**
 * Pure transform: a PI Base DB row → the engine's `EngineIngredient` contract.
 *
 * No IO, no backend client, no engine internals — only public `@/engine` types.
 * The engine owns all recipe math; this only reshapes a verified ingredient profile.
 *
 * Honesty rules:
 *  - Engine `composition` fields are required numbers, so an unknown (`null`)
 *    component is coerced to 0 ONLY here, at the engine seam (the DB stays
 *    blank). The engine already treats an absent component as a 0 contribution.
 *  - `saturated_fat_percent` is OPTIONAL in the engine, so an unknown stays
 *    absent (never invented as 0).
 *  - `pod/pac/npac/de_value` and `cost_per_kg` are nullable in `EngineIngredient`
 *    and are preserved verbatim (a stored 0 stays 0; unknown stays null).
 */
import type { EngineIngredient, EngineIngredientFlags, IngredientComponentProfile } from '@/engine';
import { mapDatasetCategory } from './categoryMapping';
import type { IngredientRow } from './ingredientRow';

/** Required-number coercion at the engine seam (unknown component → 0). */
const num = (value: number | null | undefined): number => value ?? 0;

export function ingredientRowToEngineIngredient(row: IngredientRow): EngineIngredient {
  const { category } = mapDatasetCategory(row.ingredient_category);

  const composition: IngredientComponentProfile = {
    water_percent: num(row.water_percent),
    solids_percent: num(row.total_solids_percent),
    fat_percent: num(row.fat_percent),
    protein_percent: num(row.protein_percent),
    carbohydrate_percent: num(row.carbohydrate_percent),
    sugar_percent: num(row.total_sugars_percent),
    sucrose_percent: num(row.sucrose_percent),
    glucose_percent: num(row.glucose_percent),
    dextrose_percent: num(row.dextrose_percent),
    fructose_percent: num(row.fructose_percent),
    lactose_percent: num(row.lactose_percent),
    polyol_percent: num(row.polyol_percent),
    fiber_percent: num(row.fiber_percent),
    salt_percent: num(row.salt_percent),
    alcohol_percent: num(row.alcohol_percent),
    kcal_per_100g: num(row.kcal_per_100g),
  };
  // optional — keep unknown saturated fat ABSENT, never 0
  if (row.saturated_fat_percent != null) {
    composition.saturated_fat_percent = row.saturated_fat_percent;
  }

  // best-effort engine hints from the mapped category + dietary flag
  const flags: EngineIngredientFlags = {};
  if (category === 'dairy') flags.is_dairy = true;
  if (category === 'stabilizer') flags.is_stabilizer = true;
  if (category === 'flavor') flags.is_flavor_booster = true;
  if (row.vegan === 'false') flags.is_animal_origin = true;

  return {
    id: row.ingredient_id,
    name: row.ingredient_name_display.trim() || row.ingredient_name_internal,
    category,
    composition,
    pod_value: row.pod_value,
    pac_value: row.pac_value,
    npac_value: row.npac_value,
    de_value: row.de_value,
    cost_per_kg: row.cost_per_kg,
    confidence_score: row.data_confidence_percent ?? 0,
    source_type: 'verified_db',
    is_verified: row.verification_status === 'verified',
    ...(Object.keys(flags).length > 0 ? { flags } : {}),
  };
}
