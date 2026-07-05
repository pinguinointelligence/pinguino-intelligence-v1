/**
 * PINGUINO Spine — Product Profile Registry (Product_Profile.md, locked v1.0).
 *
 * The single source of truth for WHICH product rules apply. The Base Engine
 * calculates all values for all recipes; this registry decides which values
 * are used as gates, which Designer/Optimizer/Temperature Regulator owns each
 * profile, and which correction families are allowed. Product-profile logic
 * must never be scattered across UI, prompts, optimizer or random conditionals.
 *
 * Calculation does not equal evaluation.
 */
import type { GateLevel, ProductProfile, ServingTemperatureC } from './types';

/**
 * Gate identifiers used by the v1.0 profiles. Active-side gates and the
 * dairy-logic gates that sorbet/vegan explicitly disable share one vocabulary
 * (names follow the regulator docs' config keys).
 */
export type SpineGateId =
  | 'pod'
  | 'npac'
  | 'ice_fraction'
  | 'water'
  | 'total_solids'
  | 'fat'
  | 'lactose'
  | 'lactose_sanding'
  | 'aerating_protein'
  | 'protein_share_in_solids'
  | 'stabilizer'
  | 'alcohol'
  | 'fruit_water_sugar_balance'
  | 'plant_base_structure'
  | 'chocolate_cocoa_solids_behavior'
  | 'cost'
  | 'dairy_fat_logic'
  | 'aerating_dairy_protein'
  | 'dairy_protein_share_in_solids'
  | 'msnf_required_gate';

/** Correction-candidate families (Product_Profile.md §16 vocabulary). */
export type CorrectionFamily =
  | 'milk'
  | 'cream'
  | 'skimmed_milk_powder'
  | 'sucrose'
  | 'dextrose'
  | 'inulin_fiber'
  | 'stabilizer'
  | 'water'
  | 'fruit'
  | 'hero_flavor_ingredient'
  | 'oat_drink'
  | 'soy_drink'
  | 'almond_drink'
  | 'rice_drink'
  | 'coconut_milk_cream'
  | 'plant_fat'
  | 'plant_protein'
  | 'dark_chocolate'
  | 'milk_chocolate'
  | 'cocoa_powder'
  | 'cocoa_mass'
  | 'cocoa_butter'
  | 'chocolate_paste';

/** Dairy families that sorbet and vegan must never use as corrections. */
export const DAIRY_CORRECTION_FAMILIES = [
  'milk',
  'cream',
  'skimmed_milk_powder',
] as const satisfies readonly CorrectionFamily[];

/** Chocolate/cocoa families available only to the chocolate profile. */
export const CHOCOLATE_CORRECTION_FAMILIES = [
  'dark_chocolate',
  'milk_chocolate',
  'cocoa_powder',
  'cocoa_mass',
  'cocoa_butter',
  'chocolate_paste',
] as const satisfies readonly CorrectionFamily[];

export interface ProductProfileDefinition {
  id: ProductProfile;
  label: string;

  designer: string;
  optimizer: string;
  temperatureRegulator: string;

  activeGates: Partial<Record<SpineGateId, GateLevel>>;
  disabledGates: SpineGateId[];

  allowedCorrectionFamilies: CorrectionFamily[];
  forbiddenCorrectionFamilies: CorrectionFamily[];

  supportsServingTemperaturesC: readonly ServingTemperatureC[];
  defaultServingTemperatureC: ServingTemperatureC;

  notes: string[];
}

/** Every active profile evaluates at exactly these serving temperatures. */
const SUPPORTED_SERVING_TEMPERATURES: readonly ServingTemperatureC[] = [-11, -12, -13];

/**
 * System default serving temperature is −12 °C (Recipe_Intent.md §8) — the
 * balanced commercial target. Intent default, never a chemistry constant.
 */
const DEFAULT_SERVING_TEMPERATURE: ServingTemperatureC = -12;

const standardGelatoProfile: ProductProfileDefinition = {
  id: 'standard_gelato',
  label: 'Standard Gelato',
  designer: 'gelato_designer',
  optimizer: 'gelato_optimizer',
  temperatureRegulator: 'standard_gelato_temperature_regulator',
  activeGates: {
    pod: 'hard',
    npac: 'hard',
    ice_fraction: 'hard',
    water: 'hard',
    total_solids: 'hard',
    fat: 'hard',
    lactose: 'hard',
    lactose_sanding: 'hard',
    aerating_protein: 'hard',
    protein_share_in_solids: 'hard',
    stabilizer: 'hard',
    alcohol: 'hard',
  },
  disabledGates: [],
  allowedCorrectionFamilies: [
    'milk',
    'cream',
    'skimmed_milk_powder',
    'sucrose',
    'dextrose',
    'inulin_fiber',
    'stabilizer',
    'water',
    'hero_flavor_ingredient',
  ],
  forbiddenCorrectionFamilies: [],
  supportsServingTemperaturesC: SUPPORTED_SERVING_TEMPERATURES,
  defaultServingTemperatureC: DEFAULT_SERVING_TEMPERATURE,
  notes: [
    'the alcohol gate applies as hard only when alcohol > 0',
    'water correction only when the profile/recipe explicitly allows it',
    'hero flavor ingredient only where not locked and the Designer allows it',
    'chocolate-major intent routes to chocolate_gelato — never evaluated here',
    'never solve temperature with dextrose alone; never accept 0 g stabilizer as final good output',
  ],
};

