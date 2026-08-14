import type { RecipeInput } from '@/engine';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';

export interface EcoFlavourViolation {
  code:
    | 'unknown_floor_reduced'
    | 'verified_floor_crossed'
    | 'main_line_missing'
    | 'main_identity_changed'
    | 'multi_main_ratio_changed'
    | 'automatic_flavour_ingredient_added';
  lineId: string;
  ingredientName: string;
  minimumGrams: number;
  actualGrams: number;
}

export type EcoFlavourProtection =
  | { ok: true; violations: [] }
  | { ok: false; violations: EcoFlavourViolation[] };

export interface EcoFlavourVerificationContext {
  /** Current UPI authority. Unmanaged/legacy rows freeze at their baseline;
   * no client registry may independently authorize a reduction. */
  productBehaviorSnapshots?: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>;
}

const FLAVOUR_DEFINING_CATEGORIES = new Set(['fruit', 'nut_paste', 'chocolate_cocoa', 'flavor']);
const EPSILON = 1e-7;
const RATIO_EPSILON = 1e-6;

/**
 * Trustless ECO gate. It fails closed for missing/relabeled Main lines, freezes
 * unknown or reference-only floors, preserves Multi-Main ratio and rejects any
 * new flavour-defining ingredient (paste, concentrate, extract, aroma, fruit,
 * nut or cocoa), not only rows carrying the legacy booster flag.
 */
export function verifyEcoFlavourProtection(
  before: RecipeInput,
  after: RecipeInput,
  context: EcoFlavourVerificationContext = {},
): EcoFlavourProtection {
  const afterByLine = new Map(after.items.map((item) => [item.id, item]));
  const beforeMains = before.items.filter(
    (item) => item.lock_type === 'main' && item.planned_grams > 0,
  );
  const violations: EcoFlavourViolation[] = [];

  for (const main of beforeMains) {
    const next = afterByLine.get(main.id);
    if (!next) {
      violations.push({
        code: 'main_line_missing',
        lineId: main.id,
        ingredientName: main.ingredient.name,
        minimumGrams: main.planned_grams,
        actualGrams: 0,
      });
      continue;
    }

    const canonicalId = canonicalIngredientId(main.ingredient);
    if (canonicalIngredientId(next.ingredient) !== canonicalId) {
      violations.push({
        code: 'main_identity_changed',
        lineId: main.id,
        ingredientName: main.ingredient.name,
        minimumGrams: main.planned_grams,
        actualGrams: next.planned_grams,
      });
      continue;
    }

    const snapshot = context.productBehaviorSnapshots?.[main.id];
    const snapshotFloor = snapshot?.resolutionState === 'RESOLVED' &&
      snapshot.moduleEligibility.ECO === 'eligible' &&
      snapshot.ecoFloorPercent !== null && snapshot.mainEquivalentFactor !== null &&
      snapshot.mainEquivalentFactor > 0
      ? (snapshot.ecoFloorPercent / 100) * after.target_batch_grams /
        snapshot.mainEquivalentFactor
      : null;
    const verified = snapshotFloor !== null;
    const minimum = snapshotFloor ?? main.planned_grams;
    if (next.planned_grams + EPSILON < minimum) {
      violations.push({
        code: verified ? 'verified_floor_crossed' : 'unknown_floor_reduced',
        lineId: main.id,
        ingredientName: main.ingredient.name,
        minimumGrams: minimum,
        actualGrams: next.planned_grams,
      });
    }
  }

  if (beforeMains.length > 1) {
    const beforeTotal = beforeMains.reduce((sum, item) => sum + item.planned_grams, 0);
    const nextMains = beforeMains.map((item) => afterByLine.get(item.id)).filter(Boolean);
    const afterTotal = nextMains.reduce((sum, item) => sum + item!.planned_grams, 0);
    if (afterTotal > 0) {
      for (const main of beforeMains) {
        const next = afterByLine.get(main.id);
        if (!next) continue;
        const beforeShare = main.planned_grams / beforeTotal;
        const afterShare = next.planned_grams / afterTotal;
        if (Math.abs(beforeShare - afterShare) > RATIO_EPSILON) {
          violations.push({
            code: 'multi_main_ratio_changed',
            lineId: main.id,
            ingredientName: main.ingredient.name,
            minimumGrams: main.planned_grams,
            actualGrams: next.planned_grams,
          });
        }
      }
    }
  }

  const beforeIds = new Set(before.items.map((item) => canonicalIngredientId(item.ingredient)));
  for (const item of after.items) {
    if (item.planned_grams <= 0) continue;
    const id = canonicalIngredientId(item.ingredient);
    const flavourDefining =
      item.ingredient.flags?.is_flavor_booster === true ||
      FLAVOUR_DEFINING_CATEGORIES.has(item.ingredient.category);
    if (flavourDefining && !beforeIds.has(id)) {
      violations.push({
        code: 'automatic_flavour_ingredient_added',
        lineId: item.id,
        ingredientName: item.ingredient.name,
        minimumGrams: 0,
        actualGrams: item.planned_grams,
      });
    }
  }

  return violations.length === 0 ? { ok: true, violations: [] } : { ok: false, violations };
}
