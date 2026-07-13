import { describe, expect, it } from 'vitest';
import {
  MAX_READY_RECIPE_MATCHES,
  matchReadyRecipes,
  selectReadyRecipe,
  type MatchLabel,
} from './readyRecipeMatching';
import { CATALOGUE_FIXTURES } from './__fixtures__/catalogueFixtures';

const ALLOWED_LABELS: readonly MatchLabel[] = [
  'closest_idea',
  'similar_flavor_profile',
  'matches_device',
  'vegan_version',
  'similar_base',
];

/* Acceptance test (6) */
describe('(6) ready-recipe route returns 5–6 deterministic cards with honest labels', () => {
  const query = { productType: 'gelato' as const, mainFlavorTag: 'vanilla' };

  it('returns between 5 and 6 available cards (never more than the max)', () => {
    const matches = matchReadyRecipes(query, CATALOGUE_FIXTURES);
    expect(matches.length).toBeGreaterThanOrEqual(5);
    expect(matches.length).toBeLessThanOrEqual(MAX_READY_RECIPE_MATCHES);
  });

  it('never offers a coming_soon card', () => {
    const matches = matchReadyRecipes(query, CATALOGUE_FIXTURES);
    expect(matches.map((m) => m.card.id)).not.toContain('cat-hazelnut-comingsoon');
    expect(matches.every((m) => m.card.availability === 'available')).toBe(true);
  });

  it('is deterministic — same query yields the same ordered ids', () => {
    const a = matchReadyRecipes(query, CATALOGUE_FIXTURES).map((m) => m.card.id);
    const b = matchReadyRecipes(query, CATALOGUE_FIXTURES).map((m) => m.card.id);
    expect(a).toEqual(b);
    // Best match first: exact flavor + product type.
    expect(a[0]).toBe('cat-vanilla-classic');
  });

  it('carries only honest labels — never a fabricated numeric percentage', () => {
    const matches = matchReadyRecipes(query, CATALOGUE_FIXTURES);
    for (const m of matches) {
      expect(ALLOWED_LABELS).toContain(m.label);
      expect(Array.isArray(m.matchedOn)).toBe(true);
      // The match shape carries no score/percentage/confidence number.
      expect('score' in m).toBe(false);
      expect('percentage' in m).toBe(false);
      expect('confidence' in m).toBe(false);
    }
    expect(matches[0]!.label).toBe('similar_flavor_profile');
  });

  it('labels a device-only match as matches_device and a vegan match as vegan_version', () => {
    const byDevice = matchReadyRecipes({ deviceId: 'ninja-creami' }, CATALOGUE_FIXTURES);
    expect(byDevice.some((m) => m.label === 'matches_device')).toBe(true);

    const byVegan = matchReadyRecipes({ requireVegan: true }, CATALOGUE_FIXTURES);
    expect(byVegan.some((m) => m.card.id === 'cat-vegan-chocolate' && m.label === 'vegan_version')).toBe(
      true,
    );
  });
});

/* Acceptance test (7) */
describe('(7) selecting a ready recipe creates a separate editable draft; catalogue stays immutable', () => {
  const source = CATALOGUE_FIXTURES.find((c) => c.id === 'cat-vanilla-classic')!;
  const snapshot = JSON.parse(JSON.stringify(source));

  it('preserves the source id and version on the working draft', () => {
    const draft = selectReadyRecipe(source);
    expect(draft.sourceRecipeId).toBe('cat-vanilla-classic');
    expect(draft.sourceVersion).toBe('v1');
    expect(draft.editable).toBe(true);
  });

  it('does not mutate the catalogue source when the draft is edited', () => {
    const draft = selectReadyRecipe(source);
    // Editing the draft must never leak back into the immutable catalogue card.
    draft.flavorTags.push('mutated');
    draft.dietaryTags.push('mutated');
    draft.title = 'edited working title';

    expect(source.flavorTags).toEqual(snapshot.flavorTags);
    expect(source.dietaryTags).toEqual(snapshot.dietaryTags);
    expect(source.title).toBe(snapshot.title);
    expect(source).toEqual(snapshot);
    // The draft holds its own arrays, not shared references.
    expect(draft.flavorTags).not.toBe(source.flavorTags);
  });
});
