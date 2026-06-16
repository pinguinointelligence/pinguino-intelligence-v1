/**
 * Shape of one row from the `public.ingredients` table (Phase Ingredients 1).
 *
 * Mirrors the frozen Hermes schema column-for-column plus the table's lifecycle
 * metadata. This is a pure type — it imports nothing and stays free of any data
 * access so it can live in the boundary-scanned `data/` layer. The read-only
 * service returns these rows; the pure mapper turns them into EngineIngredients.
 *
 * Numeric columns are `number | null` (blank in the dataset = unknown = NULL,
 * never invented as 0). Date columns are ISO strings or null.
 */

export type VerificationStatus =
  | 'draft'
  | 'internet_data'
  | 'label_data'
  | 'supplier_data'
  | 'external_reference_data'
  | 'needs_review'
  | 'verified'
  | 'rejected';

export type StorageType = 'ambient' | 'chilled' | 'frozen' | 'dry' | 'unknown';

/** Tri-state stored as text so "unknown" stays honest (never coerced to false). */
export type BooleanOrUnknown = 'true' | 'false' | 'unknown';

export interface IngredientRow {
  // identity
  ingredient_id: string;
  ingredient_name_internal: string;
  ingredient_name_display: string;
  brand: string;
  supplier: string;
  country: string;
  ean_code: string;
  ingredient_category: string;
  ingredient_subcategory: string;
  // approval & verification
  approved_for_pinguino_base: boolean;
  approved_for_minus_11_engine: boolean;
  verification_status: VerificationStatus;
  verification_source: string;
  verification_date: string | null;
  data_confidence_percent: number | null;
  // composition (per 100 g)
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
  // engine values
  pod_value: number | null;
  pac_value: number | null;
  npac_value: number | null;
  de_value: number | null;
  sweetness_factor: number | null;
  freezing_factor: number | null;
  stabilizer_activity: number | null;
  recommended_dosage_percent_min: number | null;
  recommended_dosage_percent_max: number | null;
  // nutrition / cost
  kcal_per_100g: number | null;
  cost_per_kg: number | null;
  currency: string;
  // food safety / usage
  allergens: string;
  vegan: BooleanOrUnknown;
  dairy_free: BooleanOrUnknown;
  gluten_free: BooleanOrUnknown;
  contains_alcohol: BooleanOrUnknown;
  storage_type: StorageType;
  shelf_life_days: number | null;
  usage_notes: string;
  engine_notes: string;
  source_url: string;
  screenshot_reference: string;
  last_reviewed_by: string;
  last_reviewed_at: string | null;
  // dataset / lifecycle metadata
  dataset_version: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
