/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TEMPERATURE_REGULATOR_EVALUATION_VERSION,
  evaluateAcrossTemperatures,
  evaluateTemperatureRegulator,
  type BaseEngineMetrics,
} from './evaluateTemperatureRegulator';
import {
  findTemperatureRegulatorFixture,
  type TemperatureRegulatorGoldenFixture,
} from './temperatureRegulator';

/** Map a locked golden fixture's expected metrics into a Base Engine metric input. */
const metricsOf = (id: string, stabilizerGrams?: number): BaseEngineMetrics => {
  const fx = findTemperatureRegulatorFixture(id) as TemperatureRegulatorGoldenFixture;
  const e = fx.expected;
  return {
    npac: e.npac!,
    pod: e.pod!,
    iceFraction: e.iceFraction!,
    water: e.water!,
    solids: e.solids!,
    fat: e.fat,
    lactose: e.lactose,
    lactoseSanding: e.lactoseSanding,
    aeratingProtein: e.aeratingProtein,
    proteinShareInSolids: e.proteinShareInSolids,
    stabilizerGrams,
  };
};

/* ======================================================================== *
 * Each active profile at a supported serving temperature evaluates cleanly *
 * ======================================================================== */

describe('evaluateTemperatureRegulator — clean anchors pass at their own temperature', () => {
  it('Standard Gelato G12 at −11 °C is optimal and acceptable', () => {
    const r = evaluateTemperatureRegulator({
      productProfile: 'standard_gelato',
      servingTemperatureC: -11,
      metrics: metricsOf('G12', 1.9),
    });
    expect(r.evaluated).toBe(true);
    expect(r.blockedReason).toBeNull();
    expect(r.npacStatus).toBe('clean_center');
    expect(r.status).toBe('optimal');
    expect(r.acceptable).toBe(true);
    expect(r.hardGateFailures).toEqual([]);
    expect(r.correctionGoals).toEqual([]);
    expect(r.score).toBeGreaterThanOrEqual(90);
  });

  it('Standard Gelato G17 at −12 °C and G18 at −13 °C are optimal and acceptable', () => {
    const g17 = evaluateTemperatureRegulator({ productProfile: 'standard_gelato', servingTemperatureC: -12, metrics: metricsOf('G17', 1.9) });
    const g18 = evaluateTemperatureRegulator({ productProfile: 'standard_gelato', servingTemperatureC: -13, metrics: metricsOf('G18', 1.9) });
    expect(g17.status).toBe('optimal');
    expect(g17.acceptable).toBe(true);
    expect(g18.status).toBe('optimal');
    expect(g18.acceptable).toBe(true);
  });

  it('Sorbet S01/S02/S03 are each optimal and acceptable at their own temperature', () => {
    const cases: [string, -11 | -12 | -13][] = [
      ['S01', -11],
      ['S02', -12],
      ['S03', -13],
    ];
    for (const [id, temp] of cases) {
      const r = evaluateTemperatureRegulator({ productProfile: 'sorbet', servingTemperatureC: temp, metrics: metricsOf(id, 0.8) });
      expect(r.status, id).toBe('optimal');
      expect(r.acceptable, id).toBe(true);
      // dairy gates are disabled — no dairy metric was evaluated
      expect(r.trace.metricEvaluations.some((m) => m.gate === 'lactose'), id).toBe(false);
    }
  });

  it('Vegan V02 fixed at −13 °C is acceptable with no dairy-gate failure', () => {
    const r = evaluateTemperatureRegulator({ productProfile: 'vegan_gelato', servingTemperatureC: -13, metrics: metricsOf('V02_fixed', 1.9) });
    expect(r.status).toBe('optimal');
    expect(r.acceptable).toBe(true);
    expect(r.hardGateFailures).toEqual([]);
  });

  it('a clean Chocolate −13 °C recipe is optimal and acceptable (protein share advisory only)', () => {
    const cleanChocolate: BaseEngineMetrics = {
      npac: 51,
      pod: 16,
      iceFraction: 48,
      water: 60,
      solids: 42,
      fat: 9,
      lactose: 5,
      lactoseSanding: 7,
      aeratingProtein: 4,
      proteinShareInSolids: 10,
      stabilizerGrams: 1.9,
    };
    const r = evaluateTemperatureRegulator({ productProfile: 'chocolate_gelato', servingTemperatureC: -13, metrics: cleanChocolate });
    expect(r.status).toBe('optimal');
    expect(r.acceptable).toBe(true);
    expect(r.hardGateFailures).toEqual([]);
    expect(r.advisoryFlags).toEqual([]);
  });
});

