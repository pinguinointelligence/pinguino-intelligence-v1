import { describe, expect, it } from 'vitest';
import { ALLOWED_ENGINE_FUNCTIONS } from './__fixtures__/allowedEngineFunctions';
import { APPENDIX_A_ITEMS } from './__fixtures__/golden/composition';
import { computeComposition } from './composition';
import { IDEAL_ZONE_FRACTION, TARGET_BANDS } from './config/targets';
import { estimateIceFraction } from './iceFraction';
import * as engine from './index';
import { computeRecipeNpac } from './pac';
import { computeRecipePod } from './pod';
import {
  classifyIndicator,
  classifyRecipeIndicators,
  classifyValue,
  computeLactoseSandinessRisk,
  selectTargetBand,
  type StatusInputs,
} from './statuses';
import type { TargetBand, TargetRange } from './types';

const MILK_BAND = TARGET_BANDS[0]!;
const POD_RANGE: TargetRange = { min: 12, max: 17 }; // center 14.5, half-width 2.5

const emptyInputs = (): StatusInputs => ({
  pod: null,
  npac: null,
  ice_fraction: null,
  lactose: null,
  lactose_sandiness_risk: null,
  fat: null,
  aerating_protein: null,
  protein_in_solids: null,
  total_solids: null,
  water: null,
  alcohol: null,
});

describe('classifyValue — band evaluation (spec §9, §12.7)', () => {
  it('band center classifies ideal; in-band near-edge classifies good', () => {
    expect(classifyValue(14.5, POD_RANGE, 'pod')).toBe('ideal');
    // ideal zone at fraction 0.6 = 14.5 ± 1.5 → [13.0, 16.0]
    expect(classifyValue(13.0, POD_RANGE, 'pod')).toBe('ideal'); // exactly on the zone edge
    expect(classifyValue(16.4, POD_RANGE, 'pod')).toBe('good'); // in band, outside zone
    expect(classifyValue(12.2, POD_RANGE, 'pod')).toBe('good');
  });

  it('the ideal zone fraction is configurable (calibration-pending config)', () => {
    expect(IDEAL_ZONE_FRACTION).toBe(0.6);
    expect(classifyValue(16.4, POD_RANGE, 'pod', { ideal_zone_fraction: 1 })).toBe('ideal');
    expect(classifyValue(14.6, POD_RANGE, 'pod', { ideal_zone_fraction: 0.01 })).toBe('good');
  });

  it('below range uses the correct low-side status', () => {
    expect(classifyValue(3, MILK_BAND.metrics.fat, 'fat')).toBe('needs_correction');
    expect(classifyValue(25, MILK_BAND.metrics.total_solids, 'total_solids')).toBe('risky');
  });

  it('above range uses the correct high-side status', () => {
    expect(classifyValue(75, MILK_BAND.metrics.water, 'water')).toBe('risky');
    expect(classifyValue(7, MILK_BAND.metrics.lactose, 'lactose')).toBe('risky');
  });
});

describe('directional rules (spec §12.7)', () => {
  it('POD high → too_sweet; POD low → too_weak', () => {
    expect(classifyValue(20, MILK_BAND.metrics.pod, 'pod')).toBe('too_sweet');
    expect(classifyValue(10, MILK_BAND.metrics.pod, 'pod')).toBe('too_weak');
  });

  it('NPAC high → too_soft; NPAC low → too_hard', () => {
    expect(classifyValue(45, MILK_BAND.metrics.npac, 'npac')).toBe('too_soft');
    expect(classifyValue(30, MILK_BAND.metrics.npac, 'npac')).toBe('too_hard');
  });

  it('ice fraction high → too_hard; ice fraction low → too_soft', () => {
    expect(classifyValue(60, MILK_BAND.metrics.ice_fraction, 'ice_fraction')).toBe('too_hard');
    expect(classifyValue(40, MILK_BAND.metrics.ice_fraction, 'ice_fraction')).toBe('too_soft');
  });

  it('alcohol above warn_above → risky; in-range alcohol is not risky', () => {
    expect(classifyValue(3.0, MILK_BAND.metrics.alcohol, 'alcohol')).toBe('risky');
    expect(classifyValue(1.0, MILK_BAND.metrics.alcohol, 'alcohol')).toBe('ideal');
  });

  it('sandiness risk is one-sided: above → risky, below → good', () => {
    const range = MILK_BAND.metrics.lactose_sandiness_risk; // 5–9
    expect(classifyValue(11, range, 'lactose_sandiness_risk')).toBe('risky');
    expect(classifyValue(2, range, 'lactose_sandiness_risk')).toBe('good');
  });
});

