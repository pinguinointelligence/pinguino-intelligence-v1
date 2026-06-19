/**
 * Shape of one row from the `public.products` table (Mapper Slice D1).
 *
 * `public.products` is the GROWING, owner-scoped product layer (migration 0007):
 * customer uploads, catalogs (Colin / Mercadona), label/barcode/EAN scans, OCR,
 * manual entry, API. It is SEPARATE from the locked `mapper_basement` reference.
 *
 * This is a pure type — it imports nothing (no engine, no data access) so it can
 * live in the boundary-scanned `data/` layer. Mirrors the 0007 columns 1:1.
 *
 * Honesty rules (same as the ingredient layer):
 *   • numeric columns are `number | null` — unknown stays NULL, NEVER coerced to 0;
 *   • identity/text columns are `string | null` — raw uploads/scans arrive incomplete;
 *   • there is deliberately NO `npac_value` (v0.95 no-NPAC): `pac_value` is the
 *     freezing-power source of truth, `pod_value` the sweetness source of truth,
 *     and recipe-level NPAC is derived by the engine, never stored on a product.
 *
 * Mapper-result fields (matched_basement_id, match_confidence, mapper_status, …)
 * are intentionally ABSENT here — they arrive with a future 0008 migration, not D1.
 */

/** Product lifecycle (0007 `status` CHECK). */
export type ProductStatus =
  | 'draft'
  | 'pi_calculated'
  | 'pi_generated'
  | 'manual_adjusted'
  | 'pi_verified'
  | 'rejected';

/** Where a product row came from (0007 `source_type` CHECK). */
export type ProductSourceType =
  | 'customer_upload'
  | 'label_scan'
  | 'barcode_ean'
  | 'catalog_import'
  | 'mercadona'
  | 'colin_catalog'
  | 'manual'
  | 'api';

/** Tri-state stored as text so "unknown" stays honest (never coerced to false). */
export type ProductBooleanOrUnknown = 'true' | 'false' | 'unknown';

export type ProductStorageType = 'ambient' | 'chilled' | 'frozen' | 'dry' | 'unknown';

export interface ProductRow {
  // identity / ownership
  id: string;
  owner_user_id: string;
  created_by: string | null;
  brand: string | null;
  supplier: string | null;
  ean_code: string | null;
  barcode: string | null;
  product_name_internal: string | null;
  product_name_display: string | null;
  product_category: string | null;
  product_subcategory: string | null;
  country: string | null;
  // composition (per 100 g) — unknown stays NULL, never 0
  water_percent: number | null;
  total_solids_percent: number | null;
  fat_percent: number | null;
  saturated_fat_percent: number | null;
  milk_fat_percent: number | null;
  non_fat_milk_solids_percent: number | null;
  protein_percent: number | null;
  aerating_protein_percent: number | null;
  carbohydrate_percent: number | null;
  total_sugars_percent: number | null;
  sucrose_percent: number | null;
  dextrose_percent: number | null;
  glucose_percent: number | null;
  fructose_percent: number | null;
  lactose_percent: number | null;
  polyol_percent: number | null;
  fiber_percent: number | null;
  salt_percent: number | null;
  alcohol_percent: number | null;
  ash_percent: number | null;
  acidity_percent: number | null;
  brix: number | null;
  dry_matter_percent: number | null;
  // engine values — `pac_value` is the freezing-power source of truth,
  // `pod_value` the sweetness source of truth. NO `npac_value` (v0.95 no-NPAC).
  pod_value: number | null;
  pac_value: number | null;
  de_value: number | null;
  sweetness_factor: number | null;
  freezing_factor: number | null;
  stabilizer_activity: number | null;
  recommended_dosage_percent_min: number | null;
  recommended_dosage_percent_max: number | null;
  // nutrition / cost
  kcal_per_100g: number | null;
  cost_per_kg: number | null;
  currency: string | null;
  // food safety / usage
  allergens: string | null;
  vegan: ProductBooleanOrUnknown | null;
  dairy_free: ProductBooleanOrUnknown | null;
  gluten_free: ProductBooleanOrUnknown | null;
  contains_alcohol: ProductBooleanOrUnknown | null;
  storage_type: ProductStorageType | null;
  shelf_life_days: number | null;
  usage_notes: string | null;
  engine_notes: string | null;
  // intake placeholders (no logic this slice)
  product_image_url: string | null;
  detected_text: string | null;
  extracted_json: unknown; // jsonb; shape not assumed (no OCR/extractor this slice)
  catalog_source: string | null;
  // lifecycle / classification
  status: ProductStatus;
  source_type: ProductSourceType;
  // review (inert this slice)
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  // promotion provenance — inert; nothing here ever writes the locked reference base
  promoted_to_basement: boolean;
  promoted_at: string | null;
  // dataset / lifecycle metadata
  dataset_version: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** DB-managed columns a client never sets directly. */
type ServerManaged = 'id' | 'owner_user_id' | 'created_at' | 'updated_at';

/** Fields a client may set when creating a product. The service injects
 * owner_user_id; status defaults to 'draft' and source_type to 'manual' in the DB,
 * so both are optional. Omitting a numeric leaves it NULL (never 0). */
export type ProductInsert = Partial<Omit<ProductRow, ServerManaged>>;

/** Fields a client may change. Ownership and identity (id/owner_user_id) and the
 * DB timestamps are never reassigned here. */
export type ProductUpdate = Partial<Omit<ProductRow, ServerManaged>>;