/* ======================================================================== *
 * Unsupported profile / temperature is BLOCKED — never a fallback           *
 * ======================================================================== */

describe('evaluateTemperatureRegulator — unsupported inputs block, never remap', () => {
  it('an unsupported product profile blocks with unsupported_product_profile', () => {
    for (const bad of ['granita', 'protein_gelato', 'fresh', 'storage_minus18', 'gelato', '']) {
      const r = evaluateTemperatureRegulator({ productProfile: bad, servingTemperatureC: -12, metrics: metricsOf('G17', 1.9) });
      expect(r.evaluated, bad).toBe(false);
      expect(r.blockedReason, bad).toBe('unsupported_product_profile');
      expect(r.status, bad).toBe('invalid');
      expect(r.productProfile, bad).toBeNull(); // never remapped to a supported profile
      expect(r.servingTemperatureC, bad).toBeNull();
      expect(r.score, bad).toBe(0);
      expect(r.acceptable, bad).toBe(false);
    }
  });

  it('an unsupported serving temperature blocks with unsupported_serving_temperature', () => {
    for (const bad of [-18, -14, -10, 0, 11, Number.NaN]) {
      const r = evaluateTemperatureRegulator({ productProfile: 'standard_gelato', servingTemperatureC: bad, metrics: metricsOf('G17', 1.9) });
      expect(r.evaluated, String(bad)).toBe(false);
      expect(r.blockedReason, String(bad)).toBe('unsupported_serving_temperature');
      expect(r.servingTemperatureC, String(bad)).toBeNull(); // never remapped to −11/−12/−13
      expect(r.score, String(bad)).toBe(0);
    }
  });

  it('Granita is explicitly excluded at every serving temperature', () => {
    const across = evaluateAcrossTemperatures('granita', metricsOf('G17', 1.9));
    for (const temp of [-11, -12, -13] as const) {
      expect(across[temp].evaluated).toBe(false);
      expect(across[temp].blockedReason).toBe('unsupported_product_profile');
    }
  });
});

/* ======================================================================== *
 * Same formula, different temperature → same metrics, different verdict     *
 * ======================================================================== */

describe('evaluateTemperatureRegulator — one recipe across temperatures (docs §15)', () => {
  it('G17 is too soft at −11, optimal at −12, too hard at −13 (metrics unchanged)', () => {
    const metrics = metricsOf('G17', 1.9);
    const across = evaluateAcrossTemperatures('standard_gelato', metrics);
    expect(across[-11].status).toBe('too_soft');
    expect(across[-11].acceptable).toBe(false);
    expect(across[-12].status).toBe('optimal');
    expect(across[-12].acceptable).toBe(true);
    expect(across[-13].status).toBe('too_hard');
    expect(across[-13].acceptable).toBe(false);
  });

  it('G12 (−11 clean) reads too hard at both −12 and −13', () => {
    const across = evaluateAcrossTemperatures('standard_gelato', metricsOf('G12', 1.9));
    expect(across[-11].status).toBe('optimal');
    expect(across[-12].status).toBe('too_hard');
    expect(across[-13].status).toBe('too_hard');
  });

  it('Sorbet S02 (−12 clean) is too hard at −11 read? no — too soft at −11, too hard at −13', () => {
    const across = evaluateAcrossTemperatures('sorbet', metricsOf('S02', 0.8));
    expect(across[-11].status).toBe('too_soft'); // NPAC 44.18 above the −11 band [35,40]
    expect(across[-12].status).toBe('optimal');
    expect(across[-13].status).toBe('too_hard'); // below the −13 band [48,55]
  });
});

/* ======================================================================== *
 * Locked doc §14 hard rules — NPAC alone is never enough                    *
 * ======================================================================== */

