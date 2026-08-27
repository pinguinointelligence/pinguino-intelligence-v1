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

  const firstRunStillOpen =
    input.hasNewRecipeStarter &&
    input.appliedHistoryCount === 0 &&
    (input.recalculationTerminal === null ||
      input.recalculationTerminal.state === 'CANCELLED' ||
      input.recalculationTerminal.state === 'SETTINGS_CONFIRMATION_REQUIRED');
  if (firstRunStillOpen) return 'INITIAL';

  if (input.legacyInspection || input.currentResultAuthority.ready) return 'CURRENT';
  if (input.awaitingRecalculation) return 'STALE';
  return 'BLOCKED';
}
