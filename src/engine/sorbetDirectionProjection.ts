import { resolveEffectiveItems } from './composition';
import { ingredientNpacContribution } from './pac';
import { ingredientPodContribution } from './pod';
import type { EffectiveRecipeItem, RecipeInput } from './types';

const EPSILON = 1e-8;

const perGram = (item: RecipeInput['items'][number]): EffectiveRecipeItem => ({
  ...item,
  planned_grams: 1,
  actual_grams: null,
  effective_grams: 1,
  difference: 0,
  is_actual: false,
});

const solve3x3 = (matrix: number[][], rhs: number[]): number[] | null => {
  const augmented = matrix.map((row, index) => [...row, rhs[index]!]);
  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) {
      if (Math.abs(augmented[row]![column]!) > Math.abs(augmented[pivot]![column]!)) pivot = row;
    }
    if (Math.abs(augmented[pivot]![column]!) <= EPSILON) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot]!, augmented[column]!];
    const divisor = augmented[column]![column]!;
    for (let index = column; index < 4; index += 1) augmented[column]![index]! /= divisor;
    for (let row = 0; row < 3; row += 1) {
      if (row === column) continue;
      const factor = augmented[row]![column]!;
      for (let index = column; index < 4; index += 1) {
        augmented[row]![index]! -= factor * augmented[column]![index]!;
      }
    }
  }
  const solved = augmented.map((row) => row[3]!);
  return solved.every(Number.isFinite) ? solved : null;
};

export interface SorbetDirectionProjectionTarget {
  podCenter: number;
  npacCenter: number;
}

/**
 * Engine-owned closed-form candidate for the canonical Sorbet
 * water+sucrose+freezing-control scaffold. This is only a candidate generator;
 * normal hard bands, constraints and Preview/Apply gates still decide whether
 * the result is executable.
 */
export function projectSorbetDirectionCandidate(
  input: RecipeInput,
  target: SorbetDirectionProjectionTarget,
): RecipeInput | null {
  if (
    input.category !== 'sorbet' ||
    input.goals?.direction_targets_active !== true ||
    input.items.some((item) => item.actual_grams !== null) ||
    !Number.isFinite(target.podCenter) ||
    !Number.isFinite(target.npacCenter)
  ) {
    return null;
  }

  const projectionRole = (item: RecipeInput['items'][number]) => {
    const composition = item.ingredient.composition;
    const controlSugar =
      composition.dextrose_percent + composition.glucose_percent + composition.fructose_percent;
    if (composition.water_percent >= 99 && composition.solids_percent <= 1) return 'water';
    if (item.ingredient.category !== 'sugar') return null;
    if (composition.sucrose_percent > controlSugar) return 'sweetener_sucrose';
    if (controlSugar > composition.sucrose_percent) return 'sugar_freezing_control';
    return null;
  };
  const variables = input.items.filter((item) => projectionRole(item) !== null);
  if (variables.length !== 3) return null;
  const byRole = new Map(variables.map((item) => [projectionRole(item), item] as const));
  const ordered = [
    byRole.get('sweetener_sucrose'),
    byRole.get('sugar_freezing_control'),
    byRole.get('water'),
  ];
  if (ordered.some((item) => item === undefined)) return null;

  const fixedItems = resolveEffectiveItems(
    input.items.filter((item) => !variables.some((variable) => variable.id === item.id)),
  );
  const fixedMass = fixedItems.reduce((sum, item) => sum + item.effective_grams, 0);
  const fixedPod = fixedItems.reduce((sum, item) => sum + ingredientPodContribution(item), 0);
  const fixedNpac = fixedItems.reduce((sum, item) => sum + ingredientNpacContribution(item), 0);
  const fixedWater = fixedItems.reduce(
    (sum, item) => sum + (item.effective_grams * item.ingredient.composition.water_percent) / 100,
    0,
  );
  const coefficients = ordered.map((item) => {
    const effective = perGram(item!);
    return {
      pod: ingredientPodContribution(effective),
      npac: ingredientNpacContribution(effective),
      water: effective.ingredient.composition.water_percent / 100,
    };
  });
  const npacRatio = target.npacCenter / 100;
  const solved = solve3x3(
    [
      [1, 1, 1],
      coefficients.map((coefficient) => coefficient.pod),
      coefficients.map((coefficient) => coefficient.npac - npacRatio * coefficient.water),
    ],
    [
      input.target_batch_grams - fixedMass,
      (target.podCenter * input.target_batch_grams) / 100 - fixedPod,
      npacRatio * fixedWater - fixedNpac,
    ],
  );
  if (!solved || solved.some((grams) => grams < -EPSILON)) return null;

  const gramsById = new Map(ordered.map((item, index) => [item!.id, Math.max(0, solved[index]!)]));
  return {
    ...input,
    items: input.items.map((item) => {
      const grams = gramsById.get(item.id);
      return grams === undefined ? item : { ...item, planned_grams: grams };
    }),
  };
}
