/**
 * The saved recipe's OWN metadata, derived from what the save actually persisted (owner defect v1.4).
 *
 * „Moje receptury" used to read three denormalized `saved_recipes` columns that the canonical save
 * path (pro-core `RecipesRepository`) never writes:
 *   • `product_type`        → always NULL           → TYP: „—" for every recipe ever saved;
 *   • `serving_profile`     → always NULL           → TRYB: „—" for every recipe ever saved;
 *   • `active_engine_label` → DB default (migration 0001, `'−11°C Engine'`)
 *                                                    → SILNIK: „−11°C Engine" even for a −12°C save.
 * The columns were a legacy `services/recipes.ts` contract; the canonical path stores the whole
 * user/executable state inside `recipe_input` (Engine fields + the `pinguino_profile_v1` sidecar)
 * and never mirrored it back. So the library was showing initialization defaults, not the recipe.
 *
 * Fix, in two independent layers:
 *   1. the save path now mirrors these columns honestly (see `savedRecipeColumnsFromInput`), and
 *   2. every DISPLAY reads THIS module, which treats the persisted `recipe_input` as the authority
 *      and only falls back to a column when the input cannot answer. Layer 2 means the ~30 recipes
 *      already stored with NULL columns display correctly too — with no historical data rewrite.
 *
 * PURE: no DB client, no store, no React. Tolerant of legacy/loose JSON by construction.
 */
import { copy } from '@/copy/en';
import { ACTIVE_ENGINE } from '@/data/engines';
import { engineRouteLabel } from '@/features/studio/engineRouteLabel';
import { deriveProductType } from './recipePayload';
import type { ProductCategory } from '@/engine';

const PROFILE_METADATA_KEY = 'pinguino_profile_v1' as const;

/** The four customer-visible product types (`copy.productTypes` keys used by the library). */
const VISIBLE_PRODUCT_TYPES = new Set(['gelato', 'sorbet', 'vegan', 'protein']);
const FORMULATION_STRATEGIES = new Set(['eco', 'optimal']);

export type FormulationStrategyId = 'eco' | 'optimal';

export interface SavedRecipeMetadata {
  /** Customer-visible product type id (`gelato` | `sorbet` | `vegan` | `protein`), or null. */
  productType: string | null;
  /** The Pro serving selection this recipe was saved with (`temp_minus_12`, `fresh`, …). */
  servingModeId: string | null;
  /** The saved serving temperature in °C — the Engine route the recipe belongs to. */
  temperatureC: number | null;
  /** ECO / OPTIMAL — the product-layer formulation objective the recipe was saved with. */
  formulationStrategy: FormulationStrategyId | null;
  /** The saved batch size in grams. */
  batchGrams: number | null;
}

/** Everything the library renders for one row, already localized. `—` where truly unknown. */
export interface SavedRecipeMetadataLabels {
  /** TYP */
  productType: string;
  /** TRYB — `ECO` / `OPTIMAL` */
  mode: string;
  /** SILNIK — the saved serving route (`−12°C`, `Świeże`), never a build-time constant. */
  engine: string;
  /** ILOŚĆ */
  batch: string;
}

/** The legacy denormalized columns a row may carry. All optional: they are the LAST resort. */
export interface SavedRecipeColumns {
  product_type?: string | null;
  serving_profile?: string | null;
  active_engine_label?: string | null;
  batch_grams?: number | null;
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const finiteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const nonEmptyString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

const strategyOf = (value: unknown): FormulationStrategyId | null => {
  const text = nonEmptyString(value);
  return text && FORMULATION_STRATEGIES.has(text) ? (text as FormulationStrategyId) : null;
};

/**
 * Read the metadata a save persisted. The stored `recipe_input` is the authority: its
 * `pinguino_profile_v1` sidecar carries the exact Pro selections (visible type, ECO/OPTIMAL,
 * serving mode, temperature, batch) and its Engine fields carry the rest. Columns answer only
 * what the input cannot.
 */
export function readSavedRecipeMetadata(
  recipeInput: unknown,
  columns: SavedRecipeColumns = {},
): SavedRecipeMetadata {
  const input = record(recipeInput);
  const profile = record(input[PROFILE_METADATA_KEY]);
  const goals = record(input.goals);

  const visibleType = nonEmptyString(profile.visibleProductType);
  const category = nonEmptyString(input.category);
  const productType =
    (visibleType && VISIBLE_PRODUCT_TYPES.has(visibleType) ? visibleType : null) ??
    (category ? deriveProductType(null, category as ProductCategory) : null) ??
    nonEmptyString(columns.product_type);

  const temperatureC =
    finiteNumber(profile.targetTemperatureC) ?? finiteNumber(input.target_temperature_c);

  return {
    productType,
    servingModeId: nonEmptyString(profile.servingModeId) ?? nonEmptyString(columns.serving_profile),
    temperatureC,
    formulationStrategy:
      strategyOf(profile.formulationStrategy) ?? strategyOf(goals.formulation_strategy),
    batchGrams: finiteNumber(input.target_batch_grams) ?? finiteNumber(columns.batch_grams),
  };
}

const PRODUCT_LABELS = copy.productTypes as Record<string, { readonly label: string }>;

/** Localize one row's metadata for the library list. */
export function savedRecipeMetadataLabels(
  metadata: SavedRecipeMetadata,
  fallbackEngineLabel: string | null = null,
): SavedRecipeMetadataLabels {
  const engine =
    metadata.temperatureC === null
      ? (fallbackEngineLabel ?? '—')
      : metadata.servingModeId === 'fresh'
        ? 'Świeże'
        : engineRouteLabel(metadata.servingModeId, metadata.temperatureC).main.replace(
            /^Silnik\s+/,
            '',
          );
  return {
    productType: metadata.productType
      ? (PRODUCT_LABELS[metadata.productType]?.label ?? metadata.productType)
      : '—',
    mode: metadata.formulationStrategy ? metadata.formulationStrategy.toUpperCase() : '—',
    engine,
    batch: metadata.batchGrams === null ? '—' : `${Math.round(metadata.batchGrams)} g`,
  };
}

/**
 * The honest values for the denormalized `saved_recipes` columns, so the DB row stops contradicting
 * the recipe it stores. Written by every canonical save path (create / new version / restore).
 * `active_engine_label` keeps naming the engine that actually RAN the calculation (only −11°C is
 * calibrated today, see `data/engines.ts`) whenever the recipe routes there, and otherwise names
 * the serving route the recipe was saved for — never a build-time constant stamped over a −12°C save.
 */
export function savedRecipeColumnsFromInput(recipeInput: unknown): {
  product_type: string | null;
  serving_profile: string | null;
  active_engine_label: string;
} {
  const metadata = readSavedRecipeMetadata(recipeInput);
  return {
    product_type: metadata.productType,
    serving_profile: metadata.servingModeId,
    active_engine_label:
      metadata.temperatureC === null
        ? ACTIVE_ENGINE.label
        : metadata.servingModeId === 'fresh'
          ? 'Świeże'
          : engineRouteLabel(metadata.servingModeId, metadata.temperatureC).main,
  };
}
