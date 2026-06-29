/**
 * Presentational view for the DEV-only Mapper review page. Pure + side-effect-free: it
 * takes the review rows + callbacks and renders the product-vs-candidate comparison with
 * Confirm / Reject buttons. No service, no store, no DB import — SSR-testable, and the
 * boundary scan never sees a write path here.
 */
import { Button } from '@/components/ui/Button';

export interface ReviewRow {
  code: string;
  id: string;
  product_name: string | null;
  product_category: string | null;
  mapper_status: string | null;
  matched_basement_id: string | null;
  candidate_name: string | null;
  candidate_category: string | null;
  candidate_subcategory: string | null;
  product_fat: number | string | null;
  product_protein: number | string | null;
  product_sugars: number | string | null;
  candidate_fat: number | string | null;
  candidate_protein: number | string | null;
  candidate_sugars: number | string | null;
  candidate_pac: number | string | null;
  candidate_pod: number | string | null;
}

export interface MapperReviewViewProps {
  rows: ReviewRow[];
  loading: boolean;
  loaded: boolean;
  busyId: string | null;
  message: string | null;
  errorMessage: string | null;
  onLoad: () => void;
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
}

const cell = (v: number | string | null) => (v === null || v === '' ? '—' : String(v));

export function MapperReviewView({
  rows,
  loading,
  loaded,
  busyId,
  message,
  errorMessage,
  onLoad,
  onConfirm,
  onReject,
}: MapperReviewViewProps) {
  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-paper px-6 py-16 text-ink">
      <p className="font-mono text-xs uppercase tracking-wide text-stone-400">DEV · internal</p>
      <h1 className="mt-3 text-2xl font-light tracking-tight">Mapper review — confirm / reject</h1>

      <div className="mt-6 rounded-md border border-amber-400/50 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
        <strong>Warning.</strong> Confirm / Reject write <strong>only the Mapper-result columns</strong> on one
        product. <strong>Confirm</strong> → status <code>matched</code>, method <code>manual_mapping</code>,
        confidence <code>high</code>. <strong>Reject</strong> → status <code>rejected</code> and clears the
        candidate. Neither copies or calculates <code>pac_value</code>/<code>pod_value</code> — a confirmed
        mapping is <strong>not</strong> engine-ready. Nothing writes the locked reference base. You must be
        signed in as the product owner.
      </div>

      <div className="mt-6">
        <Button variant="primary" onClick={onLoad} disabled={loading}>
          {loading ? 'Loading…' : 'Load needs_review products'}
        </Button>
      </div>

      {message !== null ? <p className="mt-4 text-sm text-stone-600">{message}</p> : null}
      {errorMessage !== null ? <p className="mt-4 text-sm text-status-risky">Error: {errorMessage}</p> : null}
      {loaded && rows.length === 0 ? (
        <p className="mt-4 text-sm text-stone-600">No products in needs_review.</p>
      ) : null}

      <div className="mt-6 space-y-6">
        {rows.map((r) => {
          const resolved = r.mapper_status !== 'needs_review';
          const busy = busyId === r.id;
          return (
            <div key={r.id} className="rounded-md border border-stone-200 bg-white px-4 py-4">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <span className="font-mono text-xs text-stone-500">{r.code}</span>{' '}
                  <span className="text-sm font-medium">{r.product_name ?? '—'}</span>
                </div>
                <span className="font-mono text-xs uppercase tracking-wide text-stone-500">
                  {r.mapper_status ?? '—'}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-4 text-xs leading-relaxed">
                <div className="rounded border border-stone-100 bg-stone-50 p-3">
                  <p className="font-semibold text-ink">Product</p>
                  <p className="text-stone-500">{r.product_category ?? '—'}</p>
                  <p className="mt-2 font-mono">fat {cell(r.product_fat)} · prot {cell(r.product_protein)} · sugar {cell(r.product_sugars)}</p>
                  <p className="mt-1 font-mono text-stone-400">pac — · pod — (unsourced)</p>
                </div>
                <div className="rounded border border-stone-100 bg-stone-50 p-3">
                  <p className="font-semibold text-ink">Candidate · {r.matched_basement_id ?? '—'}</p>
                  <p className="text-stone-500">{r.candidate_name ?? '—'}</p>
                  <p className="text-stone-400">{r.candidate_category ?? '—'} / {r.candidate_subcategory ?? '—'}</p>
                  <p className="mt-2 font-mono">fat {cell(r.candidate_fat)} · prot {cell(r.candidate_protein)} · sugar {cell(r.candidate_sugars)}</p>
                  <p className="mt-1 font-mono">pac {cell(r.candidate_pac)} · pod {cell(r.candidate_pod)}</p>
                </div>
              </div>

              <div className="mt-4 flex gap-3">
                <Button size="sm" variant="primary" onClick={() => onConfirm(r.id)} disabled={busy || resolved}>
                  {busy ? 'Working…' : 'Confirm'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onReject(r.id)} disabled={busy || resolved}>
                  Reject
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
