/**
 * B1 vs B2 — metric-by-metric divergence table (PINGÜINO template grams vs
 * MyGelato auto-balanced grams, SAME canonical demo compositions, both run
 * through PINGÜINO's own engine).
 *
 * Records ONLY where the two gram distributions diverge and which PINGÜINO
 * band each violates — deliberately NO conclusion about which is "right"
 * (science freeze). Deltas are B1 − B2. DRIFT DETECTOR via inline snapshot.
 */
import { describe, expect, it } from 'vitest';
import {
  B1_PINGUINO_FRUIT_GELATO,
  B2_MYGELATO_AUTOBALANCED_FRUIT_GELATO,
  r4,
  recordEngineOutput,
} from './fixtures';

const b1 = recordEngineOutput(B1_PINGUINO_FRUIT_GELATO);
const b2 = recordEngineOutput(B2_MYGELATO_AUTOBALANCED_FRUIT_GELATO);

const row = (metric: string, a: number | null, b: number | null) => ({
  metric,
  b1: a,
  b2: b,
  delta_b1_minus_b2: a !== null && b !== null ? r4(a - b) : null,
});

describe('AGENT B — B1 vs B2 divergence (no judgment, deltas only)', () => {
  it('both fixtures classify against the SAME milk_gelato fallback band', () => {
    expect(b1.indicators.map((i) => i.band)).toEqual(b2.indicators.map((i) => i.band));
  });

  it('records the metric-by-metric divergence table (inline snapshot)', () => {
    const table = [
      row('total_batch_g', b1.total_batch_g, b2.total_batch_g),
      row('water_percent', b1.percentages.water_percent ?? null, b2.percentages.water_percent ?? null),
      row('solids_percent', b1.percentages.solids_percent ?? null, b2.percentages.solids_percent ?? null),
      row('fat_percent', b1.percentages.fat_percent ?? null, b2.percentages.fat_percent ?? null),
      row('protein_percent', b1.percentages.protein_percent ?? null, b2.percentages.protein_percent ?? null),
      row('lactose_percent', b1.percentages.lactose_percent ?? null, b2.percentages.lactose_percent ?? null),
      row('sucrose_g', b1.sugar.sucrose_g ?? null, b2.sugar.sucrose_g ?? null),
      row('dextrose_g', b1.sugar.dextrose_g ?? null, b2.sugar.dextrose_g ?? null),
      row('glucose_g', b1.sugar.glucose_g ?? null, b2.sugar.glucose_g ?? null),
      row('fructose_g', b1.sugar.fructose_g ?? null, b2.sugar.fructose_g ?? null),
      row('lactose_g', b1.sugar.lactose_g ?? null, b2.sugar.lactose_g ?? null),
      row('pod_points', b1.pod_points, b2.pod_points),
      row('pac_points', b1.pac_points, b2.pac_points),
      row('npac_points', b1.npac_points, b2.npac_points),
      row('ice_fraction_percent', b1.ice_fraction_percent, b2.ice_fraction_percent),
      row('overall_score', b1.scores?.overall ?? null, b2.scores?.overall ?? null),
      row('technical_score', b1.scores?.technical ?? null, b2.scores?.technical ?? null),
      row('cost_per_kg', b1.cost_per_kg, b2.cost_per_kg),
    ];
    expect(table).toMatchInlineSnapshot(`
      [
        {
          "b1": 1000,
          "b2": 1000.01,
          "delta_b1_minus_b2": -0.01,
          "metric": "total_batch_g",
        },
        {
          "b1": 68.902,
          "b2": 65.6572,
          "delta_b1_minus_b2": 3.2448,
          "metric": "water_percent",
        },
        {
          "b1": 31.098,
          "b2": 34.3428,
          "delta_b1_minus_b2": -3.2448,
          "metric": "solids_percent",
        },
        {
          "b1": 3.867,
          "b2": 5.1043,
          "delta_b1_minus_b2": -1.2373,
          "metric": "fat_percent",
        },
        {
          "b1": 3.258,
          "b2": 4.1428,
          "delta_b1_minus_b2": -0.8848,
          "metric": "protein_percent",
        },
        {
          "b1": 4.168,
          "b2": 5.6265,
          "delta_b1_minus_b2": -1.4585,
          "metric": "lactose_percent",
        },
        {
          "b1": 110,
          "b2": 117.8,
          "delta_b1_minus_b2": -7.8,
          "metric": "sucrose_g",
        },
        {
          "b1": 32.2,
          "b2": 32.108,
          "delta_b1_minus_b2": 0.092,
          "metric": "dextrose_g",
        },
        {
          "b1": 7,
          "b2": 5.314,
          "delta_b1_minus_b2": 1.686,
          "metric": "glucose_g",
        },
        {
          "b1": 8.4,
          "b2": 6.3768,
          "delta_b1_minus_b2": 2.0232,
          "metric": "fructose_g",
        },
        {
          "b1": 41.68,
          "b2": 56.2651,
          "delta_b1_minus_b2": -14.5851,
          "metric": "lactose_g",
        },
        {
          "b1": 16.0209,
          "b2": 16.5525,
          "delta_b1_minus_b2": -0.5316,
          "metric": "pod_points",
        },
        {
          "b1": 24.212,
          "b2": 25.728,
          "delta_b1_minus_b2": -1.516,
          "metric": "pac_points",
        },
        {
          "b1": 36.6001,
          "b2": 41.2457,
          "delta_b1_minus_b2": -4.6456,
          "metric": "npac_points",
        },
        {
          "b1": 50.6999,
          "b2": 45.7962,
          "delta_b1_minus_b2": 4.9037,
          "metric": "ice_fraction_percent",
        },
        {
          "b1": 82.1399,
          "b2": 83.2067,
          "delta_b1_minus_b2": -1.0668,
          "metric": "overall_score",
        },
        {
          "b1": 88.3413,
          "b2": 89.1667,
          "delta_b1_minus_b2": -0.8254,
          "metric": "technical_score",
        },
        {
          "b1": 3.309,
          "b2": 3.088,
          "delta_b1_minus_b2": 0.221,
          "metric": "cost_per_kg",
        },
      ]
    `);
  });

  it('records which PINGÜINO band each side violates, per indicator (inline snapshot)', () => {
    const statuses = b1.indicators.map((indicator, index) => ({
      key: indicator.key,
      band: indicator.band ? [indicator.band.min, indicator.band.max] : null,
      b1_value: indicator.value,
      b1_status: indicator.status,
      b2_value: b2.indicators[index]?.value ?? null,
      b2_status: b2.indicators[index]?.status ?? 'missing',
    }));
    expect(statuses).toMatchInlineSnapshot(`
      [
        {
          "b1_status": "good",
          "b1_value": 16.0209,
          "b2_status": "good",
          "b2_value": 16.5525,
          "band": [
            12,
            17,
          ],
          "key": "pod",
        },
        {
          "b1_status": "ideal",
          "b1_value": 36.6001,
          "b2_status": "good",
          "b2_value": 41.2457,
          "band": [
            33,
            42,
          ],
          "key": "npac",
        },
        {
          "b1_status": "ideal",
          "b1_value": 50.6999,
          "b2_status": "good",
          "b2_value": 45.7962,
          "band": [
            45,
            54.5,
          ],
          "key": "ice_fraction",
        },
        {
          "b1_status": "good",
          "b1_value": 4.168,
          "b2_status": "good",
          "b2_value": 5.6265,
          "band": [
            4,
            6,
          ],
          "key": "lactose",
        },
        {
          "b1_status": "ideal",
          "b1_value": 6.0492,
          "b2_status": "good",
          "b2_value": 8.5694,
          "band": [
            5,
            9,
          ],
          "key": "lactose_sandiness_risk",
        },
        {
          "b1_status": "needs_correction",
          "b1_value": 3.867,
          "b2_status": "good",
          "b2_value": 5.1043,
          "band": [
            5,
            12,
          ],
          "key": "fat",
        },
        {
          "b1_status": "good",
          "b1_value": 3.258,
          "b2_status": "ideal",
          "b2_value": 4.1428,
          "band": [
            3,
            6,
          ],
          "key": "aerating_protein",
        },
        {
          "b1_status": "ideal",
          "b1_value": 10.4766,
          "b2_status": "ideal",
          "b2_value": 12.063,
          "band": [
            9,
            13,
          ],
          "key": "protein_in_solids",
        },
        {
          "b1_status": "good",
          "b1_value": 31.098,
          "b2_status": "ideal",
          "b2_value": 34.3428,
          "band": [
            31,
            45,
          ],
          "key": "total_solids",
        },
        {
          "b1_status": "good",
          "b1_value": 68.902,
          "b2_status": "ideal",
          "b2_value": 65.6572,
          "band": [
            57,
            70,
          ],
          "key": "water",
        },
        {
          "b1_status": "good",
          "b1_value": 0,
          "b2_status": "good",
          "b2_value": 0,
          "band": [
            0,
            2.5,
          ],
          "key": "alcohol",
        },
      ]
    `);
  });
});
