/**
 * VEGAN ENGINE v2 — derived classifier contract.
 *
 * Pins the deterministic rules AND the named false-positive exclusions from the
 * science audit §5.4. Every unresolved case must return `unknown` so the
 * baseline Vegan Engine keeps answering.
 */
import { describe, expect, it } from 'vitest';
import { deriveVeganBehavior } from './deriveVeganBehavior';
import {
  clearVeganBehaviorCache,
  hasDerivedStructuralEvidence,
  veganBehaviorForFacts,
  veganEnhancementLevel,
} from './veganBehaviorRuntime';
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

const behaviorOf = (identityText: string, overrides: Partial<VeganBehaviorFacts> = {}) =>
  deriveVeganBehavior(facts(identityText, overrides));

describe('fat functional taxonomy', () => {
  it('reads an EXPLICIT lauric solid-fat system from the fat-phase identity', () => {
    const fat = behaviorOf('REFINED COCONUT OIL · Elstar Fats Coconut · Dry', {
      fatPercent: 100,
    }).fat;
    expect(fat.functionalClass).toBe('lauric_solid_fat');
    expect(fat.source).toBe('coconut');
    expect(fat.evidence).toBe('EXPLICIT');
    expect(fat.amountPercent).toBe(100);
  });

  it('reads an EXPLICIT liquid vegetable oil and an EXPLICIT cocoa-butter system', () => {
    expect(behaviorOf('SUNFLOWER OIL · Fat', { fatPercent: 100 }).fat).toMatchObject({
      functionalClass: 'liquid_vegetable_oil',
      source: 'sunflower',
      evidence: 'EXPLICIT',
    });
    expect(behaviorOf('COCOA BUTTER · Fat · Dry', { fatPercent: 100 }).fat).toMatchObject({
      functionalClass: 'cocoa_butter_fat',
      source: 'cocoa_butter',
      evidence: 'EXPLICIT',
    });
  });

  it('INFERS the fat class from a source token only when a material fat phase corroborates', () => {
    expect(behaviorOf('COCONUT MILK · Beverage', { fatPercent: 17 }).fat).toMatchObject({
      functionalClass: 'lauric_solid_fat',
      evidence: 'DETERMINISTICALLY_INFERRED',
    });
    // no material fat → nothing to classify, baseline fallback
    expect(behaviorOf('COCONUT WATER · Beverage', { fatPercent: 0.1 }).fat).toMatchObject({
      functionalClass: 'unknown',
      evidence: 'UNKNOWN',
    });
  });

  it('classifies a nut/seed paste as a fat MATRIX, not a free fat phase', () => {
    expect(behaviorOf('PISTACHIO PASTE 100% · Nut', { fatPercent: 55 }).fat).toMatchObject({
      functionalClass: 'nut_fat_matrix',
      source: 'nut_or_seed',
      evidence: 'EXPLICIT',
    });
  });

  it('returns UNKNOWN when a fat phase exists but its source cannot be established', () => {
    const behavior = behaviorOf('VEGETABLE FAT BLEND · Fat', { fatPercent: 7 });
    expect(behavior.fat.amountPercent).toBe(7);
    expect(behavior.fat.amountEvidence).toBe('EXPLICIT');
    expect(behavior.fat.functionalClass).toBe('unknown');
    expect(behavior.fat.evidence).toBe('UNKNOWN');
    expect(behavior.reasons).toContain('fat_present_class_unknown');
  });

  it('reports a MIXED fat system when two distinct families are present', () => {
    expect(
      behaviorOf('COCONUT OIL AND SUNFLOWER OIL BLEND', { fatPercent: 100 }).fat,
    ).toMatchObject({ functionalClass: 'mixed_plant_fat', source: 'mixed', evidence: 'EXPLICIT' });
  });

  it('applies the audit §5.4 exclusions — lecithin, cocoa powder/mass, coconut sugar', () => {
    expect(behaviorOf('SUNFLOWER LECITHIN · Emulsifier', { fatPercent: 3 }).fat.evidence).toBe(
      'UNKNOWN',
    );
    expect(behaviorOf('COCOA POWDER 10-12% · Cocoa', { fatPercent: 11 }).fat.evidence).toBe(
      'UNKNOWN',
    );
    expect(behaviorOf('COCOA MASS · Cocoa', { fatPercent: 54 }).fat.evidence).toBe('UNKNOWN');
    expect(behaviorOf('COCONUT SUGAR · Sugar', { fatPercent: 1 }).fat.evidence).toBe('UNKNOWN');
  });
});

