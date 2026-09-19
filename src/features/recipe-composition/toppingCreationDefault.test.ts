import { describe, expect, it } from 'vitest';
import { TOPPING_CREATION_DEFAULT_SHARE, toppingCreationDefaultGrams } from './toppingCreationDefault';

describe('OWNER OD-3 — a new topping without a confirmed amount starts at 5 % of the BASE', () => {
  it('is 5 % of the BASE, in whole grams', () => {
    expect(TOPPING_CREATION_DEFAULT_SHARE).toBe(0.05);
    expect(toppingCreationDefaultGrams([{ planned_grams: 600 }, { planned_grams: 400 }])).toBe(50);
    expect(toppingCreationDefaultGrams([{ planned_grams: 523 }, { planned_grams: 219 }])).toBe(37);
  });

  it('reads only real BASE mass — no base, no invented amount', () => {
    expect(toppingCreationDefaultGrams([])).toBe(0);
    expect(toppingCreationDefaultGrams([{ planned_grams: 0 }])).toBe(0);
    expect(toppingCreationDefaultGrams([{ planned_grams: Number.NaN }, { planned_grams: -5 }])).toBe(0);
  });
});
