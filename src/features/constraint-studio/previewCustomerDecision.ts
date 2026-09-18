/**
 * Which staged proposals are the customer's to decide, not a surface's to apply.
 *
 * PRO asks before every Apply, so it never needed this list. HOME recalculates on the
 * customer's behalf after every change (owner 2026-09-18: „HOME ma automatycznie
 * liczyć … Nie oznacza to automatycznego zastosowania każdej proponowanej zmiany
 * wymagającej istniejącego potwierdzenia. Zachowaj obowiązujące granice
 * preview / apply.”). The boundary therefore has to be stated once, next to the
 * Preview it describes, so a surface that applies a result for the customer can never
 * apply one of these — and a future proposal kind is added HERE, for every surface.
 *
 * Deliberately conservative: every case below is one where the proposal changes
 * something the customer set, or settles for less than they asked for.
 */
import type { ConstraintPreview } from './applyPipeline';

export type CustomerDecisionReason =
  | 'diagnostic_only'
  | 'suggested_fix_changes_a_lock'
  | 'direction_fallback'
  | 'direction_not_reached'
  | 'substitution'
  | 'explicit_removal'
  | 'rescue_adds_an_ingredient'
  | 'customer_amount_moves';

export function previewCustomerDecisionReason(
  preview: ConstraintPreview,
): CustomerDecisionReason | null {
  // A diagnostic Preview has no Apply at all — it only explains.
  if (preview.diagnosticOnly === true) return 'diagnostic_only';
  // A Suggested Fix moves a value the customer LOCKED; only they may release it.
  if (preview.safetyLockConflict !== undefined) return 'suggested_fix_changes_a_lock';
  // An adjacent/neutral Direction instead of the one they chose.
  if (preview.directionFallback !== undefined) return 'direction_fallback';
  // The nearest legal recipe rather than the Direction they chose.
  if (preview.directionTargetUnreached === true) return 'direction_not_reached';
  // Another product, or a line removed, is never the side effect of a recalculation.
  if (preview.substitution !== undefined) return 'substitution';
  if (preview.explicitStandardRemoval !== undefined) return 'explicit_removal';
  // Rescue brings in an ingredient the customer did not choose.
  if (preview.starterPackRescue !== undefined) return 'rescue_adds_an_ingredient';
  // An amount the customer gave moved past the global soft-hold line: the Preview
  // must SAY so, and they must agree (owner GLOBAL SOFT-HOLD §7/§13/§25).
  if ((preview.userIntent?.material.length ?? 0) > 0) return 'customer_amount_moves';
  return null;
}
