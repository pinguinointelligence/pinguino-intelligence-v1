/**
 * Produkty → „Moje produkty" — the account's OWN products, ready and not.
 *
 * It lives in `services/` because the studio boundary forbids the backend client in the UI layer:
 * a screen asks a service, and only the service knows there is a database behind it.
 *
 * Privacy is the database's, not this file's. `products_canonical_read` admits a row only when
 * `owning_account_id = auth.uid()` or `created_by = auth.uid()`, so another account's private
 * product is not merely filtered out here — it is never returned. The explicit `owning_account_id`
 * filter is a second, narrower statement of the same intent, so a future policy change cannot turn
 * this list into someone else's.
 */
import { supabase } from '@/lib/supabase/client';

export type MyProduct = {
  productId: string;
  productCode: string | null;
  ean: string | null;
  name: string | null;
  brand: string | null;
  savedAt: string | null;
  /** the readiness verdict as saved — never re-derived on the client */
  ready: boolean;
};

type Row = {
  id: string;
  product_code: string | null;
  ean_code_normalized: string | null;
  product_name_display: string | null;
  product_name_internal: string | null;
  brand: string | null;
  created_at: string | null;
  current_version_id: string | null;
};

const readySaved = (facts: Record<string, unknown> | null | undefined): boolean => {
  if (!facts || typeof facts !== 'object') return false;
  const intelligence = (facts as Record<string, unknown>)['productIntelligence'];
  const assessment =
    intelligence && typeof intelligence === 'object'
      ? (intelligence as Record<string, unknown>)['productAccuracyAssessment']
      : null;
  const readiness =
    assessment && typeof assessment === 'object'
      ? (assessment as Record<string, unknown>)['gellattiReadiness']
      : null;
  return Boolean(
    readiness && typeof readiness === 'object' && (readiness as Record<string, unknown>)['ready'],
  );
};

/** `null` means "we could not ask" — a different thing from an empty list, and shown differently. */
export async function fetchMyProducts(): Promise<MyProduct[] | null> {
  if (!supabase) return null;
  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) return null;
    const { data, error } = await supabase
      .from('products')
      .select(
        'id,product_code,ean_code_normalized,product_name_display,product_name_internal,brand,created_at,current_version_id',
      )
      .eq('owning_account_id', userId)
      .eq('is_active', true)
      .is('merged_into_product_id', null)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return null;
    const rows = (data ?? []) as unknown as Row[];
    /* The FK to the current version is composite, so the readiness verdict is read directly rather
       than embedded — one extra round trip, no reliance on how PostgREST names a composite join. */
    const versionIds = rows
      .map((row) => row.current_version_id)
      .filter((id): id is string => typeof id === 'string');
    const readyById = new Map<string, boolean>();
    if (versionIds.length > 0) {
      const { data: versions } = await supabase
        .from('product_versions')
        .select('id,facts')
        .in('id', versionIds);
      for (const version of (versions ?? []) as { id: string; facts: unknown }[]) {
        readyById.set(version.id, readySaved(version.facts as Record<string, unknown> | null));
      }
    }
    return rows.map((row) => ({
      productId: row.id,
      productCode: row.product_code,
      ean: row.ean_code_normalized,
      name: row.product_name_display ?? row.product_name_internal,
      brand: row.brand,
      savedAt: row.created_at,
      ready: row.current_version_id ? (readyById.get(row.current_version_id) ?? false) : false,
    }));
  } catch {
    return null;
  }
}
