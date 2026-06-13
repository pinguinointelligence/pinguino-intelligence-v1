/**
 * Batch-size unit conversion. The engine ALWAYS receives grams (spec §6); the
 * UI may let the user enter grams, kilograms or litres. Litres convert via the
 * engine's per-category density defaults (masterplan Page 1) — a user override
 * always wins. No recipe math here, only unit arithmetic.
 */
import { DENSITY_DEFAULTS, type ProductCategory } from '@/engine';

export type BatchUnit = 'g' | 'kg' | 'l';

export const BATCH_UNITS: readonly BatchUnit[] = ['g', 'kg', 'l'];

/** Resolve a typed amount + unit to grams. Litres use the category density
 * estimate (g/ml × 1000 ml/L) unless an explicit override is supplied. */
export function toGrams(
  amount: number,
  unit: BatchUnit,
  category: ProductCategory,
  densityOverride?: number,
): number {
  if (!Number.isFinite(amount) || amount < 0) return 0;
  switch (unit) {
    case 'g':
      return amount;
    case 'kg':
      return amount * 1000;
    case 'l':
      return amount * 1000 * (densityOverride ?? DENSITY_DEFAULTS[category]);
  }
}

/** Inverse of toGrams for display when the user is working in kg/L. */
export function fromGrams(
  grams: number,
  unit: BatchUnit,
  category: ProductCategory,
  densityOverride?: number,
): number {
  switch (unit) {
    case 'g':
      return grams;
    case 'kg':
      return grams / 1000;
    case 'l':
      return grams / (1000 * (densityOverride ?? DENSITY_DEFAULTS[category]));
  }
}
