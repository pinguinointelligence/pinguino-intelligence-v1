/**
 * First ACTIVE external reference fixture (spec §16) — a verified milk-base
 * recipe transcribed VERBATIM from the external reference tool's screens.
 *
 * Provenance: every number below is the product owner's verified reference data
 * (grams, per-100 g composition profiles, per-ingredient `pod_value`/`pac_value`,
 * displayed result values and target bands). Nothing here is invented.
 *
 * Stored-value mapping (documented modeling decision, spec §8) lives with the
 * shared profiles in ./referenceProfiles: the reference's per-ingredient
 * `pac_value` is NET anti-freezing power, stored into the engine's net NPAC slot
 * (`npac_value = pac_value`). Validated by the calibration report — under
 * per_water_mass the recipe NPAC reproduces the reference's displayed 40.74 exactly.
 *
 * This fixture is DATA ONLY. It changes no formula, no config, no normalization
 * basis and no ice anchor. The calibration report (milkBaseCalibration.report.test)
 * reads it and prints the comparison; it does not enforce within-tolerance, so an
 * intentionally-uncalibrated config never turns the suite red.
 *
 * The 7 per-ingredient profiles come from ./referenceProfiles (the single source
 * of truth shared with other active reference fixtures); only the grams differ.
 */
import type { ActiveRecipeFixture } from '../schema';
import {
  CREAM_30,
  DEXTROSE,
  MILK_3_5,
  referenceLine,
  SALT,
  SKIMMED_MILK_POWDER,
  SUCROSE,
  TARA_GUM,
} from './referenceProfiles';

export const externalReferenceMilkBase: ActiveRecipeFixture = {
  kind: 'recipe',
  name: 'External Reference Milk Base -11C',
  status: 'active',
  category: 'milk_gelato',
  temperature_c: -11,
  batch_grams: 1000,
  input: [
    referenceLine(MILK_3_5, 523.5),
    referenceLine(CREAM_30, 263.5),
    referenceLine(SKIMMED_MILK_POWDER, 48.4),
    referenceLine(SUCROSE, 123.4),
    referenceLine(DEXTROSE, 38.3),
    referenceLine(TARA_GUM, 1.92),
    referenceLine(SALT, 1.01),
  ],
  expected: {
    pod: 15.98,
    npac: 40.74,
    ice_fraction: 50.74,
    water: 64.23,
    total_solids: 35.77,
    fat: 9.78,
    lactose: 5.77,
    aerating_protein: 3.9,
    protein_in_solids: 10.92,
    lactose_sandiness_risk: 8.99,
    cost_per_kg: 1.97,
    cost_per_serving_80g: 0.16,
  },
  bands: {
    pod: [12.0, 17.0],
    npac: [33.0, 42.0],
    ice_fraction: [45.0, 54.5],
    lactose: [4.0, 6.0],
    lactose_sandiness_risk: [5.0, 9.0],
    fat: [5.0, 12.0],
    aerating_protein: [3.0, 6.0],
    protein_in_solids: [9.0, 13.0],
    total_solids: [31.0, 45.0],
    water: [57.0, 70.0],
  },
  tolerance: 0.5,
};
