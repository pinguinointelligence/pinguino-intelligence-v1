/**
 * PINGÜINO engine types — Step 4B foundation.
 *
 * Source of truth: docs/PINGUINO_RECIPE_ENGINE_SPEC_V1.md (LOCKED — overrides the
 * masterplan on any engine/math difference). Section references below point there.
 *
 * Field names follow the spec's snake_case (e.g. `planned_grams`, spec §15);
 * UI and store layers map to camelCase at their own boundary.
 *
 * This file contains types only — no functions, no logic.
 */

/* ── Core unions ─────────────────────────────────────────────────────────── */

export type ProductMode = 'eco' | 'classic' | 'premium' | 'signature';

export type ProductCategory =
  | 'milk_gelato'
  | 'fruit_gelato'
  | 'nut_gelato'
  | 'chocolate_gelato'
  | 'alcohol_gelato'
  | 'sorbet'
  | 'vegan_gelato'
  | 'custom';

/** Spec §13/§15 — the six lock types. `already_added` lines can never be reduced. */
export type LockType = 'unlocked' | 'grams' | 'percent' | 'main' | 'already_added' | 'required';

/** Full engine status vocabulary (spec §9; masterplan §12.7). The UI chip set in
 * src/components/shared/status.ts is a separate presentation subset mapped later. */
export type IndicatorStatus =
  | 'ideal'
  | 'good'
  | 'risky'
  | 'too_soft'
  | 'too_hard'
  | 'too_sweet'
  | 'too_weak'
  | 'too_expensive'
  | 'premium'
  | 'needs_correction';

export type IngredientCategory =
  | 'sugar'
  | 'dairy'
  | 'fat'
  | 'fruit'
  | 'nut_paste'
  | 'chocolate_cocoa'
  | 'stabilizer'
  | 'flavor'
  | 'alcohol'
  | 'water'
  | 'egg'
  | 'other';

/** Masterplan §16 — where ingredient data came from. */
export type SourceType =
  | 'verified_db'
  | 'producer_label'
  | 'ocr'
  | 'manual'
  | 'ai_estimated'
  | 'external_db'
  | 'user_created';

export type DietaryFlag =
  | 'vegan'
  | 'lactose_free'
  | 'low_sugar'
  | 'no_added_sugar'
  | 'alcohol'
  | 'gluten_free'
  | 'allergen_aware';

/* ── Ingredient model (spec §3) ──────────────────────────────────────────── */

/**
 * Per-100 g composition. Total sugar alone is never enough (spec §3–§4):
 * the typed sugar split drives POD and PAC/NPAC. Alcohol is its own component —
 * never water, never solids (spec §5).
 */
export interface IngredientComponentProfile {
  water_percent: number;
  solids_percent: number;
  fat_percent: number;
  protein_percent: number;
  carbohydrate_percent: number;
  sugar_percent: number;
  sucrose_percent: number;
  glucose_percent: number;
  dextrose_percent: number;
  fructose_percent: number;
  lactose_percent: number;
  polyol_percent: number;
  fiber_percent: number;
  salt_percent: number;
  alcohol_percent: number;
  kcal_per_100g: number;
}

/** Flags the engine math/corrections care about (full flag set lives in the DB plan). */
export interface EngineIngredientFlags {
  is_dairy?: boolean;
  is_animal_origin?: boolean;
  is_flavor_booster?: boolean;
  is_stabilizer?: boolean;
}

export interface EngineIngredient {
  id: string;
  name: string;
  category: IngredientCategory;
  composition: IngredientComponentProfile;
  /** Stored, verified-first values (spec §7–§8): when present, the engine uses
   * these instead of deriving from the sugar breakdown. */
  pod_value: number | null;
  pac_value: number | null;
  npac_value: number | null;
  /** Dextrose-equivalent for glucose syrups (spec §8). */
  de_value: number | null;
  cost_per_kg: number;
  /** 0–100 (masterplan §16). */
  confidence_score: number;
  source_type: SourceType;
  is_verified: boolean;
  flags?: EngineIngredientFlags;
}

/* ── Recipe input (spec §6, §15) ─────────────────────────────────────────── */

export interface RecipeItem {
  id: string;
  ingredient: EngineIngredient;
  planned_grams: number;
  /** Real production amount (Actual Batch Mode, spec §15). */
  actual_grams: number | null;
  lock_type: LockType;
  production_step?: number;
  notes?: string;
}

/** A recipe item after the effective-grams rule (spec §6):
 * `effective_grams = actual_grams ?? planned_grams`. Computed by composition.ts (4C). */
export interface EffectiveRecipeItem extends RecipeItem {
  effective_grams: number;
  /** actual − planned (0 when no actual recorded). */
  difference: number;
  is_actual: boolean;
}

