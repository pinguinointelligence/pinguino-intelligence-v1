/**
 * B2 — MyGelato auto-balanced COMPARISON recipe (fruit_gelato, classic, −11 °C,
 * ≈1000 g): Strawberry(surrogate) 265.7 / Milk 396.7 / Cream 119.5 / SMP 64 /
 * Sucrose 117.8 / Dextrose 34.9 / Tara 1.41.
 *
 * The GRAMS are MyGelato's auto-balance output (comparison source only — never
 * promoted as truth). The COMPOSITIONS are PINGÜINO's own canonical demo rows
 * (identical to B1), so the two fixtures differ ONLY in gram distribution.
 *
 * DRIFT DETECTOR: pins what `calculateRecipe` ACTUALLY returns today — not a
 * judgment of which recipe is right.
 */
import { describe, expect, it } from 'vitest';
import { B2_MYGELATO_AUTOBALANCED_FRUIT_GELATO, recordEngineOutput } from './fixtures';

describe('AGENT B — B2 MyGelato auto-balanced comparison (engine output pin)', () => {
  const record = recordEngineOutput(B2_MYGELATO_AUTOBALANCED_FRUIT_GELATO);

  it('pins version stamps, ingredient identities and the ≈1000.01 g batch', () => {
    expect(record.engine_version).toBe('0.4.0');
    expect(record.config_version).toBe('0.7.0');
    expect(record.ingredients.map((i) => i.ingredient_id)).toEqual([
      'PI-ING-001553', // same documented strawberry surrogate as B1
      'milk_3_5',
      'cream_30',
      'smp',
      'sucrose',
      'dextrose',
      'tara_gum',
    ]);
    expect(record.total_batch_g).toBe(1000.01);
  });

  it('fruit_gelato at −11 °C classifies on the milk_gelato CATEGORY-FALLBACK band (all 11 indicators)', () => {
    expect(record.indicators).toHaveLength(11);
    for (const indicator of record.indicators) {
      expect(indicator.category_fallback).toBe(true);
      expect(indicator.temperature_fallback).toBe(false);
      expect(indicator.band_status).toBe('seeded');
    }
  });

  it('no warnings fire (0.01 g inside the 0.1 g batch tolerance; costs complete)', () => {
    expect(record.warnings).toEqual([]);
    expect(record.cost_complete).toBe(true);
  });

  it('records the full engine output (inline snapshot — drift detection only)', () => {
    expect(record).toMatchInlineSnapshot(`
      {
        "config_version": "0.7.0",
        "cost_complete": true,
        "cost_per_kg": 3.088,
        "engine_version": "0.4.0",
        "ice_fraction_percent": 45.7962,
        "indicators": [
          {
            "band": {
              "max": 17,
              "min": 12,
            },
            "band_status": "seeded",
            "category_fallback": true,
            "key": "pod",
            "status": "good",
            "temperature_fallback": false,
            "value": 16.5525,
          },
          {
            "band": {
              "max": 42,
              "min": 33,
            },
            "band_status": "seeded",
            "category_fallback": true,
            "key": "npac",
            "status": "good",
            "temperature_fallback": false,
            "value": 41.2457,
          },
          {
            "band": {
              "max": 54.5,
              "min": 45,
            },
            "band_status": "seeded",
            "category_fallback": true,
            "key": "ice_fraction",
            "status": "good",
            "temperature_fallback": false,
            "value": 45.7962,
          },
          {
            "band": {
              "max": 6,
              "min": 4,
            },
            "band_status": "seeded",
            "category_fallback": true,
            "key": "lactose",
            "status": "good",
            "temperature_fallback": false,
            "value": 5.6265,
          },
          {
            "band": {
              "max": 9,
              "min": 5,
            },
            "band_status": "seeded",
            "category_fallback": true,
            "key": "lactose_sandiness_risk",
            "status": "good",
            "temperature_fallback": false,
            "value": 8.5694,
          },
          {
            "band": {
              "max": 12,
              "min": 5,
            },
            "band_status": "seeded",
            "category_fallback": true,
            "key": "fat",
            "status": "good",
            "temperature_fallback": false,
            "value": 5.1043,
          },
          {
            "band": {
              "max": 6,
              "min": 3,
            },
            "band_status": "seeded",
            "category_fallback": true,
            "key": "aerating_protein",
            "status": "ideal",
            "temperature_fallback": false,
            "value": 4.1428,
          },
          {
            "band": {
              "max": 13,
              "min": 9,
            },
            "band_status": "seeded",
            "category_fallback": true,
            "key": "protein_in_solids",
            "status": "ideal",
            "temperature_fallback": false,
            "value": 12.063,
          },
          {
            "band": {
              "max": 45,
              "min": 31,
            },
            "band_status": "seeded",
            "category_fallback": true,
            "key": "total_solids",
            "status": "ideal",
            "temperature_fallback": false,
            "value": 34.3428,
          },
          {
            "band": {
              "max": 70,
              "min": 57,
            },
            "band_status": "seeded",
            "category_fallback": true,
            "key": "water",
            "status": "ideal",
            "temperature_fallback": false,
            "value": 65.6572,
          },
          {
            "band": {
              "max": 2.5,
              "min": 0,
              "warn_above": 2.5,
            },
            "band_status": "seeded",
            "category_fallback": true,
            "key": "alcohol",
            "status": "good",
            "temperature_fallback": false,
            "value": 0,
          },
        ],
        "ingredients": [
          {
            "grams": 265.7,
            "ingredient_id": "PI-ING-001553",
            "line": "b2-strawberry",
            "name": "STRAWBERRIES · Fresh Fruit",
          },
          {
            "grams": 396.7,
            "ingredient_id": "milk_3_5",
            "line": "b2-milk",
            "name": "Milk 3.5 %",
          },
          {
            "grams": 119.5,
            "ingredient_id": "cream_30",
            "line": "b2-cream",
            "name": "Cream 30 %",
          },
          {
            "grams": 64,
            "ingredient_id": "smp",
            "line": "b2-smp",
            "name": "Skimmed milk powder",
          },
          {
            "grams": 117.8,
            "ingredient_id": "sucrose",
            "line": "b2-sucrose",
            "name": "Sucrose",
          },
          {
            "grams": 34.9,
            "ingredient_id": "dextrose",
            "line": "b2-dextrose",
            "name": "Dextrose",
          },
          {
            "grams": 1.41,
            "ingredient_id": "tara_gum",
            "line": "b2-tara",
            "name": "Tara gum",
          },
        ],
        "npac_points": 41.2457,
        "pac_points": 25.728,
        "percentages": {
          "alcohol_percent": 0,
          "dextrose_percent": 3.2108,
          "fat_percent": 5.1043,
          "fiber_percent": 1.8398,
          "fructose_percent": 0.6377,
          "glucose_percent": 0.5314,
          "lactose_percent": 5.6265,
          "polyol_percent": 0,
          "protein_percent": 4.1428,
          "salt_percent": 0.1156,
          "solids_percent": 34.3428,
          "sucrose_percent": 11.7799,
          "water_percent": 65.6572,
        },
        "pod_points": 16.5525,
        "scores": {
          "cost": 92.16,
          "flavor": 70,
          "overall": 83.2067,
          "technical": 89.1667,
        },
        "sugar": {
          "dextrose_g": 32.108,
          "fructose_g": 6.3768,
          "glucose_g": 5.314,
          "lactose_g": 56.2651,
          "other_sugar_g": 0,
          "polyol_g": 0,
          "sucrose_g": 117.8,
        },
        "total_batch_g": 1000.01,
        "totals": {
          "alcohol_g": 0,
          "dextrose_g": 32.108,
          "fat_g": 51.0436,
          "fiber_g": 18.3985,
          "fructose_g": 6.3768,
          "glucose_g": 5.314,
          "lactose_g": 56.2651,
          "polyol_g": 0,
          "protein_g": 41.428,
          "salt_g": 1.1562,
          "solids_g": 343.4313,
          "sucrose_g": 117.8,
          "water_g": 656.5787,
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
