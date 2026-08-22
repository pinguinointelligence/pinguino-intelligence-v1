/**
 * VEGAN ENGINE v2 — validation fixtures V1…V7 from the science audit §9.
 *
 * FIVE qualitative / architectural holdouts and TWO mechanistic-only fixtures.
 * ZERO numeric calibration fixtures — the evidence does not support any, so
 * Gellatti is NEVER asked to reproduce a process-dependent overrun, melting
 * rate or hardness number. What IS asserted is that the derived model can
 * DISTINGUISH the systems the controlled trials separated, and that the
 * architectural guards hold.
 *
 * No coefficient from any paper enters the runtime. No MyGelato number is used.
 */
import { describe, expect, it } from 'vitest';
import { deriveVeganBehavior } from './deriveVeganBehavior';
import type { VeganBehaviorFacts } from './veganBehaviorFacts';

const facts = (
  identityText: string,
  overrides: Partial<VeganBehaviorFacts> = {},
): VeganBehaviorFacts => ({
  identityKey: identityText,
  identityText,
  engineCategory: null,
  fatPercent: 0,
  proteinPercent: 0,
  fiberPercent: 0,
  betaGlucanPercent: null,
  stabilizerActivity: null,
  ...overrides,
});

const behaviorOf = (identity: string, overrides: Partial<VeganBehaviorFacts> = {}) =>
  deriveVeganBehavior(facts(identity, overrides));

describe('V1 — brown rice / pea / soy protein at identical 3.6 % protein (DOI 10.1002/fsn3.4494)', () => {
  it('distinguishes all three protein sources that the trial separated', () => {
    const rice = behaviorOf('BROWN RICE PROTEIN · Protein · Dry', { proteinPercent: 78 });
    const pea = behaviorOf('PEA PROTEIN ISOLATE · Protein · Dry', { proteinPercent: 80 });
    const soy = behaviorOf('SOY PROTEIN ISOLATE · Protein · Dry', { proteinPercent: 90 });
    expect([rice.protein.source, pea.protein.source, soy.protein.source]).toEqual([
      'rice',
      'pea',
      'soy',
    ]);
    for (const behavior of [rice, pea, soy]) {
      expect(behavior.protein.functionalClass).toBe('functional_plant_protein_isolate');
      expect(behavior.protein.evidence).toBe('EXPLICIT');
    }
  });

  it('does NOT encode the trial’s overrun / hardness / melting numbers as coefficients', () => {
    const pea = behaviorOf('PEA PROTEIN ISOLATE · Protein · Dry', { proteinPercent: 80 });
    // The behaviour carries classes and evidence — never a predicted quantity.
    expect(Object.keys(pea.protein).sort()).toEqual([
      'amountEvidence',
      'amountPercent',
      'evidence',
      'form',
      'functionalClass',
      'source',
    ]);
    expect(pea.protein.amountPercent).toBe(80);
  });
});

describe('V2 — sunflower vs coconut at matched fat (DOI 10.1111/ijfs.16493)', () => {
  it('separates the liquid oil and the lauric solid-fat system at identical fat %', () => {
    const sunflower = behaviorOf('SUNFLOWER OIL · Fat', { fatPercent: 9.89 });
    const coconut = behaviorOf('COCONUT OIL · Fat', { fatPercent: 9.89 });
    expect(sunflower.fat.functionalClass).toBe('liquid_vegetable_oil');
    expect(coconut.fat.functionalClass).toBe('lauric_solid_fat');
    expect(sunflower.fat.amountPercent).toBe(coconut.fat.amountPercent);
  });

  it('guards against an ADDITIVE per-fat-class coefficient — the class carries no modifier', () => {
    // The partial-coalescence direction REVERSES with protein composition
    // (839.67→1065.10 vs 51.65→13.47), so a fat effect that flips sign cannot
    // be represented as an additive modifier. The model therefore attaches no
    // numeric modifier to any fat class at all.
    const coconut = behaviorOf('COCONUT OIL · Fat', { fatPercent: 9.89 });
    expect(Object.keys(coconut.fat).sort()).toEqual([
      'amountEvidence',
      'amountPercent',
      'evidence',
      'functionalClass',
      'source',
    ]);
  });
});