/** Page-1 recipe goals — consumed by scoring/corrections from 4C onward. */
export interface RecipeGoals {
  sweetness?: 'low' | 'normal' | 'high';
  flavor_intensity?: 'light' | 'balanced' | 'strong' | 'maximum';
  creaminess?: 'light' | 'classic' | 'premium' | 'dense';
  cost_priority?: 'low' | 'balanced' | 'premium';
  main_priority?: 'normal' | 'high' | 'maximum';
  dietary?: DietaryFlag[];
}

export interface RecipeInput {
  items: RecipeItem[];
  mode: ProductMode;
  category: ProductCategory;
  target_temperature_c: number;
  /** Always grams internally; liters are converted upstream via density config. */
  target_batch_grams: number;
  machine_capacity_grams: number | null;
  goals?: RecipeGoals;
}

/* ── Composition results (spec §6) ───────────────────────────────────────── */

/** The 13 component gram totals (spec §6 verbatim). */
export interface ComponentTotals {
  water_g: number;
  solids_g: number;
  fat_g: number;
  protein_g: number;
  lactose_g: number;
  sucrose_g: number;
  glucose_g: number;
  dextrose_g: number;
  fructose_g: number;
  polyol_g: number;
  fiber_g: number;
  salt_g: number;
  alcohol_g: number;
}

/** Sugar-type gram view (spec §4) — sugars are never one generic number. */
export interface SugarBreakdown {
  sucrose_g: number;
  glucose_g: number;
  dextrose_g: number;
  fructose_g: number;
  lactose_g: number;
  polyol_g: number;
  other_sugar_g: number;
}

/** Component percentages of total batch mass (spec §6). */
export interface RecipePercentages {
  water_percent: number;
  solids_percent: number;
  fat_percent: number;
  protein_percent: number;
  lactose_percent: number;
  sucrose_percent: number;
  glucose_percent: number;
  dextrose_percent: number;
  fructose_percent: number;
  polyol_percent: number;
  fiber_percent: number;
  salt_percent: number;
  alcohol_percent: number;
}

/* ── Targets & indicators (spec §9) ──────────────────────────────────────── */

/** The 11 target metrics of the (category, temperature) bands (spec §9). */
export type TargetMetric =
  | 'pod'
  | 'npac'
  | 'ice_fraction'
  | 'lactose'
  | 'lactose_sandiness_risk'
  | 'fat'
  | 'aerating_protein'
  | 'protein_in_solids'
  | 'total_solids'
  | 'water'
  | 'alcohol';

export interface TargetRange {
  min: number;
  max: number;
  warn_above?: number;
  warn_below?: number;
}

/** Target metrics plus the client-facing PI panel indicators (masterplan §7 Page 3). */
export type IndicatorKey =
  | TargetMetric
  | 'structure'
  | 'freezing_stability'
  | 'sweetness'
  | 'creaminess'
  | 'flavor_intensity'
  | 'cost_per_kg'
  | 'cost_per_serving'
  | 'overall';

export interface Indicator {
  key: IndicatorKey;
  value: number | null;
  status: IndicatorStatus;
  band?: TargetRange;
}

export interface RecipeScores {
  technical: number;
  flavor: number;
  cost: number;
  overall: number;
}

/** Engine warnings are code-based — no English inside the engine; copy maps codes. */
export type WarningCode =
  | 'alcohol_above_safe_range'
  | 'machine_capacity_exceeded'
  | 'batch_mass_mismatch'
  | 'composition_invalid'
  | 'low_confidence_ingredient';

export interface EngineWarning {
  code: WarningCode;
  severity: 'info' | 'warning' | 'critical';
  context?: Record<string, number | string>;
}

/* ── Result (spec §6–§9, §17) ────────────────────────────────────────────── */

/**
 * Future-complete result shape: 4C+ fills the nullable calculation fields.
 * Nothing constructs this type in Step 4B — there is no calculation logic yet.
 */
export interface RecipeResult {
  /** Spec §17 — every result is reproducible. */
  engine_version: string;
  config_version: string;
  total_batch_g: number;
  items: EffectiveRecipeItem[];
  totals: ComponentTotals;
  percentages: RecipePercentages;
  sugar: SugarBreakdown;
  pod_points: number | null;
  pac_points: number | null;
  npac_points: number | null;
  ice_fraction_percent: number | null;
  indicators: Indicator[];
  scores: RecipeScores | null;
  warnings: EngineWarning[];
}

/* ── Config shapes (spec §7–§11; data lives in src/engine/config/) ──────── */

export interface SugarCoefficients {
  sucrose: number;
  dextrose: number;
  glucose: number;
  fructose: number;
  lactose: number;
  invert: number;
}

export interface NpacCoefficients extends SugarCoefficients {
  /** Spec §8 — must strongly increase freezing depression. */
  alcohol: number;
  /** Spec §8 — flagged calibration-sensitive. */
  salt: number;
}

/** Spec §8 calibration assumptions box: per_total_mass is and remains the canonical
 * default; per_water_mass is a candidate calibration mode to be tested only. */
