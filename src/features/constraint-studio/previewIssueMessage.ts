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
