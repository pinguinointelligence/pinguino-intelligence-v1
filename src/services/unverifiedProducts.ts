/**
 * Produkty → Niezweryfikowane — the data access for the customer's own not-yet-ready products.
 *
 * It lives in `services/` because the studio boundary (src/features/studioBoundary.test.ts) forbids
 * the backend client anywhere in the UI layer: a screen asks a service, and only the service knows
 * there is a database behind it. The RPC already returns customer language, so nothing here has to
 * translate a status — and nothing here may start doing so.
 */
import { supabase } from '@/lib/supabase/client';

export type UnverifiedProduct = {
  productId: string;
  ean: string | null;
  name: string | null;
  brand: string | null;
  savedAt: string | null;
  missing: readonly string[];
};

/**
 * `null` means "we could not ask" — a screen shows a calm sentence for that, which is a different
 * thing from an empty list ("you have none"), and the two must not be confused.
 */
export async function fetchMyUnverifiedProducts(): Promise<UnverifiedProduct[] | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc('gellatti_my_unverified_products_v1');
    if (error) return null;
    return Array.isArray(data) ? (data as UnverifiedProduct[]) : [];
  } catch {
    return null;
  }
}
