/**
 * OWNER REGRESSION SPECIMEN — durable run `2fc85403-2394-4582-a211-4736bfc4ef8e`,
 * read from served staging `e2e1a61a` on 2026-09-04 and never mutated.
 *
 * Full forensic record: `reports/production-rescue/OWNER_REPRO_2fc85403.md`.
 *
 * This is the batch that could be authorized but never recovered: BANANA weighed
 * 345 g, the accepted rescue targets 1149.9 g, and 345 / 1149.9 = 30.0026 % is
 * outside BANANA's published 30 % hard Main limit. Tests import these exact
 * numbers so the regression is the owner's real incident, not a re-creation.
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

/** Mapper ids behind those lines, for building engine ingredients in tests. */
export const OWNER_MAPPER_IDS = {
  milk: 'PI-ING-000236',
  cream: 'PI-ING-000180',
  smp: 'PI-ING-000270',
  sucrose: 'PI-ING-000514',
  dextrose: 'PI-ING-000494',
  tara: 'PI-ING-000492',
  banana: 'PI-ING-000345',
} as const;

/** Immutable planned vector — identical in the run and in saved version 2. */
export const OWNER_PLANNED_GRAMS = [428, 113, 40, 60, 55, 4, 300] as const;
export const OWNER_PLANNED_TOTAL_G = 1000;

/** Physical facts at actual_revision 8. No top-up was ever executed. */
export const OWNER_ACTUAL_GRAMS = [428, 113, 40, 60, 55, 4, 345] as const;
export const OWNER_ACTUAL_TOTAL_G = 1045;
export const OWNER_BANANA_PHYSICAL_G = 345;

/** The accepted-but-unrecoverable rescue (rescue_revision 1). */
export const OWNER_RESCUE_GRAMS = [492.2, 129.9, 46, 69, 63.2, 4.6, 345] as const;
export const OWNER_RESCUE_TOTAL_G = 1149.9;
export const OWNER_RESCUE_OPTION_ID = 'restore_original_recipe';
export const OWNER_RESCUE_REVISION = 1;
export const OWNER_SOURCE_ACTUAL_REVISION = 8;

/** Published `main-banana-fresh-dairy` v2, as stored on the run's own snapshot. */
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

/**
 * Carrier authority as persisted on the same run. MILK 3.5 % is the approved
 * liquid dairy carrier; every other line is `false`, and BANANA is the line that
 * REQUIRES one (floor 30 % of the batch). In the owner's own candidate the
 * carrier was satisfied — MILK 492.2 / 1149.9 = 42.8 % — which is why that
 * candidate failed on the Main hard limit alone.
 */
export const OWNER_APPROVED_DAIRY_CARRIER_LINE_ID = OWNER_LINE_IDS.milk;

/**
 * The smallest batch at which 345 g of BANANA is inside its 30 % hard limit.
 * DERIVED here for assertions only — production code must compute the minimum
 * safe executable batch itself and must never hard-code this number.
 */
export const OWNER_MINIMUM_LEGAL_TOTAL_G =
  OWNER_BANANA_PHYSICAL_G / (OWNER_BANANA_MAIN_POLICY.hardLimitPercent / 100);
