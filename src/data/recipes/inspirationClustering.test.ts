import { describe, expect, it } from 'vitest';
import { FLAVOR_CATALOGUE } from './flavorCatalogue';
import {
  MAX_INITIAL_DISCOVERY_CARDS,
  clusterFlavorInspirations,
  customerFacingInspirationFamilies,
  customerInspirationFamilyId,
  initialDiscoveryFamilies,
  inspirationFamilyId,
  searchInspirationFamilies,
} from './inspirationClustering';

describe('2500 inspiration discovery tree', () => {
  const families = clusterFlavorInspirations();

  it('clusters every source row exactly once without deleting or duplicating data', () => {
    expect(FLAVOR_CATALOGUE).toHaveLength(2500);
    expect(families.reduce((sum, family) => sum + family.count, 0)).toBe(2500);
    expect(
      new Set(families.flatMap((family) => family.entries.map((entry) => entry.flavorCode))).size,
    ).toBe(2500);
  });

  it('never renders a 2500-card dump on entry', () => {
    const suggestions = initialDiscoveryFamilies(customerFacingInspirationFamilies());
    expect(suggestions).toHaveLength(MAX_INITIAL_DISCOVERY_CARDS);
    expect(MAX_INITIAL_DISCOVERY_CARDS).toBeLessThanOrEqual(6);
    expect(suggestions.map((family) => family.id)).not.toEqual(
      [...families]
        .sort((a, b) => b.count - a.count)
        .slice(0, MAX_INITIAL_DISCOVERY_CARDS)
        .map((family) => family.id),
    );
  });

  it('offers at most ten curated directions per family and preserves a long tail', () => {
    for (const family of families) {
      expect(family.directions.length).toBeLessThanOrEqual(10);
      expect(family.longTailCount).toBe(family.count - family.directions.length);
    }
    expect(families.some((family) => family.longTailCount > 0)).toBe(true);
  });

  it('uses ingredient-led families and keeps branded inspirations distinct', () => {
    const strawberry = FLAVOR_CATALOGUE.find((entry) => entry.flavorName.startsWith('Strawberry'))!;
    const branded = FLAVOR_CATALOGUE.find((entry) => entry.category === 'Branded Confectionery')!;
    expect(inspirationFamilyId(strawberry)).toBe('strawberry');
    expect(inspirationFamilyId(branded)).toBe('confectionery');
  });

  it('supports accent-insensitive mobile search', () => {
    const customerFamilies = customerFacingInspirationFamilies();
    expect(
      searchInspirationFamilies('pistacja', customerFamilies).some(
        (family) => family.id === 'pistachio',
      ),
    ).toBe(true);
    expect(
      searchInspirationFamilies('czekolada', customerFamilies).some(
        (family) => family.id === 'chocolate',
      ),
    ).toBe(true);
  });

  it('keeps Protein as a product filter and technical buckets out of customer families', () => {
    expect(families.some((family) => family.id === 'protein')).toBe(true);
    const customerFamilies = customerFacingInspirationFamilies();
    expect(customerFamilies.map((family) => family.id)).not.toEqual(
      expect.arrayContaining(['protein', 'aromatic', 'other']),
    );

    const proteinFamilies = customerFacingInspirationFamilies('protein');
    expect(proteinFamilies.length).toBeGreaterThan(0);
    expect(proteinFamilies.every((family) => family.id !== 'protein')).toBe(true);
    expect(
      proteinFamilies
        .flatMap((family) => family.entries)
        .every((entry) => entry.supportedVisibleTypes.includes('protein')),
    ).toBe(true);
  });

  it('resolves a technical Protein row to concrete flavour language when available', () => {
    const proteinChocolate = FLAVOR_CATALOGUE.find(
      (entry) => entry.category === 'Protein' && /chocolate/i.test(entry.flavorName),
    );
    expect(proteinChocolate).toBeDefined();
    expect(customerInspirationFamilyId(proteinChocolate!)).toBe('chocolate');
  });

  it('does not introduce an Engine product family', () => {
    const allowed = new Set(['gelato', 'sorbet', 'vegan', 'protein']);
    for (const entry of FLAVOR_CATALOGUE) {
      expect(allowed.has(entry.visibleProductType)).toBe(true);
      expect(entry.supportedVisibleTypes.every((type) => allowed.has(type))).toBe(true);
    }
  });
});
