/**
 * Canonical product read service plus compatibility write adapters. Reads use
 * authenticated RLS; every mutation routes through catalog-submit → ingest_product_v1.
 *
 * Boundaries:
 *   • reads ONLY `public.products` — never reads or writes `mapper_basement`
 *     (the locked reference base is read-only and untouched by this layer);
 *   • no recipe-engine calls, no recipe-value calculation, no Mapper matching;
 *   • clients never write product identity/version/verification/mapping directly;
 *   • unknown numeric values are passed through verbatim — NEVER coerced to 0
 *     (omit a field to leave it NULL); no `npac_value` anywhere.
 */
import { supabase } from '@/lib/supabase/client';
import { emptyUnconfiguredRead } from '@/services/backendGuard';
import { productMatchResultToPatch } from '@/data/products/productMatchResultToPatch';
import {
  canonicalIngestFromLegacyProduct,
  ingestProduct,
  productIngestIdempotencyKey,
  type ProductIngestResult,
} from '@/services/productIngest';
import {
  normalizeEan,
  productIdentityKey,
  productInsertToIdentityInput,
} from '@/data/products/productIdentity';
import type { ProductMatchResult } from '@/data/products/productMatcher';
import type {
  ProductInsert,
  ProductMapperResultUpdate,
  ProductRow,
  ProductStatus,
  ProductUpdate,
} from '@/data/products/productRow';

const TABLE = 'products';
const UNAVAILABLE = 'Products are not available in this build.';

/** Products owned/created by the current account. Shared discovery uses the
 * catalog search RPC; this legacy list never exposes the mixed canonical root. */
export async function listMyProducts(): Promise<ProductRow[]> {
  if (!supabase) return emptyUnconfiguredRead('products.listMyProducts', []);
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProductRow[];
}

/** A single canonical product by id; canonical shared/private RLS still applies. */
export async function getProduct(id: string): Promise<ProductRow | null> {
  if (!supabase) return emptyUnconfiguredRead('products.getProduct', null);
  const { data, error } = await supabase.rpc('get_canonical_product_for_account_v1', {
    p_product_id: id,
  });
  if (error) throw new Error(error.message);
  return (data as ProductRow | null) ?? null;
}

export interface ProductCreateResult {
  product: ProductRow;
  ingest: ProductIngestResult;
}

/** Create through the canonical ingest transaction and preserve the DB-owned
 * outcome. Callers must not guess `created` vs `existing` from an owner-scoped
 * browser precheck. */
export async function createProductWithResult(
  payload: ProductInsert,
): Promise<ProductCreateResult> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const request = canonicalIngestFromLegacyProduct(payload);
  const idempotencyKey = await productIngestIdempotencyKey(request.source, request.input);
  const ingest = await ingestProduct({ ...request, idempotencyKey });
  if (!ingest.productId) throw new Error('Product ingest did not return a canonical product.');
  const product = await getProduct(ingest.productId);
  if (!product) throw new Error('Canonical product is not visible after ingest.');
  return { product, ingest };
}

/** Compatibility projection for callers that only need the hydrated product. */
export async function createProduct(payload: ProductInsert): Promise<ProductRow> {
  return (await createProductWithResult(payload)).product;
}

/** STRUCTURAL GUARD: product ENGINE values are never written through the generic update paths —
 * they stay NULL unless a dedicated, provenance-gated flow (none exists yet) sets them. Stripped
 * at runtime as defense-in-depth on top of the callers' already-narrowed patches. */
const STRIPPED_ENGINE_FIELDS = ['pac_value', 'pod_value'] as const;

function stripEngineValues(patch: object): Record<string, unknown> {
  const safe: Record<string, unknown> = { ...patch };
  for (const field of STRIPPED_ENGINE_FIELDS) delete safe[field];
  return safe;
}

/** A generic-update patch: engine values are excluded at the TYPE level too (see the strip). */
export type ProductUpdatePatch = Omit<ProductUpdate, (typeof STRIPPED_ENGINE_FIELDS)[number]>;

/** Update an owned product (RLS rejects rows the user does not own). Engine values
 * (see STRIPPED_ENGINE_FIELDS) are type-excluded AND runtime-stripped — this path can
 * never write them. */
