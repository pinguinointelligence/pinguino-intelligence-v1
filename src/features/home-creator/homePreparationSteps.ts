/**
 * "Zróbmy to" — the order the customer weighs their recipe out in.
 *
 * OWNER QA 2026-09-06 (served, SOL-040): the button set `preparationStarted` and NOTHING was
 * rendered — on this branch and on `staging`. The copy for the stage
 * (`homeCreatorCopy.preparation`) had been written and never wired, so the customer's journey
 * stopped at the recipe.
 *
 * This module decides only the ORDER and the numbers already in the recipe. It starts no durable
 * production run, writes nothing, and calls no engine: the PRO production workspace
 * (`useProductionWorkspace`) remains the authority for a recorded run, and its repository is
 * reported unavailable in this build. A HOME customer weighing ingredients into a bowl needs the
 * list, not a record.
 */
import type { RecipeItem } from '@/engine';
import { isCatalogLabelToppingIngredient } from '@/features/recipe-composition/labelTopping';
import type { RecipeToppingItem } from '@/features/recipe-composition/recipeCompositionPersistence';

export interface HomePreparationStep {
  /** the recipe line this step weighs out */
  lineId: string;
  name: string;
  /** the amount the recipe asks for; `null` when the customer has not chosen one yet */
  grams: number | null;
  /** a post-process add-on goes in after churning, never into the base */
  stage: 'base' | 'topping';
}

const displayName = (name: string): string => name.trim();

/**
 * Base lines in the recipe's own order, then the add-ons. A line the recipe holds at 0 g is still
 * a step — the customer decided to have that product in the recipe, and the amount is theirs to
 * pick at the bowl; inventing a gram figure here would be a formulation decision this module has
 * no authority to make.
 */
export function homePreparationSteps(
  items: readonly RecipeItem[],
  toppings: readonly RecipeToppingItem[],
): readonly HomePreparationStep[] {
  const base = items.map<HomePreparationStep>((item) => ({
    lineId: item.id,
    name: displayName(item.ingredient.name),
    grams: item.planned_grams > 0 ? item.planned_grams : null,
    stage: 'base',
  }));
  const addons = toppings.map<HomePreparationStep>((topping) => ({
    lineId: topping.id,
    name: displayName(
      isCatalogLabelToppingIngredient(topping.ingredient)
        ? topping.ingredient.name
        : topping.ingredient.name,
    ),
    grams: topping.planned_grams > 0 ? topping.planned_grams : null,
    stage: 'topping',
  }));
  return [...base, ...addons];
}

/** Everything weighed out? An empty recipe is never "done". */
export function homePreparationComplete(
  steps: readonly HomePreparationStep[],
  weighed: ReadonlySet<string>,
): boolean {
  return steps.length > 0 && steps.every((step) => weighed.has(step.lineId));
}
