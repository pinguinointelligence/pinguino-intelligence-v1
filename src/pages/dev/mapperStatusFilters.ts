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
