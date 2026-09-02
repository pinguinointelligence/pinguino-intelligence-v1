/**
 * Read-only compatibility access to the retired owner product snapshot ledger.
 * All new product history is created atomically by ingest_product_v1 in product_versions.
 */
import { supabase } from '@/lib/supabase/client';
import { emptyUnconfiguredRead } from '@/services/backendGuard';
import type { SnapshotChangeType, SnapshotFields } from '@/data/products/productSnapshotDiff';

const TABLE = 'product_snapshots';

export interface ProductSnapshotRow extends SnapshotFields {
  id: string;
  product_id: string;
  owner_user_id: string;
  snapshot_at: string;
  change_type: SnapshotChangeType;
  detected_changes: unknown;
  created_at: string;
}

export async function listProductSnapshots(productId: string): Promise<ProductSnapshotRow[]> {
  if (!supabase) return emptyUnconfiguredRead('productSnapshots.listProductSnapshots', []);
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('product_id', productId)
    .order('snapshot_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProductSnapshotRow[];
}

export async function getLatestSnapshot(productId: string): Promise<ProductSnapshotRow | null> {
  if (!supabase) return emptyUnconfiguredRead('productSnapshots.getLatestSnapshot', null);
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