describe('protein functional taxonomy', () => {
  it('reads an EXPLICIT purified plant protein with its form when stated', () => {
    expect(
      behaviorOf('PEA PROTEIN ISOLATE · Protein · Dry', { proteinPercent: 84 }).protein,
    ).toMatchObject({
      source: 'pea',
      form: 'isolate',
      functionalClass: 'functional_plant_protein_isolate',
      evidence: 'EXPLICIT',
    });
    expect(
      behaviorOf('SOY PROTEIN CONCENTRATE · Protein', { proteinPercent: 70 }).protein,
    ).toMatchObject({ source: 'soy', form: 'concentrate', evidence: 'EXPLICIT' });
  });

  it('keeps the form UNKNOWN when the identity does not state it, without losing the class', () => {
    expect(
      behaviorOf('RICE PROTEIN · Protein · Dry', { proteinPercent: 83 }).protein,
    ).toMatchObject({
      source: 'rice',
      form: 'unknown',
      functionalClass: 'functional_plant_protein_isolate',
      evidence: 'EXPLICIT',
    });
  });

  it('INFERS a whole-food protein matrix from a plant drink carrying real protein', () => {
    expect(
      behaviorOf('SOY DRINK 0% ADDED SUGAR · Carrefour · UHT', { proteinPercent: 3.2 }).protein,
    ).toMatchObject({
      source: 'soy',
      form: 'whole_food_matrix',
      functionalClass: 'whole_food_plant_protein_matrix',
      evidence: 'DETERMINISTICALLY_INFERRED',
    });
  });

  it('returns UNKNOWN protein when the source cannot be established or the phase is immaterial', () => {
    expect(
      behaviorOf('OAT DRINK · Beverage · Chilled · BIO', { proteinPercent: 0.4 }).protein,
    ).toMatchObject({ functionalClass: 'unknown', evidence: 'UNKNOWN' });
    expect(
      behaviorOf('PLANT PROTEIN BLEND · Protein', { proteinPercent: 60 }).protein,
    ).toMatchObject({ functionalClass: 'unknown', evidence: 'UNKNOWN' });
  });

  it('applies the audit §5.4 protein exclusions — lecithin, rice syrup, soybean oil', () => {
    expect(behaviorOf('SOY LECITHIN · Emulsifier', { proteinPercent: 1 }).protein.evidence).toBe(
      'UNKNOWN',
    );
    expect(behaviorOf('RICE SYRUP · Sugar', { proteinPercent: 0.8 }).protein.evidence).toBe(
      'UNKNOWN',
    );
    expect(
      behaviorOf('SOYBEAN OIL · Fat', { proteinPercent: 1, fatPercent: 100 }).protein.evidence,
    ).toBe('UNKNOWN');
  });

  it('reports a MIXED plant protein system for a multi-source protein material', () => {
    expect(
      behaviorOf('PEA PROTEIN AND RICE PROTEIN BLEND', { proteinPercent: 80 }).protein,
    ).toMatchObject({ source: 'mixed', functionalClass: 'mixed_plant_protein' });
  });
});

