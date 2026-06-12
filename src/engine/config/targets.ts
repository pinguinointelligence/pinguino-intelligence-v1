/**
 * Target ranges by (product category, target serving temperature) — spec §9.
 * Data only: band lookup/interpolation arrives with statuses.ts (4C).
 *
 * The milk gelato @ −11 °C band is seeded verbatim from the LOCKED spec.
 * Further categories/temperatures arrive as 'estimated' bands with 4C — they are
 * deliberately not invented in the foundation step.
 */
import type { TargetBand } from '../types';

export const TARGET_BANDS: readonly TargetBand[] = [
  {
    category: 'milk_gelato',
    temperature_c: -11,
    status: 'seeded',
    metrics: {
      pod: { min: 12, max: 17 },
      npac: { min: 33, max: 42 },
      ice_fraction: { min: 45, max: 54.5 },
      lactose: { min: 4, max: 6 },
      lactose_sandiness_risk: { min: 5, max: 9 },
      fat: { min: 5, max: 12 },
      aerating_protein: { min: 3, max: 6 },
      protein_in_solids: { min: 9, max: 13 },
      total_solids: { min: 31, max: 45 },
      water: { min: 57, max: 70 },
      alcohol: { min: 0, max: 2.5, warn_above: 2.5 },
    },
  },
];
