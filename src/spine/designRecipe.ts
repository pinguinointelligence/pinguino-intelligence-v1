/**
 * PINGUINO Spine — pure Designer output layer (Designer.md, locked v1.0;
 * Phase C Slice 3).
 *
 * Converts a NormalizedRecipeIntent into a deterministic RecipeDesignPlan:
 * product strategy, flavor strategy, quality strategy, hero policy, allowed/
 * forbidden ingredient families and optimizer constraints. The Designer
 * decides what the recipe SHOULD BE — it never calculates what the recipe IS:
 * no POD/PAC/NPAC, no ice fraction, no cost, no nutrition, no exact grams.
 * Gate truth comes from the Product Profile Registry — never duplicated here.
 */
import { PRODUCT_PROFILE_REGISTRY, type CorrectionFamily } from './productProfiles';
import {
  SPINE_CONTRACT_VERSION,
  type CostPriority,
  type DesignerProfileId,
  type DesignerWarning,
  type FlavorGroup,
  type NormalizedRecipeIntent,
  type ProductProfile,
  type QualityTier,
  type SpineContractVersion,
  type SweetnessPreference,
  type TexturePreference,
} from './types';

/** Texture intent labels — the Temperature Regulator maps them to bands later. */
export type TextureTargetIntent = 'lower_safe_side' | 'clean_center' | 'upper_safe_side';

/** Sweetness intent labels — product-safe POD zones, never numeric POD. */
export type SweetnessTargetIntent =
  | 'lower_product_safe_side'
  | 'product_clean_center'
  | 'upper_product_safe_side';

/** Hero-ingredient protection policy (Designer.md §12). */
export interface HeroIngredientPolicy {
  heroFlavor: string | null;
  protectHeroIngredient: boolean;
  reductionPolicy: 'forbidden' | 'allowed_with_warning' | 'allowed';
  minimumRelativeLevel: 'low' | 'standard' | 'raised' | 'maximum';
  notes: string[];
}

export interface FlavorStrategy {
  flavorGroup: FlavorGroup;
  flavorTags: string[];
  strategyNotes: string[];
}

export interface QualityStrategy {
  qualityTier: QualityTier;
  costPosture: 'low_cost' | 'balanced' | 'premium_allowed';
  heroIntensity: 'low' | 'standard' | 'raised' | 'maximum';
  boostersPermitted: boolean;
  strategyNotes: string[];
}

export interface IngredientStrategy {
  baseFamilies: CorrectionFamily[];
  heroFamilies: CorrectionFamily[];
  boosterPolicy: 'forbidden' | 'available_if_verified';
  stabilizerRequired: true;
  strategyNotes: string[];
}

/** Constraints the Optimizer consumes verbatim (Designer.md §17). */
export interface DesignerOptimizerConstraints {
  productProfile: ProductProfile;
  qualityTier: QualityTier;

  allowedIngredientFamilies: CorrectionFamily[];
  forbiddenIngredientFamilies: CorrectionFamily[];

  heroIngredientPolicy: HeroIngredientPolicy;

  sweetnessPreference: SweetnessPreference;
  texturePreference: TexturePreference;
  costPriority: CostPriority;

  naturalOnly: boolean;
  allowBoosters: boolean;

  stabilizerRequired: boolean;

  disabledGates: string[];
  /** Non-hard informative gates (levels soft + advisory) — guidance, not hard fails. */
  advisoryGates: string[];

  notes: string[];
}

/** Designer output (Designer.md §6.2) — strategy and constraints, never grams. */
export interface RecipeDesignPlan {
  productProfile: ProductProfile;
  designerProfile: DesignerProfileId;

  flavorStrategy: FlavorStrategy;
  qualityStrategy: QualityStrategy;
  ingredientStrategy: IngredientStrategy;

  textureTarget: TextureTargetIntent;
  sweetnessTarget: SweetnessTargetIntent;

  heroIngredientPolicy: HeroIngredientPolicy;
  allowedIngredientFamilies: CorrectionFamily[];
  forbiddenIngredientFamilies: CorrectionFamily[];