describe('missing values and missing bands (safety)', () => {
  it('missing value → needs_correction, no throw', () => {
    expect(classifyValue(null, POD_RANGE, 'pod')).toBe('needs_correction');
    expect(classifyValue(Number.NaN, POD_RANGE, 'pod')).toBe('needs_correction');
  });

  it('missing range → needs_correction, no throw', () => {
    expect(classifyValue(14.5, null, 'pod')).toBe('needs_correction');
    expect(classifyValue(14.5, undefined, 'pod')).toBe('needs_correction');
  });

  it('missing band selection → all indicators needs_correction with null bands', () => {
    const fruitOnly: TargetBand[] = [{ ...MILK_BAND, category: 'fruit_gelato' }];
    const indicators = classifyRecipeIndicators(
      { ...emptyInputs(), pod: 14.5 },
      'sorbet',
      -11,
      { bands: fruitOnly },
    );
    expect(indicators).toHaveLength(11);
    for (const indicator of indicators) {
      expect(indicator.status).toBe('needs_correction');
      expect(indicator.band).toBeNull();
      expect(indicator.band_status).toBeNull();
    }
  });
});

describe('target band selection — category- and temperature-aware', () => {
  const sorbetBand: TargetBand = {
    ...MILK_BAND,
    category: 'sorbet',
    status: 'estimated', // test-only band — NOT real calibration data
    metrics: { ...MILK_BAND.metrics, pod: { min: 18, max: 26 } },
  };

  it('uses the category-specific band when it exists', () => {
    const selection = selectTargetBand('sorbet', -11, [MILK_BAND, sorbetBand]);
    expect(selection!.band.category).toBe('sorbet');
    expect(selection!.category_fallback).toBe(false);
    expect(selection!.temperature_fallback).toBe(false);
    // POD 20 is in the sorbet band, not the milk band
    expect(classifyIndicator('pod', 20, selection).status).toBe('ideal');
  });

  it('unseeded category falls back to milk_gelato bands (calibration-pending fallback)', () => {
    const selection = selectTargetBand('nut_gelato', -11);
    expect(selection!.band.category).toBe('milk_gelato');
    expect(selection!.category_fallback).toBe(true);
  });

  it('non-anchored temperature uses the nearest band, flagged as fallback', () => {
    const selection = selectTargetBand('milk_gelato', -14);
    expect(selection!.band.temperature_c).toBe(-11);
    expect(selection!.temperature_fallback).toBe(true);
  });

  it('temperature ties resolve to the colder band (deterministic)', () => {
    const warm: TargetBand = { ...MILK_BAND, temperature_c: -10 };
    const cold: TargetBand = { ...MILK_BAND, temperature_c: -12 };
    const selection = selectTargetBand('milk_gelato', -11, [warm, cold]);
    expect(selection!.band.temperature_c).toBe(-12);
  });

  it('preserves seeded/estimated band status on indicators', () => {
    const seeded = classifyIndicator('pod', 14.5, selectTargetBand('milk_gelato', -11));
    expect(seeded.band_status).toBe('seeded');
    const estimated = classifyIndicator(
      'pod',
      20,
      selectTargetBand('sorbet', -11, [sorbetBand]),
    );
    expect(estimated.band_status).toBe('estimated');
  });
});

