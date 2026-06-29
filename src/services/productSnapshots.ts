/**
 * Product snapshots service (Mapper history slice) — the ONLY access to the append-only
 * public.product_snapshots history table (migration 0011).
 *
 * RLS scopes every row to the signed-in owner (auth.uid() = owner_user_id); the client sends
 * only the anon key + the user's JWT. The table is APPEND-ONLY (SELECT + INSERT policies
 * only), so this service exposes no update/delete.
 *
 * Boundaries:
 *   • targets ONLY public.product_snapshots — never reads/writes products or the locked
 *     mapper_basement; no recipe engine; no npac_value; no privileged key;
 *   • unknown numerics stay NULL (never coerced to 0); diffing is the pure productSnapshotDiff.
 */
import { supabase } from '@/lib/supabase/client';
import { getCurrentUser } from '@/services/auth';
import {
  diffSnapshot,
  extractSnapshotFields,
  normalizeSnapshotFields,
  type SnapshotChangeType,
  type SnapshotFields,
  type SnapshotSource,
} from '@/data/products/productSnapshotDiff';

const TABLE = 'product_snapshots';
const UNAVAILABLE = 'Product snapshots are not available in this build.';

export interface ProductSnapshotRow extends SnapshotFields {
  id: string;
  product_id: string;
  owner_user_id: string;
  snapshot_at: string;
  change_type: SnapshotChangeType;
  detected_changes: unknown;
  created_at: string;
}

/** The most recent snapshot for a product (RLS scopes it to the owner), or null. */
export async function getLatestSnapshot(productId: string): Promise<ProductSnapshotRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('product_id', productId)
    .order('snapshot_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ProductSnapshotRow | null) ?? null;
}

async function insertSnapshot(
  productId: string,
  fields: SnapshotFields,
  change_type: SnapshotChangeType,
  detected_changes: unknown,
): Promise<ProductSnapshotRow> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const user = await getCurrentUser();
  if (!user) throw new Error('You must be signed in to snapshot a product.');
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ product_id: productId, owner_user_id: user.id, change_type, detected_changes, ...fields })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ProductSnapshotRow;
}

/** Record the first snapshot for a newly created product (change_type 'created'). */
export async function snapshotNewProduct(product: SnapshotSource & { id: string }): Promise<ProductSnapshotRow> {
  return insertSnapshot(product.id, extractSnapshotFields(product), 'created', {});
}

/**
 * Record a snapshot for a product ONLY when its source data changed vs the latest snapshot.
 * Returns the new snapshot, or null when nothing changed (a no-op — never PI Verified
 * overwrite, never a product write). When there is no prior snapshot, records 'created'.
 */
export async function snapshotSourceChange(
  productId: string,
  source: SnapshotSource,
): Promise<ProductSnapshotRow | null> {
  const latest = await getLatestSnapshot(productId);
  const current = extractSnapshotFields(source);
  const previous = latest ? normalizeSnapshotFields(latest as unknown as Record<string, unknown>) : null;
  const diff = diffSnapshot(current, previous);
  if (!diff.changed) return null;
  return insertSnapshot(productId, current, diff.change_type, diff.detected_changes);
}
