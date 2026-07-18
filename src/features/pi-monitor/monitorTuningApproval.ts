/**
 * PINGÜINO PI Monitor — per-temperature interactive-tuning approval (Track G).
 *
 * WHY THIS EXISTS (evidence, 2026-07-18): the temperature-aware TARGET_BANDS seed
 * all 12 profile × temperature cells (CONFIG 0.6.0, commit 70fcbd7) and the
 * Monitor/solver correctly aims at the recipe's own cell — but the engine's
 * ice-fraction model (`src/engine/config/iceAnchors.ts`) has exactly ONE seeded
 * anchor row: milk_gelato @ −11 °C. At −12/−13 the model extrapolates from the
 * −11 anchors and CONTRADICTS the locked regulator references: the approved
 * clean anchors G17 (−12) and G18 (−13) run through the real engine land at
 * ice ≈ 41.2 / 35.6 % versus the doc-expected 50.34 / 49.69 % and the approved
 * bands [46,54] / [46,52]. Under the current model the −12/−13 band sets are not
 * jointly satisfiable, so interactive Monitor tuning at those temperatures would
 * either refuse honestly or endorse gram changes computed with an unvalidated
 * ice curve. Neither is acceptable — so tuning is HONESTLY UNAVAILABLE there
 * until the −12/−13 ice anchors arrive via external scientific calibration
 * (ice-anchor values are calibration data this codebase never invents).
 *
 * This table is an AVAILABILITY flag only. It contains no scientific values and
 * changes no engine behavior; removing a cell's block requires only the
 * scientific calibration to land (see docs/engine/TRACK_G_SCIENCE_APPROVAL_PACKAGE.md).
 */

/**
 * Serving temperatures with a VALIDATED interactive-tuning path. −11 °C is the
 * calibrated base (seeded ice anchors + the −11 engine contract); Świeże and
 * Ninja Swirl route to −11 and inherit it. −12/−13 (and Ninja Gelato → −13) are
 * pending the external ice-anchor calibration.
 */
const TUNING_APPROVED_TEMPERATURES: ReadonlySet<number> = new Set([-11]);

/** True when interactive Monitor tuning is approved for this serving temperature. */
export function isMonitorTuningApproved(servingTemperatureC: number): boolean {
  return TUNING_APPROVED_TEMPERATURES.has(servingTemperatureC);
}

/**
 * The owner-approved customer copy for a not-yet-approved tuning temperature.
 * The recipe itself still calculates; only the interactive tuning is unavailable.
 */
export const TUNING_NOT_APPROVED_COPY =
  'PI może obliczyć recepturę dla tego trybu, ale interaktywne dostrajanie Monitorem nie zostało jeszcze zatwierdzone dla tej temperatury.';
