/**
 * Auto Fix Slice 1A — DIAGNOSTIC external-reference fixture: ultra-fruit
 * Raspberry-428 (42.7 % fresh fruit, fruit_gelato, −11 °C).
 *
 * Provenance: the RECIPE grams and the displayed RESULT are transcribed VERBATIM
 * from the external-reference planning history (the recipe the owner labels with
 * raspberries 428 g and the result POD 17.56 / NPAC 49.64 / ice 48.69 / solids
 * 37.83 / water 62.17 / fat 3.32 / lactose 4.57 / protein 3.14). Grams sum to
 * 1002 g (raspberries 42.71 %); not renormalized.
 *
 * TEMPERATURE SCOPE — −11 °C ONLY. Every value recovered from the planning
 * history was measured on the −11 °C serving setting; this fixture's `expected`
 * results are valid at −11 °C only (temperature_c: -11). They do NOT validate
 * the engine at −10 / −12 / −13 °C or any future temperature profile — those
 * need their own recovered fixtures.
 *
 * RASPBERRY-DNA PROVENANCE (important): the planning history gives NO precise
 * per-100 g raspberry card — only the loose assumption "≈85 % water, ≈5 % sugars".
 * We must not invent it, so the raspberry line REUSES the repo's already-verified
 * `RASPBERRIES` profile from ./referenceProfiles (the same verified raspberry the
 * raspberry-premium active fixture uses). The diagnostic run then reproduces the
 * recovered RESULT EXACTLY — POD 17.56, NPAC 49.64 (per_water) and all four core
 * composition fields to 2 dp — which is itself the evidence that this profile
 * matches the external tool for this recipe. On that basis the diagnostic test
 * PROMOTES composition + POD + NPAC to hard assertions; aerating_protein
 * (≈ +0.56 pp protein-DNA delta) and ice fraction (anchors deferred + ultra-fruit)
 * stay REPORT-ONLY.
 *
 * Dry glucose syrup 39 DE and inulin DNA ARE confirmed in the history
 * (39 DE: solids 95 / PAC 74.1 / POD 30.03; inulin: solids 97 / PAC 8 / POD 8 /
 * fiber 89) and are local profiles below. The 7 dairy/sugar/stabilizer/salt
 * profiles are reused from ./referenceProfiles.
 *
 * Stored-value mapping and DATA-ONLY discipline: identical to ./chocolate-123.
 */
import type { IngredientComponentProfile } from '../../types';
import type { ActiveRecipeFixture } from '../schema';
import {
  CREAM_30,
  DEXTROSE,
  MILK_3_5,
  RASPBERRIES,
  referenceLine,
  type ReferenceIngredient,
  SALT,
  SKIMMED_MILK_POWDER,
  SUCROSE,
  TARA_GUM,
} from './referenceProfiles';

/** Dry glucose syrup 39 DE — confirmed history card (solids 95 / PAC 74.1 /
 * POD 30.03). Stored pod/pac used; the DE-anchor engine path is intentionally
 * NOT exercised (de_value left absent) so this stays a clean probe input. */
const DRY_GLUCOSE_39_DE: ReferenceIngredient = {
  ingredient_name: 'Dry glucose syrup 39 DE',
  pod_value: 30.03,
  pac_value: 74.1,
  npac_value: 74.1,
  composition: {
    kcal_per_100g: 380,
    water_percent: 5,
    solids_percent: 95,
    fat_percent: 0,
    carbohydrate_percent: 95,
    sugar_percent: 0,
    sucrose_percent: 0,
    glucose_percent: 0,
    dextrose_percent: 0,
    fructose_percent: 0,
    lactose_percent: 0,
    polyol_percent: 0,
    fiber_percent: 0,
    protein_percent: 0,
    salt_percent: 0,
    alcohol_percent: 0,
  } satisfies IngredientComponentProfile,
};

/** Inulin — confirmed history card (solids 97 / PAC 8 / POD 8 / fiber 89). */
const INULIN: ReferenceIngredient = {
  ingredient_name: 'Inulin',
  pod_value: 8,
  pac_value: 8,
  npac_value: 8,
  composition: {
    kcal_per_100g: 190,
    water_percent: 3,
    solids_percent: 97,
    fat_percent: 0,
    carbohydrate_percent: 90,
    sugar_percent: 0,
    sucrose_percent: 0,
    glucose_percent: 0,
    dextrose_percent: 0,
    fructose_percent: 0,
    lactose_percent: 0,
    polyol_percent: 0,
    fiber_percent: 89,
    protein_percent: 0,
    salt_percent: 0,
    alcohol_percent: 0,
  } satisfies IngredientComponentProfile,
};

export const externalReferenceRaspberry428: ActiveRecipeFixture = {
  kind: 'recipe',
  name: 'External Reference Ultra-Fruit Raspberry-428 -11C',
  status: 'active',
  category: 'fruit_gelato',
  temperature_c: -11,
  batch_grams: 1000, // verbatim grams sum to 1002 g (raspberries 42.71 %); not renormalized
  input: [
    referenceLine(RASPBERRIES, 428), // repo-verified raspberry DNA — see header caveat
    referenceLine(MILK_3_5, 214),
    referenceLine(CREAM_30, 80),
    referenceLine(SUCROSE, 100),
    referenceLine(DEXTROSE, 40),
    referenceLine(DRY_GLUCOSE_39_DE, 40),
    referenceLine(SKIMMED_MILK_POWDER, 65),
    referenceLine(INULIN, 30),
    referenceLine(TARA_GUM, 3),
    referenceLine(SALT, 2),
  ],
  expected: {
    pod: 17.56,
    npac: 49.64,
    ice_fraction: 48.69,
    water: 62.17,
    total_solids: 37.83,
    fat: 3.32,
    lactose: 4.57,
    aerating_protein: 3.14,
    // protein_in_solids: not supplied by the reference for this recipe — omitted.
  },
  tolerance: 0.5,
};
