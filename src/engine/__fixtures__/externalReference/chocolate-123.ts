/**
 * Auto Fix Slice 1A — DIAGNOSTIC external-reference fixture: Chocolate #123.
 *
 * Provenance: transcribed VERBATIM from the product owner's external-reference
 * planning history (the "external reference calculator" — neutral wording only).
 * This is the recipe the planning history labels "Receptura #123 CZEKOLADA
 * (1000 g)" with its displayed result panel. Every ingredient's per-100 g DNA
 * is ALSO present in that history (the per-ingredient cards), so this fixture is
 * a CLEAN engine-vs-reference probe: identical inputs in, compare outputs.
 *
 * TEMPERATURE SCOPE — −11 °C ONLY. Every value recovered from the planning
 * history was measured on the −11 °C serving setting; this fixture's `expected`
 * results are valid at −11 °C only (temperature_c: -11). They do NOT validate
 * the engine at −10 / −12 / −13 °C or any future temperature profile — those
 * need their own recovered fixtures.
 *
 * Stored-value mapping (same documented decision as ./referenceProfiles): the
 * reference's per-ingredient PAC is its NET anti-freezing power, stored into the
 * engine's net NPAC slot (npac_value = pac_value); pac_value keeps the same
 * number. Sweetness uses pod_value. This sidesteps the DE-anchor / typed-sugar
 * derivation so the probe measures the recipe-level math only.
 *
 * The 7 base dairy/sugar/stabilizer/salt profiles are REUSED from
 * ./referenceProfiles (single source of truth) because they are byte-identical
 * to this history's per-ingredient cards. Only Chocolate 72% Barima is local
 * (no shared chocolate profile exists).
 *
 * DATA ONLY — changes no formula, config, normalization basis or ice anchor. The
 * diagnostic report (referenceDiagnostics.report.test) reads it, PRINTS the full
 * delta, and only hard-asserts the fields confirmed in-band; it never tunes the
 * engine to match (Slice 1A rule).
 *
 * NOTE (finding, documented in the report test): the reference's "aerating
 * protein" / "protein in solids" appear to EXCLUDE cocoa protein — dairy-only
 * protein reproduces 3.80 % / 10.40 % exactly, whereas the engine counts ALL
 * protein (incl. the chocolate's 8.1 %). That delta is REPORTED, never "fixed".
 */
import type { IngredientComponentProfile } from '../../types';
import type { ActiveRecipeFixture } from '../schema';
import {
  CREAM_30,
  DEXTROSE,
  MILK_3_5,
  referenceLine,
  type ReferenceIngredient,
  SALT,
  SKIMMED_MILK_POWDER,
  SUCROSE,
  TARA_GUM,
} from './referenceProfiles';

/** Dessert chocolate 72 % Barima — per-100 g card transcribed from the history
 * (kcal 580, fat 44.5, sat 26.8, carbs 32.8, sugars/sucrose 26.1, protein 8.1,
 * salt 0.007, fiber 0, solids 85.407, PAC 26.14, POD 26.1). Water = 100 − solids. */
const CHOCOLATE_72_BARIMA: ReferenceIngredient = {
  ingredient_name: 'Dessert chocolate 72% Barima',
  pod_value: 26.1,
  pac_value: 26.14,
  npac_value: 26.14,
  composition: {
    kcal_per_100g: 580,
    water_percent: 14.593,
    solids_percent: 85.407,
    fat_percent: 44.5,
    saturated_fat_percent: 26.8,
    carbohydrate_percent: 32.8,
    sugar_percent: 26.1,
    sucrose_percent: 26.1,
    glucose_percent: 0,
    dextrose_percent: 0,
    fructose_percent: 0,
    lactose_percent: 0,
    polyol_percent: 0,
    fiber_percent: 0,
    protein_percent: 8.1,
    salt_percent: 0.007,
    alcohol_percent: 0,
  } satisfies IngredientComponentProfile,
};

export const externalReferenceChocolate123: ActiveRecipeFixture = {
  kind: 'recipe',
  name: 'External Reference Chocolate #123 -11C',
  status: 'active',
  category: 'chocolate_gelato',
  temperature_c: -11,
  batch_grams: 1000, // verbatim grams sum to 999.97 g; not renormalized
  input: [
    referenceLine(SUCROSE, 133.3),
    referenceLine(DEXTROSE, 0.9),
    referenceLine(SKIMMED_MILK_POWDER, 47.9),
    referenceLine(SALT, 2.0),
    referenceLine(TARA_GUM, 1.87),
    referenceLine(CREAM_30, 73.0),
    referenceLine(MILK_3_5, 640.0),
    referenceLine(CHOCOLATE_72_BARIMA, 101.0),
  ],
  expected: {
    pod: 16.94,
    npac: 37.39,
    ice_fraction: 50.3,
    water: 63.47,
    total_solids: 36.53,
    fat: 8.96,
    lactose: 5.68,
    // dairy-only in the reference — engine counts cocoa protein too (see header).
    aerating_protein: 3.8,
    protein_in_solids: 10.4,
    // informational only — fixture ingredient costs are null, so engine cost is null.
    cost_per_kg: 1.28,
    cost_per_serving_80g: 0.1,
  },
  tolerance: 0.5,
};
