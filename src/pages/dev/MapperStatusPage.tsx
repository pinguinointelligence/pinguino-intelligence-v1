/**
 * DEV-ONLY Mapper status control page (route: /dev/mapper-status).
 *
 * Loads the owner's products + the read-only reference base, runs the PURE
 * `decideProductStatus` per product, and shows current vs recommended lifecycle status.
 * Three writes, all via the narrow `setProductLifecycleStatus` (status + review audit only):
 *   • Apply recommended (never PI Verified).
 *   • Manual adjust → manual_adjusted (reviewer reason).
 *   • Verify → pi_verified — only when `decideProductStatus` with the reviewer approval yields
 *     pi_verified (i.e. NO red flags); a red-flagged / ineligible product is blocked with a message.
 *
 * Boundaries (enforced by MapperStatusPage.security.test.ts): DEV-only; reads via
 * listMyProducts + listEngineApprovedIngredients; the only write is setProductLifecycleStatus;
 * never writes pac/pod or mapper_basement; never auto-verifies.
 */
import { useState } from 'react';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { listMyProducts } from '@/services/products';
import { listEngineApprovedIngredients } from '@/services/ingredients';
import { setProductLifecycleStatus } from '@/services/productStatusWrite';
import { decideProductStatus } from '@/data/products/productStatusDecision';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import type { ProductRow, ProductStatus } from '@/data/products/productRow';
import { MapperStatusView, type StatusRow } from './mapperStatusView';

const READINESS = ['product_measured', 'reference_linked', 'unresolved'] as const;
const REVIEWER = 'dev-reviewer';

export function MapperStatusPage() {
  const [rows, setRows] = useState<StatusRow[]>([]);
  const [recommended, setRecommended] = useState<Record<string, ProductStatus>>({});
  const [productsById, setProductsById] = useState<Map<string, ProductRow>>(new Map());
  const [referenceById, setReferenceById] = useState<Map<string, IngredientRow>>(new Map());
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!import.meta.env.DEV) return <NotFoundPage />;

  const referenceFor = (p: ProductRow, refs: Map<string, IngredientRow>): IngredientRow | null =>
    p.matched_basement_id ? (refs.get(p.matched_basement_id) ?? null) : null;

  const load = async () => {
    setLoading(true);
    setMessage(null);
    setErrorMessage(null);
    try {
      const [products, ingredients] = await Promise.all([listMyProducts(), listEngineApprovedIngredients()]);
      const refs = new Map(ingredients.map((i) => [i.ingredient_id, i]));
      const prods = new Map(products.map((p) => [p.id, p]));
      const recMap: Record<string, ProductStatus> = {};
      const statusRows: StatusRow[] = products
        .slice()
        .sort((a, b) => a.product_code.localeCompare(b.product_code))
        .map((p) => {
          const decision = decideProductStatus({ ...p, reference: referenceFor(p, refs) });
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
      setProductsById(prods);
      setReferenceById(refs);
      setLoaded(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  const persist = async (id: string, status: ProductStatus, reason?: string) => {
    setBusyId(id);
    setMessage(null);
    setErrorMessage(null);
    try {
      const review = reason && reason.trim() !== '' ? { reviewed_by: REVIEWER, review_notes: reason.trim() } : undefined;
      const updated = await setProductLifecycleStatus(id, status, review);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, current_status: updated.status } : r)));
      const code = rows.find((r) => r.id === id)?.code ?? id;
      setMessage(`${code} → status ${updated.status}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyId(null);
    }
  };

  const onApply = (id: string) => {
    const status = recommended[id];
    if (status) void persist(id, status, reasons[id]);
  };

  const onManualAdjust = (id: string) => {
    const reason = (reasons[id] ?? '').trim();
    if (reason !== '') void persist(id, 'manual_adjusted', reason);
  };

  const onVerify = (id: string) => {
    const reason = (reasons[id] ?? '').trim();
    const product = productsById.get(id);
    if (reason === '' || !product) return;
    // Re-decide WITH the reviewer approval; only persist pi_verified if the policy allows it
    // (it never does for a red-flagged product → blocked here).
    const decision = decideProductStatus({
      ...product,
      reference: referenceFor(product, referenceById),
      reviewerApproval: { verified_by: REVIEWER, basis: reason },
    });
    if (decision.recommended_status === 'pi_verified') {
      void persist(id, 'pi_verified', reason);
    } else {
      const code = rows.find((r) => r.id === id)?.code ?? id;
      setMessage(`${code}: PI Verified blocked — ${decision.blockers.join('; ') || 'not eligible (red flags / unresolved)'}`);
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
      onApply={onApply}
      onManualAdjust={onManualAdjust}
      onVerify={onVerify}
    />
  );
}
