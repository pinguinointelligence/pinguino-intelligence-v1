import type { EngineIngredient } from '@/engine';
import type { IngredientRow } from './ingredientRow';
import { VEGAN_VERIFIED_CANONICAL_IDS } from './verifiedVeganToolbox';

export type VeganEligibility =
  | 'VEGAN_VERIFIED'
  | 'VEGAN_FALSE'
  | 'VEGAN_UNKNOWN'
  | 'VEGAN_CONFLICT';

export interface VeganEligibilityAssessment {
  status: VeganEligibility;
  reasons: string[];
}

const PRIVATE_PRODUCT_VEGAN_REASON_PREFIX = 'private_product_vegan_';

type MapperVeganEvidence = Pick<
  IngredientRow,
  | 'approved_for_engines'
  | 'verification_status'
  | 'vegan'
  | 'dairy_free'
  | 'allergens'
  | 'ingredient_category'
  | 'ingredient_subcategory'
  | 'ingredient_name_internal'
  | 'ingredient_name_display'
  | 'milk_fat_percent'
  | 'non_fat_milk_solids_percent'
  | 'lactose_percent'
> & { is_active?: boolean };

const normalize = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const ANIMAL_CATEGORY_TOKENS = new Set([
  'dairy',
  'egg',
  'gelatin',
  'honey',
  'animal_fat',
]);

const ANIMAL_IDENTITY_PATTERN =
  /(^|[^a-z])(milk|cream|butter|whey|wpc|casein|caseinate|lactose|egg|gelatin|gelatine|honey|miod|jaj|mleko|smiet|serwat|kazein)([^a-z]|$)/;
const VERIFIED_PLANT_MILK_IDENTITY_PATTERN =
  /(^|[^a-z])(plant|oat|soy|soya|almond|rice|coconut|coco|cashew|hazelnut)[^,;]{0,24}(milk|drink|beverage)([^a-z]|$)/g;

const meaningfulPositive = (value: number | null | undefined): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value > 1e-9;

const reliablePositiveVeganEvidence = (row: MapperVeganEvidence): boolean =>
  row.vegan === 'true' &&
  row.approved_for_engines === true &&
  row.verification_status.startsWith('Verified') &&
  row.is_active !== false;

const animalEvidence = (row: MapperVeganEvidence): string[] => {
  const reasons: string[] = [];
  const category = normalize(row.ingredient_category);
  const subcategory = normalize(row.ingredient_subcategory);
  const identity = normalize(`${row.ingredient_name_internal} ${row.ingredient_name_display}`);
  const identityWithoutPlantMilk = identity.replace(VERIFIED_PLANT_MILK_IDENTITY_PATTERN, ' ');

  if (ANIMAL_CATEGORY_TOKENS.has(category) || ANIMAL_CATEGORY_TOKENS.has(subcategory)) {
    reasons.push('animal_category');
  }
  if (ANIMAL_IDENTITY_PATTERN.test(identityWithoutPlantMilk)) reasons.push('animal_identity');
  if (meaningfulPositive(row.milk_fat_percent)) reasons.push('milk_fat_present');
  if (meaningfulPositive(row.non_fat_milk_solids_percent)) reasons.push('milk_solids_present');
  if (meaningfulPositive(row.lactose_percent)) reasons.push('lactose_present');

  return reasons;
};

/**
 * Fail-closed Mapper classification. `dairy_free` and a blank allergen field are
 * deliberately never positive Vegan evidence. An allergen string is diagnostic
 * only: the current schema cannot distinguish ingredient composition from
 * precautionary cross-contact, so it cannot override canonical `vegan=true` by
 * itself. Composition/category/identity evidence can.
 */
