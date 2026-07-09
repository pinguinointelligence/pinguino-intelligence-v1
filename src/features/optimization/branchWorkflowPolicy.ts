/**
 * IF9/IF10 branch-workflow DISPLAY policy (Spine Slice 21) — pure redaction rules.
 *
 * Maps the viewer's capabilities (from `useAccess`) to what the production
 * branch previews may show, mirroring the optimization-preview policy:
 *  - Demo/Free SEE that the workflows exist but cannot run them (upgrade
 *    affordance instead of buttons); if a redacted view is ever rendered, exact
 *    grams, the exact scale factor, numeric metrics and the debug trace are all
 *    hidden (defense in depth).
 *  - Paid/Pro run the previews and see VERIFIED detail: IF9 verified add-only
 *    grams, the IF10 verified scale-down ratio, before/after metrics.
 *  - The DEV debug trace is ADDITIVE and never relaxes customer redaction.
 *
 * The spine access contract already fixes the workflow capabilities
 * (`canUseActualBatchRescue` / `canUseStockShortageWorkflow`: demo false, paid
 * true) — this UI policy mirrors that shape through the existing `useAccess`
 * capability subset until the spine AccessContext is wired end-to-end.
 *
 * Display HARD RULES (enforced by the panel + tests, restated here):
 *  - always "Preview only — nothing is applied", "No inventory is changed",
 *    "No recipe is saved";
 *  - never an Apply / Save / Update-inventory control;
 *  - never the word "rescued" unless the exact status is `calculated`;
 *  - `partial_improvement` stays clearly labelled partial.
 *
 * No engine, no IO, no persistence — a pure function of capabilities.
 */

/** The capability inputs this policy reads (a structural subset of `useAccess`). */
export interface BranchWorkflowCapabilities {
  /** Pro marker — exact numbers (grams / ratios) are paid detail. */
  exactCorrectionGrams: boolean;
  /** Pro technical view — numeric before/after metrics. */
  technicalView: boolean;
}

export interface BranchWorkflowDisplayPolicy {
  /** Paid tiers run the branch previews; Demo/Free get the upgrade affordance. */
  canRunWorkflows: boolean;
  /** IF9: verified add-only grams. */
  showExactGrams: boolean;
  /** IF10: the exact verified scale-down ratio (paid detail). */
  showScaleFactor: boolean;
  /** Numeric before/after metrics. */
  showBeforeAfterMetrics: boolean;
  /** DEV-only debug trace — additive, never a redaction upgrade. */
  showTrace: boolean;
  level: 'redacted' | 'full';
}

/** Derive the display policy. `opts.dev` adds the trace only. */
export function branchWorkflowDisplayPolicy(
  caps: BranchWorkflowCapabilities,
  opts: { dev?: boolean } = {},
): BranchWorkflowDisplayPolicy {
  const paid = caps.exactCorrectionGrams;
  return {
    canRunWorkflows: paid,
    showExactGrams: paid,
    showScaleFactor: paid,
    showBeforeAfterMetrics: caps.technicalView,
    showTrace: opts.dev === true,
    level: paid ? 'full' : 'redacted',
  };
}

/** Safe, number-free status labels. `partial_improvement` is NEVER "rescued". */
export const BRANCH_STATUS_LABEL: Readonly<Record<string, string>> = {
  calculated: 'verified',
  partial_improvement: 'partial improvement — not fully rescued',
  not_attempted: 'guidance only — no numbers attempted',
  blocked_missing_data: 'blocked — data missing',
  unsafe: 'blocked — safety',
  verification_failed: 'verification failed — no numbers shown',
  not_supported: 'not supported',
};

export const branchStatusLabel = (status: string): string =>
  BRANCH_STATUS_LABEL[status] ?? status;