const sorbetProfile: ProductProfileDefinition = {
  id: 'sorbet',
  label: 'Sorbet',
  designer: 'sorbet_designer',
  optimizer: 'sorbet_optimizer',
  temperatureRegulator: 'sorbet_temperature_regulator',
  activeGates: {
    pod: 'hard',
    npac: 'hard',
    ice_fraction: 'hard',
    water: 'hard',
    total_solids: 'hard',
    stabilizer: 'hard',
    fruit_water_sugar_balance: 'hard',
    cost: 'soft',
  },
  disabledGates: [
    'dairy_fat_logic',
    'lactose',
    'lactose_sanding',
    'aerating_dairy_protein',
    'dairy_protein_share_in_solids',
    'msnf_required_gate',
  ],
  allowedCorrectionFamilies: ['fruit', 'water', 'sucrose', 'dextrose', 'inulin_fiber', 'stabilizer'],
  forbiddenCorrectionFamilies: ['milk', 'cream', 'skimmed_milk_powder'],
  supportsServingTemperaturesC: SUPPORTED_SERVING_TEMPERATURES,
  defaultServingTemperatureC: DEFAULT_SERVING_TEMPERATURE,
  notes: [
    'sorbet must never fail because dairy metrics are absent',
    'fruit is never blindly maximized — fruit brings water, sugar, acidity and solids',
    'fruit types behave differently (strawberry vs mango) — Designer/Optimizer adapt per fruit',
    'an acid family may be added later if supported',
  ],
};

const veganGelatoProfile: ProductProfileDefinition = {
  id: 'vegan_gelato',
  label: 'Vegan Gelato',
  designer: 'vegan_designer',
  optimizer: 'vegan_optimizer',
  temperatureRegulator: 'vegan_gelato_temperature_regulator',
  activeGates: {
    pod: 'hard',
    npac: 'hard',
    ice_fraction: 'hard',
    water: 'hard',
    total_solids: 'hard',
    fat: 'hard',
    stabilizer: 'hard',
    plant_base_structure: 'hard',
    cost: 'soft',
  },
  disabledGates: [
    'lactose',
    'lactose_sanding',
    'aerating_dairy_protein',
    'dairy_protein_share_in_solids',
    'msnf_required_gate',
  ],
  allowedCorrectionFamilies: [
    'water',
    'oat_drink',
    'soy_drink',
    'almond_drink',
    'rice_drink',
    'coconut_milk_cream',
    'plant_fat',
    'plant_protein',
    'sucrose',
    'dextrose',
    'inulin_fiber',
    'stabilizer',
    'hero_flavor_ingredient',
  ],
  forbiddenCorrectionFamilies: ['milk', 'cream', 'skimmed_milk_powder'],
  supportsServingTemperaturesC: SUPPORTED_SERVING_TEMPERATURES,
  defaultServingTemperatureC: DEFAULT_SERVING_TEMPERATURE,
  notes: [
    'never fails because lactose is 0 or dairy protein is 0',
    'vegan chocolate stays vegan_gelato with chocolate flavor strategy — never routed to dairy chocolate_gelato',
    'hero ingredients (fruit/chocolate/nut) only when plant-compatible',
    'soy drink only if available',
  ],
};

const chocolateGelatoProfile: ProductProfileDefinition = {
  id: 'chocolate_gelato',
  label: 'Chocolate Gelato',
  designer: 'chocolate_designer',
  optimizer: 'chocolate_optimizer',
  temperatureRegulator: 'chocolate_gelato_temperature_regulator',
  activeGates: {
    pod: 'hard',
    npac: 'hard',
    ice_fraction: 'hard',
    water: 'hard',
    total_solids: 'hard',
    fat: 'hard',
    lactose: 'hard',
    lactose_sanding: 'hard',
    aerating_protein: 'hard',
    protein_share_in_solids: 'advisory',
    chocolate_cocoa_solids_behavior: 'hard',
    stabilizer: 'hard',
  },
  disabledGates: [],
  allowedCorrectionFamilies: [
    'milk',
    'cream',
    'skimmed_milk_powder',
    'sucrose',
    'dextrose',
    'inulin_fiber',
    'dark_chocolate',
    'milk_chocolate',
    'cocoa_powder',
    'cocoa_mass',
    'cocoa_butter',
    'chocolate_paste',
    'stabilizer',
  ],
  forbiddenCorrectionFamilies: [],
  supportsServingTemperaturesC: SUPPORTED_SERVING_TEMPERATURES,
  defaultServingTemperatureC: DEFAULT_SERVING_TEMPERATURE,
  notes: [
    'protein share in solids is soft/advisory — cocoa solids dilute dairy protein share (advisory band 8–13, visible benchmark band 9–13, hard minimum 7 per the chocolate regulator); never a standard-gelato hard failure',
    'wider POD tolerance (12–20) than standard gelato — cocoa bitterness reduces perceived sweetness',
    'never overuse skimmed milk powder to force protein share if lactose sanding breaks',
    'never reduce the chocolate hero ingredient below product/tier intent',
    'chocolate is a product profile, not just a flavor label',
  ],
};

/** Exactly the four active v1.0 profiles — nothing else is supported. */
export const ACTIVE_PRODUCT_PROFILES = [
  'standard_gelato',
  'sorbet',
  'vegan_gelato',
  'chocolate_gelato',
] as const satisfies readonly ProductProfile[];

export const PRODUCT_PROFILE_REGISTRY: Record<ProductProfile, ProductProfileDefinition> = {
  standard_gelato: standardGelatoProfile,
  sorbet: sorbetProfile,
  vegan_gelato: veganGelatoProfile,
  chocolate_gelato: chocolateGelatoProfile,
};

export const getProductProfileDefinition = (profile: ProductProfile): ProductProfileDefinition =>
  PRODUCT_PROFILE_REGISTRY[profile];
