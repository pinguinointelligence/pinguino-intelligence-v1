import { copy } from '@/copy/en';
import type { RecipeState } from '@/stores/recipeStore';

const pm = copy.proMachine;

/** The calculation tier exactly as the recipe card spells it. */
export const RECIPE_TIER_LABEL = { optimal: 'OPTIMAL', eco: 'ECO' } as const;

/** Serving mode → the short label every recipe summary prints. */
export const RECIPE_SERVING_LABEL: Record<string, string> = {
  fresh: pm.serving.fresh,
  temp_minus_11: pm.serving.minus11,
  temp_minus_12: pm.serving.minus12,
  temp_minus_13: pm.serving.minus13,
  ninja_gelato: 'Ninja Gelato',
  ninja_swirl: 'Ninja Swirl',
};

export type RecipeProfileContextSource = Pick<
  RecipeState,
  | 'visibleProductType'
  | 'formulation_strategy'
  | 'target_temperature_c'
  | 'target_batch_grams'
  | 'machineKind'
  | 'servingModeId'
  | 'machineLabel'
>;

/**
 * ONE sentence naming the recipe's profile: product · tier · serving · target
 * batch (a Home machine names itself and its batch instead). The workbar card
 * and the PRO MOBILE UX v2 recipe bar print this same sentence, so the profile
 * a phone shows above the ingredients can never drift from the card.
 */
export function recipeProfileContextLabel(source: RecipeProfileContextSource): string {
  const product = copy.studio.goal.productTypes[source.visibleProductType];
  const serving = source.servingModeId
    ? (RECIPE_SERVING_LABEL[source.servingModeId] ?? `${source.target_temperature_c}°C`)
    : `${source.target_temperature_c}°C`;
  const tier =
    RECIPE_TIER_LABEL[source.formulation_strategy as keyof typeof RECIPE_TIER_LABEL] ??
    source.formulation_strategy;
  return source.machineKind === 'home' && source.machineLabel
    ? `${source.machineLabel} · ${source.target_batch_grams} g`
    : `${product} · ${tier} · ${serving} · ${source.target_batch_grams} g`;
}
