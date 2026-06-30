/**
 * DEV-ONLY keyless enrichment workflow (route: /dev/enrichment-preview).
 *
 * Step 1 — PREVIEW: enter an EAN → read-only, KEYLESS OpenFoodFacts lookup
 * (fetchOpenFoodFactsProduct) → found / not-found + parsed per-100g nutrition + source tier.
 * Step 2 — REVIEWED MERGE: pick one of the owner's products → a per-field comparison (stored vs
 * OFF: fill / agree / conflict / skip) → tick the fields to apply → "Apply selected enrichment".
 *
 * Safety: the write goes through `applyProductEnrichment`, which writes ONLY the label-nutrition
 * allowlist (never pac/pod, identity/EAN/product_code, status, or mapper_basement), snapshots the
 * change, and refuses a PI Verified product unless the reviewer explicitly overrides. OFF is a
 * weak `public_composition_db` source, so conflicts default to KEEP-stored (unticked). Mercadona
 * private-label EANs aren't in OFF (404 → not-found); use a known public EAN to exercise step 2.
 *
 * Boundaries (EnrichmentPreviewPage.security.test.ts): DEV-only; reads via fetchOpenFoodFactsProduct
 * + listMyProducts; the ONLY write is applyProductEnrichment; no secret/API key; no npac.
 */
import { useState } from 'react';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { fetchOpenFoodFactsProduct } from '@/services/openFoodFacts';
import { listMyProducts } from '@/services/products';
import { applyProductEnrichment } from '@/services/productEnrichment';
import {
  buildEnrichmentPatch,
  compareEnrichment,
  previewEnrichmentWrite,
  safeFillFields,
  type EnrichableField,
  type EnrichmentComparison,
} from '@/data/products/productEnrichment';
import type { OffProduct } from '@/data/products/openFoodFactsAdapter';
import type { ProductRow } from '@/data/products/productRow';

const FIELD_LABEL: Record<EnrichableField, string> = {
  fat_percent: 'fat',
  saturated_fat_percent: 'saturated fat',
  carbohydrate_percent: 'carbohydrate',
  total_sugars_percent: 'sugars',
  protein_percent: 'protein',
  salt_percent: 'salt',
  kcal_per_100g: 'kcal',
};

const DECISION_STYLE: Record<string, string> = {
  fill: 'text-emerald-700',
  agree: 'text-stone-400',
  conflict: 'text-amber-700',
  skip: 'text-stone-300',
};

const num = (v: number | null) => (v === null ? '—' : v);
const onlyDigits = (s: string | null) => (s ?? '').replace(/\D+/g, '');

