import type { RecalculationTerminalState } from '@/features/constraint-studio/constraintStudioStore';
import type { CurrentRecipeResultAuthority } from './currentRecipeResultAuthority';

export type FriendlyLabRecipeJourneyState = 'INITIAL' | 'WORKING' | 'CURRENT' | 'STALE' | 'BLOCKED';

export interface FriendlyLabRecipeJourneyInput {
  currentResultAuthority: CurrentRecipeResultAuthority;
  awaitingRecalculation: boolean;
  hasNewRecipeStarter: boolean;
  appliedHistoryCount: number;
  recalculationTerminal: RecalculationTerminalState | null;
  legacyInspection: boolean;
  calculatedForDraft: boolean;
  calculatedAuthorityCurrent: boolean;
}

/**
 * Presentation-only state for the real Recipe journey. It deliberately leaves
 * current-result authority untouched: the extra INITIAL distinction prevents
 * background ProductBehavior hydration from presenting a fresh draft as if the
 * customer had already run Recalculate.
 */
export function friendlyLabRecipeJourneyState(
  input: FriendlyLabRecipeJourneyInput,
): FriendlyLabRecipeJourneyState {
  if (
    input.currentResultAuthority.state === 'LOADING' ||
    input.recalculationTerminal?.state === 'WORKING'
  ) {
    return 'WORKING';
  }

  const completedWithoutApply =
    input.recalculationTerminal?.state === 'NO_CHANGE_NEEDED' ||
    input.recalculationTerminal?.state === 'BEST_ACHIEVABLE';
  const authoritativeCurrentEstablished =
    input.calculatedAuthorityCurrent ||
    input.appliedHistoryCount > 0 ||
    completedWithoutApply ||
    !input.hasNewRecipeStarter;
  const firstRunStillOpen =
    input.hasNewRecipeStarter &&
    !input.calculatedForDraft &&
    !authoritativeCurrentEstablished &&
    (input.recalculationTerminal === null ||
      input.recalculationTerminal.state === 'CANCELLED' ||
      input.recalculationTerminal.state === 'SETTINGS_CONFIRMATION_REQUIRED');
  if (firstRunStillOpen) return 'INITIAL';

  if (input.calculatedForDraft && !input.calculatedAuthorityCurrent) return 'STALE';
  if (
    input.legacyInspection ||
    (input.currentResultAuthority.ready && authoritativeCurrentEstablished)
  ) {
    return 'CURRENT';
  }
  if (input.awaitingRecalculation || input.calculatedForDraft) return 'STALE';
  return 'BLOCKED';
}
