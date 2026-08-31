import { describe, expect, it } from 'vitest';
import {
  RECALCULATION_MARKER_EPSILON_GRAMS,
  recalculatedIngredientLineIds,
  type RecalculationMarkerLine,
} from './ingredientChangeHighlight';

const line = (overrides: Partial<RecalculationMarkerLine> = {}): RecalculationMarkerLine => ({
  id: 'line-1',
  ingredientId: 'milk_3_5',
  plannedGrams: 670,
  lockType: 'unlocked',
  ...overrides,
});

describe('recalculatedIngredientLineIds', () => {
  it('marks nothing for an unchanged line or an all-unchanged NO-OP', () => {
    expect([...recalculatedIngredientLineIds([line()], [line()])]).toEqual([]);
  });

  it.each([
    ['grams', { plannedGrams: 671 }],
    ['lock', { lockType: 'grams' }],
    ['Main crown', { lockType: 'main' }],
    ['product substitution', { ingredientId: 'milk_1_5' }],
  ])('marks a real %s change', (_label, patch) => {
    expect([
      ...recalculatedIngredientLineIds([line()], [line(patch as Partial<RecalculationMarkerLine>)]),
    ]).toEqual(['line-1']);
  });

  it('absorbs residue at or below the displayed-row epsilon', () => {
    expect([
      ...recalculatedIngredientLineIds(
        [line()],
        [line({ plannedGrams: 670 + RECALCULATION_MARKER_EPSILON_GRAMS })],
      ),
    ]).toEqual([]);
  });
});