export function EnrichmentPreviewView({
  result,
  loading,
  errorMessage,
}: {
  result: OffProduct | null;
  loading: boolean;
  errorMessage: string | null;
}) {
  return (
    <div className="mt-6">
      {loading ? <p className="text-sm text-stone-600">Looking up…</p> : null}
      {errorMessage !== null ? <p className="text-sm text-status-risky">Error: {errorMessage}</p> : null}
      {result && !loading ? (
        result.found ? (
          <div className="rounded-md border border-stone-200 bg-white px-4 py-3 text-sm">
            <p className="font-medium">{result.name ?? '(no name)'}</p>
            <p className="mt-1 font-mono text-xs text-stone-500">
              EAN {result.ean ?? '—'} · source: public composition DB (lower priority than a producer / retailer label)
            </p>
            <table className="mt-2 w-full text-xs">
              <tbody>
                {(Object.keys(FIELD_LABEL) as EnrichableField[]).map((key) => (
                  <tr key={key}>
                    <td className="py-0.5 text-stone-500">{FIELD_LABEL[key]}</td>
                    <td className="py-0.5 text-right font-mono tabular-nums">{num(result.nutrition[key])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-stone-600">Not found in OpenFoodFacts for EAN {result.ean ?? '—'}.</p>
        )
      ) : null}
    </div>
  );
}

export interface EnrichmentMergeViewProps {
  comparison: EnrichmentComparison;
  productCode: string;
  productName: string | null;
  productEan: string | null;
  productStatus: string;
  selected: EnrichableField[];
  override: boolean;
  reason: string;
  applying: boolean;
  applyMessage: string | null;
  applyError: string | null;
  onToggle: (field: EnrichableField) => void;
  onOverrideChange: (on: boolean) => void;
  onReasonChange: (reason: string) => void;
  onApply: () => void;
}

export function EnrichmentMergeView({
  comparison,
  productCode,
  productName,
  productEan,
  productStatus,
  selected,
  override,
  reason,
  applying,
  applyMessage,
  applyError,
  onToggle,
  onOverrideChange,
  onReasonChange,
  onApply,
}: EnrichmentMergeViewProps) {
  const isPiVerified = productStatus === 'pi_verified';
  const eanMismatch = !!comparison.ean && !!productEan && onlyDigits(comparison.ean) !== onlyDigits(productEan);
  const sel = new Set(selected);
  const conflictSelected = comparison.fields.some((f) => f.decision === 'conflict' && sel.has(f.field));
  const blockedByPiV = isPiVerified && (!override || reason.trim() === '');
  const preview = previewEnrichmentWrite(comparison, selected);
  const canApply = selected.length > 0 && !applying && !blockedByPiV;

  return (
    <div className="mt-6 rounded-md border border-stone-200 bg-white px-4 py-3 text-sm">
      <p className="font-medium">
        Merge into <span className="font-mono text-xs">{productCode}</span> {productName ?? ''}
      </p>
      <p className="mt-1 font-mono text-xs text-stone-500">
        {comparison.fill_count} to fill · {comparison.conflict_count} conflict · OFF is public-DB (weaker than a producer/retailer label)
      </p>
      {eanMismatch ? (
        <p className="mt-1 text-xs text-amber-700">
          EAN mismatch — OFF {comparison.ean} vs product {productEan}. Verify this is the same product before applying.
        </p>
      ) : null}

      <table className="mt-3 w-full text-xs">
        <thead>
          <tr className="text-stone-400">
            <th className="w-8 text-left font-normal"> </th>
            <th className="text-left font-normal">field</th>
            <th className="text-right font-normal">stored</th>
            <th className="text-right font-normal">OFF</th>
            <th className="text-right font-normal">decision</th>
          </tr>
        </thead>
        <tbody>
          {comparison.fields.map((f) => {
            const selectable = f.decision === 'fill' || f.decision === 'conflict';
            return (
              <tr key={f.field}>
                <td className="py-0.5">
                  {selectable ? (
                    <input
                      type="checkbox"
                      aria-label={`apply ${f.field}`}
                      checked={sel.has(f.field)}
                      onChange={() => onToggle(f.field)}
                    />
                  ) : null}
                </td>
                <td className="py-0.5 text-stone-500">{FIELD_LABEL[f.field]}</td>
                <td className="py-0.5 text-right font-mono tabular-nums">{num(f.stored)}</td>
                <td className="py-0.5 text-right font-mono tabular-nums">{num(f.incoming)}</td>
                <td className={`py-0.5 text-right font-mono ${DECISION_STYLE[f.decision]}`}>{f.decision}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {conflictSelected ? (
        <p className="mt-2 text-xs text-amber-700">
          A conflict field is selected — you are overriding a stored value with a weaker public-DB source.
        </p>
      ) : null}

      <div className="mt-3 rounded border border-stone-100 bg-stone-50 px-3 py-2 text-xs">
        <p className="font-mono text-stone-600">
          proposed write payload ({Object.keys(preview.patch).length} field{Object.keys(preview.patch).length === 1 ? '' : 's'})
        </p>
        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all font-mono text-stone-700">
          {Object.keys(preview.patch).length === 0 ? '{}  (nothing selected)' : JSON.stringify(preview.patch)}
        </pre>
        <p className="mt-1 font-mono text-stone-600">
          snapshot on apply: {preview.snapshot_change_type === 'none' ? 'none (no field changes)' : preview.snapshot_change_type}
        </p>
        {preview.snapshot_changes.length > 0 ? (
          <ul className="mt-0.5 list-disc pl-4 text-stone-500">
            {preview.snapshot_changes.map((c) => (
              <li key={c.field}>
                {c.field}: {c.from === null ? '—' : c.from} → {c.to}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {isPiVerified ? (
        <div className="mt-3 rounded border border-status-risky/40 bg-red-50 px-3 py-2 text-xs text-status-risky">
          <p>
            <strong>PI Verified</strong> — enrichment is blocked unless you explicitly override.
          </p>
          <label className="mt-2 flex items-center gap-2">
            <input type="checkbox" checked={override} onChange={(e) => onOverrideChange(e.target.checked)} />
            Override PI Verified for this write
          </label>
          <input
            className="mt-2 w-full rounded border border-stone-200 px-2 py-1 font-mono"
            placeholder="reviewer reason (required to override)"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
          />
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium hover:border-stone-500 disabled:opacity-40"
          onClick={onApply}
          disabled={!canApply}
        >
          {applying ? 'Applying…' : `Apply selected enrichment (${selected.length})`}
        </button>
        {applyMessage ? <span className="text-xs text-emerald-700">{applyMessage}</span> : null}
        {applyError ? <span className="text-xs text-status-risky">Error: {applyError}</span> : null}
      </div>
    </div>
  );
}

export function EnrichmentPreviewPage() {
  const [ean, setEan] = useState('');
  const [result, setResult] = useState<OffProduct | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selected, setSelected] = useState<EnrichableField[]>([]);
  const [override, setOverride] = useState(false);
  const [reason, setReason] = useState('');
  const [applying, setApplying] = useState(false);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  const selectedProduct = products.find((p) => p.id === selectedProductId) ?? null;
  const comparison: EnrichmentComparison | null =
    result?.found && selectedProduct ? compareEnrichment(selectedProduct, result) : null;

  if (!import.meta.env.DEV) return <NotFoundPage />;

  /** Reset the per-field selection (default = safe gap-fills) + override state on (re)selection. */
  const resetSelection = (next: EnrichmentComparison | null) => {
    setSelected(next ? safeFillFields(next) : []);
    setApplyMessage(null);
    setApplyError(null);
    setOverride(false);
    setReason('');
  };

  const selectProduct = (id: string) => {
    setSelectedProductId(id);
    const p = products.find((x) => x.id === id) ?? null;
    resetSelection(p && result?.found ? compareEnrichment(p, result) : null);
  };

  const lookup = async () => {
    if (ean.trim() === '') return;
    setLoading(true);
    setErrorMessage(null);
    setResult(null);
    setSelectedProductId('');
    resetSelection(null);
    try {
      setResult(await fetchOpenFoodFactsProduct(ean.trim()));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async () => {
    try {
      const rows = await listMyProducts();
      setProducts(rows);
      // Auto-select the product whose EAN matches the looked-up source (load by EAN).
      const wantEan = result?.ean ? result.ean.replace(/\D+/g, '') : '';
      const match = wantEan ? rows.find((p) => (p.ean_code ?? '').replace(/\D+/g, '') === wantEan) : undefined;
      if (match) {
        setSelectedProductId(match.id);
        resetSelection(result?.found ? compareEnrichment(match, result) : null);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const toggle = (field: EnrichableField) =>
    setSelected((prev) => (prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]));

  const apply = async () => {
    if (!comparison || !selectedProduct) return;
    setApplying(true);
    setApplyMessage(null);
    setApplyError(null);
    try {
      const patch = buildEnrichmentPatch(comparison, selected);
      const res = await applyProductEnrichment(selectedProduct.id, patch, {
        allowPiVerifiedOverride: override,
        reason: reason.trim() || undefined,
      });
      setApplyMessage(
        `Applied ${res.appliedFields.length} field(s); snapshot ${res.snapshot ? res.snapshot.change_type : 'unchanged'}.`,
      );
      setProducts((prev) => prev.map((p) => (p.id === res.product.id ? res.product : p)));
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : String(error));
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-xl bg-paper px-6 py-16 text-ink">
      <p className="font-mono text-xs uppercase tracking-wide text-stone-400">DEV · internal</p>
      <h1 className="mt-3 text-2xl font-light tracking-tight">Enrichment (OpenFoodFacts)</h1>
      <p className="mt-2 text-sm text-stone-600">
        Read-only keyless lookup by EAN, then a reviewed per-field merge. Writes only label nutrition
        (never PAC/POD, identity, or the reference base); every applied change is snapshotted.
      </p>

      <div className="mt-6 flex gap-2">
        <input
          className="flex-1 rounded border border-stone-200 px-3 py-2 font-mono text-sm"
          placeholder="EAN / barcode"
          value={ean}
          onChange={(e) => setEan(e.target.value)}
        />
        <button
          type="button"
          className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium hover:border-stone-500"
          onClick={() => void lookup()}
          disabled={loading}
        >
          {loading ? 'Looking up…' : 'Look up'}
        </button>
      </div>

      <EnrichmentPreviewView result={result} loading={loading} errorMessage={errorMessage} />

      {result?.found ? (
        <div className="mt-6">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium hover:border-stone-500"
              onClick={() => void loadProducts()}
            >
              {products.length === 0 ? 'Load my products' : `Reload (${products.length})`}
            </button>
            {products.length > 0 ? (
              <label className="font-mono text-xs text-stone-500">
                product{' '}
                <select
                  className="rounded border border-stone-200 px-2 py-1 text-xs"
                  value={selectedProductId}
                  onChange={(e) => selectProduct(e.target.value)}
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

          {comparison && selectedProduct ? (
            <EnrichmentMergeView
              comparison={comparison}
              productCode={selectedProduct.product_code}
              productName={selectedProduct.product_name_display}
              productEan={selectedProduct.ean_code}
              productStatus={selectedProduct.status}
              selected={selected}
              override={override}
              reason={reason}
              applying={applying}
              applyMessage={applyMessage}
              applyError={applyError}
              onToggle={toggle}
              onOverrideChange={setOverride}
              onReasonChange={setReason}
              onApply={() => void apply()}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
