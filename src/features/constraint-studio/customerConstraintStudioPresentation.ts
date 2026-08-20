import { constraintStudioCopy, formatGramsPl } from './constraintStudioCopy';
import { previewIssueMessagePl } from './previewIssueMessage';
import type { PreviewIssue } from './constraintStudioStore';

/** Customer projection. Solver search counts remain available in Owner diagnostics,
 * but never appear in the normal recipe workflow. */
export function customerStopReasonPl(
  reason: 'local_no_proposal' | 'template_fixed_point',
): string {
  return reason === 'local_no_proposal'
    ? 'Powód zatrzymania: solver lokalny nie znalazł bezpiecznej korekty, a reformulacja od wzorca nie daje lepszego bezpiecznego wyniku.'
    : 'Powód zatrzymania: solver lokalny i reformulacja od wzorca nie znalazły dalszej zweryfikowanej poprawy.';
}

export function customerOptimizerNoSolutionPl(metricLabels: readonly string[]): string {
  return 'PI przeliczyło recepturę, ale nie znalazło bezpiecznej korekty w zatwierdzonych zakresach.' +
    (metricLabels.length > 0 ? ` Parametry poza zakresem: ${metricLabels.join(', ')}.` : '');
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
      'To najbliższy osiągalny wynik dla wybranego kierunku. PI nie znalazło legalnej ' +
      'korekty, która poprawia ten cel bez naruszenia twardych ograniczeń.' +
      (labels.length > 0 ? ` Parametry kierunku: ${labels.join(', ')}.` : '')
    );
  }
  if (issue.code === 'impossible_under_constraints') {
    const conflictPart = issue.conflict
      ? `Przy ograniczeniu „${issue.conflict.ingredientName}” = ${formatGramsPl(issue.conflict.grams)} `
      : 'Przy obecnych ograniczeniach ';
    const searchPart = issue.capReached
      ? 'PI wyczerpało bezpieczny zakres przeszukiwania bez osiągnięcia zatwierdzonych zakresów.'
      : 'PI wykonało pełne przeszukanie dozwolonych ruchów.';
    const nearestPart = issue.nearestFeasibleGrams !== null && issue.conflict
      ? ` Najbliższa wykonalna wartość dla „${issue.conflict.ingredientName}”: ${formatGramsPl(issue.nearestFeasibleGrams)}.`
      : '';
    const metrics = [...new Set([
      ...issue.hardViolatedMetrics,
      ...issue.residualViolatedMetrics,
    ])];
    const metricPart = metrics.length > 0
      ? ` Parametry techniczne poza zakresem: ${metrics.map(
          (metric) => constraintStudioCopy.diagnosis.metricLabels[metric] ?? metric,
        ).join(', ')}.`
      : '';
    return `${conflictPart}${searchPart}${nearestPart}${metricPart}`;
  }
  return previewIssueMessagePl(issue);
}

export const customerSolverSourcePl =
  'Źródło propozycji: kanoniczny solver korekt PI + wyrównanie partii.';

export const customerFormulationSourcePl = (templateId: string): string =>
  `Źródło formulacji: ${templateId} + kanoniczny solver korekt PI.`;