export function assessMapperVeganEligibility(
  row: MapperVeganEvidence,
): VeganEligibilityAssessment {
  const animal = animalEvidence(row);
  const positive = reliablePositiveVeganEvidence(row);

  if (positive && animal.length > 0) {
    return { status: 'VEGAN_CONFLICT', reasons: ['verified_vegan_vs_animal_evidence', ...animal] };
  }
  if (row.vegan === 'false' || animal.length > 0) {
    return {
      status: 'VEGAN_FALSE',
      reasons: row.vegan === 'false' ? ['mapper_vegan_false', ...animal] : animal,
    };
  }
  if (positive) return { status: 'VEGAN_VERIFIED', reasons: ['verified_mapper_vegan_true'] };

  const reasons = ['insufficient_verified_vegan_evidence'];
  if (row.vegan === 'true') reasons.push('vegan_true_without_verified_engine_approval');
  if (row.vegan === 'unknown') reasons.push('mapper_vegan_unknown');
  if (row.dairy_free === 'true') reasons.push('dairy_free_is_not_vegan_evidence');
  return { status: 'VEGAN_UNKNOWN', reasons };
}

/** Runtime assessment for an already-mapped Engine ingredient. Mapper-derived
 * ingredients carry the canonical assessment in flags. Legacy/manual rows with
 * no proof remain UNKNOWN; explicit animal flags remain FALSE. */
export function assessEngineIngredientVeganEligibility(
  ingredient: EngineIngredient,
): VeganEligibilityAssessment {
  const flaggedStatus = ingredient.flags?.vegan_eligibility;
  const flaggedReasons = [...(ingredient.flags?.vegan_eligibility_reasons ?? [])];
  const hasAnimalFlag =
    ingredient.flags?.is_animal_origin === true || ingredient.flags?.is_dairy === true;

  // A contradictory flag bundle is never allowed to let positive Vegan metadata
  // override explicit animal-origin evidence.
  if (flaggedStatus === 'VEGAN_VERIFIED' && hasAnimalFlag) {
    return {
      status: 'VEGAN_CONFLICT',
      reasons: ['verified_vegan_vs_engine_animal_flag', ...flaggedReasons],
    };
  }

  // Private products borrow the matched Mapper row's composition and flags at
  // handoff. Only an assessment explicitly recomputed from THIS product's own
  // Vegan declaration may be trusted; inherited Mapper eligibility fails closed.
  if (ingredient.identity_provenance === 'private_product') {
    if (
      flaggedStatus &&
      flaggedReasons.some((reason) => reason.startsWith(PRIVATE_PRODUCT_VEGAN_REASON_PREFIX))
    ) {
      return { status: flaggedStatus, reasons: flaggedReasons };
    }
    if (hasAnimalFlag) return { status: 'VEGAN_FALSE', reasons: ['engine_animal_origin_flag'] };
    return {
      status: 'VEGAN_UNKNOWN',
      reasons: ['private_product_has_no_own_verified_vegan_evidence'],
    };
  }

  if (ingredient.flags?.vegan_eligibility) {
    return {
      status: ingredient.flags.vegan_eligibility,
      reasons: flaggedReasons,
    };
  }
  if (hasAnimalFlag) {
    return { status: 'VEGAN_FALSE', reasons: ['engine_animal_origin_flag'] };
  }
  const canonicalId = ingredient.canonical_ingredient_id ?? ingredient.id;
  if (VEGAN_VERIFIED_CANONICAL_IDS.has(canonicalId)) {
    return { status: 'VEGAN_VERIFIED', reasons: ['verified_canonical_mapper_identity'] };
  }
  return { status: 'VEGAN_UNKNOWN', reasons: ['engine_ingredient_has_no_verified_vegan_evidence'] };
}

export interface VeganRecipeEligibilityIssue {
  lineId: string;
  ingredientId: string;
  ingredientName: string;
  status: Exclude<VeganEligibility, 'VEGAN_VERIFIED'>;
  reasons: string[];
}

export function veganRecipeEligibilityIssues(
  items: readonly { id: string; ingredient: EngineIngredient; planned_grams: number }[],
): VeganRecipeEligibilityIssue[] {
  return items
    .filter((item) => item.planned_grams > 0)
    .flatMap((item) => {
      const assessment = assessEngineIngredientVeganEligibility(item.ingredient);
      if (assessment.status === 'VEGAN_VERIFIED') return [];
      return [
        {
          lineId: item.id,
          ingredientId: item.ingredient.id,
          ingredientName: item.ingredient.name,
          status: assessment.status,
          reasons: assessment.reasons,
        },
      ];
    });
}
