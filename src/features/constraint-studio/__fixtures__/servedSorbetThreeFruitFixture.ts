/**
 * Served PRO Sorbet three-fruit capture — owner 2026-09-11.
 *
 * The Przelicz input captured on staging c65e52ef (PRO QA account, fresh Sorbet
 * S03): the canonical starter support lines plus STRAWBERRIES, CRANBERRY and
 * WATERMELON added at 0 g and crowned at the PRO 1 g seed, with the served
 * compositions, Main policy fields and resolution context. STRAWBERRIES carries
 * the published exact-product fruit policy (60 %); CRANBERRY and WATERMELON are
 * MAIN_CAPABLE_UNCALIBRATED (user-held). Professional machine: the served home
 * Ninja (670 g) cannot hold the 1000 g batch in any variant.
 */
import type { EngineIngredient, RecipeInput, RecipeItem } from '@/engine';
import { AUTO_CROWN_SEED } from '@/features/formulation/crownBootstrapProvenance';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence/contracts';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';

const flags = {
  vegan_eligibility: 'VEGAN_VERIFIED',
  vegan_eligibility_reasons: ['verified_mapper_vegan_true'],
};

const composition = (values: Record<string, number>) => ({
  water_percent: 0,
  solids_percent: 0,
  fat_percent: 0,
  protein_percent: 0,
  carbohydrate_percent: 0,
  sugar_percent: 0,
  sucrose_percent: 0,
  glucose_percent: 0,
  dextrose_percent: 0,
  fructose_percent: 0,
  lactose_percent: 0,
  polyol_percent: 0,
  fiber_percent: 0,
  salt_percent: 0,
  alcohol_percent: 0,
  kcal_per_100g: 0,
  ...values,
});

const ingredient = (
  id: string,
  name: string,
  category: string,
  subcategory: string,
  values: Record<string, number>,
  pod: number,
  pac: number,
  cost: number | null,
  extra: Record<string, unknown> = {},
): EngineIngredient =>
  ({
    id,
    canonical_ingredient_id: id,
    private_product_id: null,
    identity_provenance: 'mapper',
    source_subcategory: subcategory,
    carbonation_status: 'UNKNOWN',
    name,
    category,
    composition: composition(values),
    pod_value: pod,
    pac_value: pac,
    de_value: null,
    cost_per_kg: cost,
    cost_currency: 'EUR',
    confidence_score: 95,
    source_type: 'verified_db',
    is_verified: true,
    flags,
    ...extra,
  }) as unknown as EngineIngredient;

const WATER = ingredient(
  'PI-ING-001409',
  'WATER · Liquid',
  'other',
  'water',
  { water_percent: 100 },
  0,
  0,
  null,
);
const SUCROSE = ingredient(
  'PI-ING-000514',
  'SUCROSE SUGAR · Sweetener · Dry',
  'sugar',
  'sucrose',
  {
    solids_percent: 100,
    carbohydrate_percent: 100,
    sugar_percent: 100,
    sucrose_percent: 100,
    kcal_per_100g: 400,
    saturated_fat_percent: 0,
  },
  100,
  100,
  1.2,
  { confidence_score: 98 },
);
const DEXTROSE = ingredient(
  'PI-ING-000494',
  'DEXTROSE MONOHYDRATE · Sweetener · Dry',
  'sugar',
  'dextrose',
  {
    water_percent: 9.1,
    solids_percent: 90.9,
    carbohydrate_percent: 90.9,
    sugar_percent: 90.9,
    dextrose_percent: 90.9,
    kcal_per_100g: 364,
    saturated_fat_percent: 0,
  },
  72.7,
  172.7,
  2.8,
  { confidence_score: 98 },
);
const INULIN = ingredient(
  'PI-ING-000456',
  'INULIN · Specialty',
  'other',
  'specialty_component',
  {
    water_percent: 3,
    solids_percent: 97,
    carbohydrate_percent: 8,
    sugar_percent: 8,
    sucrose_percent: 8,
    fiber_percent: 89,
    kcal_per_100g: 210,
    saturated_fat_percent: 0,
  },
  8,
  8,
  8,
  { confidence_score: 98 },
);
const TARA = ingredient(
  'PI-ING-000492',
  'TARA GUM · Stabilizer',
  'stabilizer',
  'tara_gum',
  {
    water_percent: 9.5,
    solids_percent: 90.5,
    fat_percent: 0.5,
    protein_percent: 2,
    carbohydrate_percent: 1.5,
    fiber_percent: 86.5,
    kcal_per_100g: 180,
    saturated_fat_percent: 0,
  },
  0,
  0,
  20,
  { confidence_score: 98, flags: { ...flags, is_stabilizer: true } },
);
const STRAWBERRIES = ingredient(
  'PI-ING-001553',
  'STRAWBERRIES · Fresh Fruit',
  'fruit',
  'fresh_fruit_profile',
  {
    water_percent: 89,
    solids_percent: 11,
    fat_percent: 0.3,
    protein_percent: 0.7,
    carbohydrate_percent: 8,
    sugar_percent: 5.8,
    sucrose_percent: 1,
    glucose_percent: 2.4,
    fructose_percent: 2.4,
    fiber_percent: 2,
    kcal_per_100g: 32,
  },
  6.928,
  10.12,
  null,
);
const CRANBERRY = ingredient(
  'PI-ING-001556',
  'CRANBERRY · Fresh Fruit',
  'fruit',
  'fresh_fruit_profile',
  {
    water_percent: 87.295,
    solids_percent: 12.705,
    fat_percent: 0.1,
    protein_percent: 0.4,
    carbohydrate_percent: 7.6,
    fiber_percent: 4.6,
    salt_percent: 0.005,
    kcal_per_100g: 42,
  },
  0,
  0.029,
  null,
);
const WATERMELON = ingredient(
  'PI-ING-000405',
  'WATERMELON · Fresh Fruit',
  'fruit',
  'fresh_fruit_profile',
  {
    water_percent: 90.4,
    solids_percent: 9.6,
    fat_percent: 0.2,
    protein_percent: 0.6,
    carbohydrate_percent: 8.4,
    sugar_percent: 7.6,
    sucrose_percent: 2.4,
    glucose_percent: 1.8,
    fructose_percent: 3.4,
    fiber_percent: 0.4,
    kcal_per_100g: 30,
    saturated_fat_percent: 0,
  },
  9.566,
  12.28,
  3.5,
  { confidence_score: 92, source_type: 'ai_estimated', is_verified: false },
);

