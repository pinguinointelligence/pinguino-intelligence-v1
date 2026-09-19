/**
 * HOME's ONE orchestration of the shared recalculation (owner §18, 2026-09-18).
 *
 * HOME owns no recipe math. Every rule — the solver, constraints, the whole-gram
 * practicalization, the target batch, scaling, Crown/Main, locks, Direction,
 * preview/apply — belongs to the shared CORE that PRO uses. This module only
 * decides WHEN to start that shared PRZELICZ and what to do with its answer:
 *
 *   1. start it: `homeRecalculationInstructions` hands every 0 g HOME priority
 *      line to the solver as the 1 g Crown bootstrap on the calculation COPY
 *      (owner OD-1: the recipe keeps its 0 g until Apply), then the same runners
 *      PRO calls;
 *   2. a CLEAN result — a staged Preview the customer does not have to decide on
 *      (`previewCustomerDecisionReason`) — goes through the one Apply door,
 *      `applyPreviewWithServerAuthority`, exactly as HOME's first build always did;
 *   3. ANYTHING ELSE — Direction consent, a lock conflict, a Suggested Fix, an
 *      instructions-only commit, a refusal, a timeout — stays staged for HOME's
 *      existing review dialog (`HomeRecalculate`), which already speaks every one
 *      of those states. HOME never collapses them into one generic sentence again.
 *
 * Before this module the first build had its own copy of step 2 and treated every
 * other state as „Nie udało się jeszcze bezpiecznie przygotować receptury” — which is
 * how a sorbet (whose exact Direction centre is essentially never met in whole
 * grams, so CORE asks for best-achievable consent) could never be built in HOME,
 * while the same CORE state had a working answer one dialog away.
 */
import {
  applyPreviewWithServerAuthority,
  runInteractiveRecalculationWithTerminal,
  runPiRecalculationWithTerminal,
  useConstraintStudioStore,
} from '@/features/constraint-studio/constraintStudioStore';
import type { PreviewLineInstruction } from '@/features/constraint-studio/previewInstructions';
import { previewCustomerDecisionReason } from '@/features/constraint-studio/previewCustomerDecision';
import { useRecipeStore } from '@/stores/recipeStore';

import { homeRecalculationInstructions } from './homePriorityBootstrap';

/**
 * - `applied`: CORE's clean result is now the recipe.
 * - `unchanged`: CORE found nothing to change and published the current result.
 * - `decision`: CORE staged something only the customer may decide — show the dialog.
 * - `superseded`: the recipe changed while CORE was working; the newer change
 *   starts its own run, so this answer is dropped rather than applied.
 */
export type HomeRecalculationOutcome = 'applied' | 'unchanged' | 'decision' | 'superseded';

/** Start the shared PRZELICZ for the recipe as it is now, plus the customer's own
 * preview edits (only the review dialog has any). */
export async function runHomeRecalculation(
  customer: readonly PreviewLineInstruction[] = [],
): Promise<void> {
  const all = homeRecalculationInstructions(useRecipeStore.getState().items, customer);
  if (all.length > 0) await runInteractiveRecalculationWithTerminal(all);
  else await runPiRecalculationWithTerminal();
}

/** The staged answer is a normal Preview the customer has already asked for by
 * making their change: nothing in it needs their decision. */
export function stagedResultIsClean(): boolean {
  const studio = useConstraintStudioStore.getState();
  return (
    studio.recalculationTerminal?.state === 'PREVIEW_READY' &&
    studio.preview !== null &&
    studio.directionBestCandidate === null &&
    studio.lockConflict === null &&
    studio.pendingInstructionCommit === null &&
    studio.blocked === null &&
    previewCustomerDecisionReason(studio.preview) === null
  );
}

/** The recipe the customer sees is the recipe CORE last verified. */
function currentResultEstablished(): boolean {
  const studio = useConstraintStudioStore.getState();
  return (
    studio.preview === null &&
    studio.blocked === null &&
    studio.postApplyNotice === null &&
    useRecipeStore.getState().practicalRecipeAudit !== null
  );
}

/**
 * Run the shared PRZELICZ and apply a clean result through the one Apply door.
 * Everything CORE wants the customer to decide is left staged, untouched, for the
 * review dialog to present — this function never accepts a consent on their behalf.
 */
export async function recalculateHomeRecipe(): Promise<HomeRecalculationOutcome> {
  const startedAt = useRecipeStore.getState().draftRevision;
  await runHomeRecalculation();
  if (useRecipeStore.getState().draftRevision !== startedAt) return 'superseded';

  if (stagedResultIsClean()) {
    await applyPreviewWithServerAuthority();
    return currentResultEstablished() ? 'applied' : 'decision';
  }

  const studio = useConstraintStudioStore.getState();
  if (
    studio.recalculationTerminal?.state === 'NO_CHANGE_NEEDED' &&
    studio.pendingInstructionCommit === null &&
    currentResultEstablished()
  ) {
    return 'unchanged';
  }
  return 'decision';
}
