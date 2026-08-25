import type { RecipeInput } from '@/engine';
import {
  proteinRouteForRecipe,
  selectFormulationTemplateForRecipe,
} from '@/features/formulation/templateRegistry';
import {
  hasNativeSeededBands,
  internalCategoryFor,
  visibleTypeOf,
  type VisibleProductType,
} from '@/features/studio/productType';

/**
 * The Pro selector order is intentionally different from the global family list:
 * Gelato and Protein are adjacent because they share the most common dairy workflow.
 */
export const PRO_VISIBLE_PRODUCT_TYPES: readonly VisibleProductType[] = [
  'gelato',
  'protein',
  'sorbet',
  'vegan',
];

export type ProfileBaseFamily = 'dairy' | 'sorbet' | 'vegan' | 'protein_plant';
export type ProfileBaseFamilyContract = ProfileBaseFamily | 'dairy_or_plant';

/**
 * Product-family authority derived from the registered Designer/optimizer
 * contract. Protein owns a native profile and target, reuses the Standard
 * Gelato physical envelope, and selects either the approved dairy or plant
 * workflow from the actual recipe. Sorbet and Vegan each own a structurally
 * different base family.
 */
export const PROFILE_BASE_FAMILY: Readonly<
  Record<VisibleProductType, ProfileBaseFamilyContract>
> = {
  gelato: 'dairy',
  protein: 'dairy_or_plant',
  sorbet: 'sorbet',
  vegan: 'vegan',
};

const profileBaseFamilyFor = (
  input: RecipeInput,
  visibleType: VisibleProductType,
): ProfileBaseFamily => {
  if (visibleType === 'protein') {
    const proteinInput = { ...input, category: 'protein_gelato' as const };
    return proteinRouteForRecipe(proteinInput) === 'plant' ? 'protein_plant' : 'dairy';
  }
  return PROFILE_BASE_FAMILY[visibleType] as ProfileBaseFamily;
};

export type ProfileTransitionDecision =
  | {
      supported: true;
      kind: 'same_family' | 'new_base_required';
      nextCategory: RecipeInput['category'];
      templateId: string;
    }
  | {
      supported: false;
      nextCategory: RecipeInput['category'];
      message: string;
    };

/**
 * Classifies a profile transition from the same two authorities used by runtime:
 * native Engine bands and the approved formulation-template registry. It never
 * mutates the recipe and never guesses a replacement composition.
 */
export function classifyProfileTransition(
  input: RecipeInput,
  nextVisibleType: VisibleProductType,
  currentVisibleType: VisibleProductType = visibleTypeOf(input.category),
): ProfileTransitionDecision {
  const nextCategory = internalCategoryFor(nextVisibleType, input.items, input.category);
  const candidate = { ...input, category: nextCategory };
  const lookup = selectFormulationTemplateForRecipe(candidate);
  const currentFamily = profileBaseFamilyFor(input, currentVisibleType);
  const nextFamily = profileBaseFamilyFor(candidate, nextVisibleType);

  if (hasNativeSeededBands(nextCategory) && lookup.template?.status === 'approved') {
    return {
      supported: true,
      kind:
        currentFamily === nextFamily ? 'same_family' : 'new_base_required',
      nextCategory,
      templateId: lookup.template.templateId,
    };
  }

  return {
    supported: false,
    nextCategory,
    message:
      'Ten profil nie ma zatwierdzonej ścieżki dla bieżącego składu i temperatury. Receptura pozostała bez zmian.',
  };
}
