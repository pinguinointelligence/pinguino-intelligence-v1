import type { ProductCategory, RecipeInput } from '@/engine';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';

export type FlavourIngredientForm =
  | 'fresh'
  | 'frozen'
  | 'puree'
  | 'concentrate'
  | 'flavour_paste'
  | 'pure_nut_paste'
  | 'cocoa'
  | 'chocolate'
  | 'coffee'
  | 'vanilla'
  | 'other';

export interface FlavourFloorPolicy {
  policyId: string;
  canonicalIngredientId?: string;
  ingredientFamily?: string;
  ingredientForm: FlavourIngredientForm;
  productProfiles: readonly ProductCategory[];
  minimumGramsPerKgFinal: number | null;
  evidenceType: 'manufacturer_dosage' | 'manufacturer_recipe' | 'verified_internal';
  sourceUrl: string;
  confidence: 'high' | 'medium' | 'reference_only';
  ecoMayReduceMain: boolean;
  note: string;
}

/**
 * Deliberately small, exact-identity registry. Reference-only evidence never
 * authorises a reduction. Unknown is a valid production state and freezes the
 * user's Main baseline instead of extrapolating a universal percentage.
 */
export const FLAVOUR_FLOOR_REGISTRY: readonly FlavourFloorPolicy[] = [
  {
    policyId: 'pregel-strawberry-fortefrutto-20g-per-kg-base',
    canonicalIngredientId: 'PI-ING-000737',
    ingredientForm: 'concentrate',
    productProfiles: ['milk_gelato', 'sorbet', 'vegan_gelato'],
    minimumGramsPerKgFinal: 19.61,
    evidenceType: 'manufacturer_dosage',
    sourceUrl: 'https://shop.pregelamerica.com/strawberry-fortefrutto-45872',
    confidence: 'high',
    ecoMayReduceMain: true,
    note: '20 g per 1 kg base converted to 19.61 g per kg final mix.',
  },
  {
    policyId: 'pregel-raspberry-fortefrutto-20g-per-kg-base',
    canonicalIngredientId: 'PI-ING-000732',
    ingredientForm: 'concentrate',
    productProfiles: ['milk_gelato', 'sorbet', 'vegan_gelato'],
    minimumGramsPerKgFinal: 19.61,
    evidenceType: 'manufacturer_dosage',
    sourceUrl: 'https://shop.pregelamerica.com/raspberry-fortefrutto-46272',
    confidence: 'high',
    ecoMayReduceMain: true,
    note: '20 g per 1 kg base converted to 19.61 g per kg final mix.',
  },
  {
    policyId: 'mapper-hazelnut-pure-paste-70g-per-kg-base',
    canonicalIngredientId: 'PI-ING-000431',
    ingredientForm: 'pure_nut_paste',
    productProfiles: ['nut_gelato', 'milk_gelato', 'vegan_gelato'],
    minimumGramsPerKgFinal: 65.42,
    evidenceType: 'manufacturer_dosage',
    sourceUrl: 'https://pregelamerica.com/pga_collateral/PreGel_Product_Catalog.pdf',
    confidence: 'high',
    ecoMayReduceMain: true,
    note: '70 g per 1 kg base converted to 65.42 g per kg final mix.',
  },
  {
    policyId: 'mapper-prontociocc-100g-per-kg-base',
    canonicalIngredientId: 'PI-ING-000757',
    ingredientForm: 'chocolate',
    productProfiles: ['chocolate_gelato'],
    minimumGramsPerKgFinal: 90.91,
    evidenceType: 'manufacturer_dosage',
    sourceUrl: 'https://pregelamerica.com/pga_collateral/PreGel_Product_Catalog.pdf',
    confidence: 'high',
    ecoMayReduceMain: true,
    note: '100 g per 1 kg base converted to 90.91 g per kg final mix.',
  },
  {
    policyId: 'mapper-coffee-paste-70g-per-kg-base',
    canonicalIngredientId: 'PI-ING-000245',
    ingredientForm: 'coffee',
    productProfiles: ['milk_gelato', 'vegan_gelato'],
    minimumGramsPerKgFinal: 65.42,
    evidenceType: 'manufacturer_dosage',
    sourceUrl: 'https://pregelamerica.com/pga_collateral/PreGel_Product_Catalog.pdf',
    confidence: 'high',
    ecoMayReduceMain: true,
    note: '70 g per 1 kg base converted to 65.42 g per kg final mix.',
  },
  {
    policyId: 'fresh-fruit-reference-only',
    ingredientFamily: 'fresh_fruit',
    ingredientForm: 'fresh',
    productProfiles: ['milk_gelato', 'sorbet'],
    minimumGramsPerKgFinal: null,
    evidenceType: 'manufacturer_recipe',
    sourceUrl: 'https://en.fabbri1905.com/fabbri-products/nevia-crema-e-frutta-.kl',
    confidence: 'reference_only',
    ecoMayReduceMain: false,
    note: 'Confirms high fresh-fruit presence but not a universal production floor.',
  },
] as const;

export function resolveFlavourFloorPolicy(input: {
  canonicalIngredientId: string;
  ingredientFamily?: string;
  productProfile: ProductCategory;
}): FlavourFloorPolicy | null {
  const exact = FLAVOUR_FLOOR_REGISTRY.find(
    (policy) =>
      policy.canonicalIngredientId === input.canonicalIngredientId &&
      policy.productProfiles.includes(input.productProfile),
  );
  if (exact) return exact;
  if (!input.ingredientFamily) return null;
  return (
    FLAVOUR_FLOOR_REGISTRY.find(
      (policy) =>
        policy.ingredientFamily === input.ingredientFamily &&
        policy.productProfiles.includes(input.productProfile),
    ) ?? null
  );
}

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
  /** Optional exact sidecar. Family policies remain inert unless this is supplied. */
  ingredientFamilyByCanonicalId?: Readonly<Record<string, string | undefined>>;
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

    const policy = resolveFlavourFloorPolicy({
      canonicalIngredientId: canonicalId,
      ingredientFamily: context.ingredientFamilyByCanonicalId?.[canonicalId],
      productProfile: before.category,
    });
    const verified =
      policy !== null &&
      policy.ecoMayReduceMain &&
      policy.minimumGramsPerKgFinal !== null &&
      policy.confidence !== 'reference_only';
    const minimum = verified
      ? (policy.minimumGramsPerKgFinal! * after.target_batch_grams) / 1000
      : main.planned_grams;
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
