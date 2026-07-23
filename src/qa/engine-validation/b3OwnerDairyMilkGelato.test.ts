/**
 * B3 — the owner's dairy fixture (milk_gelato, classic, −11 °C, 999.91 g):
 * Milk 592.3 / Cream 216.6 / SMP 22 / Sucrose 32.5 / Dextrose 110 / Salt 0.8 /
 * Inulin 23.7 / Tara 2.01 — the exact "MyGelato copy" grams already exercised
 * by src/features/constraint-studio/autoBalance.test.ts (PHASE 10).
 *
 * DRIFT DETECTOR: pins what `calculateRecipe` ACTUALLY returns today — not a
 * judgment of correctness.
 */
import { describe, expect, it } from 'vitest';
import { B3_OWNER_DAIRY_MILK_GELATO, recordEngineOutput } from './fixtures';

describe('AGENT B — B3 owner dairy milk gelato (engine output pin)', () => {
  const record = recordEngineOutput(B3_OWNER_DAIRY_MILK_GELATO);

  it('pins version stamps, ingredient identities and the 999.91 g batch', () => {
    expect(record.engine_version).toBe('0.4.0');
    expect(record.config_version).toBe('0.7.0');
    expect(record.ingredients.map((i) => i.ingredient_id)).toEqual([
      'milk_3_5',
      'cream_30',
      'smp',
      'sucrose',
      'dextrose',
      'salt',
      'inulin',
      'tara_gum',
    ]);
    expect(record.total_batch_g).toBe(999.91);
  });

  it('milk_gelato at −11 °C uses its OWN seeded band — no category/temperature fallback', () => {
    expect(record.indicators).toHaveLength(11);
    for (const indicator of record.indicators) {
      expect(indicator.category_fallback).toBe(false);
      expect(indicator.temperature_fallback).toBe(false);
      expect(indicator.band_status).toBe('seeded');
    }
  });

  it('no warnings fire (0.09 g inside the 0.1 g batch tolerance; costs complete)', () => {
    expect(record.warnings).toEqual([]);
    expect(record.cost_complete).toBe(true);
  });

  it('records the full engine output (inline snapshot — drift detection only)', () => {
    expect(record).toMatchInlineSnapshot(`
      {
        "config_version": "0.7.0",
        "cost_complete": true,
        "cost_per_kg": 2.0153,
        "engine_version": "0.4.0",
        "ice_fraction_percent": 42.9048,
        "indicators": [
          {
            "band": {
              "max": 17,
              "min": 12,
            },
            "band_status": "seeded",
            "category_fallback": false,
            "key": "pod",
            "status": "too_weak",
            "temperature_fallback": false,
            "value": 11.4921,
          },
          {
            "band": {
              "max": 42,
              "min": 33,
            },
            "band_status": "seeded",
            "category_fallback": false,
            "key": "npac",
            "status": "too_soft",
            "temperature_fallback": false,
            "value": 43.985,
          },
          {
            "band": {
              "max": 54.5,
              "min": 45,
            },
            "band_status": "seeded",
            "category_fallback": false,
            "key": "ice_fraction",
            "status": "too_soft",
            "temperature_fallback": false,
            "value": 42.9048,
          },
          {
            "band": {
              "max": 6,
              "min": 4,
            },
            "band_status": "seeded",
            "category_fallback": false,
            "key": "lactose",
            "status": "ideal",
            "temperature_fallback": false,
            "value": 4.7022,
          },
          {
            "band": {
              "max": 9,
              "min": 5,
            },
            "band_status": "seeded",
            "category_fallback": false,
            "key": "lactose_sandiness_risk",
            "status": "ideal",
            "temperature_fallback": false,
            "value": 7.0536,
          },
          {
            "band": {
              "max": 12,
              "min": 5,
            },
            "band_status": "seeded",
            "category_fallback": false,
            "key": "fat",
            "status": "ideal",
            "temperature_fallback": false,
            "value": 8.5894,
          },
          {
            "band": {
              "max": 6,
              "min": 3,
            },
            "band_status": "seeded",
            "category_fallback": false,
            "key": "aerating_protein",
            "status": "good",
            "temperature_fallback": false,
            "value": 3.2231,
          },
          {
            "band": {
              "max": 13,
              "min": 9,
            },
            "band_status": "seeded",
            "category_fallback": false,
            "key": "protein_in_solids",
            "status": "good",
            "temperature_fallback": false,
            "value": 9.6685,
          },
          {
            "band": {
              "max": 45,
              "min": 31,
            },
            "band_status": "seeded",
            "category_fallback": false,
            "key": "total_solids",
            "status": "good",
            "temperature_fallback": false,
            "value": 33.3357,
          },
          {
            "band": {
              "max": 70,
              "min": 57,
            },
            "band_status": "seeded",
            "category_fallback": false,
            "key": "water",
            "status": "ideal",
            "temperature_fallback": false,
            "value": 66.6643,
          },
          {
            "band": {
              "max": 2.5,
              "min": 0,
              "warn_above": 2.5,
            },
            "band_status": "seeded",
            "category_fallback": false,
            "key": "alcohol",
            "status": "good",
            "temperature_fallback": false,
            "value": 0,
          },
        ],
        "ingredients": [
          {
            "grams": 592.3,
            "ingredient_id": "milk_3_5",
            "line": "b3-milk",
            "name": "Milk 3.5 %",
          },
          {
            "grams": 216.6,
            "ingredient_id": "cream_30",
            "line": "b3-cream",
            "name": "Cream 30 %",
          },
          {
            "grams": 22,
            "ingredient_id": "smp",
            "line": "b3-smp",
            "name": "Skimmed milk powder",
          },
          {
            "grams": 32.5,
            "ingredient_id": "sucrose",
            "line": "b3-sucrose",
            "name": "Sucrose",
          },
          {
            "grams": 110,
            "ingredient_id": "dextrose",
            "line": "b3-dextrose",
            "name": "Dextrose",
          },
          {
            "grams": 0.8,
            "ingredient_id": "salt",
            "line": "b3-salt",
            "name": "Salt",
          },
          {
            "grams": 23.7,
            "ingredient_id": "inulin",
            "line": "b3-inulin",
            "name": "Inulin",
          },
          {
            "grams": 2.01,
            "ingredient_id": "tara_gum",
            "line": "b3-tara",
            "name": "Tara gum",
          },
        ],
        "npac_points": 43.985,
        "pac_points": 27.1823,
        "percentages": {
          "alcohol_percent": 0,
          "dextrose_percent": 10.1209,
          "fat_percent": 8.5894,
          "fiber_percent": 2.294,
          "fructose_percent": 0,
          "glucose_percent": 0,
          "lactose_percent": 4.7022,
          "polyol_percent": 0,
          "protein_percent": 3.2231,
          "salt_percent": 0.1829,
          "solids_percent": 33.3357,
          "sucrose_percent": 3.2503,
          "water_percent": 66.6643,
        },
        "pod_points": 11.4921,
        "scores": {
          "cost": 100,
          "flavor": 70,
          "overall": 75.9824,
          "technical": 66.2059,
        },
        "sugar": {
          "dextrose_g": 101.2,
          "fructose_g": 0,
          "glucose_g": 0,
          "lactose_g": 47.0182,
          "other_sugar_g": 0,
          "polyol_g": 0,
          "sucrose_g": 32.5,
        },
        "total_batch_g": 999.91,
        "totals": {
          "alcohol_g": 0,
          "dextrose_g": 101.2,
          "fat_g": 85.8865,
          "fiber_g": 22.938,
          "fructose_g": 0,
          "glucose_g": 0,
          "lactose_g": 47.0182,
          "polyol_g": 0,
          "protein_g": 32.2277,
          "salt_g": 1.8289,
          "solids_g": 333.3269,
          "sucrose_g": 32.5,
          "water_g": 666.5831,
        },
        "verdict": {
          "label": "Bardzo dobrze dopasowana",
          "score": 8,
        },
        "warnings": [],
      }
    `);
  });
});
