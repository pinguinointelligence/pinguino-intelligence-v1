import { describe, expect, it } from 'vitest';
import {
  recalculatedIngredientLineIds,
  type RecalculationMarkerLine,
} from './ingredientChangeHighlight';

const line = (
  id: string,
  plannedGrams: number,
  ingredientId = id,
  lockType = 'unlocked',
): RecalculationMarkerLine => ({ id, ingredientId, plannedGrams, lockType });

describe('ingredient marker — last Recalculate truth', () => {
  const before = [
    line('milk', 657),
    line('cream', 95),
    line('smp', 49),
    line('sucrose', 85),
    line('dextrose', 71),
    line('tara', 3),
    line('apple', 40),
  ];

  it('marks only real before/after changes; unchanged APPLE and TARA stay neutral', () => {
    const after = before.map((item) => {
      if (item.id === 'milk') return { ...item, plannedGrams: 664.7 };
      if (item.id === 'cream') return { ...item, plannedGrams: 96 };
      return { ...item };
    });

    expect([...recalculatedIngredientLineIds(before, after)]).toEqual(['milk', 'cream']);
    expect(recalculatedIngredientLineIds(before, after).has('apple')).toBe(false);
    expect(recalculatedIngredientLineIds(before, after).has('tara')).toBe(false);
  });

  it('treats numerical noise within epsilon as NO-OP', () => {
    const after = before.map((item) =>
      item.id === 'apple' ? { ...item, plannedGrams: item.plannedGrams + 1e-7 } : item,
    );
    expect([...recalculatedIngredientLineIds(before, after)]).toEqual([]);
  });

  it('treats product substitution and lock changes as real recalculation changes', () => {
    const after = before.map((item) =>
      item.id === 'apple'
        ? { ...item, ingredientId: 'pear' }
        : item.id === 'tara'
          ? { ...item, lockType: 'grams' }
          : item,
    );
    expect([...recalculatedIngredientLineIds(before, after)]).toEqual(['tara', 'apple']);
  });

  it('marks a genuinely added line and ignores removed rows that are no longer renderable', () => {
    expect([...recalculatedIngredientLineIds(before, [...before, line('inulin', 12)])]).toEqual([
      'inulin',
    ]);
    expect([
      ...recalculatedIngredientLineIds(before, before.filter((item) => item.id !== 'apple')),
    ]).toEqual([]);
  });
});
