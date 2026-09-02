import type { RecipeInput } from '@/engine';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';

export interface EcoFlavourViolation {
  code:
    | 'main_line_missing'
    | 'main_identity_changed'
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
  /** Retained for call-site compatibility. Sensory floor metadata is
   * informational and never authorizes or blocks a technical Main amount. */
  productBehaviorSnapshots?: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>;
}

const FLAVOUR_DEFINING_CATEGORIES = new Set(['fruit', 'nut_paste', 'chocolate_cocoa', 'flavor']);

/**
 * Trustless ECO flavour-identity gate. It fails closed for missing/relabeled
 * Main lines and rejects any new flavour-defining ingredient (paste,
 * concentrate, extract, aroma, fruit, nut or cocoa), not only rows carrying
 * the legacy booster flag. Main quantity and Multi-Main allocation belong to
 * the technical objective, constraint gate and `mainIngredientContract`.
 */
export function verifyEcoFlavourProtection(
  before: RecipeInput,
  after: RecipeInput,
  context: EcoFlavourVerificationContext = {},
): EcoFlavourProtection {
  void context;
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

    // Main grams are a technical objective. Historical ECO floors and the
    // entered amount are suggestions only; exactness is owned by the separate
    // gram constraint and verified by the constraint/Main identity gates.
  }

  // Multi-Main ratio authority lives in mainIngredientContract. Input grams
  // are deliberately not interpreted as a ratio here.

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
