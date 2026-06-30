/**
 * DEV-ONLY product snapshot audit (route: /dev/snapshot-audit).
 *
 * READ-ONLY history viewer over the append-only `product_snapshots` table. Pick one of the
 * owner's products (by product_code) → its snapshots, newest first: when it was taken, the
 * change_type (created / nutrition / price / source / …), the source_url, and the per-field
 * from→to changes. It never edits a snapshot and never writes a product — it only reads via
 * listMyProducts + listProductSnapshots.
 *
 * Boundaries (SnapshotAuditPage.security.test.ts): DEV-only; reads only; no write verbs, no
 * write service, no pac/pod, no mapper_basement, no npac.
 */
import { useState } from 'react';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { listMyProducts } from '@/services/products';
import { listProductSnapshots, type ProductSnapshotRow } from '@/services/productSnapshots';
import { parseDetectedChanges } from '@/data/products/productSnapshotDiff';
import { filterSnapshotsByType, snapshotChangeTypes, summarizeSnapshots } from './snapshotAuditFilters';
import type { ProductRow } from '@/data/products/productRow';

const CHANGE_STYLE: Record<string, string> = {
  created: 'bg-stone-100 text-stone-600',
  nutrition: 'bg-emerald-100 text-emerald-700',
  price: 'bg-sky-100 text-sky-700',
  package: 'bg-violet-100 text-violet-700',
  ingredients: 'bg-amber-100 text-amber-700',
  source: 'bg-stone-100 text-stone-600',
  image: 'bg-stone-100 text-stone-600',
  other: 'bg-stone-100 text-stone-500',
};

const fmt = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));

export function SnapshotAuditView({ snapshots }: { snapshots: ProductSnapshotRow[] }) {
  const [typeFilter, setTypeFilter] = useState('all');
  if (snapshots.length === 0) {
    return <p className="mt-6 text-sm text-stone-600">No snapshots for this product.</p>;
  }
  const summary = summarizeSnapshots(snapshots);
  const types = snapshotChangeTypes(snapshots);
  const visible = filterSnapshotsByType(snapshots, typeFilter);
  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="font-mono text-stone-500">
          {snapshots.length} snapshot{snapshots.length === 1 ? '' : 's'} ·{' '}
          {summary.map((x) => `${x.count} ${x.change_type}`).join(' · ')}
        </span>
        <label className="font-mono text-stone-500">
          type{' '}
          <select
            className="rounded border border-stone-200 px-2 py-1 text-xs"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">All</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-3 space-y-3">
      {visible.map((s) => {
        const changes = parseDetectedChanges(s.detected_changes);
        return (
          <div key={s.id} className="rounded-md border border-stone-200 bg-white px-4 py-3 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className={`rounded px-1.5 py-0.5 font-mono text-xs ${CHANGE_STYLE[s.change_type] ?? CHANGE_STYLE.other}`}>
                {s.change_type}
              </span>
              <span className="font-mono text-xs text-stone-400">{s.snapshot_at}</span>
            </div>
            <p className="mt-1 font-mono text-xs text-stone-500">source: {fmt(s.source_url)}</p>
            {changes.length > 0 ? (
              <table className="mt-2 w-full text-xs">
                <tbody>
                  {changes.map((c) => (
                    <tr key={c.field}>
                      <td className="py-0.5 text-stone-500">{c.field}</td>
                      <td className="py-0.5 text-right font-mono tabular-nums text-stone-400">{fmt(c.from)}</td>
                      <td className="py-0.5 text-center text-stone-300">→</td>
                      <td className="py-0.5 text-left font-mono tabular-nums">{fmt(c.to)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-1 text-xs text-stone-400">{s.change_type === 'created' ? 'initial snapshot' : 'no field-level diff recorded'}</p>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}

export function SnapshotAuditPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [snapshots, setSnapshots] = useState<ProductSnapshotRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!import.meta.env.DEV) return <NotFoundPage />;

  const loadProducts = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      setProducts(await listMyProducts());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  const selectProduct = async (id: string) => {
    setSelectedProductId(id);
    setSnapshots([]);
    setLoaded(false);
    if (id === '') return;
    setLoading(true);
    setErrorMessage(null);
    try {
      setSnapshots(await listProductSnapshots(id));
      setLoaded(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-paper px-6 py-16 text-ink">
      <p className="font-mono text-xs uppercase tracking-wide text-stone-400">DEV · internal</p>
      <h1 className="mt-3 text-2xl font-light tracking-tight">Product snapshot audit</h1>
      <p className="mt-2 text-sm text-stone-600">
        Read-only history from the append-only product_snapshots table. Nothing here edits a snapshot or a product.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium hover:border-stone-500"
          onClick={() => void loadProducts()}
          disabled={loading}
        >
          {products.length === 0 ? 'Load my products' : `Reload (${products.length})`}
        </button>
        {products.length > 0 ? (
          <label className="font-mono text-xs text-stone-500">
            product{' '}
            <select
              className="rounded border border-stone-200 px-2 py-1 text-xs"
              value={selectedProductId}
              onChange={(e) => void selectProduct(e.target.value)}
            >
              <option value="">— select —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.product_code} · {p.product_name_display ?? '(no name)'}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {errorMessage !== null ? <p className="mt-4 text-sm text-status-risky">Error: {errorMessage}</p> : null}
      {loading ? <p className="mt-4 text-sm text-stone-600">Loading…</p> : null}
      {selectedProductId !== '' && loaded ? <SnapshotAuditView snapshots={snapshots} /> : null}
    </div>
  );
}
