/**
 * Pure filter model for the DEV Mapper review workstation. Kept out of the view file so the
 * view exports only its component (react-refresh) — and so the filter logic is unit-testable
 * without rendering. No DB, no service, no IO.
 */
import { rankCandidatesByName } from '@/data/products/productNameTiebreak';
import type { ReviewFilters, ReviewRow } from './mapperReviewView';

export const DEFAULT_REVIEW_FILTERS: ReviewFilters = {
  mapperStatus: 'all',
  category: 'all',
  redFlaggedOnly: false,
  candidateBucket: 'all',
  tiebreakFilter: 'all',
};

export interface TiebreakEvidence {
  /** candidate basement_id → name-concept score, ranked best-first. */
  ranked: { id: string; score: number }[];
  topScore: number;
  /** the unique-maximum (>0) candidate id — the one the matcher would narrow to, else null. */
  narrowedId: string | null;
  status: 'narrowed' | 'ranked' | 'none';
}

/**
 * Compute the deterministic name-tiebreaker evidence for one review row's candidate pool: the
 * per-candidate concept score, the top score, and whether it uniquely narrows. Mirrors what the
 * matcher does, so the workstation can show WHY a candidate ranked first / why it did not narrow.
 */
export function reviewRowTiebreak(row: ReviewRow): TiebreakEvidence {
  const ranked = rankCandidatesByName(
    row.product_name ?? '',
    row.candidates.map((c) => ({ id: c.basement_id, name: c.name ?? '' })),
  ).map(({ id, score }) => ({ id, score }));
  const top = ranked[0];
  const topScore = top ? top.score : 0;
  const topCount = top ? ranked.filter((r) => r.score === topScore).length : 0;
  const narrowedId = topScore > 0 && topCount === 1 ? top!.id : null;
  const status: TiebreakEvidence['status'] = topScore === 0 ? 'none' : narrowedId ? 'narrowed' : 'ranked';
  return { ranked, topScore, narrowedId, status };
}

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
    if (f.tiebreakFilter && f.tiebreakFilter !== 'all') {
      const hasHit = reviewRowTiebreak(r).status !== 'none';
      if (f.tiebreakFilter === 'hit' && !hasHit) return false;
      if (f.tiebreakFilter === 'no_hit' && hasHit) return false;
    }
    return true;
  });
}
