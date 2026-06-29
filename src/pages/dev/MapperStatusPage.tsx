/**
 * DEV-ONLY Mapper status control page (route: /dev/mapper-status).
 *
 * Loads the owner's products + the read-only reference base, runs the PURE
 * `decideProductStatus` per product (red flags + reference-linked resolution), and shows the
 * current vs recommended lifecycle status. "Apply recommended" persists ONLY the status via
 * the narrow `setProductLifecycleStatus`. It never sets PI Verified (the pure policy never
 * recommends it without explicit reviewer approval, which this page does not supply), and a
 * red-flagged product requires a written reason before Apply is enabled.
 *
 * Boundaries (enforced by MapperStatusPage.security.test.ts):
 *   - DEV-only route + NotFound fallback; no nav link; dead-code-eliminated in prod.
 *   - READS via listMyProducts + listEngineApprovedIngredients; the only WRITE is
 *     setProductLifecycleStatus (status + review audit only). No matching, no pac/pod, no
 *     mapper_basement, no engine, no raw DB verbs.
 */
import { useState } from 'react';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { listMyProducts } from '@/services/products';
import { listEngineApprovedIngredients } from '@/services/ingredients';
import { setProductLifecycleStatus } from '@/services/productStatusWrite';
import { decideProductStatus } from '@/data/products/productStatusDecision';
import type { ProductStatus } from '@/data/products/productRow';
import { MapperStatusView, type StatusRow } from './mapperStatusView';

const READINESS = ['product_measured', 'reference_linked', 'unresolved'] as const;

export function MapperStatusPage() {
  const [rows, setRows] = useState<StatusRow[]>([]);
  const [recommended, setRecommended] = useState<Record<string, ProductStatus>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!import.meta.env.DEV) return <NotFoundPage />;

  const load = async () => {
    setLoading(true);
    setMessage(null);
    setErrorMessage(null);
    try {
      const [products, ingredients] = await Promise.all([listMyProducts(), listEngineApprovedIngredients()]);
      const byId = new Map(ingredients.map((i) => [i.ingredient_id, i]));
      const recMap: Record<string, ProductStatus> = {};
      const statusRows: StatusRow[] = products
        .slice()
        .sort((a, b) => a.product_code.localeCompare(b.product_code))
        .map((p) => {
          const reference = p.matched_basement_id ? (byId.get(p.matched_basement_id) ?? null) : null;
          const decision = decideProductStatus({ ...p, reference });
          recMap[p.id] = decision.recommended_status;
          const prov = decision.internal_flags.find((f) => f.startsWith('engine_provenance:'))?.split(':')[1];
          const engine_readiness = (READINESS as readonly string[]).includes(prov ?? '')
            ? (prov as StatusRow['engine_readiness'])
            : 'unresolved';
          return {
            code: p.product_code,
            id: p.id,
            product_name: p.product_name_display,
            mapper_status: p.mapper_status,
            current_status: p.status,
            recommended_status: decision.recommended_status,
            customer_label: decision.customer_label,
            engine_readiness,
            red_flag_codes: decision.red_flags.map((f) => f.code),
            blockers: decision.blockers,
          };
        });
      setRows(statusRows);
      setRecommended(recMap);
      setLoaded(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  const onApply = async (id: string) => {
    const status = recommended[id];
    if (!status) return;
    setBusyId(id);
    setMessage(null);
    setErrorMessage(null);
    try {
      const reason = (reasons[id] ?? '').trim();
      const updated = await setProductLifecycleStatus(id, status, reason === '' ? undefined : { review_notes: reason });
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, current_status: updated.status } : r)));
      const code = rows.find((r) => r.id === id)?.code ?? id;
      setMessage(`${code} → status ${updated.status}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <MapperStatusView
      rows={rows}
      loading={loading}
      loaded={loaded}
      busyId={busyId}
      message={message}
      errorMessage={errorMessage}
      reasons={reasons}
      onLoad={() => void load()}
      onReasonChange={(id, reason) => setReasons((prev) => ({ ...prev, [id]: reason }))}
      onApply={(id) => void onApply(id)}
    />
  );
}
