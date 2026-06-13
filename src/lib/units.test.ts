import { describe, expect, it } from 'vitest';
import { DENSITY_DEFAULTS } from '@/engine';
import { fromGrams, toGrams } from './units';

describe('unit conversion (engine always receives grams)', () => {
  it('passes grams through unchanged', () => {
    expect(toGrams(1000, 'g', 'milk_gelato')).toBe(1000);
  });

  it('converts kilograms', () => {
    expect(toGrams(2, 'kg', 'milk_gelato')).toBe(2000);
  });

  it('converts litres via the category density default', () => {
    expect(toGrams(1, 'l', 'milk_gelato')).toBeCloseTo(1000 * DENSITY_DEFAULTS.milk_gelato, 9);
  });

  it('honours a density override', () => {
    expect(toGrams(1, 'l', 'milk_gelato', 1.2)).toBeCloseTo(1200, 9);
  });

  it('fromGrams is the inverse of toGrams', () => {
    for (const unit of ['g', 'kg', 'l'] as const) {
      expect(fromGrams(toGrams(3, unit, 'sorbet'), unit, 'sorbet')).toBeCloseTo(3, 9);
    }
  });

  it('guards against negative or non-finite input', () => {
    expect(toGrams(-5, 'g', 'milk_gelato')).toBe(0);
    expect(toGrams(Number.NaN, 'kg', 'milk_gelato')).toBe(0);
  });
});
