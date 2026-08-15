import type { ProductCategory, RecipeItem } from '@/engine';
import { approvedFormulationToolboxIngredients } from '@/features/formulation/formulate';
import { selectFormulationTemplate } from '@/features/formulation/templateRegistry';
import type { VisibleProductType } from '@/features/studio/productType';

const DEFAULT_STARTER_TEMPERATURE_C = -12;
const DEFAULT_STARTER_BATCH_G = 1_000;

const starterCategory = (visible: VisibleProductType): ProductCategory => {
  switch (visible) {
    case 'gelato':
      return 'milk_gelato';
    case 'sorbet':
      return 'sorbet';
    case 'vegan':
      return 'vegan_gelato';
    case 'protein':
      return 'protein_gelato';
  }
};

export interface CanonicalNewRecipeStarter {
  templateId: string;
  visibleProductType: VisibleProductType;
  category: ProductCategory;
  targetTemperatureC: number;
  targetBatchGrams: number;
  items: RecipeItem[];
}

/**
 * Builds the neutral technological scaffold from the approved formulation
 * registry. Roles without an approved toolbox identity (for example a fruit
 * Main in Sorbet) remain deliberately absent: a new draft must never invent a
 * flavour or silently promote a commercial product.
 */
export function buildCanonicalNewRecipeStarter(input: {
  visibleProductType: VisibleProductType;
  targetTemperatureC?: number;
  targetBatchGrams?: number;
}): CanonicalNewRecipeStarter {
  const category = starterCategory(input.visibleProductType);
  const requestedTemperature = input.targetTemperatureC ?? DEFAULT_STARTER_TEMPERATURE_C;
  const requested = selectFormulationTemplate(category, requestedTemperature);
  const fallback =
    requested.template === null
      ? selectFormulationTemplate(category, DEFAULT_STARTER_TEMPERATURE_C)
      : requested;
  const template = fallback.template;
  if (!template) {
    throw new Error(`No approved new-recipe starter for ${category} at ${requestedTemperature}C.`);
  }
  const targetBatchGrams =
    Number.isFinite(input.targetBatchGrams) && (input.targetBatchGrams ?? 0) > 0
      ? input.targetBatchGrams!
      : DEFAULT_STARTER_BATCH_G;
  const scale = targetBatchGrams / template.baseBatchG;
  const items = template.roles.flatMap((roleTarget, index): RecipeItem[] => {
    if (!roleTarget.toolboxId || roleTarget.grams <= 0) return [];
    const ingredient = approvedFormulationToolboxIngredients(roleTarget.toolboxId).at(-1);
    if (!ingredient) {
      throw new Error(
        `Approved starter ${template.templateId} is missing toolbox identity ${roleTarget.toolboxId}.`,
      );
    }
    return [
      {
        id: `new-recipe-${index}-${roleTarget.toolboxId}`,
        ingredient: structuredClone(ingredient),
        planned_grams: roleTarget.grams * scale,
        actual_grams: null,
        lock_type: 'unlocked',
      },
    ];
  });

  return {
    templateId: template.templateId,
    visibleProductType: input.visibleProductType,
    category,
    targetTemperatureC: template.temperatureC,
    targetBatchGrams,
    items,
  };
}