describe('V3 — soy protein concentration is non-monotonic (DOI 10.1016/j.foohum.2025.100557)', () => {
  it('never derives a universal protein optimum, minimum or maximum from a source class', () => {
    const low = behaviorOf('SOY PROTEIN POWDER', { proteinPercent: 4 });
    const high = behaviorOf('SOY PROTEIN POWDER', { proteinPercent: 10 });
    // Same class at both concentrations: the model reports WHAT it is, never
    // how much of it "should" be there. Overrun peaks then collapses, so any
    // single optimum would be false precision.
    expect(low.protein.functionalClass).toBe(high.protein.functionalClass);
    expect(low.protein.source).toBe(high.protein.source);
    expect(low.protein.amountPercent).toBe(4);
    expect(high.protein.amountPercent).toBe(10);
  });
});

describe('V4 — fat SFC systems are mechanistic only (DOI 10.1007/s13197-022-05507-z)', () => {
  it('distinguishes fat families qualitatively without any SFC curve', () => {
    const classes = [
      behaviorOf('COCONUT OIL · Fat', { fatPercent: 100 }).fat.functionalClass,
      behaviorOf('COCOA BUTTER · Fat', { fatPercent: 100 }).fat.functionalClass,
      behaviorOf('SUNFLOWER OIL · Fat', { fatPercent: 100 }).fat.functionalClass,
      behaviorOf('HAZELNUT PASTE 100% · Nut', { fatPercent: 61 }).fat.functionalClass,
    ];
    expect(new Set(classes).size).toBe(4);
    // The paper reports no overrun and no hardness for a frozen dessert and
    // covers PKO/SBO/PS — not coconut, sunflower or cocoa butter. It supports a
    // qualitative family and nothing more.
  });
});

describe('V5 — NEGATIVE CONTROL: structural factors must not move ice (DOI 10.1111/jtxs.70035)', () => {
  it('exposes no ice, NPAC, crystal-size or freezing output of any kind', () => {
    const behavior = behaviorOf('TARA GUM · Stabilizer', { stabilizerActivity: 1 });
    const serialized = JSON.stringify(behavior);
    expect(serialized).not.toMatch(/ice|npac|crystal|freez|cryoscopic/i);
    expect(Object.keys(behavior).sort()).toEqual([
      'emulsifiers',
      'fat',
      'hydrocolloids',
      'identityKey',
      'modelVersion',
      'protein',
      'reasons',
      'structuralCarbohydrates',
    ]);
  });
});

describe('V6 — inulin and LBG are distinct classes with opposite signs (DOI 10.1016/j.lwt.2018.03.010)', () => {
  it('keeps inulin out of the hydrocolloid taxonomy entirely', () => {
    const inulin = behaviorOf('INULIN · Fibre', { fiberPercent: 90 });
    const lbg = behaviorOf('LOCUST BEAN GUM · Stabilizer');
    expect(inulin.structuralCarbohydrates.map((entry) => entry.structuralClass)).toEqual([
      'inulin',
    ]);
    expect(inulin.hydrocolloids).toEqual([]);
    expect(lbg.hydrocolloids.map((entry) => entry.hydrocolloidClass)).toEqual(['locust_bean']);
    expect(lbg.structuralCarbohydrates).toEqual([]);
  });

  it('does not transfer the paper’s dosage windows into Gellatti', () => {
    // Inulin 0.8–4.0 and LBG 0.2–0.8 g/100 g are one coconut-milk formulation,
    // not a universal window. The derived model carries no dosage at all — the
    // existing fail-closed inulin envelope and stabiliser dosage authority
    // remain the only dosage rules.
    const inulin = behaviorOf('INULIN · Fibre', { fiberPercent: 90 });
    expect(JSON.stringify(inulin)).not.toMatch(/dosage|min|max/i);
  });
});

describe('V7 — β-glucan is mechanistic only and dairy-mediated (DOI 10.3390/molecules28072924)', () => {
  it('builds no β-glucan term: an oat identity never yields a β-glucan class', () => {
    const oat = behaviorOf('OAT DRINK · Beverage', { fiberPercent: 0.8, proteinPercent: 0.4 });
    const classes = oat.structuralCarbohydrates.map((entry) => entry.structuralClass);
    expect(classes).toContain('oat_matrix');
    expect(classes).not.toContain('beta_glucan_explicit');
  });

  it('accepts β-glucan only as a stated quantity, never as a modelled effect', () => {
    const stated = behaviorOf('OAT BETA-GLUCAN 22%', { betaGlucanPercent: 22 });
    const entry = stated.structuralCarbohydrates.find(
      (candidate) => candidate.structuralClass === 'beta_glucan_explicit',
    );
    expect(entry).toEqual({
      structuralClass: 'beta_glucan_explicit',
      evidence: 'EXPLICIT',
      amountPercent: 22,
    });
  });
});
