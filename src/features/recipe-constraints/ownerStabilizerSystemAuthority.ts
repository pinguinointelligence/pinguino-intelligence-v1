import type { ProductCategory, RecipeInput, RecipeItem } from '@/engine';
import { resolveFunctionalRole } from '@/features/formulation/ingredientRoles';
import {
  assessGelatoStabilizerSystem,
  clampGelatoStabilizerComponentGrams,
  gelatoStabilizerSystemApplies,
  gelatoStabilizerWholeGramBand,
} from './gelatoStabilizerSystemAuthority';
import {
  assessSorbetStabilizerSystem,
  clampSorbetStabilizerComponentGrams,
  sorbetStabilizerSystemApplies,
  sorbetStabilizerWholeGramBand,
} from './sorbetStabilizerSystemAuthority';

export const ownerStabilizerSystemApplies = (category: ProductCategory): boolean =>
  gelatoStabilizerSystemApplies(category) || sorbetStabilizerSystemApplies(category);

export const ownerStabilizerSystemItems = (items: readonly RecipeItem[]): RecipeItem[] =>
  items.filter((item) => resolveFunctionalRole(item.ingredient) === 'stabilizer');

/** The published whole-gram band of whichever owner stabilizer system governs
 * this product type. Callers must gate on `ownerStabilizerSystemApplies` first:
 * a product type with no published band has no whole-gram authority, and this
 * must never invent one for it. */
export function ownerStabilizerWholeGramBand(category: ProductCategory, baseGrams: number) {
  return sorbetStabilizerSystemApplies(category)
    ? sorbetStabilizerWholeGramBand(baseGrams)
    : gelatoStabilizerWholeGramBand(baseGrams);
}

export function assessOwnerStabilizerSystem(
  input: Pick<RecipeInput, 'category' | 'target_batch_grams' | 'items'>,
) {
  const sorbet = assessSorbetStabilizerSystem(input);
  return sorbet.applicable ? sorbet : assessGelatoStabilizerSystem(input);
}

export function clampOwnerStabilizerComponentGrams(
  input: Pick<RecipeInput, 'category' | 'target_batch_grams' | 'items'>,
  lineId: string,
  requestedGrams: number,
) {
  return sorbetStabilizerSystemApplies(input.category)
    ? clampSorbetStabilizerComponentGrams(input, lineId, requestedGrams)
    : clampGelatoStabilizerComponentGrams(input, lineId, requestedGrams);
}