export async function updateProduct(id: string, patch: ProductUpdatePatch): Promise<ProductRow> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const current = await getProduct(id);
  if (!current) throw new Error('Product not found or not owned.');
  const request = canonicalIngestFromLegacyProduct({ ...current, ...stripEngineValues(patch) });
  request.input.productId = id;
  request.input.operation = 'upsert';
  const idempotencyKey = await productIngestIdempotencyKey(
    request.source,
    request.input,
    `update:${id}`,
  );
  const result = await ingestProduct({ ...request, idempotencyKey, productId: id });
  if (!result.productId) throw new Error('Product update did not return a canonical product.');
  const product = await getProduct(result.productId);
  if (!product) throw new Error('Canonical product is not visible after update.');
  return product;
}

/**
 * `updateProduct` variant that REFUSES the write when the row's status equals `unlessStatus`
 * AT WRITE TIME — the condition travels inside the UPDATE itself, closing the check-then-write
 * race (e.g. enrichment must never overwrite a product that became PI Verified between its read
 * and its write). Same engine-value strip as updateProduct.
 */
export async function updateProductUnlessStatus(
  id: string,
  patch: ProductUpdatePatch,
  unlessStatus: ProductStatus,
): Promise<ProductRow> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const current = await getProduct(id);
  if (!current) throw new Error('Product not found or not owned.');
  const request = canonicalIngestFromLegacyProduct({ ...current, ...stripEngineValues(patch) });
  request.input.productId = id;
  request.input.operation = 'upsert';
  request.input.expectedStatusNot = unlessStatus;
  const idempotencyKey = await productIngestIdempotencyKey(
    request.source,
    request.input,
    `guarded-update:${id}`,
  );
  const result = await ingestProduct({ ...request, idempotencyKey, productId: id });
  if (!result.productId) {
    throw new Error(
      `Product not found, not owned, or its status is '${unlessStatus}' (write refused).`,
    );
  }
  const product = await getProduct(result.productId);
  if (!product) throw new Error('Canonical product is not visible after update.');
  return product;
}

/** Delete an owned product (RLS scopes the delete to the owner). */
export async function removeProduct(id: string): Promise<void> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const current = await getProduct(id);
  if (!current) throw new Error('Product not found or not owned.');
  const request = canonicalIngestFromLegacyProduct(current);
  request.input.productId = id;
  request.input.operation = 'retire';
  const idempotencyKey = await productIngestIdempotencyKey(
    request.source,
    request.input,
    `retire:${id}`,
  );
  await ingestProduct({ ...request, idempotencyKey, productId: id, operation: 'retire' });
}

/**
 * Submit one deterministic Mapper match as review evidence through canonical
 * ingest. It never authorizes a mapping, mutates mapper_basement, or calls Engine.
 */
export async function saveProductMatchResult(
  productId: string,
  result: ProductMatchResult,
): Promise<ProductRow> {
  const current = await getProduct(productId);
  if (!current) throw new Error('Product not found or not owned.');
  const request = canonicalIngestFromLegacyProduct(current);
  request.source = 'manual';
  request.input.productId = productId;
  request.input.operation = 'upsert';
  request.input.mapperCandidate = productMatchResultToPatch(result);
  const idempotencyKey = await productIngestIdempotencyKey(
    request.source,
    request.input,
    `mapper-candidate:${productId}`,
  );
  const ingested = await ingestProduct({ ...request, idempotencyKey, productId });
  if (!ingested.productId) throw new Error('Mapper candidate intake did not return a product.');
  const product = await getProduct(ingested.productId);
  if (!product) throw new Error('Canonical product is not visible after Mapper candidate intake.');
  return product;
}

export interface ProductMapperReviewAuthorization {
  reviewedBy: string;
  reviewNotes: string;
  reviewSignoffId?: string | null;
  independentProvenance?: boolean;
}

/**
 * Manual Mapper review adapter. Ordinary reviewers submit candidate evidence;
 * only independently authorised administrators submit a version-bound decision.
 * Neither path writes the canonical product root or Mapper dataset directly.
 */