describe('evaluateTemperatureRegulator — §14 hard rules', () => {
  it('C01 fixed: NPAC is in-band yet the recipe is NOT acceptable (ice/water broken)', () => {
    const r = evaluateTemperatureRegulator({ productProfile: 'chocolate_gelato', servingTemperatureC: -13, metrics: metricsOf('C01_fixed', 1.9) });
    expect(r.npacStatus).toBe('clean_center'); // NPAC 54.08 in the clean center
    expect(r.status).toBe('optimal'); // texture verdict follows NPAC…
    expect(r.acceptable).toBe(false); // …but the recipe is rejected on hard gates
    expect(r.hardGateFailures).toEqual(expect.arrayContaining(['ice_fraction', 'water', 'total_solids']));
    expect(r.correctionGoals).toEqual(expect.arrayContaining(['increase_ice_fraction', 'increase_water', 'decrease_solids']));
    // protein share is advisory only — never a hard failure for chocolate
    expect(r.hardGateFailures).not.toContain('protein_share_in_solids');
    expect(r.advisoryFlags).toContain('protein_share_below_hard_minimum');
  });

  it('C01 optimized: NPAC in-band but lactose sanding above 9 blocks acceptance', () => {
    const r = evaluateTemperatureRegulator({ productProfile: 'chocolate_gelato', servingTemperatureC: -13, metrics: metricsOf('C01_optimized', 1.74) });
    expect(r.npacStatus).toBe('clean_center');
    expect(r.acceptable).toBe(false);
    expect(r.hardGateFailures).toContain('lactose_sanding');
    expect(r.correctionGoals).toContain('reduce_lactose_sanding');
  });

  it('stabilizer 0 g is never accepted and emits restore_stabilizer (docs §14 / Test 5)', () => {
    const clean = metricsOf('G17', 0); // otherwise-clean −12 reference, but 0 g stabilizer
    const r = evaluateTemperatureRegulator({ productProfile: 'standard_gelato', servingTemperatureC: -12, metrics: clean });
    expect(r.npacStatus).toBe('clean_center');
    expect(r.acceptable).toBe(false);
    expect(r.hardGateFailures).toContain('stabilizer');
    expect(r.correctionGoals).toContain('restore_stabilizer');
  });

  it('unreported stabilizer is a warning, not a hard failure', () => {
    const r = evaluateTemperatureRegulator({ productProfile: 'standard_gelato', servingTemperatureC: -12, metrics: metricsOf('G17') });
    expect(r.warnings).toContain('stabilizer_not_reported');
    expect(r.hardGateFailures).not.toContain('stabilizer');
    expect(r.acceptable).toBe(true);
  });

  it('V01 rejected fails Vegan −13 on low NPAC, low solids and high water', () => {
    const r = evaluateTemperatureRegulator({ productProfile: 'vegan_gelato', servingTemperatureC: -13, metrics: metricsOf('V01_rejected', 1.9) });
    expect(r.status).toBe('too_hard'); // NPAC 32.91 below the −13 band
    expect(r.acceptable).toBe(false);
    expect(r.hardGateFailures).toEqual(expect.arrayContaining(['npac', 'total_solids', 'water']));
    expect(r.correctionGoals).toEqual(expect.arrayContaining(['increase_npac', 'increase_solids', 'decrease_water']));
  });
});

/* ======================================================================== *
 * Advisory gates are never escalated to hard fails, even on invalid input    *
 * ======================================================================== */

describe('evaluateTemperatureRegulator — advisory gate never becomes a hard fail', () => {
  it('a negative Chocolate protein share stays advisory (never a hard fail) and is flagged invalid', () => {
    const r = evaluateTemperatureRegulator({
      productProfile: 'chocolate_gelato',
      servingTemperatureC: -13,
      metrics: {
        npac: 51, // clean_center in band [49,57] / cleanCenter [49.8,54.1]
        pod: 16,
        iceFraction: 48,
        water: 60,
        solids: 42,
        fat: 9,
        lactose: 5,
        lactoseSanding: 7,
        aeratingProtein: 4,
        proteinShareInSolids: -1, // invalid — but protein share is ADVISORY for chocolate
        stabilizerGrams: 1.9,
      },
    });
    expect(r.npacStatus).toBe('clean_center');
    expect(r.hardGateFailures).not.toContain('protein_share_in_solids');
    expect(r.advisoryFlags).toContain('protein_share_below_hard_minimum');
    expect(r.warnings).toContain('invalid_metric_value:proteinShareInSolids');
    // acceptance is governed by NPAC + real hard gates — the advisory gate can never flip it
    expect(r.acceptable).toBe(true);
  });

  it('a negative HARD metric (water) is still a hard fail and flagged invalid', () => {
    const r = evaluateTemperatureRegulator({
      productProfile: 'standard_gelato',
      servingTemperatureC: -12,
      metrics: { ...metricsOf('G17', 1.9), water: -5 },
    });
    expect(r.hardGateFailures).toContain('water');
    expect(r.warnings).toContain('invalid_metric_value:water');
    expect(r.acceptable).toBe(false);
  });
});