  optimizerConstraints: DesignerOptimizerConstraints;
  warnings: DesignerWarning[];

  contractVersion: SpineContractVersion;
}

/* ------------------------------------------------------------------------ *
 * Locked deterministic tables                                               *
 * ------------------------------------------------------------------------ */

const TEXTURE_TARGETS: Readonly<Record<TexturePreference, TextureTargetIntent>> = {
  firm: 'lower_safe_side',
  medium: 'clean_center',
  soft: 'upper_safe_side',
};

const SWEETNESS_TARGETS: Readonly<Record<SweetnessPreference, SweetnessTargetIntent>> = {
  low: 'lower_product_safe_side',
  balanced: 'product_clean_center',
  high: 'upper_product_safe_side',
};

interface TierPolicy {
  costPosture: QualityStrategy['costPosture'];
  heroIntensity: QualityStrategy['heroIntensity'];
  protectHero: boolean;
  reductionPolicy: HeroIngredientPolicy['reductionPolicy'];
  /** Eco never uses boosters by default, regardless of permission upstream. */
  boostersByDefault: boolean;
  strategyNotes: string[];
}

const TIER_POLICIES: Readonly<Record<QualityTier, TierPolicy>> = {
  eco: {
    costPosture: 'low_cost',
    heroIntensity: 'low',
    protectHero: false,
    reductionPolicy: 'allowed',
    boostersByDefault: false,
    strategyNotes: [
      'lowest cost while passing all technical gates — eco never means a bad product',
      'lower hero ingredient range; simple recipe; no boosters by default',
    ],
  },
  classic: {
    costPosture: 'balanced',
    heroIntensity: 'standard',
    protectHero: false,
    reductionPolicy: 'allowed_with_warning',
    boostersByDefault: true,
    strategyNotes: ['balanced commercial default — reliable structure, normal flavor intensity'],
  },
  premium: {
    costPosture: 'premium_allowed',
    heroIntensity: 'raised',
    protectHero: true,
    reductionPolicy: 'forbidden',
    boostersByDefault: true,
    strategyNotes: [
      'higher real ingredient content, stronger natural identity, better mouthfeel',
      'hero ingredient protected; boosters only if allowed and justified',
    ],
  },
  signature: {
    costPosture: 'premium_allowed',
    heroIntensity: 'maximum',
    protectHero: true,
    reductionPolicy: 'forbidden',
    boostersByDefault: true,
    strategyNotes: [
      'maximum perceived flavor and product experience — NOT blind maximum hero grams',
      'may combine real ingredient with puree/concentrate/paste/booster when allowed',
      'must still pass every technical gate',
    ],
  },
};

const FLAVOR_STRATEGY_NOTES: Readonly<Record<FlavorGroup, string[]>> = {
  fruit: [
    'fruit brings water, sugars, solids and acidity — never blindly maximized',
    'fresh vs frozen vs puree vs concentrate behave differently per fruit',
  ],
  chocolate: [
    'chocolate is a product profile, not a flavor label — cocoa solids change fat, solids, perceived sweetness and protein share',
    'lactose sanding risk when correcting with dairy powder',
  ],
  nut: ['nut paste brings fat and solids; intensity and cost rise together'],
  vanilla: ['vanilla/neutral identity relies on a clean base'],
  coffee: ['espresso adds water; dry coffee/paste adds solids; bitterness needs sweetness balance'],
  alcohol: [
    'alcohol depresses freezing — the safe alcohol band constrains the recipe and may force tradeoffs',
    'never fixed blindly with dextrose',
  ],
  neutral: ['neutral base — structure and mouthfeel carry the product'],
  unknown: ['unknown flavor — no ingredient strategy is invented'],
};

/** Hero family per profile — where the identity ingredient lives. */
const HERO_FAMILIES: Readonly<Record<ProductProfile, CorrectionFamily[]>> = {
  standard_gelato: ['hero_flavor_ingredient'],
  sorbet: ['fruit'],
  vegan_gelato: ['hero_flavor_ingredient'],
  chocolate_gelato: [
    'dark_chocolate',
    'milk_chocolate',
    'cocoa_powder',
    'cocoa_mass',
    'cocoa_butter',
    'chocolate_paste',
  ],
};