export async function saveProductMapperReview(
  productId: string,
  patch: ProductMapperResultUpdate,
  authorization?: ProductMapperReviewAuthorization,
): Promise<ProductRow> {
  const current = await getProduct(productId);
  if (!current) throw new Error('Product not found or not owned.');
  const request = canonicalIngestFromLegacyProduct(current);
  request.input.productId = productId;
  request.input.operation = 'upsert';

  const mapperIngredientId = patch.matched_basement_id ?? current.matched_basement_id ?? null;
  const rejecting = patch.mapper_status === 'rejected';
  const canAuthorize = Boolean(
    authorization?.reviewSignoffId || authorization?.independentProvenance === true,
  );
  request.source = canAuthorize ? 'admin' : 'manual';
  if (canAuthorize) {
    request.input.mapperDecision = {
      mapperIngredientId: rejecting ? null : mapperIngredientId,
    };
    request.input.reviewEvidence = {
      reviewedBy: authorization?.reviewedBy ?? 'authenticated-admin',
      reviewNotes:
        authorization?.reviewNotes ?? patch.mapper_notes ?? 'Manual Mapper review decision.',
      reviewSignoffId: authorization?.reviewSignoffId ?? null,
      independentProvenance: authorization?.independentProvenance === true,
    };
  } else {
    // A visual reviewer choice without an independently verified sign-off is
    // evidence for the review queue, never an Engine mapping authorization.
    request.input.mapperCandidate = {
      ...patch,
      mapperIngredientId,
      decisionRequested: patch.mapper_status,
      reviewed: true,
    };
  }
  const idempotencyKey = await productIngestIdempotencyKey(
    request.source,
    request.input,
    `${canAuthorize ? 'mapper-decision' : 'mapper-review-candidate'}:${productId}`,
  );
  const ingested = await ingestProduct({ ...request, idempotencyKey, productId });
  if (!ingested.productId) throw new Error('Mapper review intake did not return a product.');
  const product = await getProduct(ingested.productId);
  if (!product) throw new Error('Canonical product is not visible after Mapper review intake.');
  return product;
}

/* ── D5B: identity-aware duplicate prevention ──────────────────────────────────
 * Owner-scoped (RLS auto-filters every query to auth.uid() = owner_user_id — no
 * explicit owner filter, no cross-user query, no privileged server key). Reuses the pure D5A
 * identity helpers; never reads/writes the locked reference base; never computes a
 * product code (the DB owns it). */

/** A single owned row where `column` equals `value` (RLS scopes it to the caller).
 * `.limit(1)` guards the non-unique source_url / identity-hash lookups. */
async function findOwnedProductBy(column: string, value: string): Promise<ProductRow | null> {
  if (!supabase) return emptyUnconfiguredRead('products.findOwnedProductBy', null);
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq(column, value)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ProductRow | null) ?? null;
}

/** An identity key is strong enough to dedupe on only if it carries a brand or a name;
 * a key with neither (e.g. nutrition-only) is too weak and must not match. */
function identityKeyIsMeaningful(key: string): boolean {
  const parts = key.split('|');
  return (parts[0] ?? '') !== '' || (parts[1] ?? '') !== '';
}

/**
 * Find the caller's existing product that duplicates `input`, in priority order:
 * normalized EAN → normalized barcode → source_url → product_identity_hash. Blank
 * normalized EAN/barcode, a blank source_url, and a non-meaningful identity key are
 * SKIPPED (never matched). Returns the first match or null. Reads only public.products.
 */
export async function findExistingProductForIdentity(
  input: ProductInsert,
): Promise<ProductRow | null> {
  if (!supabase) return emptyUnconfiguredRead('products.findExistingProductForIdentity', null);

  const normEan = normalizeEan(input.ean_code);
  if (normEan !== '') {
    const hit = await findOwnedProductBy('ean_code_normalized', normEan);
    if (hit) return hit;
  }

  const normBarcode = normalizeEan(input.barcode);
  if (normBarcode !== '') {
    const hit = await findOwnedProductBy('barcode_normalized', normBarcode);
    if (hit) return hit;
  }

  if (input.source_url) {
    const hit = await findOwnedProductBy('source_url', input.source_url);
    if (hit) return hit;
  }

  const identityHash = productIdentityKey(productInsertToIdentityInput(input));
  if (identityKeyIsMeaningful(identityHash)) {
    const hit = await findOwnedProductBy('product_identity_hash', identityHash);
    if (hit) return hit;
  }

  return null;
}

/** Create or reuse one canonical identity through ingest_product_v1. Duplicate
 * detection and concurrency locks remain inside that single transaction; a
 * client-side precheck must never skip evidence, relation or ingest-event work. */
export async function createProductWithIdentity(input: ProductInsert): Promise<ProductRow> {
  const product_identity_hash = productIdentityKey(productInsertToIdentityInput(input));
  return createProduct({ ...input, product_identity_hash });
}

export async function createProductWithIdentityResult(
  input: ProductInsert,
): Promise<ProductCreateResult> {
  const product_identity_hash = productIdentityKey(productInsertToIdentityInput(input));
  return createProductWithResult({ ...input, product_identity_hash });
}
