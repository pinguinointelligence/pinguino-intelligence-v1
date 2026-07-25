/**
 * Honest Polish message for a failed preview build (§12.4 honesty: the surface always says WHY
 * no proposal was staged — never a silent no-op). Shared by the Constraint Studio section and
 * the PINGÜINO Pro workbar recalculation panel (ONE canonical pipeline, one message source).
 */
import { constraintStudioCopy as copy, formatGramsPl } from './constraintStudioCopy';
import type { PreviewIssue } from './constraintStudioStore';

export function previewIssueMessagePl(issue: PreviewIssue): string {
  switch (issue.code) {
    case 'already_clean':
      return copy.previewIssue.alreadyClean;
    case 'no_proposal':
      return copy.previewIssue.noProposal;
    case 'unsafe_proposal':
      return copy.previewIssue.unsafeProposal;
    case 'best_safe_result':
      // Owner P0 NIGHTLY Phase 7(b): explanatory terminal state, not a failure.
      // OWNER FINAL INTEGRATION ADDENDUM item 3 (2026-07-25): the honest
      // sentence is never shown alone — the STOP REASON rides with it, so the
      // reader always sees WHY the search ended rather than an unqualified
      // superlative. (The Pro panel additionally renders the full evidence.)
      return `${copy.previewIssue.bestSafeResult} ${copy.bestSafe.stopReason[issue.stopReason](
        issue.solverInvocations,
      )}`;
    case 'impossible_under_constraints': {
      // Owner Agent 3 (dominant-lock infeasibility) + ACCEPTANCE ADDENDUM (1):
      // the exact conflicting constraint, the honest search account (full
      // fixed-point search vs. exhausted deterministic budget), the
      // engine-verified nearest feasible alternative and — when
      // deterministically applicable — the product-type alternative.
      const conflictPart = issue.conflict
        ? `Przy ograniczeniu „${issue.conflict.ingredientName}" = ${formatGramsPl(issue.conflict.grams)} `
        : 'Przy obecnych ograniczeniach ';
      const searchPart = issue.capReached
        ? `PI wyczerpało deterministyczny budżet ruchów solvera (wywołania: ${issue.solverInvocations}) ` +
          'bez osiągnięcia zatwierdzonych zakresów — taki wynik nigdy nie jest uznawany za recepturę.'
        : `PI wykonało pełne przeszukanie dozwolonych ruchów (wywołania solvera: ${issue.solverInvocations}).`;
      const nearestPart =
        issue.nearestFeasibleGrams !== null && issue.conflict
          ? ` Najbliższa wykonalna wartość dla „${issue.conflict.ingredientName}": ` +
            `maksymalnie ${formatGramsPl(issue.nearestFeasibleGrams)} (zweryfikowana przez Engine) — ` +
            'zmniejsz ten składnik do tej wartości.'
          : ' Brak wykonalnej alternatywy możliwej do wyliczenia dla tej blokady.';
      const alternativePart =
        issue.alternativeProductType === 'sorbet'
          ? ' Możesz też zmienić typ produktu na Sorbet.'
          : '';
      return (
        conflictPart +
        'nie istnieje receptura mieszcząca się w zatwierdzonych zakresach — ' +
        searchPart +
        nearestPart +
        alternativePart +
        ' Receptura nie została zmieniona.'
      );
    }
    case 'unsupported_profile':
      return copy.previewIssue.unsupportedProfile;
    case 'missing_required_role':
      return issue.messagePl;
    case 'apply_failed':
      return copy.previewIssue.applyFailed;
    case 'invalid_constraints':
      return copy.previewIssue.invalidConstraints;
    case 'line_missing':
      return copy.previewIssue.lineMissing;
    case 'rescale_invalid':
      return copy.previewIssue.rescaleInvalid;
    case 'rescale_actuals':
      return copy.previewIssue.rescaleActuals;
    case 'rescale_no_scalable':
      return copy.previewIssue.rescaleNoScalable;
    case 'rescale_locked_sum':
      return copy.previewIssue.rescaleLockedSum(formatGramsPl(issue.minimumBatchGrams));
  }
}
