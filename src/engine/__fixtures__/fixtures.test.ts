import { describe, expect, it } from 'vitest';
import type { PendingFixture } from './schema';
import { GOLDEN_FIXTURES } from './golden';
import { EXTERNAL_REFERENCE_FIXTURES } from './externalReference';

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

describe('golden fixtures (structure only in Step 4B)', () => {
  it('exports a typed, empty array — no invented verified production recipes', () => {
    expect(Array.isArray(GOLDEN_FIXTURES)).toBe(true);
    expect(GOLDEN_FIXTURES).toHaveLength(0);
  });
});
