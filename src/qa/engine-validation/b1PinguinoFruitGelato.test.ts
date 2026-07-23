/**
 * B1 — PINGÜINO-generated Fruit Gelato (fruit_gelato, classic, −11 °C, 1000 g):
 * Strawberry(surrogate) 350 / Milk 3.5% 380 / Cream 30% 80 / SMP 40 /
 * Sucrose 110 / Dextrose 35 / Tara 5.
 *
 * DRIFT DETECTOR: pins what `calculateRecipe` ACTUALLY returns today
 * (ENGINE 0.4.0 / CONFIG 0.7.0) — not a judgment of correctness. Any engine,
 * config or demo-catalog change that moves these numbers fails here on purpose.
 */
import { describe, expect, it } from 'vitest';
import { B1_PINGUINO_FRUIT_GELATO, recordEngineOutput } from './fixtures';

describe('AGENT B — B1 PINGÜINO fruit gelato (engine output pin)', () => {
  const record = recordEngineOutput(B1_PINGUINO_FRUIT_GELATO);

  it('pins version stamps and the exact ingredient identities (incl. strawberry surrogate)', () => {
    expect(record.engine_version).toBe('0.4.0');
    expect(record.config_version).toBe('0.7.0');
    expect(record.ingredients.map((i) => i.ingredient_id)).toEqual([
      'PI-ING-001553', // raspberry demo row as STRAWBERRIES · Fresh Fruit (documented surrogate)
      'milk_3_5',
      'cream_30',
      'smp',
      'sucrose',
      'dextrose',
      'tara_gum',
    ]);
    expect(record.total_batch_g).toBe(1000);
  });

  it('fruit_gelato at −11 °C classifies on the milk_gelato CATEGORY-FALLBACK band (all 11 indicators)', () => {
    expect(record.indicators).toHaveLength(11);
    for (const indicator of record.indicators) {
      expect(indicator.category_fallback).toBe(true); // no fruit_gelato band exists in TARGET_BANDS
      expect(indicator.temperature_fallback).toBe(false); // milk_gelato @ −11 is an exact-temperature band
      expect(indicator.band_status).toBe('seeded');
    }
  });

  it('no warnings fire (batch exact, capacity null, confidence 85, costs complete)', () => {
    expect(record.warnings).toEqual([]);
    expect(record.cost_complete).toBe(true);
  });

  it('records the full engine output (inline snapshot — drift detection only)', () => {
    expect(record).toMatchInlineSnapshot(`
      {
        "config_version": "0.7.0",
        "cost_complete": true,
        "cost_per_kg": 3.309,
        "engine_version": "0.4.0",
        "ice_fraction_percent": 50.6999,
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
            "value": 16.0209,
          },
          {
            "band": {
              "max": 42,
              "min": 33,
            },
            "band_status": "seeded",
            "category_fallback": true,
            "key": "npac",
            "status": "ideal",
            "temperature_fallback": false,
            "value": 36.6001,
          },
          {
            "band": {
              "max": 54.5,
              "min": 45,
            },
            "band_status": "seeded",
            "category_fallback": true,
            "key": "ice_fraction",
            "status": "ideal",
            "temperature_fallback": false,
            "value": 50.6999,
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
            "value": 4.168,
          },
          {
            "band": {
              "max": 9,
              "min": 5,
            },
            "band_status": "seeded",
            "category_fallback": true,
            "key": "lactose_sandiness_risk",
            "status": "ideal",
            "temperature_fallback": false,
            "value": 6.0492,
          },
          {
            "band": {
              "max": 12,
              "min": 5,
            },
            "band_status": "seeded",
            "category_fallback": true,
            "key": "fat",
            "status": "needs_correction",
            "temperature_fallback": false,
            "value": 3.867,
          },
          {
            "band": {
              "max": 6,
              "min": 3,
            },
            "band_status": "seeded",
            "category_fallback": true,
            "key": "aerating_protein",
            "status": "good",
            "temperature_fallback": false,
            "value": 3.258,
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
            "value": 10.4766,
          },
          {
            "band": {
              "max": 45,
              "min": 31,
            },
            "band_status": "seeded",
            "category_fallback": true,
            "key": "total_solids",
            "status": "good",
            "temperature_fallback": false,
            "value": 31.098,
          },
          {
            "band": {
              "max": 70,
              "min": 57,
            },
            "band_status": "seeded",
            "category_fallback": true,
            "key": "water",
            "status": "good",
            "temperature_fallback": false,
            "value": 68.902,
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
            "grams": 350,
            "ingredient_id": "PI-ING-001553",
            "line": "b1-strawberry",
            "name": "STRAWBERRIES · Fresh Fruit",
          },
          {
            "grams": 380,
            "ingredient_id": "milk_3_5",
            "line": "b1-milk",
            "name": "Milk 3.5 %",
          },
          {
            "grams": 80,
            "ingredient_id": "cream_30",
            "line": "b1-cream",
            "name": "Cream 30 %",
          },
          {
            "grams": 40,
            "ingredient_id": "smp",
            "line": "b1-smp",
            "name": "Skimmed milk powder",
          },
          {
            "grams": 110,
            "ingredient_id": "sucrose",
            "line": "b1-sucrose",
            "name": "Sucrose",
          },
          {
            "grams": 35,
            "ingredient_id": "dextrose",
            "line": "b1-dextrose",
            "name": "Dextrose",
          },
          {
            "grams": 5,
            "ingredient_id": "tara_gum",
            "line": "b1-tara",
            "name": "Tara gum",
          },
        ],
        "npac_points": 36.6001,
        "pac_points": 24.212,
        "percentages": {
          "alcohol_percent": 0,
          "dextrose_percent": 3.22,
          "fat_percent": 3.867,
          "fiber_percent": 2.675,
          "fructose_percent": 0.84,
          "glucose_percent": 0.7,
          "lactose_percent": 4.168,
          "polyol_percent": 0,
          "protein_percent": 3.258,
          "salt_percent": 0.086,
          "solids_percent": 31.098,
          "sucrose_percent": 11,
          "water_percent": 68.902,
        },
        "pod_points": 16.0209,
        "scores": {
          "cost": 89.2133,
          "flavor": 70,
          "overall": 82.1399,
          "technical": 88.3413,
        },
        "sugar": {
          "dextrose_g": 32.2,
          "fructose_g": 8.4,
          "glucose_g": 7,
          "lactose_g": 41.68,
          "other_sugar_g": 0,
          "polyol_g": 0,
          "sucrose_g": 110,
        },
        "total_batch_g": 1000,
        "totals": {
          "alcohol_g": 0,
          "dextrose_g": 32.2,
          "fat_g": 38.67,
          "fiber_g": 26.75,
          "fructose_g": 8.4,
          "glucose_g": 7,
          "lactose_g": 41.68,
          "polyol_g": 0,
          "protein_g": 32.58,
          "salt_g": 0.86,
          "solids_g": 310.98,
          "sucrose_g": 110,
          "water_g": 689.02,
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
