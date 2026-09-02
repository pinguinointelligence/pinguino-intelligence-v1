import { constraintStudioCopy, formatGramsPl } from './constraintStudioCopy';
import { previewIssueMessagePl } from './previewIssueMessage';
import type { PreviewIssue } from './constraintStudioStore';

/** Customer projection. Solver search counts remain available in Owner diagnostics,
 * but never appear in the normal recipe workflow. */
export function customerStopReasonPl(reason: 'local_no_proposal' | 'template_fixed_point'): string {
  return reason === 'local_no_proposal'
    ? 'Nie znaleźliśmy bezpiecznej korekty ani lepszego wyniku przy obecnych ustawieniach.'
    : 'Nie znaleźliśmy dalszej bezpiecznej poprawy przy obecnych ustawieniach.';
}

export function customerOptimizerNoSolutionPl(metricLabels: readonly string[]): string {
  return (
    'Przeliczyliśmy recepturę, ale nie znaleźliśmy bezpiecznej korekty w zatwierdzonych zakresach.' +
    (metricLabels.length > 0 ? ` Parametry poza zakresem: ${metricLabels.join(', ')}.` : '')
  );
}

export function customerPreviewIssueMessagePl(issue: PreviewIssue): string {
  if (issue.code === 'already_clean') {
    return 'Receptura już spełnia wybrany profil. Nie są potrzebne żadne zmiany.';
  }
  if (issue.code === 'best_safe_result') {
    return `${constraintStudioCopy.previewIssue.bestSafeResult} ${customerStopReasonPl(issue.stopReason)}`;
  }
  if (issue.code === 'no_proposal' && issue.directionTargetUnreached === true) {
    const labels = (issue.violatedMetrics ?? []).map(
      (metric) => constraintStudioCopy.diagnosis.metricLabels[metric] ?? metric,
    );
    return (
      'To najbliższy osiągalny wynik dla wybranego kierunku. Nie znaleźliśmy bezpiecznej ' +
      'korekty, która poprawia ten cel bez naruszenia twardych ograniczeń.' +
      (labels.length > 0 ? ` Parametry kierunku: ${labels.join(', ')}.` : '')
    );
  }
  if (issue.code === 'impossible_under_constraints') {
    // CUSTOMER COPY RULE (owner, 2026-09-02). A locked amount that cannot work
    // gets the ANSWER, not our algorithm: the requested value, and the maximum
    // we can actually use. The `Ustaw X g` action is rendered beside this by
    // FeasibilityNotice. Solver attempt counts and the out-of-range technical
    // metrics (NPAC, dry matter, water, …) stay in the Pro/diagnostic renderer
    // `previewIssueMessagePl`, which is unchanged.
    if (issue.nearestFeasibleGrams !== null && issue.conflict) {
      // The ingredient is NAMED: with several lines on screen the two sentences
      // alone would not say which one to change. A product name is the
      // customer's own vocabulary, not one of our internal rules.
      return (
        `„${issue.conflict.ingredientName}” — ` +
        `${formatGramsPl(issue.conflict.grams)} nie jest możliwe w tej recepturze. ` +
        `Maksymalnie możemy użyć ${formatGramsPl(issue.nearestFeasibleGrams)}.`
      );
    }
    return constraintStudioCopy.blocked.recipeCannotBeFitted;
  }
  return previewIssueMessagePl(issue);
}

export const customerSolverSourcePl = 'Źródło propozycji: sprawdzone obliczenia Gellatti.';

export function customerFormulationSourcePl(templateId: string): string {
  void templateId;
  return 'Źródło propozycji: sprawdzone obliczenia Gellatti.';
}