/* ======================================================================== *
 * Firm / soft acceptable band — the middle of the §12 status model          *
 * ======================================================================== */

describe('evaluateTemperatureRegulator — firm/soft acceptable band', () => {
  it('NPAC on the firm side of the band is firm_side_acceptable and still acceptable', () => {
    const r = evaluateTemperatureRegulator({
      productProfile: 'standard_gelato',
      servingTemperatureC: -12,
      metrics: { ...metricsOf('G17', 1.9), npac: 43 }, // in band [42,50], below cleanCenter [45,46.2]
      texturePreference: 'firm',
    });
    expect(r.npacStatus).toBe('firm_side');
    expect(r.status).toBe('firm_side_acceptable');
    expect(r.acceptable).toBe(true);
    expect(r.trace.textureAligned).toBe(true); // firm preference aligns with the firm side
  });

  it('NPAC on the soft side of the band is soft_side_acceptable and still acceptable', () => {
    const r = evaluateTemperatureRegulator({
      productProfile: 'standard_gelato',
      servingTemperatureC: -12,
      metrics: { ...metricsOf('G17', 1.9), npac: 47 }, // in band [42,50], above cleanCenter [45,46.2]
      texturePreference: 'soft',
    });
    expect(r.npacStatus).toBe('soft_side');
    expect(r.status).toBe('soft_side_acceptable');
    expect(r.acceptable).toBe(true);
    expect(r.trace.textureAligned).toBe(true); // soft preference aligns with the soft side
  });
});

/* ======================================================================== *
 * Disabled dairy gates — sorbet & vegan never fail on dairy metrics         *
 * ======================================================================== */

describe('evaluateTemperatureRegulator — disabled dairy gates', () => {
  it('Sorbet with lactose 0 / sanding 0 is still acceptable (dairy gates disabled)', () => {
    const r = evaluateTemperatureRegulator({
      productProfile: 'sorbet',
      servingTemperatureC: -12,
      metrics: { ...metricsOf('S02', 0.8), lactose: 0, lactoseSanding: 0, proteinShareInSolids: 0 },
    });
    expect(r.acceptable).toBe(true);
    expect(r.hardGateFailures).not.toContain('lactose');
    expect(r.hardGateFailures).not.toContain('lactose_sanding');
  });

  it('Vegan with lactose 0 / dairy protein 0 is still acceptable (docs §15 Test 5)', () => {
    const r = evaluateTemperatureRegulator({
      productProfile: 'vegan_gelato',
      servingTemperatureC: -13,
      metrics: { ...metricsOf('V02_fixed', 1.9), lactose: 0, lactoseSanding: 0, aeratingProtein: 0, proteinShareInSolids: 0 },
    });
    expect(r.acceptable).toBe(true);
    expect(r.hardGateFailures).toEqual([]);
  });
});

/* ======================================================================== *
 * Correction-goal vocabulary fidelity (per-doc §13 terms)                   *
 * ======================================================================== */

describe('evaluateTemperatureRegulator — per-profile correction-goal vocabulary', () => {
  it('Standard Gelato says reduce_pod (not decrease_pod) for high POD', () => {
    const r = evaluateTemperatureRegulator({
      productProfile: 'standard_gelato',
      servingTemperatureC: -12,
      metrics: { ...metricsOf('G17', 1.9), pod: 19 }, // above the [12,17] band
    });
    expect(r.correctionGoals).toContain('reduce_pod');
    expect(r.correctionGoals).not.toContain('decrease_pod');
  });

  it('Sorbet says decrease_pod for high POD', () => {
    const r = evaluateTemperatureRegulator({
      productProfile: 'sorbet',
      servingTemperatureC: -12,
      metrics: { ...metricsOf('S02', 0.8), pod: 26 }, // above the [15,25] band
    });
    expect(r.correctionGoals).toContain('decrease_pod');
    expect(r.correctionGoals).not.toContain('reduce_pod');
  });

  it('Standard Gelato has no water correction goal — water miss is a hard fail without a water goal', () => {
    const r = evaluateTemperatureRegulator({
      productProfile: 'standard_gelato',
      servingTemperatureC: -11,
      metrics: { ...metricsOf('G12', 1.9), water: 72 }, // above the [57,70] band
    });
    expect(r.hardGateFailures).toContain('water');
    expect(r.correctionGoals).not.toContain('increase_water');
    expect(r.correctionGoals).not.toContain('decrease_water');
  });
});

