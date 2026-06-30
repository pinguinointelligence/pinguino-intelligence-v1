/**
 * Presentational view for the DEV-only Mapper review WORKSTATION. Pure + side-effect-free:
 * it takes review rows + filters + callbacks and renders, per product, its red flags +
 * recommended status + composition next to the computed candidate SHORTLIST, with a
 * per-candidate Confirm and a Reject. Filtering is the pure `filterReviewRows`. No service /
 * store / DB import — SSR-testable; the boundary scan never sees a write path here.
 */
import { Button } from '@/components/ui/Button';
import { filterReviewRows, reviewRowTiebreak } from './mapperReviewFilters';

export interface CandidateView {
  basement_id: string;
  name: string | null;
  category: string | null;
  subcategory: string | null;
  fat: number | string | null;
  carbohydrate: number | string | null;
  sugars: number | string | null;
  protein: number | string | null;
  salt: number | string | null;
  pac: number | string | null;
  pod: number | string | null;
  /** Mean absolute per-field distance (pp), already rounded for display. */
  mean_pp: number | string | null;
}

export interface ReviewRow {
  code: string;
  id: string;
  product_name: string | null;
  product_category: string | null;
  mapper_status: string | null;
  product_status: string;
  recommended_status: string;
  red_flag_codes: string[];
  /** total composition candidates (may exceed the displayed shortlist). */
  candidate_count: number;
  product_fat: number | string | null;
  product_carbohydrate: number | string | null;
  product_sugars: number | string | null;
  product_protein: number | string | null;
  product_salt: number | string | null;
  candidates: CandidateView[];
}

export interface ReviewFilters {
  mapperStatus: string; // 'all' | 'null' | 'matched' | 'rejected' | 'needs_review' | 'ambiguous'
  category: string; // 'all' | <category>
  redFlaggedOnly: boolean;
  candidateBucket: string; // 'all' | '0' | '1' | '2-5' | '6+'
  tiebreakFilter: string; // 'all' | 'hit' | 'no_hit'
}

export interface MapperReviewViewProps {
  rows: ReviewRow[];
  loading: boolean;
  loaded: boolean;
  busyId: string | null;
  message: string | null;
  errorMessage: string | null;
  filters: ReviewFilters;
  onFilterChange: (filters: ReviewFilters) => void;
  onLoad: () => void;
  onConfirm: (productId: string, basementId: string) => void;
  onReject: (productId: string) => void;
}

const cell = (v: number | string | null) => (v === null || v === '' ? '—' : String(v));
const MAPPER_STATES = ['all', 'null', 'matched', 'rejected', 'needs_review', 'ambiguous'];
const BUCKETS = ['all', '0', '1', '2-5', '6+'];
const TIEBREAK_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'any tiebreak' },
  { value: 'narrowed', label: 'unique narrowed' },
  { value: 'ranked', label: 'ranked shortlist' },
  { value: 'no_hit', label: 'no tiebreak hit' },
];

