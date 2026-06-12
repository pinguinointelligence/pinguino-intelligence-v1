/**
 * Density defaults for converting liters → grams by product category (g/ml).
 * Spec/masterplan Page 1 rule: these are ESTIMATES used only to propose a batch
 * mass — the user can always confirm or override, and the override always wins.
 * The conversion helper itself arrives with 4C/lib; this is data only.
 */
import type { ProductCategory } from '../types';

export const DENSITY_DEFAULTS: Record<ProductCategory, number> = {
  milk_gelato: 1.08,
  fruit_gelato: 1.09,
  nut_gelato: 1.08,
  chocolate_gelato: 1.12,
  alcohol_gelato: 1.06,
  sorbet: 1.12,
  vegan_gelato: 1.08,
  custom: 1.08,
};
