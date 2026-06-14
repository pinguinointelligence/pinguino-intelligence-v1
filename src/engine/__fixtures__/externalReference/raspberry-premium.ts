/**
 * Second ACTIVE external reference fixture (spec §16) — a verified raspberry
 * premium recipe (fruit_gelato, −11 °C, 1000 g) transcribed VERBATIM from the
 * external reference tool's screens.
 *
 * Purpose: a structurally different recipe (water-heavy fruit with a real
 * sucrose/glucose/fructose split) that tests whether the milk-base NPAC finding
 * holds. The 7 dairy/sugar/stabilizer/salt profiles are REUSED from
 * ./referenceProfiles (single source of truth); only the verified Raspberries
 * profile and the per-recipe grams are specific to this fixture. Nothing invented.
 *
 * Distinct from the pending placeholder `./raspberry` (name 'raspberry'), which
 * stays pending — this fixture is named 'External Reference Raspberry Premium -11C'.
 *
 * DATA ONLY — no formula/config/normalization/ice-anchor change. The calibration
 * report (raspberryPremiumCalibration.report.test) reads it and prints the
 * comparison; it does not enforce the deferred config decisions.
 */
import type { ActiveRecipeFixture } from '../schema';
import {
  CREAM_30,
  DEXTROSE,
  MILK_3_5,
  RASPBERRIES,
  referenceLine,
  SALT,
  SKIMMED_MILK_POWDER,
  SUCROSE,
  TARA_GUM,
} from './referenceProfiles';

export const externalReferenceRaspberryPremium: ActiveRecipeFixture = {
  kind: 'recipe',
  name: 'External Reference Raspberry Premium -11C',
  status: 'active',
  category: 'fruit_gelato',
  temperature_c: -11,
  batch_grams: 1000,
  input: [
    referenceLine(RASPBERRIES, 455.6),
    referenceLine(MILK_3_5, 131.3),
    referenceLine(CREAM_30, 225.9),
    referenceLine(SKIMMED_MILK_POWDER, 80.2),
    referenceLine(SUCROSE, 35.7),
    referenceLine(DEXTROSE, 68.3),
    referenceLine(TARA_GUM, 0.98),
    referenceLine(SALT, 2.0),
  ],
  expected: {
    pod: 12.03,
    npac: 41.15,
    ice_fraction: 52.77,
    water: 66.81,
    total_solids: 33.19,
    fat: 7.44,
    lactose: 5.43,
    aerating_protein: 3.78,
    protein_in_solids: 11.38,
    lactose_sandiness_risk: 8.13,
    cost_per_kg: 1.47,
    cost_per_serving_80g: 0.12,
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
