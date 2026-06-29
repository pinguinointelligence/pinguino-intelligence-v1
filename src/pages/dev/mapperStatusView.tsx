/**
 * Presentational view for the DEV-only Mapper STATUS control page. Pure + side-effect-free:
 * it shows each product's mapper_status, current lifecycle status, the recommended status,
 * red flags, blockers, and engine-readiness, and offers three reviewer actions:
 *   • Apply recommended (safe; never PI Verified)
 *   • Manual adjust → manual_adjusted (needs a reviewer reason)
 *   • Verify → PI Verified (needs a reviewer reason; DISABLED for red-flagged products)
 * No service / DB import — SSR-testable; PI Verified is never offered for a red-flagged row.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { STATUS_FILTERS, filterStatusRows, type StatusFilter } from './mapperStatusFilters';

export interface StatusRow {
  code: string;
  id: string;
  product_name: string | null;
  mapper_status: string | null;
  current_status: string;
  recommended_status: string;
  customer_label: string | null;
  engine_readiness: 'product_measured' | 'reference_linked' | 'unresolved';
  red_flag_codes: string[];
  blockers: string[];
  /** matches the picker's "My Products" gate — selectable in a Studio recipe. */
  studio_eligible: boolean;
}

export interface MapperStatusViewProps {
  rows: StatusRow[];
  loading: boolean;
  loaded: boolean;
  busyId: string | null;
  message: string | null;
  errorMessage: string | null;
  reasons: Record<string, string>;
  onLoad: () => void;
  onReasonChange: (id: string, reason: string) => void;
  onApply: (id: string) => void;
  onManualAdjust: (id: string) => void;
  onVerify: (id: string) => void;
}

const READINESS_LABEL: Record<StatusRow['engine_readiness'], string> = {
  product_measured: 'engine-ready (own measured pac/pod)',
  reference_linked: 'reference-linked (NOT independently measured)',
  unresolved: 'not engine-ready',
};

export function MapperStatusView({
  rows,
  loading,
  loaded,
  busyId,
  message,
  errorMessage,
  reasons,
  onLoad,
  onReasonChange,
  onApply,
  onManualAdjust,
  onVerify,
}: MapperStatusViewProps) {
  const [filter, setFilter] = useState<StatusFilter>('all');
  const visible = filterStatusRows(rows, filter);
  return (
    <div className="mx-auto min-h-screen max-w-3xl bg-paper px-6 py-16 text-ink">
      <p className="font-mono text-xs uppercase tracking-wide text-stone-400">DEV · internal</p>
      <h1 className="mt-3 text-2xl font-light tracking-tight">Mapper status control</h1>

      <div className="mt-6 rounded-md border border-amber-400/50 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
        <strong>Warning.</strong> These write <strong>only</strong> the product lifecycle <code>status</code>
        (+ review audit) — never pac/pod, identity, or the locked reference base. <strong>Apply</strong> sets the
        safe recommended status. <strong>Verify</strong> sets <code>pi_verified</code> and needs a written reviewer
        reason — it is <strong>blocked for any red-flagged product</strong> and never runs automatically.
        <strong> Manual adjust</strong> sets <code>manual_adjusted</code> with a reason.
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={onLoad} disabled={loading}>
          {loading ? 'Loading…' : 'Load products'}
        </Button>
        {loaded ? (
          <label className="font-mono text-xs text-stone-500">
            filter{' '}
            <select
              className="rounded border border-stone-200 px-2 py-1 text-xs"
              value={filter}
              onChange={(e) => setFilter(e.target.value as StatusFilter)}
            >
              {STATUS_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {message !== null ? <p className="mt-4 text-sm text-stone-600">{message}</p> : null}
      {errorMessage !== null ? <p className="mt-4 text-sm text-status-risky">Error: {errorMessage}</p> : null}
      {loaded && rows.length === 0 ? <p className="mt-4 text-sm text-stone-600">No products loaded.</p> : null}
      {loaded && rows.length > 0 ? (
        <p className="mt-4 font-mono text-xs text-stone-500">
          {rows.filter((r) => r.studio_eligible).length} / {rows.length} Studio-eligible · showing {visible.length}
        </p>
      ) : null}

      <div className="mt-6 space-y-4">
        {visible.map((r) => {
          const upToDate = r.current_status === r.recommended_status;
          const redFlagged = r.red_flag_codes.length > 0;
          const reason = (reasons[r.id] ?? '').trim();
          const busy = busyId === r.id;
          const applyDisabled = busy || upToDate || (redFlagged && reason === '');
          return (
            <div key={r.id} className="rounded-md border border-stone-200 bg-white px-4 py-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <span className="font-mono text-xs text-stone-500">{r.code}</span>{' '}
                  <span className="font-medium">{r.product_name ?? '—'}</span>
                </div>
                <span className="flex items-center gap-2 font-mono text-xs text-stone-500">
                  <span
                    className={
                      r.studio_eligible
                        ? 'rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700'
                        : 'rounded bg-stone-100 px-1.5 py-0.5 text-stone-400'
                    }
                  >
                    {r.studio_eligible ? 'Studio ✓' : 'Studio ✗'}
                  </span>
                  mapper: {r.mapper_status ?? 'null'}
                </span>
              </div>
              <p className="mt-1 font-mono text-xs">
                status <strong>{r.current_status}</strong> → recommended <strong>{r.recommended_status}</strong>
                {r.customer_label ? ` (${r.customer_label})` : ''} · {READINESS_LABEL[r.engine_readiness]}
              </p>
              {redFlagged ? (
                <p className="mt-1 font-mono text-xs text-status-risky">red flags: {r.red_flag_codes.join(', ')} · PI Verified blocked</p>
              ) : null}
              {r.blockers.length > 0 ? (
                <p className="mt-1 text-xs text-stone-500">blockers: {r.blockers.join(' · ')}</p>
              ) : null}

              <input
                className="mt-2 w-full rounded border border-stone-200 px-2 py-1 font-mono text-xs"
                placeholder="reviewer reason — required to verify, manual-adjust, or apply to a red-flagged product"
                value={reasons[r.id] ?? ''}
                onChange={(e) => onReasonChange(r.id, e.target.value)}
              />

              <div className="mt-2 flex flex-wrap gap-2">
                {upToDate ? (
                  <span className="text-xs text-stone-400">status up to date</span>
                ) : (
                  <Button size="sm" variant="primary" onClick={() => onApply(r.id)} disabled={applyDisabled}>
                    {busy ? 'Applying…' : `Apply ${r.recommended_status}`}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => onManualAdjust(r.id)} disabled={busy || reason === ''}>
                  Manual adjust
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onVerify(r.id)} disabled={busy || redFlagged || reason === ''}>
                  Verify (PI Verified)
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
