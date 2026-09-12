/**
 * OWNER BUGFIX — HOME EMPTY REFUSAL (#287), 2026-09-11.
 *
 * What HOME says when „Przelicz i popraw" does not produce a change.
 *
 * Served staging showed a refusal card with ONLY „Wróć". The solver had refused honestly —
 * `no_proposal` on a safe recipe whose Direction target cannot be improved — and the store
 * published that verdict unchanged. HOME read nothing but `messagePl`, which that variant does
 * not carry, and the card had no fallback. The reason existed; the HOME adapter dropped it.
 *
 * This is a PRESENTATION projection and nothing else:
 *   - it never changes a verdict — a refusal stays a refusal, fail-closed stays closed;
 *   - the reason comes from the canonical message sources the rest of Gellatti speaks
 *     (`previewIssueMessagePl`, the customer projection); HOME replaces a sentence only where it
 *     would send the customer to a control HOME does not have, or show a solver search count;
 *   - a rule is named only from the result's own structured data, in HOME's consumer words —
 *     and dropped rather than shown by half;
 *   - every refusal says what the customer can do next;
 *   - a result with no reason at all gets the calm fallback — never an empty card.
 */
import {
  constraintStudioCopy,
  formatGramsPl,
} from '@/features/constraint-studio/constraintStudioCopy';
import type {
  PreviewIssue,
  RecalculationTerminalState,
} from '@/features/constraint-studio/constraintStudioStore';
import {
  customerOptimizerNoSolutionPl,
  customerPreviewIssueMessagePl,
} from '@/features/constraint-studio/customerConstraintStudioPresentation';
import { previewIssueMessagePl } from '@/features/constraint-studio/previewIssueMessage';
import {
  MONITOR_HOME_TRAIT_LABELS,
  MONITOR_HOME_TRAIT_ORDER,
  type MonitorHomeTraitId,
} from '@/features/pi-monitor/piMonitorHomeView';
import { homeCreatorCopy } from './homeCreatorCopy';
import { exposesInternals, homeCustomerNotice } from './homeCustomerNotice';

export interface HomeRecalcRefusal {
  /** Why nothing was changed — always a customer sentence. */
  readonly reason: string;
  /** The rule the result names (a target, a limit), when it names one HOME can say. */
  readonly detail: string | null;
  /** What the customer can do next. */
  readonly next: string;
}

/**
 * The engine metrics a refusal reports, in HOME's consumer traits: the recipe Direction axes
 * (sweetness → `pod`, softness → `npac` | `ice_fraction`) and the HOME monitor's own trait
 * metrics. A metric HOME has no word for is never shown.
 */
const METRIC_TRAIT: Readonly<Partial<Record<string, MonitorHomeTraitId>>> = {
  pod: 'slodycz',
  npac: 'miekkosc',
  ice_fraction: 'miekkosc',
  fat: 'kremowosc',
  total_solids: 'pelnia',
};

/** HOME's words for these metrics, or `null` when any of them has none — never half a list. */
function traitWords(metrics: readonly string[] | undefined): string[] | null {
  if (!metrics || metrics.length === 0) return null;
  const traits = new Set<MonitorHomeTraitId>();
  for (const metric of metrics) {
    const trait = METRIC_TRAIT[metric];
    if (trait === undefined) return null;
    traits.add(trait);
  }
  return MONITOR_HOME_TRAIT_ORDER.filter((trait) => traits.has(trait)).map((trait) =>
    MONITOR_HOME_TRAIT_LABELS[trait].toLocaleLowerCase('pl-PL'),
  );
}

function issueReason(issue: PreviewIssue): string {
  switch (issue.code) {
    case 'no_proposal':
      // PC-01 (owner-locked): a safe recipe whose Direction target cannot be improved speaks
      // the canonical sentence — the same one HOME's Direction choice already shows.
      if (issue.directionTargetUnreached === true) return previewIssueMessagePl(issue);
      // The canonical ordinary sentence sends the customer to „Sprawdź wykonalność blokad", a
      // PRO control HOME does not have, and names locks without proof (PC-01). HOME speaks the
      // customer projection's own no-solution sentence. A search that simply found nothing
      // lists no parameters: its metrics are not proven out of range.
      return customerOptimizerNoSolutionPl(
        issue.failureKind === 'SEARCH_FAILED' ? [] : (traitWords(issue.violatedMetrics) ?? []),
      );
    case 'best_safe_result':
      // The customer projection: the canonical sentence and the stop reason, without the
      // solver's search count.
      return customerPreviewIssueMessagePl(issue);
    case 'impossible_under_constraints':
      // The canonical sentence reports search counts. HOME says the same verdict in the words
      // its lock-conflict panel already uses; the limit is the detail.
      return constraintStudioCopy.lockConflict.genericGap;
    default:
      // Every other variant: the ONE canonical message source — its own `messagePl`, or the
      // canonical sentence for its code.
      return previewIssueMessagePl(issue);
  }
}

function issueDetail(issue: PreviewIssue): string | null {
  if (issue.code === 'no_proposal' && issue.directionTargetUnreached === true) {
    const words = traitWords(issue.violatedMetrics);
    return words ? `${homeCreatorCopy.recalcRefusal.notImproved} ${words.join(', ')}.` : null;
  }
  if (
    issue.code === 'impossible_under_constraints' &&
    issue.conflict !== null &&
    issue.conflict.kind !== 'range' &&
    issue.nearestFeasibleGrams !== null
  ) {
    const feasibility = constraintStudioCopy.feasibility;
    return (
      `${feasibility.boundLockedAt(issue.conflict.ingredientName, formatGramsPl(issue.conflict.grams))} ` +
      feasibility.boundMax(formatGramsPl(issue.nearestFeasibleGrams))
    );
  }
  return null;
}

/**
 * The refusal HOME shows. Precedence: an Apply refusal speaks first (it is the newest
 * verdict), then the recalculation result, then a sentence the terminal carries itself, and
 * only then the calm fallback.
 */
export function homeRecalcRefusal(input: {
  readonly previewIssue: PreviewIssue | null;
  readonly blocked: { readonly messagePl: string } | null;
  readonly terminal: RecalculationTerminalState | null;
}): HomeRecalcRefusal {
  const { previewIssue, blocked, terminal } = input;
  const copy = homeCreatorCopy.recalcRefusal;
  const terminalMessage = terminal !== null && 'messagePl' in terminal ? terminal.messagePl : null;
  const reason =
    (blocked ? homeCustomerNotice(blocked.messagePl) : null) ??
    (previewIssue ? homeCustomerNotice(issueReason(previewIssue)) : null) ??
    homeCustomerNotice(terminalMessage) ??
    copy.fallback;
  const detail = blocked === null && previewIssue !== null ? issueDetail(previewIssue) : null;
  return {
    reason,
    detail: detail !== null && !exposesInternals(detail) ? detail : null,
    next: copy.next,
  };
}