describe('structural carbohydrates, hydrocolloids and emulsifiers stay DISTINCT', () => {
  it('classifies inulin as a structural carbohydrate and NEVER as a hydrocolloid', () => {
    const behavior = behaviorOf('INULIN · Fibre · Dry', { fiberPercent: 90 });
    expect(behavior.structuralCarbohydrates.map((entry) => entry.structuralClass)).toContain(
      'inulin',
    );
    expect(behavior.hydrocolloids).toHaveLength(0);
  });

  it('does not turn inulin into a hydrocolloid through its engine "stabilizer" category', () => {
    // The approved toolbox payload for Inulin carries `category: 'stabilizer'`.
    const behavior = behaviorOf('Inulin', { engineCategory: 'stabilizer', fiberPercent: 90 });
    expect(behavior.structuralCarbohydrates.map((entry) => entry.structuralClass)).toEqual([
      'inulin',
    ]);
    expect(behavior.hydrocolloids).toHaveLength(0);
  });

  it('classifies tara / guar / locust bean as hydrocolloids and not as structural carbohydrates', () => {
    for (const [identity, expected] of [
      ['TARA GUM · Stabilizer', 'tara'],
      ['GUAR GUM · Stabilizer', 'guar'],
      ['LOCUST BEAN GUM · Stabilizer', 'locust_bean'],
      ['XANTHAN GUM · Stabilizer', 'xanthan'],
    ] as const) {
      const behavior = behaviorOf(identity);
      expect(behavior.hydrocolloids.map((entry) => entry.hydrocolloidClass)).toEqual([expected]);
      expect(behavior.structuralCarbohydrates).toHaveLength(0);
    }
  });

  it('detects an oat matrix qualitatively and NEVER invents a β-glucan amount', () => {
    const behavior = behaviorOf('OAT DRINK · Beverage · Chilled · BIO', { fiberPercent: 0.8 });
    const classes = behavior.structuralCarbohydrates.map((entry) => entry.structuralClass);
    expect(classes).toContain('oat_matrix');
    expect(classes).not.toContain('beta_glucan_explicit');
    expect(behavior.structuralCarbohydrates.every((entry) => entry.amountPercent === null)).toBe(
      true,
    );
  });

  it('accepts β-glucan ONLY from a stated canonical quantity', () => {
    const behavior = behaviorOf('OAT BETA-GLUCAN CONCENTRATE', { betaGlucanPercent: 22 });
    const glucan = behavior.structuralCarbohydrates.find(
      (entry) => entry.structuralClass === 'beta_glucan_explicit',
    );
    expect(glucan).toMatchObject({ evidence: 'EXPLICIT', amountPercent: 22 });
  });

  it('records an unknown stabiliser identity as UNKNOWN evidence, never as a known system', () => {
    const behavior = behaviorOf('COMPOUND STABILIZER BLEND', { engineCategory: 'stabilizer' });
    expect(behavior.hydrocolloids).toEqual([
      { hydrocolloidClass: 'other_unknown', evidence: 'UNKNOWN' },
    ]);
  });

  it('classifies emulsifier evidence separately from the fat and protein phases', () => {
    expect(behaviorOf('SUNFLOWER LECITHIN · Emulsifier').emulsifiers).toEqual([
      { emulsifierClass: 'lecithin', evidence: 'EXPLICIT' },
    ]);
    expect(behaviorOf('MONO AND DIGLYCERIDES OF FATTY ACIDS E471').emulsifiers).toEqual([
      { emulsifierClass: 'mono_diglycerides', evidence: 'EXPLICIT' },
    ]);
  });
});

describe('determinism, memoisation and enhancement depth', () => {
  it('is deterministic — same facts in, identical behaviour out', () => {
    const input = facts('REFINED COCONUT OIL · Elstar Fats Coconut · Dry', { fatPercent: 100 });
    expect(deriveVeganBehavior(input)).toEqual(deriveVeganBehavior({ ...input }));
  });

  it('memoises without ever changing the answer', () => {
    const input = facts('PEA PROTEIN · Protein · Dry', { proteinPercent: 84 });
    clearVeganBehaviorCache();
    const cold = veganBehaviorForFacts(input);
    const warm = veganBehaviorForFacts({ ...input });
    expect(warm).toEqual(cold);
    clearVeganBehaviorCache();
    expect(veganBehaviorForFacts(input)).toEqual(cold);
  });

  it('reports BASELINE_FALLBACK when nothing could be derived', () => {
    const behavior = behaviorOf('UNSPECIFIED PLANT PREPARATION', { fatPercent: 7 });
    expect(hasDerivedStructuralEvidence(behavior)).toBe(false);
    expect(veganEnhancementLevel(behavior)).toBe('BASELINE_FALLBACK');
  });

  it('reports PARTIAL_ENHANCEMENT when one axis resolves and another stays unknown', () => {
    const behavior = behaviorOf('COCONUT OIL WITH ADDED PLANT PROTEIN', {
      fatPercent: 60,
      proteinPercent: 12,
    });
    expect(behavior.fat.evidence).toBe('EXPLICIT');
    expect(behavior.protein.evidence).toBe('UNKNOWN');
    expect(veganEnhancementLevel(behavior)).toBe('PARTIAL_ENHANCEMENT');
  });

  it('reports FULL_ENHANCEMENT when every materially present axis resolves', () => {
    expect(veganEnhancementLevel(behaviorOf('TARA GUM · Stabilizer'))).toBe('FULL_ENHANCEMENT');
  });
});
