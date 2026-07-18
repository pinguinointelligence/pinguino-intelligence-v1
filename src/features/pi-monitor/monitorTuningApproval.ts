/**
 * PINGÜINO PI Monitor — data-driven interactive-tuning approval (Track G).
 *
 * Interactive tuning is offered ONLY where the canonical ice-fraction model has a
 * SEEDED anchor at the recipe's serving temperature (its own category row, or the
 * milk_gelato fallback at that temperature) — i.e. the ice estimate needs no
 * cross-temperature extrapolation. This delegates to the engine's
 * `hasSeededIceAnchorAtTemperature`, so it is NOT a hand-maintained list: when new
 * approved anchors are wired into `src/engine/config/iceAnchors.ts`, the cells they
 * cover become tunable automatically, with no change here.
 *
 * HISTORY: before CONFIG 0.7.0 only milk_gelato @ −11 had a seeded anchor, so
 * −12/−13 (and Ninja Gelato → −13) fell back to the −11 anchor + a temperature
 * slope, landing recipes out of the ice band and blocking recalculation. CONFIG
 * 0.7.0 wired the already-approved G15/G17 (−12) and G11/G18 (−13) clean-anchor
 * coordinates, so all of −11/−12/−13 now have same-temperature ice anchors and are
 * tunable. A cell without a same-temperature seeded anchor stays honestly
 * unavailable rather than endorsing gram changes from a temperature-extrapolated
 * ice curve. See docs/engine/TRACK_G_ICE_ANCHOR_WIRING.md.
 */
import { hasSeededIceAnchorAtTemperature, type RecipeInput } from '@/engine';

/**
 * True when interactive Monitor tuning is scientifically grounded for this recipe's
 * category × serving temperature (a same-temperature seeded ice anchor exists).
 */
export function isMonitorTuningApproved(
  category: RecipeInput['category'],
  servingTemperatureC: number,
): boolean {
  return hasSeededIceAnchorAtTemperature(category, servingTemperatureC);
}

/**
 * The owner-approved customer copy for a not-yet-approved tuning cell. The recipe
 * itself still calculates; only the interactive tuning is unavailable.
 */
export const TUNING_NOT_APPROVED_COPY =
  'PI może obliczyć recepturę dla tego trybu, ale interaktywne dostrajanie Monitorem nie zostało jeszcze zatwierdzone dla tej temperatury.';
