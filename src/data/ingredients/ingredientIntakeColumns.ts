/**
 * PINGÜINO Base Approved Ingredients — FROZEN intake column schema (data contract).
 *
 * This is the single machine-readable source of truth for the Hermes intake
 * sheet and future import tooling. It is NOT an app feature, NOT wired to the
 * database, and NOT used by the engine. It only describes the columns, their
 * types, defaults, allowed values and validation intent.
 *
 * Core rules (see docs/ingredients/PINGUINO_BASE_INGREDIENTS_SCHEMA.md):
 *  - All composition values are per 100 g unless a column says otherwise.
 *  - Missing data is stored as blank ('') or null — NEVER invented as 0.
 *  - 0 is allowed only when the value is a verified true zero.
 *  - An ingredient profile is reusable data, NOT a recipe.
 *  - Only `verified` ingredients may later be used by the engine; draft /
 *    internet_data / needs_review / rejected are NOT safe for auto recipes.
 *
 * No-NPAC model (v0.95): ingredient-level `npac_value` was REMOVED. `pac_value`
 * is the ingredient freezing-power source of truth; recipe-level NPAC is
 * calculated by the engine and never stored on an ingredient. Do not add an
 * `npac_value` column back, and never fill missing data with zero.
 */

export type IntakeColumnType =
  | 'string'
  | 'boolean'
  | 'boolean_or_unknown'
  | 'enum'
  | 'number'
  | 'number_or_null'
  | 'iso_date_or_null';

/** Default values vary by type: '' (string), false (boolean), 'unknown'
 * (boolean_or_unknown), enum default (string), 0/number, null (number_or_null,
 * iso_date_or_null). */
export type IntakeDefault = string | number | boolean | null;

export interface IngredientIntakeColumn {
  /** Stable column key — also the exact CSV header. */
  key: string;
  /** Human label for tooling/UI. */
  label: string;
  type: IntakeColumnType;
  /** Part of the mandatory contract (see schema doc for row-vs-engine nuance). */
  required: boolean;
  defaultValue: IntakeDefault;
  /** Closed value set for enum / boolean / boolean_or_unknown columns. */
  allowedValues?: readonly (string | boolean)[];
  /** Numeric lower/upper bound when the column is bounded. */
  min?: number;
  max?: number;
  /** Measurement basis; absent ⇒ per 100 g. */
  unit?: string;
  description: string;
}

export const VERIFICATION_STATUSES = [
  'draft',
  'internet_data',
  'label_data',
  'supplier_data',
  'external_reference_data',
  'needs_review',
  'verified',
  'rejected',
] as const;

export const STORAGE_TYPES = ['ambient', 'chilled', 'frozen', 'dry', 'unknown'] as const;

const BOOL = [true, false] as const;
const BOOL_OR_UNKNOWN = ['true', 'false', 'unknown'] as const;

/** A bounded composition percent column (per 100 g, 0–100, blank = unknown). */
const percent = (key: string, label: string, description: string): IngredientIntakeColumn => ({
  key,
  label,
  type: 'number_or_null',
  required: false,
  defaultValue: null,
  min: 0,
  max: 100,
  unit: 'per 100 g',
  description,
});

