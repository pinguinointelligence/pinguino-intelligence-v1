/**
 * Runtime Mapper knowledge — the same cohorts the dry runs build, from the DB.
 *
 * The local dry runs read `mapper_basement.csv` and hash the file. The browser
 * never sees that file, so at runtime the Mapper arrives as active ingredient
 * rows and is fingerprinted from their identities instead. Both paths produce
 * the same `MapperKnowledge` shape, so inference behaves identically whether it
 * runs in a test or in the app.
 *
 * This module exists in `services/` rather than `features/` because it is the
 * only part that touches the database: everything downstream stays pure and
 * takes the knowledge as an argument.
 */
import { listActiveIngredients } from './ingredients';
import {
  buildMapperKnowledge,
  fingerprintMapperRows,
  type MapperKnowledge,
  type MapperKnowledgeRow,
} from '@/features/product-intelligence/mapperValueInference';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';

/**
 * Narrow a full Mapper row to what inference reads.
 *
 * Deliberately a projection rather than a cast: inference must never be able to
 * reach a field nobody decided it should see, and the explicit list is what
 * makes that reviewable.
 */
export function toMapperKnowledgeRow(row: IngredientRow): MapperKnowledgeRow {
  return {
    ingredient_id: row.ingredient_id,
    ingredient_name_internal: row.ingredient_name_internal,
    ingredient_name_display: row.ingredient_name_display,
    brand: row.brand,
    ingredient_category: row.ingredient_category,
    ingredient_subcategory: row.ingredient_subcategory,
    is_active: row.is_active,
    ean_code: row.ean_code,
    water_percent: row.water_percent,
    total_solids_percent: row.total_solids_percent,
    fat_percent: row.fat_percent,
    protein_percent: row.protein_percent,
    carbohydrate_percent: row.carbohydrate_percent,
    total_sugars_percent: row.total_sugars_percent,
    fiber_percent: row.fiber_percent,
    salt_percent: row.salt_percent,
    alcohol_percent: row.alcohol_percent,
    kcal_per_100g: row.kcal_per_100g,
    pod_value: row.pod_value,
    pac_value: row.pac_value,
    sweetness_factor: row.sweetness_factor,
    freezing_factor: row.freezing_factor,
  };
}

/** Build knowledge from already-loaded rows. Pure; exported for tests. */
export function mapperKnowledgeFrom(rows: readonly IngredientRow[]): MapperKnowledge {
  const projected = rows.map(toMapperKnowledgeRow);
  return buildMapperKnowledge(projected, fingerprintMapperRows(projected));
}

let cached: Promise<MapperKnowledge> | null = null;

/**
 * Load and index the Mapper once per session.
 *
 * Indexing 2,000-odd rows into token, family and brand cohorts is not free, and
 * an import screen would otherwise redo it on every parse. The promise itself is
 * cached so concurrent callers share one fetch; a failed load is NOT cached, so
 * a transient outage does not disable Mapper inference for the whole session.
 */
export function loadMapperKnowledge(): Promise<MapperKnowledge> {
  if (!cached) {
    cached = listActiveIngredients()
      .then(mapperKnowledgeFrom)
      .catch((error: unknown) => {
        cached = null;
        throw error;
      });
  }
  return cached;
}

/** Drop the cached Mapper, so the next call re-reads it. */
export function resetMapperKnowledgeCache(): void {
  cached = null;
}