export function MapperReviewView({
  rows,
  loading,
  loaded,
  busyId,
  message,
  errorMessage,
  filters,
  onFilterChange,
  onLoad,
  onConfirm,
  onReject,
}: MapperReviewViewProps) {
  const categories = ['all', ...new Set(rows.map((r) => r.product_category).filter((c): c is string => !!c))];
  const visible = filterReviewRows(rows, filters);
  const set = (patch: Partial<ReviewFilters>) => onFilterChange({ ...filters, ...patch });

  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-paper px-6 py-16 text-ink">
      <p className="font-mono text-xs uppercase tracking-wide text-stone-400">DEV · internal</p>
      <h1 className="mt-3 text-2xl font-light tracking-tight">Mapper review — workstation</h1>

      <div className="mt-6 rounded-md border border-amber-400/50 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
        <strong>Warning.</strong> Loads every product and matches read-only (nothing written on load).
        <strong> Confirm</strong> a chosen candidate → <code>matched</code> / <code>manual_mapping</code> /{' '}
        <code>high</code>; <strong>Reject</strong> → <code>rejected</code>. Neither copies or calculates{' '}
        <code>pac_value</code>/<code>pod_value</code> — <strong>PAC/POD not copied; a confirmed mapping is NOT
        engine-ready.</strong> Nothing writes the locked reference base. One product at a time; no batch.
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={onLoad} disabled={loading}>
          {loading ? 'Loading…' : 'Load products'}
        </Button>
        <select aria-label="mapper status filter" className="rounded border border-stone-300 px-2 py-1 text-xs" value={filters.mapperStatus} onChange={(e) => set({ mapperStatus: e.target.value })}>
          {MAPPER_STATES.map((s) => <option key={s} value={s}>{s === 'all' ? 'all mapper' : s}</option>)}
        </select>
        <select aria-label="category filter" className="rounded border border-stone-300 px-2 py-1 text-xs" value={filters.category} onChange={(e) => set({ category: e.target.value })}>
          {categories.map((c) => <option key={c} value={c}>{c === 'all' ? 'all categories' : c}</option>)}
        </select>
        <select aria-label="candidate count filter" className="rounded border border-stone-300 px-2 py-1 text-xs" value={filters.candidateBucket} onChange={(e) => set({ candidateBucket: e.target.value })}>
          {BUCKETS.map((b) => <option key={b} value={b}>{b === 'all' ? 'any candidates' : `${b} cand`}</option>)}
        </select>
        <select aria-label="tiebreak filter" className="rounded border border-stone-300 px-2 py-1 text-xs" value={filters.tiebreakFilter} onChange={(e) => set({ tiebreakFilter: e.target.value })}>
          {TIEBREAK_FILTERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <label className="flex items-center gap-1 text-xs text-stone-600">
          <input type="checkbox" checked={filters.redFlaggedOnly} onChange={(e) => set({ redFlaggedOnly: e.target.checked })} /> red-flagged only
        </label>
      </div>

      {message !== null ? <p className="mt-4 text-sm text-stone-600">{message}</p> : null}
      {errorMessage !== null ? <p className="mt-4 text-sm text-status-risky">Error: {errorMessage}</p> : null}
      {loaded ? (
        <p className="mt-4 text-xs text-stone-500">Showing {visible.length} of {rows.length} loaded products.</p>
      ) : null}

      <div className="mt-6 space-y-6">
        {visible.map((r) => {
          const resolved = r.mapper_status === 'matched' || r.mapper_status === 'rejected';
          const busy = busyId === r.id;
          const noCandidate = r.candidate_count === 0;
          const tb = reviewRowTiebreak(r);
          const scoreOf = new Map(tb.ranked.map((x) => [x.id, x.score]));
          return (
            <div key={r.id} className="rounded-md border border-stone-200 bg-white px-4 py-4">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <span className="font-mono text-xs text-stone-500">{r.code}</span>{' '}
                  <span className="text-sm font-medium">{r.product_name ?? '—'}</span>{' '}
                  <span className="text-xs text-stone-400">({r.product_category ?? '—'})</span>
                </div>
                <span className="font-mono text-xs uppercase tracking-wide text-stone-500">
                  {r.mapper_status ?? 'unreviewed'} · {r.product_status}
                </span>
              </div>

              <p className="mt-1 text-xs text-stone-500">
                recommended status: <strong>{r.recommended_status}</strong> · candidates: {r.candidate_count}
                {r.red_flag_codes.length > 0 ? (
                  <span className="text-status-risky"> · red flags: {r.red_flag_codes.join(', ')}</span>
                ) : null}
              </p>

              <p className="mt-2 font-mono text-xs text-stone-600">
                product · fat {cell(r.product_fat)} · carb {cell(r.product_carbohydrate)} · sugar{' '}
                {cell(r.product_sugars)} · prot {cell(r.product_protein)} · salt {cell(r.product_salt)} · pac — · pod —
              </p>

              {!noCandidate ? (
                <p className="mt-1 font-mono text-xs text-stone-500">
                  tiebreak:{' '}
                  {tb.status === 'narrowed' ? (
                    <span className="text-emerald-700">narrows to {tb.narrowedId} (unique concept score {tb.topScore})</span>
                  ) : tb.status === 'ranked' ? (
                    <span className="text-amber-700">ranked top (score {tb.topScore}, not unique — shortlist stays ambiguous)</span>
                  ) : (
                    <span className="text-stone-400">no name evidence — composition only</span>
                  )}
                  {!resolved ? (
                    <span className="text-stone-400"> · confirm a candidate → matched · becomes {r.recommended_status}</span>
                  ) : null}
                </p>
              ) : null}

              {noCandidate ? (
                <p className="mt-2 text-xs text-stone-500">No composition candidate — may need a new reference-base ingredient.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {r.candidates.map((c) => (
                    <li key={c.basement_id} className="rounded border border-stone-100 bg-stone-50 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <span className="font-mono text-stone-500">{c.basement_id}</span>{' '}
                          <span className="font-medium">{c.name ?? '—'}</span>{' '}
                          {(scoreOf.get(c.basement_id) ?? 0) > 0 ? (
                            <span className={c.basement_id === tb.narrowedId ? 'font-mono text-emerald-700' : 'font-mono text-amber-700'}>
                              · name {scoreOf.get(c.basement_id)}{c.basement_id === tb.narrowedId ? ' ◀ narrows' : ''}
                            </span>
                          ) : null}{' '}
                          <span className="text-stone-400">{c.category ?? '—'}/{c.subcategory ?? '—'} · Δ {cell(c.mean_pp)} pp</span>
                          <p className="mt-1 font-mono text-stone-500">
                            fat {cell(c.fat)} · carb {cell(c.carbohydrate)} · sugar {cell(c.sugars)} · prot{' '}
                            {cell(c.protein)} · salt {cell(c.salt)} · pac {cell(c.pac)} · pod {cell(c.pod)}
                          </p>
                        </div>
                        <Button size="sm" variant="primary" onClick={() => onConfirm(r.id, c.basement_id)} disabled={busy || resolved}>
                          {busy ? 'Working…' : 'Confirm'}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3">
                <Button size="sm" variant="ghost" onClick={() => onReject(r.id)} disabled={busy || resolved}>
                  Reject all
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
