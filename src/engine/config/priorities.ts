/**
 * The Golden Middle priority order (spec §10) — the engine optimizes toward band
 * centers in this exact order and must never fix a lower-priority metric by
 * breaking a higher-priority one. Used by the solver (4C+) for violation ranking
 * AND proposal tie-breaking.
 */
import type { PriorityKey } from '../types';

export const GOLDEN_MIDDLE_PRIORITY = [
  'feasibility_safety',
  'freezing_stability',
  'npac_pac',
  'pod',
  'water_solids',
  'fat',
  'protein',
  'lactose_sandiness',
  'stabilizer_ratio',
  'flavor_priority',
  'cost',
] as const satisfies readonly PriorityKey[];