describe('computeLactoseSandinessRisk (calibration-pending working definition)', () => {
  it('computes lactose concentration relative to the water phase', () => {
    // Appendix A: 54.39 g lactose / 667.045 g water → ≈ 8.15, inside the 5–9 band
    const risk = computeLactoseSandinessRisk(54.39, 667.045);
    expect(risk).toBeCloseTo(8.1539, 3);
    expect(
      classifyValue(risk, MILK_BAND.metrics.lactose_sandiness_risk, 'lactose_sandiness_risk'),
    ).toBe('ideal');
  });

  it('is null-safe for invalid water', () => {
    expect(computeLactoseSandinessRisk(50, 0)).toBeNull();
    expect(computeLactoseSandinessRisk(50, -1)).toBeNull();
    expect(computeLactoseSandinessRisk(Number.NaN, 600)).toBeNull();
  });
});

describe('classifyRecipeIndicators — end-to-end (Appendix A arithmetic)', () => {
  // honest outcomes under the CURRENT uncalibrated config — arithmetic
  // statements, not quality claims (same caveat as the pac tests)
  it('classifies all 11 metrics in stable order from real pipeline values', () => {
    const { items, total_batch_g, totals, percentages } = computeComposition(APPENDIX_A_ITEMS);
    const npac = computeRecipeNpac(items, total_batch_g);
    const inputs: StatusInputs = {
      pod: computeRecipePod(items, total_batch_g),
      npac,
      ice_fraction: estimateIceFraction({
        npac,
        temperature_c: -11,
        category: 'milk_gelato',
      }),
      lactose: percentages.lactose_percent,
      lactose_sandiness_risk: computeLactoseSandinessRisk(totals.lactose_g, totals.water_g),
      fat: percentages.fat_percent,
      aerating_protein: percentages.protein_percent,
      protein_in_solids: (totals.protein_g / totals.solids_g) * 100,
      total_solids: percentages.solids_percent,
      water: percentages.water_percent,
      alcohol: percentages.alcohol_percent,
    };
    const indicators = classifyRecipeIndicators(inputs, 'milk_gelato', -11);
    expect(indicators).toHaveLength(11);
    expect(indicators.map((i) => i.key)).toEqual([
      'pod',
      'npac',
      'ice_fraction',
      'lactose',
      'lactose_sandiness_risk',
      'fat',
      'aerating_protein',
      'protein_in_solids',
      'total_solids',
      'water',
      'alcohol',
    ]);

    const byKey = Object.fromEntries(indicators.map((i) => [i.key, i]));
    expect(byKey['pod']!.status).toBe('ideal'); // 15.91 in 12–17
    expect(byKey['npac']!.status).toBe('too_hard'); // 25.03 below 33 under current config
    expect(byKey['ice_fraction']!.status).toBe('too_hard'); // consistent with low NPAC
    expect(byKey['lactose']!.status).toBe('ideal'); // 5.44 in 4–6
    expect(byKey['water']!.status).toBe('ideal'); // 66.70 in 57–70
    expect(byKey['alcohol']!.status).toBe('good'); // 0 at the band edge
    for (const indicator of indicators) {
      expect(indicator.band_status).toBe('seeded');
      expect(indicator.category_fallback).toBe(false);
      expect(indicator.temperature_fallback).toBe(false);
    }
  });

  it('is deterministic and does not mutate inputs', () => {
    const inputs: StatusInputs = { ...emptyInputs(), pod: 14.5, water: 66 };
    const snapshot = JSON.parse(JSON.stringify(inputs)) as unknown;
    const a = classifyRecipeIndicators(inputs, 'milk_gelato', -11);
    const b = classifyRecipeIndicators(inputs, 'milk_gelato', -11);
    expect(a).toEqual(b);
    expect(inputs).toEqual(snapshot);
  });
});

describe('scope guard (no scoring/corrections yet)', () => {
  it('creates no scoring or correction functions', () => {
    const allowed = new Set(ALLOWED_ENGINE_FUNCTIONS);
    const extraFunctions = Object.entries(engine)
      .filter(([name, value]) => typeof value === 'function' && !allowed.has(name))
      .map(([name]) => name);
    expect(extraFunctions).toEqual([]);
  });
});
