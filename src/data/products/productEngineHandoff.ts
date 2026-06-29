/**
 * Pure PRODUCT → engine-ingredient handoff adapter (read-only).
 *
 * A confirmed-matched product is handed to the recipe engine by borrowing the full, verified
 * composition + pac/pod of its matched `mapper_basement` reference — the product "is" that
 * reference for engine purposes (the product itself carries no water / total_solids /
 * sugar-type breakdown, so it cannot become a full EngineIngredient on its own). NOTHING is
 * copied onto the product row; this builds an in-memory `EngineIngredient` at compute time.
 *
 *   - PURE: reuses `ingredientRowToEngineIngredient` + `resolveProductEngineValues` +
 *     `detectRedFlags`. No DB, no recipe-engine math, no IO. Deterministic. No `npac_value`.
 *   - GATED: only a `mapper_status === 'matched'` product with a resolvable reference hands off.
 *   - HONEST: the produced ingredient is `is_verified: false` + an external source; the result
 *     flags `not_independently_measured` and surfaces any red-flag warnings + a `blocked` signal.
 *   - SAFE: the engine never sees raw OCR/catalog text — only the reference's clean profile;
 *     `pac_value`/`pod_value` are resolved (own-measured wins, else reference-linked), never
 *     copied back onto the product.
 */
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import type { EngineIngredient } from '@/engine';
import { blocksAutoVerify, detectRedFlags, type RedFlagInput } from './productRedFlags';
import { resolveProductEngineValues, type ProductEngineInput } from './productEngineResolver';

export interface ProductHandoffInput extends ProductEngineInput, RedFlagInput {
  product_code?: string | null;
  product_name_display?: string | null;
}

export interface ProductEngineHandoff {
  /** true when a usable EngineIngredient was produced (engine values resolvable). */
  ready: boolean;
  ingredient: EngineIngredient | null;
  provenance: 'product_measured' | 'reference_linked' | 'unresolved';
  not_independently_measured: boolean;
  /** red flags present — the caller must gate auto-use even when `ready`. */
  blocked_by_red_flags: boolean;
  warnings: string[];
  reason: string;
}

/**
 * Build the in-memory EngineIngredient for one product at recipe handoff. `reference` is the
 * full mapper_basement row the caller looked up by `product.matched_basement_id`. Pure;
 * writes nothing; never mutates the product or the reference.
 */
export function prepareProductEngineIngredient(
  product: ProductHandoffInput,
  reference: IngredientRow | null,
): ProductEngineHandoff {
  const redFlags = detectRedFlags(product);
  const blocked = blocksAutoVerify(redFlags);
  const resolution = resolveProductEngineValues(product, reference);

  if (!resolution.resolvable || !reference) {
    return {
      ready: false,
      ingredient: null,
      provenance: resolution.provenance,
      not_independently_measured: resolution.not_independently_measured,
      blocked_by_red_flags: blocked,
      warnings: redFlags.map((f) => f.reason),
      reason: !reference ? `No reference profile available for ${product.matched_basement_id ?? 'this product'}.` : resolution.reason,
    };
  }

  // Borrow the reference's clean, verified composition; override identity + resolved pac/pod.
  const base = ingredientRowToEngineIngredient(reference);
  const ingredient: EngineIngredient = {
    ...base,
    id: (product.product_code && product.product_code.trim()) || base.id,
    name: (product.product_name_display && product.product_name_display.trim()) || base.name,
    pac_value: resolution.pac_value,
    pod_value: resolution.pod_value,
    source_type: resolution.provenance === 'product_measured' ? 'producer_label' : 'external_db',
    is_verified: false,
    confidence_score: 0,
  };

  const warnings = redFlags.map((f) => f.reason);
  if (resolution.not_independently_measured) warnings.push(resolution.reason);

  return {
    ready: true,
    ingredient,
    provenance: resolution.provenance,
    not_independently_measured: resolution.not_independently_measured,
    blocked_by_red_flags: blocked,
    warnings,
    reason: blocked
      ? `Engine ingredient prepared, but red flags require review before use: ${redFlags.map((f) => f.code).join(', ')}.`
      : resolution.reason,
  };
}
