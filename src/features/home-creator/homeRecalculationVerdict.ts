/**
 * What the customer reads after "Przelicz i popraw".
 *
 * OWNER QA 2026-09-06 (served): the customer pressed the button, waited ~16 s and the screen said
 * NOTHING. The pipeline had answered — it publishes its verdict in `recalculationTerminal`, the same
 * state PRO renders — but HOME read only `preview`/`previewIssue`, so every outcome that is not a
 * staged preview was silent.
 *
 * This is a PRESENTATION mapping over the EXISTING authority. It never decides anything: a refusal
 * stays a refusal, a no-change stays a no-change, and a sentence written for the PRO diagnosis view
 * is passed through the customer-voice filter rather than shown raw.
 */
import { homeCreatorCopy, type HomeCreatorCopy } from './homeCreatorCopy';
import { homeCustomerNotice } from './homeCustomerNotice';
import type { RecalculationTerminalState } from '@/features/constraint-studio/constraintStudioStore';

export function homeRecalculationVerdict(
  terminal: RecalculationTerminalState | null | undefined,
  copy: HomeCreatorCopy = homeCreatorCopy,
): string | null {
  if (!terminal) return null;
  switch (terminal.state) {
    // the run is still going, or its result is already on screen as the preview panel
    case 'WORKING':
    case 'PREVIEW_READY':
    case 'CANCELLED':
      return null;
    case 'NO_CHANGE_NEEDED':
      return copy.recipe.recalcNoChange;
    case 'BEST_ACHIEVABLE':
      return copy.recipe.recalcBestAchievable;
    case 'SETTINGS_CONFIRMATION_REQUIRED':
      return copy.recipe.recalcConfirmSettings;
    case 'LOCK_CHANGE_REQUIRED':
      return copy.recipe.recalcLocked;
    case 'PRODUCT_GRAMS_REQUIRED':
      return copy.recipe.recalcNeedsGrams;
    case 'PRODUCT_DATA_REQUIRED':
    case 'MAPPER_BINDING_REQUIRED':
      return copy.recipe.recalcNeedsProductData;
    case 'TIMEOUT':
    case 'ERROR':
      return homeCustomerNotice(terminal.messagePl) ?? copy.recipe.unresolvedProduct;
    case 'BLOCKED_WITH_EXACT_ACTION':
      return homeCustomerNotice(terminal.messagePl ?? null) ?? copy.recipe.unresolvedProduct;
  }
}