/** The served line ids. */
export const SERVED_FRUIT = {
  strawberry: 'line-mtwp9ldm-0',
  cranberry: 'line-mtwpeswp-1',
  watermelon: 'line-mtwpfhm2-2',
} as const;
export const SERVED_FRUIT_IDS: readonly string[] = Object.values(SERVED_FRUIT);

const line = (
  id: string,
  engineIngredient: EngineIngredient,
  grams: number,
  main = false,
  seeded = false,
): RecipeItem => ({
  id,
  ingredient: engineIngredient,
  planned_grams: grams,
  actual_grams: null,
  lock_type: main ? 'main' : 'unlocked',
  ...(main ? { main_ratio_weight: 1 } : {}),
  ...(seeded ? { amount_provenance: AUTO_CROWN_SEED } : {}),
});

export interface ServedSorbetOptions {
  /** Crowned fruit lines (default: all three, as served). */
  mains?: readonly string[];
  /** Crowned lines still carrying the untouched PRO Crown seed provenance. */
  seeded?: readonly string[];
  fruitGrams?: number;
  directionActive?: boolean;
}

/** The served Przelicz input; `seeded: []` is the same grams typed by the user. */
export function servedSorbetRecipe({
  mains = SERVED_FRUIT_IDS,
  seeded = [],
  fruitGrams = 1,
  directionActive = true,
}: ServedSorbetOptions = {}): RecipeInput {
  const fruitLine = (id: string, engineIngredient: EngineIngredient) =>
    line(id, engineIngredient, fruitGrams, mains.includes(id), seeded.includes(id));
  const items: RecipeItem[] = [
    line('new-recipe-1-water', WATER, 144.95094339622642),
    line('new-recipe-2-sucrose', SUCROSE, 77.7056603773585),
    line('new-recipe-3-dextrose', DEXTROSE, 124.03018867924531),
    line('new-recipe-4-inulin', INULIN, 49.31320754716982),
    line('new-recipe-5-tara_gum', TARA, 4),
    fruitLine(SERVED_FRUIT.strawberry, STRAWBERRIES),
    fruitLine(SERVED_FRUIT.cranberry, CRANBERRY),
    fruitLine(SERVED_FRUIT.watermelon, WATERMELON),
  ];
  const state = {
    mode: 'classic',
    formulation_strategy: 'optimal',
    category: 'sorbet',
    visibleProductType: 'sorbet',
    target_temperature_c: -13,
    target_batch_grams: 1000,
    flavor_intensity: 'balanced',
    cost_priority: 'balanced',
    direction_targets: { flavor: 0, softness: 0, sweetness: 0, creaminess: 0 },
    direction_targets_active: directionActive,
    excludedIngredientIds: [],
    unavailableMainIngredientIds: [],
    items,
    machine_capacity_grams: null,
    machine_capacity_source: null,
    machineKind: 'professional',
    machineId: null,
    servingModeId: 'temp_minus_13',
    machineTechnology: null,
    batch_source: 'PROFESSIONAL_DEFAULT',
  };
  return buildRecipeInput(state as unknown as Parameters<typeof buildRecipeInput>[0]);
}

const context = (main: boolean) => ({
  mode: 'optimal',
  module: 'OPTIMAL',
  accountId: 'staging-pro-qa',
  processScope: 'BASE_FORMULATION',
  temperatureC: -13,
  requestedRole: main ? 'MAIN' : 'STANDARD',
  productProfile: 'sorbet',
});

