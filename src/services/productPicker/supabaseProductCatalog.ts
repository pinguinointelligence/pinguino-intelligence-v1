/**
 * PINGÜINO Product Picker — Supabase catalogue adapter (against the real schema).
 *
 * Adapts the canonical products service (`public.products`, owner-scoped by RLS,
 * anon key only) into a `ProductCatalogPort`. It is DEPENDENCY-INJECTED: the
 * `listProducts` reader (and an optional reference lookup) are passed in, so this
 * module binds to no live backend at import time and is fully unit-testable with a
 * mocked client. It NEVER writes a product, never grants PI Verified, never mutates
 * a status, and never reads or writes the locked `mapper_basement`.
 *
 * This adapter is wired ONLY against a verified, approved products environment.
 * Production (`riwipywgqobrulyzrzad`) and MOOTOORS are never write targets, and the
 * public build stays on the honest in-memory sample until an approved environment
 * is connected.
 */
import type { ProductRow } from '@/data/products/productRow';
import type { ReferenceEngineValues } from '@/data/products/productEngineResolver';
import {
  productRowToPickerEntry,
  type PickerCatalogueEntry,
  type ProductCatalogPort,
} from '@/features/product-picker';

export interface SupabaseCatalogDeps {
  /** Reads the owner-scoped product rows (e.g. the real `listMyProducts`). */
  listProducts: () => Promise<ProductRow[]>;
  /** Optional: look up the matched `mapper_basement` reference for a row (read-only).
   *  When absent, matched rows stay honestly "not exact-ready" (no fabricated link). */
  lookupReference?: (matchedBasementId: string) => Promise<ReferenceEngineValues | null>;
}

/**
 * Build a `ProductCatalogPort` over the canonical products service. Maps each owned
 * `ProductRow` to a picker entry (resolving the matched reference when a lookup is
 * provided). Pure mapping; the injected reader is the only IO.
 */
export function createSupabaseProductCatalog(deps: SupabaseCatalogDeps): ProductCatalogPort {
  return {
    fetch: async (): Promise<PickerCatalogueEntry[]> => {
      const rows = await deps.listProducts();
      const entries: PickerCatalogueEntry[] = [];
      for (const row of rows) {
        let reference: ReferenceEngineValues | null = null;
        if (deps.lookupReference && row.matched_basement_id) {
          reference = await deps.lookupReference(row.matched_basement_id);
        }
        entries.push(productRowToPickerEntry(row, reference));
      }
      return entries;
    },
  };
}
