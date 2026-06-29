/**
 * Pure filter model for the DEV Mapper review workstation. Kept out of the view file so the
 * view exports only its component (react-refresh) — and so the filter logic is unit-testable
 * without rendering. No DB, no service, no IO.
 */
import type { ReviewFilters, ReviewRow } from './mapperReviewView';

export const DEFAULT_REVIEW_FILTERS: ReviewFilters = {
  mapperStatus: 'all',
  category: 'all',
  redFlaggedOnly: false,
  candidateBucket: 'all',
};

/** Pure client-side filter over the loaded review rows. */
export function filterReviewRows(rows: ReviewRow[], f: ReviewFilters): ReviewRow[] {
  return rows.filter((r) => {
    if (f.mapperStatus !== 'all' && (r.mapper_status ?? 'null') !== f.mapperStatus) return false;
    if (f.category !== 'all' && (r.product_category ?? '') !== f.category) return false;
    if (f.redFlaggedOnly && r.red_flag_codes.length === 0) return false;
    if (f.candidateBucket !== 'all') {
      const n = r.candidate_count;
      const ok =
        f.candidateBucket === '0' ? n === 0
        : f.candidateBucket === '1' ? n === 1
        : f.candidateBucket === '2-5' ? n >= 2 && n <= 5
        : f.candidateBucket === '6+' ? n >= 6
        : true;
      if (!ok) return false;
    }
    return true;
  });
}
