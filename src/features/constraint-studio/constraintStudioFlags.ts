/**
 * Constraint Studio feature flags (SPEC §17.3, task rule).
 *
 * `rangeConstraintUi` — the Pro min–max range INPUT surface. LAUNCH-GATED
 * DEFAULT OFF: range is NOT a live solver mode (the engine has no bounded
 * moves — see src/features/recipe-constraints/constraintSet.ts header), so
 * any range UI is presented strictly as ANALYSIS („Zakres (analiza)”) fed by
 * the engine-verified feasibility layer. Turning it on is an owner decision;
 * tests flip it through the setter and restore it.
 */
export const constraintStudioFlags = {
  rangeConstraintUi: false,
};

/** Test/dev seam — never called from production UI code. */
export function setRangeConstraintUiFlag(enabled: boolean): void {
  constraintStudioFlags.rangeConstraintUi = enabled;
}
