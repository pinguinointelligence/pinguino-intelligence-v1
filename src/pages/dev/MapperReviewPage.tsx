/**
 * DEV-ONLY Mapper review WORKSTATION (route: /dev/mapper-review).
 *
 * On an explicit "Load" it reads the owner's products + the read-only reference base and runs
 * the PURE matchProduct() per product to compute candidate shortlists (display only — no write
 * on load), plus the PURE red-flag detector + status decision for per-row indicators. Filters
 * (mapper status / category / candidate count / red-flagged) narrow the list client-side. The
 * reviewer CONFIRMs a chosen candidate (confirmProductMatchTo) or REJECTs (rejectProductMatch).
 *
 * Boundaries (enforced by MapperReviewPage.security.test.ts):
 *   - DEV-only route + NotFound fallback; no nav link.
 *   - matchProduct / detectRedFlags / decideProductStatus are PURE (no DB/engine/write). The
 *     only persisted writes are confirmProductMatchTo / rejectProductMatch. No matchAndSave,
 *     no import, no create, no pac/pod copy, no mapper_basement.
 */
import { useState } from 'react';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { listMyProducts } from '@/services/products';
import { listEngineApprovedIngredients } from '@/services/ingredients';
import { confirmProductMatchTo, rejectProductMatch } from '@/services/productReview';
import { matchProduct, COMPOSITION_FIELDS, toFiniteNumber } from '@/data/products/productMatcher';
import { detectRedFlags } from '@/data/products/productRedFlags';
import { decideProductStatus } from '@/data/products/productStatusDecision';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import type { ProductRow } from '@/data/products/productRow';
import { MapperReviewView, type CandidateView, type ReviewFilters, type ReviewRow } from './mapperReviewView';
import { DEFAULT_REVIEW_FILTERS } from './mapperReviewFilters';

/** Cap how many candidates are RENDERED per row (candidate_count keeps the true total). */
const MAX_DISPLAY = 8;

function meanPp(product: ProductRow, cand: IngredientRow): number | null {
  let shared = 0;
  let sum = 0;
  for (const f of COMPOSITION_FIELDS) {
    const pv = toFiniteNumber((product as unknown as Record<string, unknown>)[f]);
    const cv = toFiniteNumber((cand as unknown as Record<string, unknown>)[f]);
    if (pv !== null && cv !== null) {
      shared += 1;
      sum += Math.abs(pv - cv);
    }
  }
  return shared > 0 ? Math.round((sum / shared) * 100) / 100 : null;
}

export function MapperReviewPage() {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [filters, setFilters] = useState<ReviewFilters>(DEFAULT_REVIEW_FILTERS);
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
      const reviewRows: ReviewRow[] = products.map((p) => {
        const reference = p.matched_basement_id ? (byId.get(p.matched_basement_id) ?? null) : null;
        const result = matchProduct(p, ingredients); // PURE compute — no write
        const compIds = result.match_method === 'category_composition_similarity' ? (result.candidate_ids ?? []) : [];
        const candidates: CandidateView[] = compIds
          .slice(0, MAX_DISPLAY)
          .map((bid) => byId.get(bid))
          .filter((c): c is IngredientRow => c != null)
          .map((c) => ({
            basement_id: c.ingredient_id,
            name: c.ingredient_name_display,
            category: c.ingredient_category,
            subcategory: c.ingredient_subcategory,
            fat: c.fat_percent,
            carbohydrate: c.carbohydrate_percent,
            sugars: c.total_sugars_percent,
            protein: c.protein_percent,
            salt: c.salt_percent,
            pac: c.pac_value,
            pod: c.pod_value,
            mean_pp: meanPp(p, c),
          }))
          .sort((a, b) => Number(a.mean_pp ?? 99) - Number(b.mean_pp ?? 99));
        const decision = decideProductStatus({ ...p, reference });
        return {
          code: p.product_code,
          id: p.id,
          product_name: p.product_name_display,
          product_category: p.product_category,
          mapper_status: p.mapper_status,
          product_status: p.status,
          recommended_status: decision.recommended_status,
          red_flag_codes: detectRedFlags(p).map((f) => f.code),
          candidate_count: compIds.length,
          product_fat: p.fat_percent,
          product_carbohydrate: p.carbohydrate_percent,
          product_sugars: p.total_sugars_percent,
          product_protein: p.protein_percent,
          product_salt: p.salt_percent,
          candidates,
        };
      });
      // unreviewed first, then by ascending candidate count, then code
      reviewRows.sort(
        (a, b) =>
          Number(a.mapper_status != null) - Number(b.mapper_status != null) ||
          a.candidate_count - b.candidate_count ||
          a.code.localeCompare(b.code),
      );
      setRows(reviewRows);
      setLoaded(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  const applyUpdate = (id: string, status: string | null) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, mapper_status: status } : r)));
  };

  const onConfirm = async (productId: string, basementId: string) => {
    setBusyId(productId);
    setMessage(null);
    setErrorMessage(null);
    try {
      const updated = await confirmProductMatchTo(productId, basementId);
      applyUpdate(productId, updated.mapper_status);
      const code = rows.find((r) => r.id === productId)?.code ?? productId;
      setMessage(`${code} → matched (${basementId})`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyId(null);
    }
  };

  const onReject = async (productId: string) => {
    setBusyId(productId);
    setMessage(null);
    setErrorMessage(null);
    try {
      const updated = await rejectProductMatch(productId);
      applyUpdate(productId, updated.mapper_status);
      const code = rows.find((r) => r.id === productId)?.code ?? productId;
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
      filters={filters}
      onFilterChange={setFilters}
      onLoad={() => void load()}
      onConfirm={(productId, basementId) => void onConfirm(productId, basementId)}
      onReject={(productId) => void onReject(productId)}
    />
  );
}
