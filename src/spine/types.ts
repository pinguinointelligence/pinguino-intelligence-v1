/**
 * PINGUINO Spine — locked v1.0 contract types (Phase C Slice 1).
 *
 * Pure type layer: no React, no IO, no network, no env access, no DB access,
 * no engine imports. Source of truth: docs/pinguino-spine/Recipe_Intent.md +
 * Calculation_Source_of_Truth.md. Fields outside the locked contract require a
 * new contract version — if a rule is missing here, stop and ask.
 */

/** The only product profiles active in Spine v1.0 (Product_Profile.md §2). */
export type ProductProfile =
  | 'standard_gelato'
  | 'sorbet'
  | 'vegan_gelato'
  | 'chocolate_gelato';

/** Business quality tiers — Designer/Optimizer policy, never chemistry. */
export type QualityTier = 'eco' | 'classic' | 'premium' | 'signature';

/** Supported serving temperatures in v1.0 — evaluation targets, not engines. */
export type ServingTemperatureC = -11 | -12 | -13;

export type TexturePreference = 'firm' | 'medium' | 'soft';

export type SweetnessPreference = 'low' | 'balanced' | 'high';

export type CostPriority = 'low' | 'balanced' | 'premium';

export type FlavorGroup =
  | 'fruit'
  | 'chocolate'
  | 'nut'
  | 'vanilla'
  | 'coffee'
  | 'alcohol'
  | 'neutral'
  | 'unknown';

/** Where a normalized intent value came from (explicit > saved > fallback). */
export type IntentSource = 'user_input' | 'saved_defaults' | 'preset' | 'fallback';

/**
 * Gate strictness levels (Product_Profile.md §6):
 * hard = must pass · soft = controlled exceptions · advisory = information
 * only, never an automatic fail · disabled = must not be evaluated.
 */
export type GateLevel = 'hard' | 'soft' | 'advisory' | 'disabled';

export type DesignerWarningCode =
  | 'unsupported_product_profile'
  | 'legacy_profile_normalized'
  | 'invalid_serving_temperature'
  | 'invalid_quality_tier'
  | 'invalid_texture_preference'
  | 'invalid_sweetness_preference'
  | 'invalid_cost_priority'
  | 'flavor_product_profile_conflict'
  | 'granita_unsupported_v1'
  | 'profile_forced_by_flavor'
  | 'saved_default_used'
  | 'fallback_default_used';

export interface DesignerWarning {
  code: DesignerWarningCode;
  severity: 'info' | 'warning' | 'critical';
  /** UI copy is rendered from the key — no long user-facing text in core logic. */
  messageKey: string;
  context?: Record<string, string | number | boolean>;
}

/** Locked contract version for every Spine v1.0 object. */
export const SPINE_CONTRACT_VERSION = '1.0.0' as const;
export type SpineContractVersion = typeof SPINE_CONTRACT_VERSION;

/**
 * The single normalized product-intent contract (Recipe_Intent.md §5).
 * Downstream modules consume this object, never raw UI fields. It carries
 * intent only — no grams, no POD/PAC/NPAC, no calculated values.
 */
export interface NormalizedRecipeIntent {
  productProfile: ProductProfile;
  qualityTier: QualityTier;
  servingTemperatureC: ServingTemperatureC;

  texturePreference: TexturePreference;
  sweetnessPreference: SweetnessPreference;
  costPriority: CostPriority;

  flavorText?: string;
  flavorGroup: FlavorGroup;
  flavorTags: string[];

  naturalOnly: boolean;
  allowBoosters: boolean;

  dietary: {
    vegan: boolean;
    lactoseFree: boolean;
    glutenFree: boolean;
    allergenAware: boolean;
    noAddedSugar: boolean;
    lowSugar: boolean;
    alcohol: boolean;
  };

  constraints: {
    excludedIngredientIds: string[];
    lockedIngredientIds: string[];
    heroIngredientIds: string[];
    batchSizeG: number | null;
    machineCapacityG: number | null;
  };

  source: IntentSource;
  warnings: DesignerWarning[];

  contractVersion: SpineContractVersion;
}

/**
 * Raw intent input (Recipe_Intent.md §6). May be incomplete, legacy,
 * user-facing or messy — it is NOT trusted and must be normalized via
 * `normalizeRecipeIntent()` before any downstream module sees it.
 */
export interface RawRecipeIntentInput {
  productProfile?: string;
  productType?: string;
  category?: string;

  qualityTier?: string;
  mode?: string;

  servingTemperatureC?: number;
  targetTemperatureC?: number;

  texturePreference?: string;
  sweetnessPreference?: string;
  costPriority?: string;

  flavorText?: string;
  flavor?: string;

  naturalOnly?: boolean;
  allowBoosters?: boolean;

  dietary?: Partial<NormalizedRecipeIntent['dietary']>;

  excludedIngredientIds?: string[];
  lockedIngredientIds?: string[];
  heroIngredientIds?: string[];

  batchSizeG?: number | null;
  machineCapacityG?: number | null;
}

/**
 * Saved user defaults (Recipe_Intent.md §7). Optional; used only when
 * explicit current input is missing. Saved defaults never prevent per-recipe
 * override and never suppress warnings from explicit invalid input.
 */
export interface SavedRecipePreferences {
  userId: string;

  defaultProductProfile: ProductProfile;
  defaultQualityTier: QualityTier;
  defaultServingTemperatureC: ServingTemperatureC;

  defaultTexturePreference: TexturePreference;
  defaultSweetnessPreference: SweetnessPreference;
  defaultCostPriority: CostPriority;

  naturalOnly: boolean;
  allowBoosters: boolean;

  dietary?: Partial<NormalizedRecipeIntent['dietary']>;

  excludedIngredientIds?: string[];
  allergenRestrictions?: string[];

  createdAt: string;
  updatedAt: string;
}
