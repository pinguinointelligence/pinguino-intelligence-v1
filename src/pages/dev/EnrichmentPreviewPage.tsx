/**
 * DEV-ONLY keyless enrichment preview (route: /dev/enrichment-preview).
 *
 * Enter an EAN → read-only lookup against the public, KEYLESS OpenFoodFacts API
 * (fetchOpenFoodFactsProduct) → show found / not-found, the parsed per-100g nutrition, and the
 * source tier. STRICTLY a preview: it NEVER writes to products, mapper_basement, or snapshots.
 * OFF is a public-DB source (lower priority than a producer/retailer label) — shown as such so a
 * reviewer can judge a conflict before any (future, separate) merge.
 *
 * Boundaries (EnrichmentPreviewPage.security.test.ts): DEV-only; the only data call is the
 * read-only fetchOpenFoodFactsProduct; no write service; no secret/API key; no npac.
 */
import { useState } from 'react';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { fetchOpenFoodFactsProduct } from '@/services/openFoodFacts';
import type { OffProduct } from '@/data/products/openFoodFactsAdapter';

const NUTRITION_FIELDS: { key: keyof OffProduct['nutrition']; label: string }[] = [
  { key: 'fat_percent', label: 'fat' },
  { key: 'saturated_fat_percent', label: 'saturated fat' },
  { key: 'carbohydrate_percent', label: 'carbohydrate' },
  { key: 'total_sugars_percent', label: 'sugars' },
  { key: 'protein_percent', label: 'protein' },
  { key: 'salt_percent', label: 'salt' },
  { key: 'kcal_per_100g', label: 'kcal' },
];

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
                {NUTRITION_FIELDS.map((f) => (
                  <tr key={f.key}>
                    <td className="py-0.5 text-stone-500">{f.label}</td>
                    <td className="py-0.5 text-right font-mono tabular-nums">
                      {result.nutrition[f.key] === null ? '—' : result.nutrition[f.key]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-stone-400">
              Preview only — nothing is written. A merge into a product is a separate, reviewed step.
            </p>
          </div>
        ) : (
          <p className="text-sm text-stone-600">Not found in OpenFoodFacts for EAN {result.ean ?? '—'}.</p>
        )
      ) : null}
    </div>
  );
}

export function EnrichmentPreviewPage() {
  const [ean, setEan] = useState('');
  const [result, setResult] = useState<OffProduct | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!import.meta.env.DEV) return <NotFoundPage />;

  const lookup = async () => {
    if (ean.trim() === '') return;
    setLoading(true);
    setErrorMessage(null);
    setResult(null);
    try {
      setResult(await fetchOpenFoodFactsProduct(ean.trim()));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-xl bg-paper px-6 py-16 text-ink">
      <p className="font-mono text-xs uppercase tracking-wide text-stone-400">DEV · internal</p>
      <h1 className="mt-3 text-2xl font-light tracking-tight">Enrichment preview (OpenFoodFacts)</h1>
      <p className="mt-2 text-sm text-stone-600">
        Read-only, keyless lookup by EAN. Preview only — never writes products or the reference base.
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
    </div>
  );
}