/* ======================================================================== *
 * Texture is advisory; structural gates are explicitly not evaluated        *
 * ======================================================================== */

describe('evaluateTemperatureRegulator — texture advisory + structural gates', () => {
  it('texture preference never changes acceptance — only trace.textureAligned', () => {
    const base = { productProfile: 'standard_gelato', servingTemperatureC: -12 as const, metrics: metricsOf('G17', 1.9) };
    const medium = evaluateTemperatureRegulator({ ...base, texturePreference: 'medium' });
    const firm = evaluateTemperatureRegulator({ ...base, texturePreference: 'firm' });
    expect(medium.acceptable).toBe(firm.acceptable);
    expect(medium.hardGateFailures).toEqual(firm.hardGateFailures);
    expect(medium.trace.textureAligned).toBe(true); // NPAC is clean_center
    expect(firm.trace.textureAligned).toBe(false); // firm wanted the lower side
  });

  it('structural / fruit / plant / cocoa gates are listed as not evaluated by the regulator', () => {
    const gelato = evaluateTemperatureRegulator({ productProfile: 'standard_gelato', servingTemperatureC: -12, metrics: metricsOf('G17', 1.9) });
    expect(gelato.trace.structuralGatesNotEvaluated).toContain('alcohol');
    const sorbet = evaluateTemperatureRegulator({ productProfile: 'sorbet', servingTemperatureC: -12, metrics: metricsOf('S02', 0.8) });
    expect(sorbet.trace.structuralGatesNotEvaluated).toContain('fruit_water_sugar_balance');
    const vegan = evaluateTemperatureRegulator({ productProfile: 'vegan_gelato', servingTemperatureC: -13, metrics: metricsOf('V02_fixed', 1.9) });
    expect(vegan.trace.structuralGatesNotEvaluated).toContain('plant_base_structure');
    const chocolate = evaluateTemperatureRegulator({ productProfile: 'chocolate_gelato', servingTemperatureC: -13, metrics: metricsOf('C01_optimized', 1.74) });
    expect(chocolate.trace.structuralGatesNotEvaluated).toContain('chocolate_cocoa_solids_behavior');
  });
});

/* ======================================================================== *
 * Purity: no engine, no mutation, deterministic                             *
 * ======================================================================== */

describe('evaluateTemperatureRegulator — purity + Base Engine untouched', () => {
  it('never mutates the input metrics and is deterministic', () => {
    const metrics = metricsOf('G17', 1.9);
    const snapshot = JSON.parse(JSON.stringify(metrics));
    Object.freeze(metrics);
    const a = evaluateTemperatureRegulator({ productProfile: 'standard_gelato', servingTemperatureC: -12, metrics });
    const b = evaluateTemperatureRegulator({ productProfile: 'standard_gelato', servingTemperatureC: -12, metrics });
    expect(metrics).toEqual(snapshot); // input untouched (the Base Engine result is never rewritten)
    expect(a).toEqual(b); // deterministic
  });

  it('scores stay within [0,100] and carry the evaluation version', () => {
    expect(TEMPERATURE_REGULATOR_EVALUATION_VERSION).toBe('0.1.0');
    for (const [profile, temp, id, stab] of [
      ['standard_gelato', -12, 'G17', 1.9],
      ['sorbet', -13, 'S03', 0.8],
      ['vegan_gelato', -13, 'V01_rejected', 1.9],
      ['chocolate_gelato', -13, 'C01_fixed', 1.9],
    ] as const) {
      const r = evaluateTemperatureRegulator({ productProfile: profile, servingTemperatureC: temp, metrics: metricsOf(id, stab) });
      expect(r.score, id).toBeGreaterThanOrEqual(0);
      expect(r.score, id).toBeLessThanOrEqual(100);
      expect(r.trace.evaluationVersion, id).toBe('0.1.0');
    }
  });

  it('the module imports no engine and calls no calculateRecipe (interpretation layer only)', () => {
    const src = readFileSync(join(resolve(import.meta.dirname), 'evaluateTemperatureRegulator.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(/from\s+['"][^'"]*engine/i.test(src)).toBe(false);
    expect(/calculateRecipe/.test(src)).toBe(false);
    expect(/@\/engine/.test(src)).toBe(false);
  });
});
