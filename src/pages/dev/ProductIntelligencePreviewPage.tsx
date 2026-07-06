/**
 * DEV-ONLY Product Intelligence preview (route: /dev/product-intelligence-preview).
 *
 * Loads the owner's products + the read-only reference base, runs the PURE
 * `simulateProductIntelligence` (matcher-pooled candidates → `resolveProductIntelligence`), and
 * shows what the resolver WOULD resolve per product — reference_linked / pi_calculated /
 * pi_generated / blocked — with the ephemeral class-derived pac/pod, provenance, confidence,
 * warnings and blocker reason. It PERSISTS NOTHING: no status write, no pac/pod write, no
 * mapper_basement write. It is a preview/simulation surface only.
 *
 * Boundaries (ProductIntelligencePreviewPage.security.test.ts): DEV-only route + NotFound
 * fallback; the only DB access is the two read services; no write verbs; no mapper_basement
 * write; never writes pac/pod or status; no engine/AI/billing.
 */
import { useState } from 'react';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { listMyProducts } from '@/services/products';
import { listEngineApprovedIngredients } from '@/services/ingredients';
import {
  simulateProductIntelligence,
  type ProductIntelligenceSimulationResult,
  type ProductIntelligenceSimulationRow,
} from '@/data/products/productIntelligenceSimulation';

type OutcomeFilter = 'all' | 'reference_linked' | 'pi_calculated' | 'pi_generated' | 'blocked';

const OUTCOME_CLASS: Record<string, string> = {
  reference_linked: 'rounded bg-sky-100 px-1.5 py-0.5 font-mono text-xs text-sky-700',
  pi_calculated: 'rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-xs text-emerald-700',
  pi_generated: 'rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs text-amber-700',
  blocked: 'rounded bg-rose-100 px-1.5 py-0.5 font-mono text-xs text-rose-700',
};

function SummaryBar({ summary }: { summary: ProductIntelligenceSimulationResult['summary'] }) {
  const cells: [string, number][] = [
    ['reference_linked', summary.reference_linked],
    ['pi_calculated', summary.pi_calculated],
    ['pi_generated', summary.pi_generated],
    ['blocked', summary.blocked],
  ];
  return (
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {cells.map(([k, v]) => (
        <div key={k} className="rounded-md border border-stone-200 bg-white px-3 py-2">
          <div className="font-mono text-lg">{v}</div>
          <div className={OUTCOME_CLASS[k]}>{k}</div>
        </div>
      ))}
    </div>
  );
}