/* ------------------------------------------------------------------------ *
 * Designer                                                                  *
 * ------------------------------------------------------------------------ */

const heroFlavorFrom = (intent: NormalizedRecipeIntent): string | null => {
  if (intent.flavorGroup === 'unknown') return null;
  return intent.flavorTags[0] ?? intent.flavorGroup;
};

/**
 * Pure, deterministic Designer (Designer.md §1): decides what the recipe
 * should be — strategy, hero policy, families and optimizer constraints.
 * Never calculates chemistry, never returns grams, never asks questions.
 */
export function designRecipe(intent: NormalizedRecipeIntent): RecipeDesignPlan {
  const profile = PRODUCT_PROFILE_REGISTRY[intent.productProfile];
  const tier = TIER_POLICIES[intent.qualityTier];

  const heroFlavor = heroFlavorFrom(intent);
  const heroIngredientPolicy: HeroIngredientPolicy = {
    heroFlavor,
    protectHeroIngredient: heroFlavor !== null && tier.protectHero,
    reductionPolicy: heroFlavor === null ? 'allowed' : tier.reductionPolicy,
    minimumRelativeLevel: heroFlavor === null ? 'standard' : tier.heroIntensity,
    notes:
      heroFlavor === null
        ? ['no hero ingredient detected — nothing to protect']
        : intent.flavorGroup === 'alcohol'
          ? ['alcohol is a technical constraint — the safe alcohol band overrides hero protection']
          : [`${heroFlavor} carries the product identity`],
  };

  const boostersPermitted = intent.allowBoosters && tier.boostersByDefault;

  const allowedIngredientFamilies = [...profile.allowedCorrectionFamilies];
  const forbiddenIngredientFamilies = [...profile.forbiddenCorrectionFamilies];

  const advisoryGates = Object.entries(profile.activeGates)
    .filter(([, level]) => level === 'advisory' || level === 'soft')
    .map(([gate]) => gate);

  const optimizerConstraints: DesignerOptimizerConstraints = {
    productProfile: intent.productProfile,
    qualityTier: intent.qualityTier,
    allowedIngredientFamilies: [...allowedIngredientFamilies],
    forbiddenIngredientFamilies: [...forbiddenIngredientFamilies],
    heroIngredientPolicy,
    sweetnessPreference: intent.sweetnessPreference,
    texturePreference: intent.texturePreference,
    costPriority: intent.costPriority,
    naturalOnly: intent.naturalOnly,
    allowBoosters: boostersPermitted,
    stabilizerRequired: true, // locked for every active v1.0 profile
    disabledGates: [...profile.disabledGates],
    advisoryGates,
    notes: [...profile.notes],
  };

  return {
    productProfile: intent.productProfile,
    designerProfile: profile.designer,
    flavorStrategy: {
      flavorGroup: intent.flavorGroup,
      flavorTags: [...intent.flavorTags],
      strategyNotes: [...FLAVOR_STRATEGY_NOTES[intent.flavorGroup]],
    },
    qualityStrategy: {
      qualityTier: intent.qualityTier,
      costPosture: tier.costPosture,
      heroIntensity: tier.heroIntensity,
      boostersPermitted,
      strategyNotes: [...tier.strategyNotes],
    },
    ingredientStrategy: {
      baseFamilies: [...allowedIngredientFamilies],
      heroFamilies: [...HERO_FAMILIES[intent.productProfile]],
      boosterPolicy: boostersPermitted ? 'available_if_verified' : 'forbidden',
      stabilizerRequired: true,
      strategyNotes: ['stabilizer is technologically required — 0 g is never a final good strategy'],
    },
    textureTarget: TEXTURE_TARGETS[intent.texturePreference],
    sweetnessTarget: SWEETNESS_TARGETS[intent.sweetnessPreference],
    heroIngredientPolicy,
    allowedIngredientFamilies,
    forbiddenIngredientFamilies,
    optimizerConstraints,
    warnings: intent.warnings.map((w) => ({ ...w })),
    contractVersion: SPINE_CONTRACT_VERSION,
  };
}
