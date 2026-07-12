/**
 * Review queue (PURE) — filtering, sorting, pagination and a privacy-safe summary. No IO.
 * Owner/reviewer scoping is enforced by RLS + the service layer; these helpers operate on
 * the already-authorized set the caller fetched.
 */
import type { QueueState, ReviewPriority, VerificationCase } from './contracts';

export interface QueueSummary {
  caseId: string;
  productId: string;
  source: VerificationCase['source'];
  state: QueueState;
  priority: ReviewPriority;
  assignedReviewerId: string | null;
  revision: number;
  /** Fields still unresolved. */
  unresolvedCount: number;
  /** Fields in an unresolved conflict. */
  conflictCount: number;
  /** Waivers recorded on the case. */
  waiverCount: number;
  createdAt: string;
  lastActivityAt: string;
}

export function summarizeCase(c: VerificationCase): QueueSummary {
  let unresolved = 0;
  let conflicts = 0;
  for (const r of c.resolutions) {
    if (r.status === 'conflict') conflicts += 1;
    else if (r.status === 'unresolved' || r.status === 'evidence_requested') unresolved += 1;
  }
  return {
    caseId: c.caseId,
    productId: c.productId,
    source: c.source,
    state: c.state,
    priority: c.priority,
    assignedReviewerId: c.assignedReviewerId,
    revision: c.revision,
    unresolvedCount: unresolved,
    conflictCount: conflicts,
    waiverCount: c.waivers.length,
    createdAt: c.createdAt,
    lastActivityAt: c.lastActivityAt,
  };
}

export interface QueueFilter {
  state?: QueueState;
  assignedTo?: string;
  unassigned?: boolean;
  priority?: ReviewPriority;
  source?: VerificationCase['source'];
  /** Only cases with at least one unresolved conflict. */
  hasConflicts?: boolean;
}

export function filterQueue(
  cases: readonly VerificationCase[],
  filter: QueueFilter = {},
): VerificationCase[] {
  return cases.filter((c) => {
    if (filter.state !== undefined && c.state !== filter.state) return false;
    if (filter.assignedTo !== undefined && c.assignedReviewerId !== filter.assignedTo) return false;
    if (filter.unassigned === true && c.assignedReviewerId !== null) return false;
    if (filter.priority !== undefined && c.priority !== filter.priority) return false;
    if (filter.source !== undefined && c.source !== filter.source) return false;
    if (filter.hasConflicts === true && !c.resolutions.some((r) => r.status === 'conflict')) return false;
    return true;
  });
}

export type QueueSort = 'priority' | 'age' | 'last_activity';

const PRIORITY_RANK: Record<ReviewPriority, number> = { high: 0, normal: 1, low: 2 };

/** Deterministic, stable sort (ties broken by caseId so results are reproducible). */
export function sortQueue(cases: readonly VerificationCase[], sort: QueueSort): VerificationCase[] {
  const withIndex = cases.map((c, i) => ({ c, i }));
  withIndex.sort((a, b) => {
    let cmp: number;
    if (sort === 'priority') cmp = PRIORITY_RANK[a.c.priority] - PRIORITY_RANK[b.c.priority];
    else if (sort === 'age') cmp = a.c.createdAt.localeCompare(b.c.createdAt);
    else cmp = b.c.lastActivityAt.localeCompare(a.c.lastActivityAt);
    if (cmp !== 0) return cmp;
    const tie = a.c.caseId.localeCompare(b.c.caseId);
    return tie !== 0 ? tie : a.i - b.i;
  });
  return withIndex.map((x) => x.c);
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function paginate<T>(items: readonly T[], page: number, pageSize: number): Page<T> {
  const safeSize = Math.max(1, pageSize);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / safeSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * safeSize;
  return { items: items.slice(start, start + safeSize), page: safePage, pageSize: safeSize, total, totalPages };
}
