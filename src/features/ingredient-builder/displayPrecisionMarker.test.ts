import { describe, expect, it } from 'vitest';
import { recalculatedIngredientLineIds } from './ingredientChangeHighlight';

const markedFor = (beforeGrams: number, afterGrams: number) => [
  ...recalculatedIngredientLineIds(
    [{ id: 'line-1', ingredientId: 'sucrose', plannedGrams: beforeGrams, lockType: 'unlocked' }],
    [{ id: 'line-1', ingredientId: 'sucrose', plannedGrams: afterGrams, lockType: 'unlocked' }],
  ),
];

describe('Recalculate marker display precision', () => {
  it.each([
    ['served SUCROSE residue', 135, 135.0004],
    ['served INULIN residue', 121, 120.9996],
    ['half display step upward', 3, 3.05],
    ['pure float noise', 480, 480.000000001],
  ])('%s → NO marker', (_label, before, after) => {
    expect(markedFor(before, after)).toEqual([]);
  });

  it.each([
    ['one visible tenth', 135, 135.1],
    ['served MILK edit', 480, 485],
    ['visible rebalance', 480, 474.9],
  ])('%s → marker', (_label, before, after) => {
    expect(markedFor(before, after)).toEqual(['line-1']);
  });
});
