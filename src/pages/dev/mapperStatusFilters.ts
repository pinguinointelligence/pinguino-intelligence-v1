/**
 * Pure filter for the DEV Mapper status control list. Kept in a `.ts` sibling (not the view)
 * so the view file only exports components (react-refresh clean). No React, no IO.
 */
import type { StatusRow } from './mapperStatusView';

export type StatusFilter = 'all' | 'studio_eligible' | 'not_eligible' | 'red_flagged' | 'missing_reference';

export const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'studio_eligible', label: 'Studio-eligible' },
  { value: 'not_eligible', label: 'Not Studio-eligible' },
  { value: 'red_flagged', label: 'Red-flagged' },
  { value: 'missing_reference', label: 'Missing reference' },
];

export function filterStatusRows(rows: readonly StatusRow[], filter: StatusFilter): StatusRow[] {
  switch (filter) {
    case 'studio_eligible':
      return rows.filter((r) => r.studio_eligible);
    case 'not_eligible':
      return rows.filter((r) => !r.studio_eligible);
    case 'red_flagged':
      return rows.filter((r) => r.red_flag_codes.length > 0);
    case 'missing_reference':
      return rows.filter((r) => r.engine_readiness === 'unresolved');
    case 'all':
    default:
      return [...rows];
  }
}

export interface VerifiabilityExplanation {
  /** hard-blocked: a written reason cannot make it PI Verifiable (red flags / no engine values). */
  blocked: boolean;
  /** a reviewer reason is required to PI Verify (when not hard-blocked). */
  needs_reason: boolean;
  /** human provenance label for the row. */
  provenance: string;
  /** why PI Verify is blocked or gated. */
  reasons: string[];
}

/**
 * Explain whether a product can be PI Verified, and why/why-not — the reviewer-facing eligibility
 * for the Verify action. Red flags and unresolved engine values HARD-block (a reason can't
 * override). A reference-linked product is verifiable ONLY with an explicit reviewer sign-off
 * (it is borrowed, not independently measured). Pure; mirrors the productStatusDecision rules.
 */
export function explainPiVerified(row: StatusRow): VerifiabilityExplanation {
  const redFlagged = row.red_flag_codes.length > 0;
  const provenance =
    row.engine_readiness === 'product_measured'
      ? 'Independently measured (own pac/pod)'
      : row.engine_readiness === 'reference_linked'
        ? 'Reference-linked only (not independently measured)'
        : 'No engine values resolved';

  const reasons: string[] = [];
  if (redFlagged) reasons.push(`Red flags must be cleared first: ${row.red_flag_codes.join(', ')}.`);
  if (row.engine_readiness === 'unresolved') reasons.push('No resolvable engine values — no usable reference.');
  if (row.engine_readiness === 'reference_linked') {
    reasons.push('Reference-linked values are borrowed, not independently measured — needs an explicit reviewer sign-off.');
  }

  const blocked = redFlagged || row.engine_readiness === 'unresolved';
  return { blocked, needs_reason: !blocked, provenance, reasons };
}