export const INGREDIENT_INTAKE_COLUMNS: readonly IngredientIntakeColumn[] = [
  /* ── identity / approval / verification ─────────────────────────────────── */
  { key: 'ingredient_id', label: 'Ingredient ID', type: 'string', required: true, defaultValue: '', description: 'Stable unique id (snake_case). Never reused or renamed once assigned.' },
  { key: 'ingredient_name_internal', label: 'Internal name', type: 'string', required: true, defaultValue: '', description: 'Internal canonical name used by tooling/engine mapping.' },
  { key: 'ingredient_name_display', label: 'Display name', type: 'string', required: true, defaultValue: '', description: 'Human-facing name shown in the app.' },
  { key: 'brand', label: 'Brand', type: 'string', required: false, defaultValue: '', description: 'Brand name, if applicable. Blank if unknown.' },
  { key: 'supplier', label: 'Supplier', type: 'string', required: false, defaultValue: '', description: 'Supplier / distributor. Blank if unknown.' },
  { key: 'country', label: 'Country', type: 'string', required: false, defaultValue: '', description: 'Country of origin / sourcing. Blank if unknown.' },
  { key: 'ean_code', label: 'EAN code', type: 'string', required: false, defaultValue: '', description: 'Barcode / EAN, if available. Blank if unknown.' },
  { key: 'ingredient_category', label: 'Category', type: 'string', required: true, defaultValue: '', description: 'Primary category, e.g. sugar, dairy, fat, fruit, nut_paste, chocolate_cocoa, stabilizer, flavor, alcohol, water, egg, other.' },
  { key: 'ingredient_subcategory', label: 'Subcategory', type: 'string', required: false, defaultValue: '', description: 'Optional finer grouping. Blank if unknown.' },
  { key: 'approved_for_base', label: 'Approved for PINGÜINO Base', type: 'boolean', required: false, defaultValue: false, allowedValues: BOOL, description: 'True only when reviewed and accepted into the locked Mapper Basement set.' },
  { key: 'approved_for_engines', label: 'Approved for engines', type: 'boolean', required: true, defaultValue: false, allowedValues: BOOL, description: 'True only when verified, ≥90% confidence, core composition + sugar split present, POD/PAC present or derivable, and source documented. Composition is universal across PI recipe engines.' },
  { key: 'verification_status', label: 'Verification status', type: 'enum', required: true, defaultValue: 'draft', allowedValues: VERIFICATION_STATUSES, description: 'Trust level of the row. Only `verified` is engine-safe.' },
  { key: 'verification_source', label: 'Verification source', type: 'string', required: false, defaultValue: '', description: 'Where the data came from (label, supplier sheet, external reference, etc.). Blank if unknown.' },
  { key: 'verification_date', label: 'Verification date', type: 'iso_date_or_null', required: false, defaultValue: null, description: 'YYYY-MM-DD when last verified. Null if never verified.' },
  { key: 'data_confidence_percent', label: 'Data confidence %', type: 'number', required: false, defaultValue: 0, min: 0, max: 100, description: '0–100 confidence in the data. 0 = no confidence yet (default), not a verified measurement.' },

  /* ── composition (per 100 g) ────────────────────────────────────────────── */
  { ...percent('water_percent', 'Water %', 'Water content per 100 g. Blank = unknown; 0 = verified zero.'), required: true },
  percent('total_solids_percent', 'Total solids %', 'Total solids per 100 g.'),
  percent('fat_percent', 'Fat %', 'Total fat per 100 g.'),
  percent('saturated_fat_percent', 'Saturated fat %', 'Saturated fat per 100 g.'),
  percent('milk_fat_percent', 'Milk fat %', 'Milk-derived fat per 100 g.'),
  percent('non_fat_milk_solids_percent', 'Non-fat milk solids %', 'MSNF per 100 g.'),
  percent('protein_percent', 'Protein %', 'Total protein per 100 g.'),
  percent('aerating_protein_percent', 'Aerating protein %', 'Dairy/aerating protein per 100 g (excludes non-aerating protein).'),
  percent('carbohydrate_percent', 'Carbohydrate %', 'Total carbohydrate per 100 g.'),
  percent('total_sugars_percent', 'Total sugars %', 'Total sugars per 100 g.'),
  percent('sucrose_percent', 'Sucrose %', 'Sucrose per 100 g.'),
  percent('dextrose_percent', 'Dextrose %', 'Dextrose per 100 g.'),
  percent('glucose_percent', 'Glucose %', 'Glucose per 100 g.'),
  percent('fructose_percent', 'Fructose %', 'Fructose per 100 g.'),
  percent('lactose_percent', 'Lactose %', 'Lactose per 100 g.'),
  percent('polyol_percent', 'Polyol %', 'Polyols (sugar alcohols) per 100 g.'),
  percent('fiber_percent', 'Fibre %', 'Dietary fibre per 100 g.'),
  percent('salt_percent', 'Salt %', 'Salt per 100 g.'),
  percent('alcohol_percent', 'Alcohol %', 'Alcohol by mass per 100 g.'),
  percent('ash_percent', 'Ash %', 'Ash / minerals per 100 g.'),
  percent('acidity_percent', 'Acidity %', 'Titratable acidity per 100 g.'),
  { key: 'brix', label: 'Brix', type: 'number_or_null', required: false, defaultValue: null, min: 0, max: 100, unit: '°Bx', description: 'Degrees Brix (not a percent). Blank = unknown.' },
  percent('dry_matter_percent', 'Dry matter %', 'Dry matter per 100 g.'),

  /* ── engine values ──────────────────────────────────────────────────────── */
  { key: 'pod_value', label: 'POD', type: 'number_or_null', required: true, defaultValue: null, min: 0, unit: 'relative, sucrose = 100', description: 'Relative sweetening power (sucrose = 100; may exceed 100). Store source + confidence when external. Blank = unknown.' },
  { key: 'pac_value', label: 'PAC', type: 'number_or_null', required: false, defaultValue: null, min: 0, unit: 'relative, sucrose = 100', description: 'Freezing-power source of truth (net anti-freezing, sucrose = 100; may exceed 100). Blank = unknown. Ingredient-level NPAC was REMOVED (v0.95) — recipe-level NPAC is derived by the engine; do not add npac_value back.' },
  { key: 'de_value', label: 'DE', type: 'number_or_null', required: false, defaultValue: null, min: 0, max: 100, description: 'Dextrose equivalent for syrups (0–100). Blank = unknown.' },
  { key: 'sweetness_factor', label: 'Sweetness factor', type: 'number_or_null', required: false, defaultValue: null, min: 0, description: 'Optional sweetness coefficient. Blank = unknown.' },
  { key: 'freezing_factor', label: 'Freezing factor', type: 'number_or_null', required: false, defaultValue: null, min: 0, description: 'Optional freezing coefficient. Blank = unknown.' },
  { key: 'stabilizer_activity', label: 'Stabilizer activity', type: 'number_or_null', required: false, defaultValue: null, min: 0, description: 'Optional stabilizer strength index. Blank = unknown.' },
  { key: 'recommended_dosage_percent_min', label: 'Recommended dosage % (min)', type: 'number_or_null', required: false, defaultValue: null, min: 0, max: 100, description: 'Lower recommended dosage of total mix. Blank = unknown.' },
  { key: 'recommended_dosage_percent_max', label: 'Recommended dosage % (max)', type: 'number_or_null', required: false, defaultValue: null, min: 0, max: 100, description: 'Upper recommended dosage of total mix. Blank = unknown.' },

  /* ── nutrition / cost ───────────────────────────────────────────────────── */
  { key: 'kcal_per_100g', label: 'Energy (kcal/100 g)', type: 'number_or_null', required: false, defaultValue: null, min: 0, unit: 'kcal per 100 g', description: 'Energy per 100 g. Blank = unknown.' },
  { key: 'cost_per_kg', label: 'Cost per kg', type: 'number_or_null', required: false, defaultValue: null, min: 0, description: 'Cost per kg. Blank = unknown; 0 = verified free/zero cost, never missing.' },
  { key: 'currency', label: 'Currency', type: 'string', required: false, defaultValue: '', description: 'ISO 4217 currency for cost_per_kg, e.g. EUR. Blank if unknown.' },

  /* ── food safety / usage ────────────────────────────────────────────────── */
  { key: 'allergens', label: 'Allergens', type: 'string', required: false, defaultValue: '', description: 'Pipe/semicolon-separated allergen list. Blank if unknown.' },
  { key: 'vegan', label: 'Vegan', type: 'boolean_or_unknown', required: false, defaultValue: 'unknown', allowedValues: BOOL_OR_UNKNOWN, description: 'true / false / unknown. Default unknown — never guess.' },
  { key: 'dairy_free', label: 'Dairy free', type: 'boolean_or_unknown', required: false, defaultValue: 'unknown', allowedValues: BOOL_OR_UNKNOWN, description: 'true / false / unknown. Default unknown.' },
  { key: 'gluten_free', label: 'Gluten free', type: 'boolean_or_unknown', required: false, defaultValue: 'unknown', allowedValues: BOOL_OR_UNKNOWN, description: 'true / false / unknown. Default unknown.' },
  { key: 'contains_alcohol', label: 'Contains alcohol', type: 'boolean_or_unknown', required: false, defaultValue: 'unknown', allowedValues: BOOL_OR_UNKNOWN, description: 'true / false / unknown. Default unknown — if unknown and the ingredient may contain alcohol, it is NOT engine-approvable.' },
  { key: 'storage_type', label: 'Storage type', type: 'enum', required: false, defaultValue: 'unknown', allowedValues: STORAGE_TYPES, description: 'ambient / chilled / frozen / dry / unknown. Default unknown.' },
  { key: 'shelf_life_days', label: 'Shelf life (days)', type: 'number_or_null', required: false, defaultValue: null, min: 0, unit: 'days', description: 'Shelf life in days. Blank = unknown.' },
  { key: 'usage_notes', label: 'Usage notes', type: 'string', required: false, defaultValue: '', description: 'Free-text usage notes. Do not invent. Blank if none.' },
  { key: 'engine_notes', label: 'Engine notes', type: 'string', required: false, defaultValue: '', description: 'Notes for engine mapping / derivation. Blank if none.' },
  { key: 'source_url', label: 'Source URL', type: 'string', required: false, defaultValue: '', description: 'Link to the source/proof. Blank if none.' },
  { key: 'screenshot_reference', label: 'Screenshot reference', type: 'string', required: false, defaultValue: '', description: 'Reference to a stored screenshot/proof file. Blank if none.' },
  { key: 'last_reviewed_by', label: 'Last reviewed by', type: 'string', required: false, defaultValue: '', description: 'Reviewer identity. Blank if never reviewed.' },
  { key: 'last_reviewed_at', label: 'Last reviewed at', type: 'iso_date_or_null', required: false, defaultValue: null, description: 'YYYY-MM-DD of last review. Null if never reviewed.' },
];

/** The exact, ordered CSV header row (matches the schema 1:1). */
export const INGREDIENT_INTAKE_HEADERS: readonly string[] = INGREDIENT_INTAKE_COLUMNS.map(
  (column) => column.key,
);

/** Columns whose value Hermes must supply to create a row at all. */
export const ROW_CREATION_REQUIRED_KEYS = [
  'ingredient_id',
  'ingredient_name_internal',
  'ingredient_name_display',
  'ingredient_category',
  'verification_status',
] as const;

/** Core composition fields a `verified` ingredient must carry to be engine-ready. */
export const ENGINE_CORE_COMPOSITION_KEYS = [
  'water_percent',
  'total_solids_percent',
  'fat_percent',
  'protein_percent',
  'carbohydrate_percent',
  'total_sugars_percent',
  'salt_percent',
] as const;

export const findIntakeColumn = (key: string): IngredientIntakeColumn | undefined =>
  INGREDIENT_INTAKE_COLUMNS.find((column) => column.key === key);
