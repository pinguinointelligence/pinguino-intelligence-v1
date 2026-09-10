import type { RecipeInput } from '@/engine';

export type SorbetProjectionRole = 'water' | 'sweetener_sucrose' | 'sugar_freezing_control';

/**
 * The shared Sorbet Direction role classification. It mirrors the Engine's
 * closed-form projection without reproducing any POD/PAC/NPAC formula.
 */
export function sorbetProjectionRole(
  item: RecipeInput['items'][number],
): SorbetProjectionRole | null {
  const composition = item.ingredient.composition;
  const controlSugar =
    composition.dextrose_percent + composition.glucose_percent + composition.fructose_percent;
  if (composition.water_percent >= 99 && composition.solids_percent <= 1) return 'water';
  if (item.ingredient.category !== 'sugar') return null;
  if (composition.sucrose_percent > controlSugar) return 'sweetener_sucrose';
  if (controlSugar > composition.sucrose_percent) return 'sugar_freezing_control';
  return null;
}
