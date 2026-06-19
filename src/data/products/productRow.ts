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
 * are the 11 columns added by migration 0008 and written ONLY by the D3 write-back
 * (saveProductMatchResult). The engine/profile JSON (calculated_profile_json /
 * source_values_json) is deliberately still ABSENT — deferred to a later slice.
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

/**
 * Mapper-result enum domains — mirror the 0008 `products` CHECK constraints
 * EXACTLY. Defined HERE (not imported from the matcher) so the data layer owns its
 * own column domains and stays import-free. These are a SUPERSET of what the pure
 * D2 matcher emits: `match_method` adds `manual_mapping`, and the confidence/status
 * domains reserve `rejected` — both are human / D3-review values the deterministic
 * matcher never produces. Every D2 result value is assignable into the wider field.
 */
export type ProductMatchConfidence =
  | 'exact'
  | 'high'
  | 'medium'
  | 'low'
  | 'needs_review'
  | 'rejected';

export type ProductMatchMethod =
  | 'exact_ean'
  | 'exact_normalized_name'
  | 'brand_name'
  | 'category_composition_similarity'
  | 'ingredient_type'
  | 'fuzzy_name'
  | 'no_confident_match'
  | 'manual_mapping';

export type ProductMapperStatus =
  | 'unmatched'
  | 'matched'
  | 'ambiguous'
  | 'needs_review'
  | 'rejected';

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
  // Mapper result (0008) — written ONLY by the D3 write-back (saveProductMatchResult);
  // NULL until a product is matched. matched_basement_id is a PLAIN value reference to
  // a mapper_basement ingredient_id (never a FK). missing_fields_json + candidate_ids
  // are jsonb string arrays. The engine/profile JSON is deliberately NOT here.
  matched_basement_id: string | null;
  match_confidence: ProductMatchConfidence | null;
  match_method: ProductMatchMethod | null;
  mapper_status: ProductMapperStatus | null;
  mapper_notes: string | null;
  normalized_name: string | null;
  normalized_category: string | null;
  needs_review_reason: string | null;
  missing_fields_json: string[] | null;
  candidate_ids: string[] | null;
  candidate_count: number | null;
}

/** DB-managed columns a client never sets directly. */
type ServerManaged = 'id' | 'owner_user_id' | 'created_at' | 'updated_at';

/** The 11 Mapper-result columns (0008). Written ONLY by the D3 write-back; never
 * set on create. */
export type MapperResultField =
  | 'matched_basement_id'
  | 'match_confidence'
  | 'match_method'
  | 'mapper_status'
  | 'mapper_notes'
  | 'normalized_name'
  | 'normalized_category'
  | 'needs_review_reason'
  | 'missing_fields_json'
  | 'candidate_ids'
  | 'candidate_count';

/** Fields a client may set when creating a product. The service injects
 * owner_user_id; status defaults to 'draft' and source_type to 'manual' in the DB,
 * so both are optional. Omitting a numeric leaves it NULL (never 0). Mapper-result
 * fields are excluded — a new product has no match yet (write them via D3). */
export type ProductInsert = Partial<Omit<ProductRow, ServerManaged | MapperResultField>>;

/** Fields a client may change. Ownership and identity (id/owner_user_id) and the
 * DB timestamps are never reassigned here. */
export type ProductUpdate = Partial<Omit<ProductRow, ServerManaged>>;

/** The NARROW patch the D3 write-back uses: ONLY the 11 Mapper-result columns, each
 * optional + nullable. saveProductMatchResult builds exactly this (never a broad
 * ProductUpdate), so a write-back can never touch a non-mapper column. */
export type ProductMapperResultUpdate = Partial<Pick<ProductRow, MapperResultField>>;
