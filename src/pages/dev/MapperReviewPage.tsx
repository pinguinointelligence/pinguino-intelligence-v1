/**
 * DEV-ONLY Mapper review page (route: /dev/mapper-review).
 *
 * Lets a human review the `needs_review` products one at a time — product composition vs
 * the proposed candidate's composition + PAC/POD — and either CONFIRM or REJECT the
 * single candidate. Each action persists a human decision via confirmProductMatch /
 * rejectProductMatch, which write ONLY the Mapper-result columns (never products.status,
 * never pac/pod, never the locked reference base).
 *
 * Boundaries (enforced by MapperReviewPage.security.test.ts):
 *   - Gated by import.meta.env.DEV: the route is registered only in DEV (app/router.tsx)
 *     and this component renders NotFound otherwise — dead-code-eliminated in production.
 *   - READS only: listMyProducts + the read-only listEngineApprovedIngredients (to show
 *     the candidate). It runs NO matching / batch / import / create — the only product
 *     WRITES are confirmProductMatch / rejectProductMatch, and only from a button click.
 *   - No nav link. No arbitrary product input — it reviews exactly the loaded
 *     needs_review set. Sign-in is enforced by RLS inside the actions.
 */
import { useState } from 'react';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { listMyProducts } from '@/services/products';
import { listEngineApprovedIngredients } from '@/services/ingredients';
import { confirmProductMatch, rejectProductMatch } from '@/services/productReview';
import { MapperReviewView, type ReviewRow } from './mapperReviewView';

export function MapperReviewPage() {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Defence in depth: never render the dev tool outside a dev build.
  if (!import.meta.env.DEV) return <NotFoundPage />;

  const load = async () => {
    setLoading(true);
    setMessage(null);
    setErrorMessage(null);
    try {
      const [products, ingredients] = await Promise.all([
        listMyProducts(),
        listEngineApprovedIngredients(),
      ]);
      const byId = new Map(ingredients.map((i) => [i.ingredient_id, i]));
      const reviewRows: ReviewRow[] = products
        .filter((p) => p.mapper_status === 'needs_review')
        .sort((a, b) => a.product_code.localeCompare(b.product_code))
        .map((p) => {
          const c = p.matched_basement_id ? (byId.get(p.matched_basement_id) ?? null) : null;
          return {
            code: p.product_code,
            id: p.id,
            product_name: p.product_name_display,
            product_category: p.product_category,
            mapper_status: p.mapper_status,
            matched_basement_id: p.matched_basement_id,
            candidate_name: c?.ingredient_name_display ?? null,
            candidate_category: c?.ingredient_category ?? null,
            candidate_subcategory: c?.ingredient_subcategory ?? null,
            product_fat: p.fat_percent,
            product_protein: p.protein_percent,
            product_sugars: p.total_sugars_percent,
            candidate_fat: c?.fat_percent ?? null,
            candidate_protein: c?.protein_percent ?? null,
            candidate_sugars: c?.total_sugars_percent ?? null,
            candidate_pac: c?.pac_value ?? null,
            candidate_pod: c?.pod_value ?? null,
          };
        });
      setRows(reviewRows);
      setLoaded(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  const applyUpdate = (id: string, status: string | null, matched: string | null) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, mapper_status: status, matched_basement_id: matched } : r)),
    );
  };

  const runAction = async (id: string, action: (productId: string) => Promise<{ mapper_status: string | null; matched_basement_id: string | null }>) => {
    setBusyId(id);
    setMessage(null);
    setErrorMessage(null);
    try {
      const updated = await action(id);
      applyUpdate(id, updated.mapper_status, updated.matched_basement_id);
      const code = rows.find((r) => r.id === id)?.code ?? id;
      setMessage(`${code} → ${updated.mapper_status}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <MapperReviewView
      rows={rows}
      loading={loading}
      loaded={loaded}
      busyId={busyId}
      message={message}
      errorMessage={errorMessage}
      onLoad={() => void load()}
      onConfirm={(id) => void runAction(id, confirmProductMatch)}
      onReject={(id) => void runAction(id, rejectProductMatch)}
    />
  );
}
