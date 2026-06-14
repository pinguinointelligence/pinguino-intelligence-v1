/**
 * Saved-recipe payload + load validation (Phase 2A.2) — PURE, no DB client.
 *
 * `recipe_input` is the stored SOURCE OF TRUTH; the engine recomputes everything
 * from it via calculateRecipe. We stamp provenance (active engine label + engine
 * / config versions) but store NO calculated values. The load schema is a
 * pragmatic safety gate — enough to load a saved recipe and run calculateRecipe —
 * NOT a full mirror of the engine types (future engine fields must not break old
 * saves, so object schemas are loose and stored values are optional).
 */
import { z } from 'zod';
import { ACTIVE_ENGINE } from '@/data/engines';
import { DEFAULT_SERVING_PROFILE_ID, type ServingProfileId } from '@/data/servingProfiles';
import type { ProductProfileId } from '@/data/productProfiles';
import { CONFIG_VERSION, ENGINE_VERSION, type ProductCategory, type RecipeInput } from '@/engine';

/** A saved recipe row (mirrors the DB columns; recipe_input validated on load). */
export interface SavedRecipe {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  recipe_input: unknown;
  product_type: string | null;
  serving_profile: string | null;
  active_engine_label: string;
  engine_version: string;
  config_version: string;
  batch_grams: number;
  created_at: string;
  updated_at: string;
}

/** The insert/update payload — user_id is set by the service from the session. */
export interface SaveRecipeInput {
  name: string;
  description: string | null;
  recipe_input: RecipeInput;
  product_type: string | null;
  serving_profile: string;
  active_engine_label: string;
  engine_version: string;
  config_version: string;
  batch_grams: number;
}

/** Reverse-map the engine category to a product direction when one applies.
 * Categories with no product-type profile (fruit/nut/chocolate/alcohol/custom)
 * are genuinely underivable → null (per the approved derivation rule). */
const PRODUCT_BY_CATEGORY: Partial<Record<ProductCategory, ProductProfileId>> = {
  milk_gelato: 'gelato',
  sorbet: 'sorbet',
  vegan_gelato: 'vegan',
};

export function deriveProductType(
  intakeProductId: ProductProfileId | null,
  category: ProductCategory,
): string | null {
  return intakeProductId ?? PRODUCT_BY_CATEGORY[category] ?? null;
}

export function deriveServingProfile(intakeServingId: ServingProfileId | null): string {
  // Always derivable: fall back to the connected −11°C display profile.
  return intakeServingId ?? DEFAULT_SERVING_PROFILE_ID;
}

/** Build the save payload from a RecipeInput + the AI-intake selections (if any).
 * Stamps the active engine label and engine/config versions; stores no results. */
export function buildSavePayload(args: {
  name: string;
  description?: string | null;
  recipeInput: RecipeInput;
  intakeProductId: ProductProfileId | null;
  intakeServingId: ServingProfileId | null;
}): SaveRecipeInput {
  return {
    name: args.name.trim(),
    description: args.description?.trim() || null,
    recipe_input: args.recipeInput,
    product_type: deriveProductType(args.intakeProductId, args.recipeInput.category),
    serving_profile: deriveServingProfile(args.intakeServingId),
    active_engine_label: ACTIVE_ENGINE.label,
    engine_version: ENGINE_VERSION,
    config_version: CONFIG_VERSION,
    batch_grams: args.recipeInput.target_batch_grams,
  };
}

/* ── pragmatic load schema (loose: tolerant of extra/future fields) ───────── */

const composition = z.record(z.string(), z.number()); // per-100g numeric fields only

const ingredient = z.looseObject({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  composition,
  pod_value: z.number().nullable(),
  pac_value: z.number().nullable(),
  npac_value: z.number().nullable(),
  de_value: z.number().nullable(),
  cost_per_kg: z.number().nullable(),
  confidence_score: z.number(),
  source_type: z.string(),
  is_verified: z.boolean(),
});

const item = z.looseObject({
  id: z.string(),
  ingredient,
  planned_grams: z.number(),
  actual_grams: z.number().nullable(),
  lock_type: z.string(),
});

export const recipeInputSchema = z.looseObject({
  items: z.array(item),
  mode: z.string(),
  category: z.string(),
  target_temperature_c: z.number(),
  target_batch_grams: z.number(),
  machine_capacity_grams: z.number().nullable(),
  goals: z.looseObject({}).optional(),
});

/** Validate a saved `recipe_input` and return it as a usable RecipeInput.
 * Throws (zod) if the shape is unsafe to load. The loose schema keeps unknown
 * fields, so newer saved recipes still load on the current engine. */
export function savedToRecipeInput(recipeInputJson: unknown): RecipeInput {
  return recipeInputSchema.parse(recipeInputJson) as unknown as RecipeInput;
}
