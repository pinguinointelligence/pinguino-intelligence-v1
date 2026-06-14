import { describe, expect, it } from 'vitest';
import type { PendingFixture } from './schema';
import { GOLDEN_FIXTURES } from './golden';
import {
  EXTERNAL_REFERENCE_FIXTURES,
  externalReferenceMilkBase,
  externalReferenceRaspberryPremium,
} from './externalReference';

const REQUIRED_NAMES = [
  'chocolate',
  'raspberry',
  'apple',
  'banana',
  'honey',
  'dry-glucose-syrup-39de',
  'liquid-glucose-syrup',
  'inulin',
  'alcohol-jim-beam',
  'mascarpone',
  'pistachio-paste',
];

describe('external calibration fixtures (spec §16)', () => {
  it('contains exactly the 11 required fixtures', () => {
    expect(EXTERNAL_REFERENCE_FIXTURES.map((f) => f.name).sort()).toEqual([...REQUIRED_NAMES].sort());
  });

  it('all fixtures are pending until real data arrives — none active, none invented', () => {
    for (const fixture of EXTERNAL_REFERENCE_FIXTURES) {
      expect(fixture.status, fixture.name).toBe('pending');
    }
  });

  it('uses the correct fixture kinds (4 recipe / 7 ingredient)', () => {
    const recipes = EXTERNAL_REFERENCE_FIXTURES.filter((f) => f.kind === 'recipe').map((f) => f.name);
    const ingredients = EXTERNAL_REFERENCE_FIXTURES.filter((f) => f.kind === 'ingredient').map((f) => f.name);
    expect(recipes.sort()).toEqual(['apple', 'banana', 'chocolate', 'raspberry']);
    expect(ingredients).toHaveLength(7);
  });

  it('pending fixtures conform to the schema', () => {
    const sample = {
      kind: 'recipe',
      name: 'sample',
      status: 'pending',
      notes: 'schema contract check',
    } satisfies PendingFixture;
    expect(sample.status).toBe('pending');
  });
});

describe('first active external reference fixture (Step 5D.2)', () => {
  it('milk base is a valid ACTIVE recipe fixture, separate from the 11 placeholders', () => {
    expect(externalReferenceMilkBase.status).toBe('active');
    expect(externalReferenceMilkBase.kind).toBe('recipe');
    expect(externalReferenceMilkBase.category).toBe('milk_gelato');
    expect(externalReferenceMilkBase.temperature_c).toBe(-11);
    // it is NOT part of the placeholder list (that list must stay 11 pending)
    expect(EXTERNAL_REFERENCE_FIXTURES.map((f) => f.name)).not.toContain(
      externalReferenceMilkBase.name,
    );
  });

  it('carries the 7 verified ingredient lines with grams summing to ~1000 g', () => {
    expect(externalReferenceMilkBase.input).toHaveLength(7);
    const total = externalReferenceMilkBase.input.reduce((sum, line) => sum + line.grams, 0);
    expect(total).toBeCloseTo(1000, 0);
    for (const line of externalReferenceMilkBase.input) {
      expect(line.grams).toBeGreaterThan(0);
      expect(line.composition).toBeDefined();
    }
  });
});

describe('second active external reference fixture (Step 5D.3)', () => {
  it('raspberry premium is a valid ACTIVE fruit_gelato fixture, distinct from the placeholders and milk base', () => {
    expect(externalReferenceRaspberryPremium.status).toBe('active');
    expect(externalReferenceRaspberryPremium.kind).toBe('recipe');
    expect(externalReferenceRaspberryPremium.category).toBe('fruit_gelato');
    expect(externalReferenceRaspberryPremium.temperature_c).toBe(-11);
    // distinct name from the milk base and from every placeholder
    expect(externalReferenceRaspberryPremium.name).not.toBe(externalReferenceMilkBase.name);
    expect(EXTERNAL_REFERENCE_FIXTURES.map((f) => f.name)).not.toContain(
      externalReferenceRaspberryPremium.name,
    );
  });

  it('carries the 8 verified ingredient lines with grams summing to ~1000 g', () => {
    expect(externalReferenceRaspberryPremium.input).toHaveLength(8);
    const total = externalReferenceRaspberryPremium.input.reduce((sum, line) => sum + line.grams, 0);
    expect(total).toBeCloseTo(1000, 0);
    for (const line of externalReferenceRaspberryPremium.input) {
      expect(line.grams).toBeGreaterThan(0);
      expect(line.composition).toBeDefined();
    }
  });

  it('does NOT activate the pending "raspberry" placeholder (it stays pending)', () => {
    const placeholder = EXTERNAL_REFERENCE_FIXTURES.find((f) => f.name === 'raspberry');
    expect(placeholder?.status).toBe('pending');
  });
});

describe('golden fixtures (structure only in Step 4B)', () => {
  it('exports a typed, empty array — no invented verified production recipes', () => {
    expect(Array.isArray(GOLDEN_FIXTURES)).toBe(true);
    expect(GOLDEN_FIXTURES).toHaveLength(0);
  });
});
