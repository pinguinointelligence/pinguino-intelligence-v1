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
import type { ProductInsert, ProductRow, ProductUpdate } from '@/data/products/productRow';

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

/** Update an owned product (RLS rejects rows the user does not own). */
export async function updateProduct(id: string, patch: ProductUpdate): Promise<ProductRow> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Product not found or not owned.');
  return data as ProductRow;
}

/** Delete an owned product (RLS scopes the delete to the owner). */
export async function removeProduct(id: string): Promise<void> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw new Error(error.message);
}
