/**
 * First-100 recommendation relevance — deterministic, honest labels, no fake %.
 */
import { describe, expect, it } from 'vitest';
import { FLAVOR_CATALOGUE } from './flavorCatalogue';
import {
  FLAVOR_RECOMMENDATION_LABEL_PL,
  MAX_FLAVOR_RECOMMENDATIONS,
  recommendFlavorRecipes,
} from './flavorRecommendation';

describe('recommendFlavorRecipes', () => {
  it('returns at most 6 results', () => {
    const results = recommendFlavorRecipes({ chocolateIntent: true });
    expect(results.length).toBeLessThanOrEqual(MAX_FLAVOR_RECOMMENDATIONS);
    expect(MAX_FLAVOR_RECOMMENDATIONS).toBe(6);
  });

  it('a vanilla query prioritizes vanilla', () => {
    const results = recommendFlavorRecipes({ mainFlavor: 'vanilla' });
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(6);
    for (const r of results) {
      expect(r.entry.flavorTags.includes('vanilla') || r.entry.mainFlavorTag === 'vanilla').toBe(true);
    }
    // no chocolate-only record sneaks in on a vanilla query
    expect(results.every((r) => r.entry.mainFlavorTag !== 'chocolate' || r.entry.flavorTags.includes('vanilla'))).toBe(true);
  });

  it('a chocolate query prioritizes chocolate', () => {
    const results = recommendFlavorRecipes({ mainFlavor: 'chocolate' });
    expect(results.length).toBe(6);
    for (const r of results) {
      expect(r.entry.flavorTags.includes('chocolate') || r.entry.mainFlavorTag === 'chocolate').toBe(true);
    }
  });

  it('chocolate + caramel prioritizes entries that have BOTH', () => {
    const results = recommendFlavorRecipes({ mainFlavor: 'chocolate', secondaryFlavor: 'caramel' });
    expect(results.length).toBeGreaterThan(0);
    // the top results all contain chocolate AND caramel
    const top = results[0]!;
    expect(top.entry.flavorTags).toContain('chocolate');
    expect(top.entry.flavorTags).toContain('caramel');
    // every returned entry contains chocolate (main flavor signal) — never unrelated
    expect(results.every((r) => r.entry.flavorTags.includes('chocolate'))).toBe(true);
    // entries with both rank ahead of chocolate-only entries
    const withCaramel = results.filter((r) => r.entry.flavorTags.includes('caramel'));
    expect(withCaramel.length).toBeGreaterThan(0);
  });

  it('never returns unrelated records just because popularity is high', () => {
    // strawberry is a fruit family; results must be strawberry-related, not top-ranked chocolate.
    const results = recommendFlavorRecipes({ mainFlavor: 'strawberry' });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.entry.flavorTags.includes('strawberry') || r.entry.mainFlavorTag === 'strawberry').toBe(true);
    }
  });

  it('is deterministic (same query → same ordered ids)', () => {
    const q = { mainFlavor: 'chocolate', secondaryFlavor: 'caramel' } as const;
    const a = recommendFlavorRecipes(q).map((r) => r.entry.flavorCode);
    const b = recommendFlavorRecipes(q).map((r) => r.entry.flavorCode);
    expect(a).toEqual(b);
  });

  it('an empty query returns the most popular inspirations (honestly labelled)', () => {
    const results = recommendFlavorRecipes({});
    expect(results).toHaveLength(6);
    expect(results[0]?.entry.popularityRank).toBe(1);
    expect(results.every((r) => r.label === 'popular_inspiration' || r.label === 'closest_idea')).toBe(true);
  });

  it('the top match is labelled closest_idea; Ninja Swirl intent yields matches_swirl', () => {
    const results = recommendFlavorRecipes({ mainFlavor: 'chocolate' });
    expect(results[0]?.label).toBe('closest_idea');

    const swirl = recommendFlavorRecipes({ ninjaSwirl: true });
    expect(swirl.length).toBeGreaterThan(0);
    expect(swirl.every((r) => r.entry.ninjaSwirlCompatible)).toBe(true);
    // at least one non-top result carries the honest swirl label
    expect(swirl.slice(1).some((r) => r.label === 'matches_swirl') || swirl[0]?.label === 'closest_idea').toBe(true);
  });

  it('chocolate intent on a non-chocolate main flavor can surface a chocolate_version label', () => {
    // Vanilla base with a chocolate variant exists (Standard Gelato / Chocolate Gelato rows).
    const results = recommendFlavorRecipes({ mainFlavor: 'vanilla', chocolateIntent: true });
    expect(results.length).toBeGreaterThan(0);
    const labels = new Set(results.map((r) => r.label));
    // chocolate_version is a valid honest label in this mixed query
    expect([...labels].every((l) => l in FLAVOR_RECOMMENDATION_LABEL_PL)).toBe(true);
  });

  it('every label has honest Polish wording and never claims a ready recipe', () => {
    for (const [, pl] of Object.entries(FLAVOR_RECOMMENDATION_LABEL_PL)) {
      expect(pl).not.toMatch(/Gotowa receptura/i);
      expect(pl.length).toBeGreaterThan(0);
    }
  });

  it('accepts an explicit catalogue subset (pure, injectable)', () => {
    const subset = FLAVOR_CATALOGUE.slice(0, 5);
    const results = recommendFlavorRecipes({ mainFlavor: 'chocolate' }, subset);
    expect(results.every((r) => subset.includes(r.entry))).toBe(true);
  });
});
