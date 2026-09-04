/**
 * OWNER REGRESSION SPECIMEN — durable run `2fc85403-2394-4582-a211-4736bfc4ef8e`,
 * read from served staging `e2e1a61a` on 2026-09-04 and never mutated.
 *
 * Full forensic record: `reports/production-rescue/OWNER_REPRO_2fc85403.md`.
 */
export const OWNER_RUN_ID = '2fc85403-2394-4582-a211-4736bfc4ef8e';
export const OWNER_RECIPE_ID = '1589cbfa-6cf5-4015-a906-1f7c64b37a19';
export const OWNER_RECIPE_VERSION_ID = '5432108b-a43c-43e9-89d5-7276f6f11ee2';
export const OWNER_RECIPE_VERSION_NUMBER = 2;

export const OWNER_LINE_IDS = {
  milk: 'new-recipe-0-milk_3_5',
  cream: 'new-recipe-1-cream_30',
  smp: 'new-recipe-2-smp',
  sucrose: 'new-recipe-3-sucrose',
  dextrose: 'new-recipe-4-dextrose',
  tara: 'new-recipe-5-tara_gum',
  banana: 'line-mtn5pdnv-1',
} as const;

export const OWNER_MAPPER_IDS = {
  milk: 'PI-ING-000236',
  cream: 'PI-ING-000180',
  smp: 'PI-ING-000270',
  sucrose: 'PI-ING-000514',
  dextrose: 'PI-ING-000494',
  tara: 'PI-ING-000492',
  banana: 'PI-ING-000345',
} as const;

export const OWNER_PLANNED_GRAMS = [428, 113, 40, 60, 55, 4, 300] as const;
export const OWNER_PLANNED_TOTAL_G = 1000;

export const OWNER_ACTUAL_GRAMS = [428, 113, 40, 60, 55, 4, 345] as const;
export const OWNER_ACTUAL_TOTAL_G = 1045;
export const OWNER_BANANA_PHYSICAL_G = 345;

export const OWNER_RESCUE_GRAMS = [492.2, 129.9, 46, 69, 63.2, 4.6, 345] as const;
export const OWNER_RESCUE_TOTAL_G = 1149.9;
export const OWNER_RESCUE_OPTION_ID = 'restore_original_recipe';
export const OWNER_RESCUE_REVISION = 1;
export const OWNER_SOURCE_ACTUAL_REVISION = 8;

export const OWNER_BANANA_MAIN_POLICY = {
  mainCapability: 'MAIN_CAPABLE',
  behaviorRole: 'MAIN_PROFILE_SPECIFIC',
  mainClassification: 'MAIN_PROFILE_SPECIFIC',
  mainAuthority: 'CALIBRATED',
  mainCalibrationLevel: 'FAMILY',
  mainBasis: 'FRUIT_EQUIVALENT',
  mainEquivalentFactor: 1,
  mainPolicyId: 'main-banana-fresh-dairy',
  mainPolicyVersion: '2',
  ecoFloorPercent: 10,
  optimalCeilingPercent: 20,
  hardLimitPercent: 30,
  multiMainHardLimitPercent: null,
  requiresLiquidDairyCarrier: true,
  approvedLiquidDairyCarrier: false,
  liquidDairyCarrierFloorPercent: 30,
} as const;

export const OWNER_APPROVED_DAIRY_CARRIER_LINE_ID = OWNER_LINE_IDS.milk;

export const OWNER_MINIMUM_LEGAL_TOTAL_G =
  OWNER_BANANA_PHYSICAL_G / (OWNER_BANANA_MAIN_POLICY.hardLimitPercent / 100);
