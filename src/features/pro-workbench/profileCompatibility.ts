import type { RecipeInput } from '@/engine';
import { selectFormulationTemplateForRecipe } from '@/features/formulation/templateRegistry';
import {
  hasNativeSeededBands,
  internalCategoryFor,
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

export type ProfileTransitionDecision =
  | {
      supported: true;
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
): ProfileTransitionDecision {
  const nextCategory = internalCategoryFor(nextVisibleType, input.items, input.category);
  const candidate = { ...input, category: nextCategory };
  const lookup = selectFormulationTemplateForRecipe(candidate);

  if (hasNativeSeededBands(nextCategory) && lookup.template?.status === 'approved') {
    return {
      supported: true,
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