export type NpacNormalization = 'per_total_mass' | 'per_water_mass';

/** DE → (pod, pac) anchor for syrups known only by DE value (spec §8). Data only;
 * interpolation logic arrives with pac.ts in 4C. */
export interface SyrupDeAnchor {
  de: number;
  pod: number;
  pac: number;
}

export type PolyolName = 'erythritol' | 'sorbitol' | 'maltitol' | 'xylitol' | 'glycerol';

export interface PolyolCoefficients {
  pod: number;
  pac: number;
}

export interface CoefficientConfig {
  pod: SugarCoefficients;
  pac: SugarCoefficients;
  npac: NpacCoefficients;
  npac_normalization: NpacNormalization;
  syrup_de_anchors: readonly SyrupDeAnchor[];
  polyols: Record<PolyolName, PolyolCoefficients>;
}

export interface TargetBand {
  category: ProductCategory;
  temperature_c: number;
  /** 'seeded' = from the locked spec; 'estimated' = default pending tuning. */
  status: 'seeded' | 'estimated';
  metrics: Record<TargetMetric, TargetRange>;
}

export interface ModeScoreWeights {
  cost: number;
  technical: number;
  flavor: number;
}

export interface MainIngredientPolicy {
  /** Spec §12 — PREMIUM/SIGNATURE: the solver may never reduce the main ingredient. */
  reduce_forbidden: boolean;
  floor: 'category_min' | 'raised' | 'maximum';
}

export type CandidateRanking = 'cheapest_first' | 'balanced' | 'mouthfeel_first' | 'flavor_first';

export type BoosterPolicy = 'none' | 'allowed' | 'suggested';

/** Spec §11 — modes are calculation policies, not visual styles. */
export interface ModePolicy {
  mode: ProductMode;
  objective: string;
  score_weights: ModeScoreWeights;
  main_ingredient: MainIngredientPolicy;
  candidate_ranking: CandidateRanking;
  boosters: BoosterPolicy;
}

/** Spec §10 — the Golden Middle priority order keys. */
export type PriorityKey =
  | 'feasibility_safety'
  | 'freezing_stability'
  | 'npac_pac'
  | 'pod'
  | 'water_solids'
  | 'fat'
  | 'protein'
  | 'lactose_sandiness'
  | 'stabilizer_ratio'
  | 'flavor_priority'
  | 'cost';

export interface EngineConfig {
  version: { engine_version: string; config_version: string };
  coefficients: CoefficientConfig;
  targets: readonly TargetBand[];
  modes: Record<ProductMode, ModePolicy>;
  priorities: readonly PriorityKey[];
  /** g/ml by category — user override always wins (spec/masterplan Page 1). */
  density: Record<ProductCategory, number>;
}

/* ── AI boundary (spec §19) ──────────────────────────────────────────────── */

/** Engine-computed numbers only — the snapshot AI is allowed to see/reference. */
export interface RecipeResultSummary {
  engine_version: string;
  config_version: string;
  percentages: RecipePercentages;
  pod_points: number | null;
  pac_points: number | null;
  npac_points: number | null;
  ice_fraction_percent: number | null;
  indicators: Indicator[];
  warnings: EngineWarning[];
}

/** Hello PI / assistant → engine. AI collects intent; the engine computes. */
export interface RecipeIntent {
  product_type: ProductCategory;
  recipe_mode: ProductMode;
  target_temperature_c: number;
  /** Liters are converted upstream via density config before reaching the engine. */
  batch_grams: number | null;
  machine_capacity_liters?: number;
  main_ingredient?: string;
  flavour_priority: 'maximum' | 'balanced' | 'lowest_cost';
  dietary: DietaryFlag[];
  already_added?: Array<{ ingredient: string; grams: number }>;
  missing_information: string[];
  next_action: string;
}

/** Label/OCR analysis → ingredient record. AI output is never verified (spec §3). */
export interface IngredientExtraction {
  name: string;
  brand?: string;
  composition: Partial<IngredientComponentProfile>;
  per_field_confidence: Record<string, number>;
  allergens?: string[];
  source_type: 'label' | 'ocr' | 'ai_estimated';
  is_verified: false;
}

/** AI/user asks the engine to correct — the engine computes the grams (spec §13–§14). */
export interface CorrectionRequest {
  recipe_snapshot: RecipeResultSummary;
  focus?: IndicatorKey[];
  constraints: {
    locked_line_ids: string[];
    machine_capacity_g?: number;
    mode: ProductMode;
  };
  /** Spec §14 — redact-at-source for demo sessions. */
  redact: boolean;
}

/** Engine results → AI wording. Words only; all numbers passed in. */
export interface ExplanationRequest {
  recipe_snapshot: RecipeResultSummary;
  question?: string;
  audience: 'client' | 'pro' | 'admin';
}