const structural = {
  mainClassification: 'NOT_MAIN',
  behaviorRole: 'STRUCTURAL_ONLY',
  mainCapability: 'MAIN_TECHNICAL_BLOCKED',
  mainAuthority: 'USER_HELD',
  mainCalibrationLevel: 'NONE',
};
const calibratedFruit = {
  mainClassification: 'MAIN_PROFILE_SPECIFIC',
  behaviorRole: 'MAIN_PROFILE_SPECIFIC',
  mainCapability: 'MAIN_CAPABLE',
  mainAuthority: 'CALIBRATED',
  mainCalibrationLevel: 'EXACT_PRODUCT',
  mainPolicyId: 'main-sorbet-exact-fruit-60-v1',
  mainPolicyVersion: '1',
  ecoFloorPercent: 60,
  optimalCeilingPercent: 60,
  hardLimitPercent: 60,
  multiMainHardLimitPercent: 60,
  mainEquivalentFactor: 1,
  mainBasis: 'FRUIT_EQUIVALENT',
  familyId: 'fruit',
  formId: 'fresh',
  blockReasons: [],
};
const uncalibratedFruit = {
  mainClassification: 'MAIN_PROFILE_SPECIFIC',
  behaviorRole: 'MAIN_PROFILE_SPECIFIC',
  mainCapability: 'MAIN_CAPABLE_UNCALIBRATED',
  mainAuthority: 'USER_HELD',
  mainCalibrationLevel: 'NONE',
  mainPolicyId: null,
  mainPolicyVersion: null,
  ecoFloorPercent: null,
  optimalCeilingPercent: null,
  hardLimitPercent: null,
  multiMainHardLimitPercent: null,
  mainEquivalentFactor: null,
  mainBasis: null,
  familyId: 'fruit',
  formId: 'fresh',
  blockReasons: ['main_user_held_no_calibration'],
};

/** The served, server-resolved snapshots for every line of `input`. */
export function servedSorbetSnapshots(input: RecipeInput): Record<string, ProductBehaviorSnapshot> {
  const base = productBehaviorTestSnapshots(input);
  const out: Record<string, ProductBehaviorSnapshot> = {};
  for (const item of input.items) {
    const snapshot = base[item.id]!;
    const isFruit = SERVED_FRUIT_IDS.includes(item.id);
    const facts = { ...snapshot.sharedFacts! } as Record<string, unknown>;
    let roleFields: Record<string, unknown> = structural;
    if (item.id === 'new-recipe-4-inulin') {
      facts.recommendedDose = {
        policyId: 'gellatti-generic-inulin',
        maxPercent: 8,
        minPercent: 2,
        provenance: 'owner-approved Gellatti formulation policy',
        policyVersion: 1,
        sourceVersion: 'owner-gellatti-inulin-v1',
        preferredPercent: 4,
        presenceSemantics: 'optional_zero_or_range',
      };
      roleFields = {
        ...structural,
        mainClassification: 'STANDARD_ONLY',
        behaviorRole: 'STANDARD_ONLY',
      };
    }
    if (item.id === 'new-recipe-5-tara_gum') {
      facts.recommendedDose = {
        maxPercent: 1,
        minPercent: 0.2,
        sourceVersion: 'v1.0:PI-ING-000492',
      };
    }
    const subfamilyId = item.id === SERVED_FRUIT.watermelon ? null : 'berry';
    if (item.id === SERVED_FRUIT.strawberry) {
      roleFields = { ...calibratedFruit, subfamilyId };
      facts.profileEligibility = ['milk_gelato', 'protein_gelato', 'sorbet', 'vegan_gelato'];
    } else if (isFruit) {
      roleFields = { ...uncalibratedFruit, subfamilyId };
      facts.profileEligibility = ['milk_gelato'];
    }
    out[item.id] = {
      ...snapshot,
      ...roleFields,
      moduleEligibility: {
        ...snapshot.moduleEligibility,
        MAIN: isFruit ? 'eligible' : 'blocked',
        TOPPING: 'blocked',
      },
      sharedFacts: facts,
      resolutionState: 'RESOLVED',
      resolutionContext: context(item.lock_type === 'main'),
    } as unknown as ProductBehaviorSnapshot;
  }
  return out;
}

/** The option set the served Przelicz passed to the canonical pipeline. */
export function servedSorbetPreviewOptions(input: RecipeInput) {
  return {
    homeFormulationModuleId: null,
    excludedIngredientIds: [],
    unavailableMainIngredientIds: [],
    effectivePriceOverrides: {},
    requirePracticalPreview: true,
    productBehaviorSnapshots: servedSorbetSnapshots(input),
    technicalOnlyMainLineIds: [],
    directionFallbackPass: true,
    skipRescueAssessment: true,
  };
}
