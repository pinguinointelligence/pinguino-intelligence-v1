/**
 * Mapper orchestrator (Slice D4) — the EXPLICIT single-product run.
 *
 * matchAndSaveProduct(productId) composes the existing pieces for ONE product:
 *   1. read the product            (products service, RLS-owned)
 *   2. read engine-approved rows    (ingredients service, READ-ONLY reference base)
 *   3. run the PURE matcher         (no IO, deterministic)
 *   4. persist via the D3 write-back (the 11 Mapper-result columns only)
 *
 * Boundaries (enforced by productMapper.security.test.ts):
 *   • runs ONLY when explicitly called — no trigger, no schedule, no background job,
 *     no auto-match-on-create;
 *   • the ONLY reference-base interaction is the read-only listEngineApprovedIngredients();
 *     it never names or writes the locked reference table, and makes no raw DB access;
 *   • the ONLY product write is saveProductMatchResult (Mapper-result columns only) — it
 *     never writes products.status, never promotes, never touches the engine / AI / billing.
 */
import { listEngineApprovedIngredients } from '@/services/ingredients';
import { getProduct, saveProductMatchResult } from '@/services/products';
import { matchProduct } from '@/data/products/productMatcher';
import type { ProductMatchResult } from '@/data/products/productMatcher';
import type { ProductRow } from '@/data/products/productRow';

export interface MapperRunResult {
  /** the product as loaded BEFORE matching. */
  product: ProductRow;
  /** the in-memory result the pure matcher computed. */
  match: ProductMatchResult;
  /** the row as PERSISTED by the D3 write-back (authoritative; returned by the save). */
  updatedProduct: ProductRow;
}

/**
 * Match ONE owned product against the engine-approved reference base and persist the
 * result. Throws if the product is not found / not owned, or if there are zero
 * engine-approved reference ingredients to match against (an infra / approval problem,
 * NOT a genuine no-match — so we never save a misleading "unmatched"). Call explicitly;
 * there is no automatic matching.
 */
export async function matchAndSaveProduct(productId: string): Promise<MapperRunResult> {
  const product = await getProduct(productId);
  if (!product) throw new Error('Product not found or not owned.');

  const basement = await listEngineApprovedIngredients();
  if (basement.length === 0) {
    throw new Error('No engine-approved reference ingredients available; cannot match.');
  }

  const match = matchProduct(product, basement);
  const updatedProduct = await saveProductMatchResult(productId, match);

  return { product, match, updatedProduct };
}