export function ProductIntelligencePreviewPage() {
  const [result, setResult] = useState<ProductIntelligenceSimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<OutcomeFilter>('all');
  const [ruleFilter, setRuleFilter] = useState<string>('all');
  const [confidenceFilter, setConfidenceFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  if (!import.meta.env.DEV) return <NotFoundPage />;

  const load = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [products, basement] = await Promise.all([listMyProducts(), listEngineApprovedIngredients()]);
      setResult(simulateProductIntelligence({ products, basement }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  const rows = result?.rows ?? [];
  // Tiny derived lists (≤69 rows) — plain computation, no hooks after the DEV early-return.
  const ruleIds = [...new Set(rows.map((r) => r.rule_id).filter((v) => v !== null))].map(String).sort();
  const categories = [...new Set(rows.map((r) => r.product_category).filter((v): v is string => !!v))].sort();

  const filtered = rows.filter((r) => {
    if (outcome !== 'all' && r.outcome !== outcome) return false;
    if (ruleFilter !== 'all' && r.rule_id !== ruleFilter) return false;
    if (confidenceFilter !== 'all' && (r.confidence ?? 'none') !== confidenceFilter) return false;
    if (categoryFilter !== 'all' && r.product_category !== categoryFilter) return false;
    return true;
  });

  return (
    <div className="mx-auto min-h-screen max-w-5xl bg-paper px-6 py-16 text-ink">
      <p className="font-mono text-xs uppercase tracking-wide text-stone-400">DEV · internal</p>
      <h1 className="mt-3 text-2xl font-light tracking-tight">Product Intelligence — preview</h1>
      <p className="mt-2 text-sm text-stone-600">
        What the resolver WOULD resolve per product, before any status or Studio use. Class-derived
        pac/pod shown here are ephemeral — nothing on this page is persisted.
      </p>
      <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 font-mono text-xs text-amber-800">
        preview only — not persisted · no status change · no pac/pod write · no reference-base write
      </p>

      {!result ? (
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="mt-6 rounded bg-ink px-4 py-2 text-sm text-paper disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Run simulation'}
        </button>
      ) : null}
      {errorMessage ? <p className="mt-3 font-mono text-xs text-rose-700">{errorMessage}</p> : null}

      {result ? (
        <>
          <SummaryBar summary={result.summary} />
          <p className="mt-2 font-mono text-xs text-stone-500">
            {result.summary.total} products · {result.summary.engine_ready} engine-ready ·{' '}
            {result.summary.newly_pi_calculated} newly PI Calculated · {result.summary.label_staged} label-staged
          </p>

          <div className="mt-4 flex flex-wrap gap-3 text-xs">
            <label className="flex items-center gap-1">
              outcome
              <select className="rounded border border-stone-200 px-2 py-1" value={outcome} onChange={(e) => setOutcome(e.target.value as OutcomeFilter)}>
                {['all', 'reference_linked', 'pi_calculated', 'pi_generated', 'blocked'].map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              rule
              <select className="rounded border border-stone-200 px-2 py-1" value={ruleFilter} onChange={(e) => setRuleFilter(e.target.value)}>
                <option value="all">all</option>
                {ruleIds.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1">
              confidence
              <select className="rounded border border-stone-200 px-2 py-1" value={confidenceFilter} onChange={(e) => setConfidenceFilter(e.target.value)}>
                {['all', 'high', 'medium', 'low', 'none'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1">
              category
              <select className="rounded border border-stone-200 px-2 py-1" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="all">all</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-4 space-y-2">
            {filtered.map((r) => <PreviewRow key={r.product_code} row={r} />)}
            {filtered.length === 0 ? <p className="font-mono text-xs text-stone-400">no rows match the filters</p> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function PreviewRow({ row }: { row: ProductIntelligenceSimulationRow }) {
  return (
    <div className="rounded-md border border-stone-200 bg-white px-4 py-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-mono text-xs text-stone-500">{row.product_code}</span>
        <span className={OUTCOME_CLASS[row.outcome]}>{row.outcome}</span>
      </div>
      <p className="mt-0.5 font-medium">{row.product_name ?? '(no name)'}</p>
      <p className="mt-1 font-mono text-xs text-stone-500">
        {row.product_category ?? '—'} · current: {row.current_mapper_status ?? 'null'} / {row.current_status}
        {row.rule_id ? ` · rule ${row.rule_id}` : ''}
        {row.confidence ? ` · ${row.confidence}` : ''}
        {row.engine_ready ? ' · engine-ready' : ''}
      </p>
      {row.derived_pac !== null ? (
        <p className="mt-1 font-mono text-xs text-emerald-700">
          ephemeral (preview) · pac {row.derived_pac} · pod {row.derived_pod}
          {row.basis_reference_ids.length > 0 ? ` · from ${row.basis_reference_ids.join(', ')}` : ''}
        </p>
      ) : row.basis_reference_ids.length > 0 ? (
        <p className="mt-1 font-mono text-xs text-sky-700">reference: {row.basis_reference_ids.join(', ')}</p>
      ) : null}
      {row.blocked_reason ? <p className="mt-1 text-xs text-rose-700">{row.blocked_reason}</p> : null}
      {row.warnings.length > 0 ? (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-stone-500">
          {row.warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      ) : null}
      <p className="mt-1 text-xs text-stone-600">→ {row.next_action}</p>
    </div>
  );
}
