/**
 * Presentational view for the DEV-only Mapper review page. Pure + side-effect-free: it
 * takes the review rows + callbacks and renders, per product, its composition next to the
 * computed candidate SHORTLIST (1–5 candidates), with a per-candidate Confirm and a single
 * Reject. No service, no store, no DB import — SSR-testable, and the boundary scan never
 * sees a write path here.
 */
import { Button } from '@/components/ui/Button';

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
  product_fat: number | string | null;
  product_carbohydrate: number | string | null;
  product_sugars: number | string | null;
  product_protein: number | string | null;
  product_salt: number | string | null;
  candidates: CandidateView[];
}

export interface MapperReviewViewProps {
  rows: ReviewRow[];
  loading: boolean;
  loaded: boolean;
  busyId: string | null;
  message: string | null;
  errorMessage: string | null;
  /** Counts of reviewable products NOT shown (broad-ambiguous >5, or no candidate). */
  hiddenBroad: number;
  hiddenNoCandidate: number;
  onLoad: () => void;
  onConfirm: (productId: string, basementId: string) => void;
  onReject: (productId: string) => void;
}

const cell = (v: number | string | null) => (v === null || v === '' ? '—' : String(v));

export function MapperReviewView({
  rows,
  loading,
  loaded,
  busyId,
  message,
  errorMessage,
  hiddenBroad,
  hiddenNoCandidate,
  onLoad,
  onConfirm,
  onReject,
}: MapperReviewViewProps) {
  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-paper px-6 py-16 text-ink">
      <p className="font-mono text-xs uppercase tracking-wide text-stone-400">DEV · internal</p>
      <h1 className="mt-3 text-2xl font-light tracking-tight">Mapper review — confirm / reject</h1>

      <div className="mt-6 rounded-md border border-amber-400/50 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
        <strong>Warning.</strong> Loads every reviewable product (not yet matched/rejected) and shows its
        computed candidate shortlist (composition is matched read-only — nothing is written on load).
        <strong> Confirm</strong> a single chosen candidate → status <code>matched</code>, method{' '}
        <code>manual_mapping</code>, confidence <code>high</code>. <strong>Reject</strong> → status{' '}
        <code>rejected</code>, candidate cleared. Neither copies or calculates{' '}
        <code>pac_value</code>/<code>pod_value</code> — a confirmed mapping is <strong>not</strong> engine-ready.
        Nothing writes the locked reference base. One product at a time; no batch. You must be signed in as the owner.
      </div>

      <div className="mt-6">
        <Button variant="primary" onClick={onLoad} disabled={loading}>
          {loading ? 'Loading…' : 'Load reviewable products'}
        </Button>
      </div>

      {message !== null ? <p className="mt-4 text-sm text-stone-600">{message}</p> : null}
      {errorMessage !== null ? <p className="mt-4 text-sm text-status-risky">Error: {errorMessage}</p> : null}
      {loaded ? (
        <p className="mt-4 text-xs text-stone-500">
          Showing {rows.length} product(s) with a 1–5 candidate shortlist. Hidden: {hiddenBroad} broadly
          ambiguous (&gt;5 candidates), {hiddenNoCandidate} with no candidate.
        </p>
      ) : null}

      <div className="mt-6 space-y-6">
        {rows.map((r) => {
          const resolved = r.mapper_status === 'matched' || r.mapper_status === 'rejected';
          const busy = busyId === r.id;
          return (
            <div key={r.id} className="rounded-md border border-stone-200 bg-white px-4 py-4">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <span className="font-mono text-xs text-stone-500">{r.code}</span>{' '}
                  <span className="text-sm font-medium">{r.product_name ?? '—'}</span>{' '}
                  <span className="text-xs text-stone-400">({r.product_category ?? '—'})</span>
                </div>
                <span className="font-mono text-xs uppercase tracking-wide text-stone-500">
                  {r.mapper_status ?? 'unreviewed'}
                </span>
              </div>

              <p className="mt-2 font-mono text-xs text-stone-600">
                product · fat {cell(r.product_fat)} · carb {cell(r.product_carbohydrate)} · sugar{' '}
                {cell(r.product_sugars)} · prot {cell(r.product_protein)} · salt {cell(r.product_salt)} · pac — · pod —
              </p>

              <ul className="mt-3 space-y-2">
                {r.candidates.map((c) => (
                  <li key={c.basement_id} className="rounded border border-stone-100 bg-stone-50 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <span className="font-mono text-stone-500">{c.basement_id}</span>{' '}
                        <span className="font-medium">{c.name ?? '—'}</span>{' '}
                        <span className="text-stone-400">
                          {c.category ?? '—'}/{c.subcategory ?? '—'} · Δ {cell(c.mean_pp)} pp
                        </span>
                        <p className="mt-1 font-mono text-stone-500">
                          fat {cell(c.fat)} · carb {cell(c.carbohydrate)} · sugar {cell(c.sugars)} · prot{' '}
                          {cell(c.protein)} · salt {cell(c.salt)} · pac {cell(c.pac)} · pod {cell(c.pod)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => onConfirm(r.id, c.basement_id)}
                        disabled={busy || resolved}
                      >
                        {busy ? 'Working…' : 'Confirm'}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>

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
