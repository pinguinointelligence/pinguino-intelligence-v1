import type { ProductCategory, RecipeInput, RecipeItem } from '@/engine';
import { resolveFunctionalRole } from '@/features/formulation/ingredientRoles';
import {
  assessGelatoStabilizerSystem,
  clampGelatoStabilizerComponentGrams,
  gelatoStabilizerSystemApplies,
} from './gelatoStabilizerSystemAuthority';
import {
  assessSorbetStabilizerSystem,
  clampSorbetStabilizerComponentGrams,
  sorbetStabilizerSystemApplies,
} from './sorbetStabilizerSystemAuthority';

export const ownerStabilizerSystemApplies = (category: ProductCategory): boolean =>
  gelatoStabilizerSystemApplies(category) || sorbetStabilizerSystemApplies(category);

export const ownerStabilizerSystemItems = (items: readonly RecipeItem[]): RecipeItem[] =>
  items.filter((item) => resolveFunctionalRole(item.ingredient) === 'stabilizer');

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
