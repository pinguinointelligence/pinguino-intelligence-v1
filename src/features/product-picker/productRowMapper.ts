/**
 * PINGÜINO Product Picker — pure `ProductRow` → `PickerCatalogueEntry` mapper.
 *
 * Maps a canonical `public.products` row (the real schema) onto the picker's
 * display + readiness shape. Read-only: copies a subset of fields, never mutates
 * the row, never invents a value (unknown stays null). The matched-basement
 * `reference` is supplied by the caller (the adapter looks it up, or passes null);
 * without a reference a matched product is honestly "not exact-ready" rather than
 * being silently upgraded.
 */
import type { ProductRow } from '@/data/products/productRow';
import type { ReferenceEngineValues } from '@/data/products/productEngineResolver';
import type { PickerCatalogueEntry } from './productPickerContracts';

/** Best human-readable name for a row, falling back through internal name → code. */
function displayNameOf(row: ProductRow): string {
  return row.product_name_display ?? row.product_name_internal ?? row.product_code ?? '(produkt bez nazwy)';
}

/** Map one canonical product row to a picker entry. Pure; the reference is injected. */
export function productRowToPickerEntry(
  row: ProductRow,
  reference: ReferenceEngineValues | null = null,
): PickerCatalogueEntry {
  return {
    productId: row.id,
    productCode: row.product_code ?? null,
    displayName: displayNameOf(row),
    internalName: row.product_name_internal,
    brand: row.brand,
    ean: row.ean_code,
    category: row.product_category,
    packageSize: row.package_size,
    imageUrl: row.product_image_url,
    status: row.status,
    readiness: {
      pac_value: row.pac_value,
      pod_value: row.pod_value,
      mapper_status: row.mapper_status,
      matched_basement_id: row.matched_basement_id,
      product_name_display: row.product_name_display,
      product_name_internal: row.product_name_internal,
      detected_text: row.detected_text,
      allergens: row.allergens,
      polyol_percent: row.polyol_percent,
      total_sugars_percent: row.total_sugars_percent,
      source_type: row.source_type,
    },
    reference,
  };
}
