/**
 * Pure builder for the Studio "My Products" ingredient group. Turns the owner's CONFIRMED
 * products into engine-usable `EngineIngredient`s by linking through their matched reference
 * (via productEngineHandoff) — so a recipe can use a `PR-ING` product with the reference's
 * verified PAC/POD at calculation time, WITHOUT copying anything onto the product row.
 *
 *   - PURE: no DB, no service, no recipe-engine math, no IO. Deterministic. No npac_value.
 *   - GATED: only `mapper_status === 'matched'` products with a `matched_basement_id` AND a
 *     customer lifecycle status (pi_generated / manual_adjusted / pi_verified / pi_calculated)
 *     are included; rejected / draft / null products are excluded.
 *   - HONEST: each entry carries provenance — reference-linked (not independently measured) +
 *     any red-flag warnings — for the picker badge. No raw OCR/catalog text reaches the engine.
 */
import { prepareProductEngineIngredient } from './productEngineHandoff';
import { formatProductStatusLabel, type CustomerStatusLabel } from './productStatusDecision';
import {
  APPROVED_PI_CALCULATED_CODES,
  CLASS_DERIVED_PROVENANCE_LABEL,
  planClassDerivedActivations,
} from './productActivationPlan';
import type { EngineIngredient } from '@/engine';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import type { ProductRow } from './productRow';

/** Lifecycle statuses a product must have reached to be engine-selectable. */
export const PRODUCT_LIBRARY_STATUSES: ReadonlySet<string> = new Set([
  'pi_generated',
  'manual_adjusted',
  'pi_verified',
  'pi_calculated',
]);

export interface ProductLibraryProvenance {
  /** true → engine values are linked from the reference (or a class anchor), not an independent measurement. */
  reference_linked: boolean;
  blocked_by_red_flags: boolean;
  warnings: string[];
  /** customer-safe status label (PI Generated / Manual Adjusted / …); never "Mapper", never a %. */
  status_label: CustomerStatusLabel | null;
  /** true → engine values are CLASS-DERIVED (interpolated/adopted from same-class anchors). */
  class_derived?: boolean;
  /** the exact provenance line shown in Studio for a class-derived product. */
  provenance_note?: string;
}

export interface ProductEngineLibrary {
  source: 'my_products';
  ingredients: EngineIngredient[];
  /** EngineIngredient.id (the product_code) → provenance for the picker badge. */
  provenance: Map<string, ProductLibraryProvenance>;
}

/**
 * Build the "My Products" engine library from the owner's products + the reference rows
 * (keyed by ingredient_id). Pure; writes nothing; never mutates inputs.
 */
export function buildProductEngineLibrary(args: {
  products: readonly ProductRow[];
  referenceById: ReadonlyMap<string, IngredientRow>;
}): ProductEngineLibrary {
  const ingredients: EngineIngredient[] = [];
  const provenance = new Map<string, ProductLibraryProvenance>();

  const added = new Set<string>();
  for (const p of args.products) {
    if (p.mapper_status !== 'matched') continue;
    if (!p.matched_basement_id) continue;
    if (!PRODUCT_LIBRARY_STATUSES.has(p.status)) continue;

    const reference = args.referenceById.get(p.matched_basement_id) ?? null;
    const handoff = prepareProductEngineIngredient(p, reference);
    if (!handoff.ready || handoff.ingredient === null) continue;

    ingredients.push(handoff.ingredient);
    added.add(p.product_code);
    provenance.set(handoff.ingredient.id, {
      reference_linked: handoff.not_independently_measured,
      blocked_by_red_flags: handoff.blocked_by_red_flags,
      warnings: handoff.warnings,
      status_label: formatProductStatusLabel(p.status),
    });
  }

  // CLASS-DERIVED branch (PI Calculated activation) — additive, tightly gated. A product is
  // included ONLY when its code is owner-approved (APPROVED_PI_CALCULATED_CODES), its status is
  // persisted to `pi_calculated`, and the resolver yields a class-derived plan. The engine
  // ingredient carries the resolver's EPHEMERAL class-derived pac/pod; the product row's own
  // pac/pod are never read or written. The matched path above is unchanged.
  const approvedCodes = new Set(APPROVED_PI_CALCULATED_CODES);
  const approvedProducts = args.products.filter(
    (p) =>
      approvedCodes.has(p.product_code) &&
      p.status === 'pi_calculated' &&
      p.mapper_status !== 'matched' &&
      !added.has(p.product_code),
  );
  if (approvedProducts.length > 0) {
    const basement = [...args.referenceById.values()];
    const batch = planClassDerivedActivations({ products: approvedProducts, basement, approvedCodes });
    for (const plan of batch.approvedPlans) {
      if (added.has(plan.product_code)) continue;
      ingredients.push(plan.engine_ingredient);
      added.add(plan.product_code);
      provenance.set(plan.engine_ingredient.id, {
        reference_linked: true, // not an independent measurement of this product
        class_derived: true,
        provenance_note: plan.provenance_label,
        blocked_by_red_flags: false,
        warnings: plan.warnings,
        status_label: formatProductStatusLabel('pi_calculated'),
      });
    }
  }

  return { source: 'my_products', ingredients, provenance };
}

export { CLASS_DERIVED_PROVENANCE_LABEL };
