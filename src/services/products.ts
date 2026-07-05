/**
 * Products service (Mapper Slice D1) — the ONLY Supabase access for the GROWING
 * `public.products` layer (customer uploads, catalogs, scans, manual, API).
 *
 * RLS scopes every row to the signed-in user (`auth.uid() = owner_user_id`); the
 * client sends the user's JWT (anon key only — never the privileged server key).
 *
 * Boundaries (Slice D1 is a pure data layer):
 *   • queries ONLY `public.products` — never reads or writes `mapper_basement`
 *     (the locked reference base is read-only and untouched by this layer);
 *   • no recipe-engine calls, no recipe-value calculation, no Mapper matching;
 *   • unknown numeric values are passed through verbatim — NEVER coerced to 0
 *     (omit a field to leave it NULL); no `npac_value` anywhere.
 */
import { supabase } from '@/lib/supabase/client';
import { getCurrentUser } from '@/services/auth';
import { productMatchResultToPatch } from '@/data/products/productMatchResultToPatch';
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

/** All products owned by the current user (RLS enforces ownership). */
export async function listMyProducts(): Promise<ProductRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProductRow[];
}

/** A single owned product by id (RLS still applies). */
export async function getProduct(id: string): Promise<ProductRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ProductRow | null) ?? null;
}

/** Create a product owned by the current user. Unknown fields stay NULL (never 0). */
export async function createProduct(payload: ProductInsert): Promise<ProductRow> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const user = await getCurrentUser();
  if (!user) throw new Error('You must be signed in to add a product.');
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...payload, owner_user_id: user.id })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ProductRow;
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
  const { data, error } = await supabase
    .from(TABLE)
    .update(stripEngineValues(patch))
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Product not found or not owned.');
  return data as ProductRow;
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
  const { data, error } = await supabase
    .from(TABLE)
    .update(stripEngineValues(patch))
    .eq('id', id)
    .neq('status', unlessStatus)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Product not found, not owned, or its status is '${unlessStatus}' (write refused).`);
  return data as ProductRow;
}

/** Delete an owned product (RLS scopes the delete to the owner). */
export async function removeProduct(id: string): Promise<void> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * D3 Mapper write-back — persist one in-memory ProductMatchResult onto the owned
 * product row. Writes ONLY the 11 Mapper-result columns (via the narrow
 * ProductMapperResultUpdate patch) through the existing RLS-gated updateProduct; it
 * never touches products.status, never reads or writes the locked mapper_basement,
 * never calls the engine, and uses no privileged key. Call it EXPLICITLY (e.g. after
 * running the pure matcher) — there is no automatic matching here.
 */
export async function saveProductMatchResult(
  productId: string,
  result: ProductMatchResult,
): Promise<ProductRow> {
  return updateProduct(productId, productMatchResultToPatch(result));
}

/**
 * Manual Mapper REVIEW write-back — persist a human confirm/reject decision onto an
 * owned product row. Like saveProductMatchResult it accepts ONLY the narrow
 * ProductMapperResultUpdate patch (the Mapper-result columns) and writes it through the
 * same RLS-gated updateProduct; the patch type makes it impossible to set products.status,
 * pac_value/pod_value, identity, or any non-Mapper column. It never reads or writes the
 * locked mapper_basement, never calls the engine, and uses no privileged key.
 */
export async function saveProductMapperReview(
  productId: string,
  patch: ProductMapperResultUpdate,
): Promise<ProductRow> {
  return updateProduct(productId, patch);
}

/* ── D5B: identity-aware duplicate prevention ──────────────────────────────────
 * Owner-scoped (RLS auto-filters every query to auth.uid() = owner_user_id — no
 * explicit owner filter, no cross-user query, no privileged server key). Reuses the pure D5A
 * identity helpers; never reads/writes the locked reference base; never computes a
 * product code (the DB owns it). */

/** A single owned row where `column` equals `value` (RLS scopes it to the caller).
 * `.limit(1)` guards the non-unique source_url / identity-hash lookups. */
async function findOwnedProductBy(column: string, value: string): Promise<ProductRow | null> {
  if (!supabase) return null;
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
  if (!supabase) return null;

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

/**
 * Create a product, deduped by identity. Returns an existing owned product if one
 * already matches `input`; otherwise inserts a new row (the DB assigns the product
 * code + normalized columns) with the computed product_identity_hash. Race-safe: if the
 * insert fails (e.g. the per-owner unique index rejects a concurrent insert), it re-runs
 * the lookup and returns the now-existing row, else rethrows. Creates only in products.
 */
export async function createProductWithIdentity(input: ProductInsert): Promise<ProductRow> {
  const existing = await findExistingProductForIdentity(input);
  if (existing) return existing;

  const product_identity_hash = productIdentityKey(productInsertToIdentityInput(input));
  try {
    return await createProduct({ ...input, product_identity_hash });
  } catch (error) {
    const raced = await findExistingProductForIdentity(input);
    if (raced) return raced;
    throw error;
  }
}
