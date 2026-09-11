import { describe, expect, it } from 'vitest';
import { HOME_TOPPING_DEFAULT_SHARE, defaultHomeToppingGrams } from './homeToppingDefault';

describe('OWNER OD-3 — a new HOME topping starts at 5 % of the current BASE mass', () => {
  it('is 5 % of the BASE, in whole grams', () => {
    expect(HOME_TOPPING_DEFAULT_SHARE).toBe(0.05);
    expect(defaultHomeToppingGrams([{ planned_grams: 600 }, { planned_grams: 400 }])).toBe(50);
    expect(defaultHomeToppingGrams([{ planned_grams: 523 }, { planned_grams: 219 }])).toBe(37);
  });

  it('reads only real BASE mass — no base, no invented amount', () => {
    expect(defaultHomeToppingGrams([])).toBe(0);
    expect(defaultHomeToppingGrams([{ planned_grams: 0 }])).toBe(0);
    expect(defaultHomeToppingGrams([{ planned_grams: Number.NaN }, { planned_grams: -5 }])).toBe(0);
  });
});
