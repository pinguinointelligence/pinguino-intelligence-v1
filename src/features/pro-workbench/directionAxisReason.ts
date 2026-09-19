import { copy } from '@/copy/en';
import type { DirectionAxisStatus } from '@/features/recipe-direction/recipeDirectionTargets';

/**
 * PRO MOBILE UX v2 · A7 — an unavailable „Dostosuj recepturę" regulator always
 * says WHY, in customer language. Whether it is available is untouched: that
 * stays the Direction plan's own status (`buildRecipeDirectionPlan`, a protected
 * path). This only puts the status it already reports into words.
 */
export function directionAxisUnavailableReason(status: DirectionAxisStatus | undefined): string {
  const reasons = copy.proWorkbench.profile.axisUnavailable;
  if (status === 'blocked_science') return reasons.blocked_science;
  if (status === 'blocked_data') return reasons.blocked_data;
  if (status === 'blocked_runtime') return reasons.blocked_runtime;
  return reasons.unknown;
}
