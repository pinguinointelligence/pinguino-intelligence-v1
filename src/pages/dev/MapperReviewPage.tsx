/**
 * DEV-ONLY Mapper review page (route: /dev/mapper-review).
 *
 * Lets a human review every product that is not yet matched/rejected. On an explicit
 * "Load" click it reads the owner's products + the read-only reference base and runs the
 * PURE matchProduct() in-memory to compute each product's candidate SHORTLIST — purely to
 * DISPLAY it (no write on load). The reviewer then CONFIRMs a single chosen candidate
 * (confirmProductMatchTo) or REJECTs the product (rejectProductMatch). Those are the only
 * writes, one product at a time, only from a button click.
 *
 * Boundaries (enforced by MapperReviewPage.security.test.ts):
 *   - Gated by import.meta.env.DEV: route registered only in DEV; renders NotFound otherwise.
 *   - matchProduct is PURE (no DB, no engine, no write) — used only to compute candidates
 *     for display. The only persisted writes are confirmProductMatchTo / rejectProductMatch;
 *     there is NO matchAndSaveProduct / saveProductMatchResult / import / create here.
 *   - Never copies pac/pod; never writes the locked reference base. No nav link. No batch.
 */
import { useState } from 'react';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { listMyProducts } from '@/services/products';
import { listEngineApprovedIngredients } from '@/services/ingredients';
import { confirmProductMatchTo, rejectProductMatch } from '@/services/productReview';
import { matchProduct, COMPOSITION_FIELDS, toFiniteNumber } from '@/data/products/productMatcher';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import type { ProductRow } from '@/data/products/productRow';
import { MapperReviewView, type CandidateView, type ReviewRow } from './mapperReviewView';

/** Products not yet decided are reviewable; matched/rejected are done. */
const REVIEWABLE = new Set(['needs_review', 'ambiguous', null as unknown as string]);
/** Show only a human-sized shortlist; broader pools are not pick-able review fodder. */
const MAX_SHORTLIST = 5;

/** Mean absolute per-field distance (pp) over the shared measured fields — reuses the
 * matcher's own field list + numeric coercion, so it can't drift from the match logic. */
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
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [hiddenBroad, setHiddenBroad] = useState(0);
  const [hiddenNoCandidate, setHiddenNoCandidate] = useState(0);
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
      const [products, ingredients] = await Promise.all([listMyProducts(), listEngineApprovedIngredients()]);
      const byId = new Map(ingredients.map((i) => [i.ingredient_id, i]));
      const reviewRows: ReviewRow[] = [];
      let broad = 0;
      let none = 0;
      for (const p of products.filter((x) => REVIEWABLE.has(x.mapper_status as string))) {
        const result = matchProduct(p, ingredients); // PURE compute — no write
        const ids = result.match_method === 'category_composition_similarity' ? (result.candidate_ids ?? []) : [];
        if (ids.length === 0) {
          none += 1;
          continue;
        }
        if (ids.length > MAX_SHORTLIST) {
          broad += 1;
          continue;
        }
        const candidates: CandidateView[] = ids
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
          .sort((a, b) => (Number(a.mean_pp ?? 99) - Number(b.mean_pp ?? 99)));
        reviewRows.push({
          code: p.product_code,
          id: p.id,
          product_name: p.product_name_display,
          product_category: p.product_category,
          mapper_status: p.mapper_status,
          product_fat: p.fat_percent,
          product_carbohydrate: p.carbohydrate_percent,
          product_sugars: p.total_sugars_percent,
          product_protein: p.protein_percent,
          product_salt: p.salt_percent,
          candidates,
        });
      }
      reviewRows.sort((a, b) => a.candidates.length - b.candidates.length || a.code.localeCompare(b.code));
      setRows(reviewRows);
      setHiddenBroad(broad);
      setHiddenNoCandidate(none);
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
      hiddenBroad={hiddenBroad}
      hiddenNoCandidate={hiddenNoCandidate}
      onLoad={() => void load()}
      onConfirm={(productId, basementId) => void onConfirm(productId, basementId)}
      onReject={(productId) => void onReject(productId)}
    />
  );
}
