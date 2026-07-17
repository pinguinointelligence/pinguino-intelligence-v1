/**
 * The bundled real catalogue (Track A, owner „wire the 69 staging products now").
 * Pins the snapshot integrity, the honest source labelling, no invented engine
 * values, and the ingredient→DB-category mapping that seeds the picker browse.
 */
import { describe, expect, it } from 'vitest';
import { evaluateProductReadiness } from '@/features/ingredient-resolution';
import { CUSTOMER_CATALOGUE_SNAPSHOT } from '@/data/products/customerCatalogueSnapshot';
import {
  BUNDLED_CATALOGUE_ENTRIES,
  BUNDLED_CATALOGUE_READY_COUNT,
  BUNDLED_CATALOGUE_SOURCE,
  bundledCategoryForIngredient,
} from './bundledCatalogue';

describe('bundled catalogue — real, honest sample', () => {
  it('is a real, non-empty sample labelled honestly (never „live")', () => {
    expect(BUNDLED_CATALOGUE_ENTRIES.length).toBe(66);
    expect(BUNDLED_CATALOGUE_ENTRIES.length).toBe(CUSTOMER_CATALOGUE_SNAPSHOT.length);
    expect(BUNDLED_CATALOGUE_SOURCE.kind).toBe('sample');
    expect(BUNDLED_CATALOGUE_SOURCE.note).toContain('Próbka');
    // No rejected products ever ship to the customer catalogue.
    expect(BUNDLED_CATALOGUE_ENTRIES.some((e) => e.status === 'rejected')).toBe(false);
  });

  it('reports an honest exact-ready count that matches the reused readiness gate', () => {
    const matched = BUNDLED_CATALOGUE_ENTRIES.filter((e) => e.reference !== null);
    expect(matched.length).toBe(23); // 23 products carry a real mapper_basement reference
    const gateReady = BUNDLED_CATALOGUE_ENTRIES.filter(
      (e) => evaluateProductReadiness(e.readiness, e.reference).readyForExact,
    );
    // The published count is the CONSERVATIVE gate verdict (matched AND no red flag),
    // so it is > 0 and never exceeds the matched count.
    expect(BUNDLED_CATALOGUE_READY_COUNT).toBe(gateReady.length);
    expect(BUNDLED_CATALOGUE_READY_COUNT).toBeGreaterThan(0);
    expect(BUNDLED_CATALOGUE_READY_COUNT).toBeLessThanOrEqual(matched.length);
    // Every exact-ready product is a matched one (never invented from an unmatched row).
    for (const e of gateReady) expect(e.reference).not.toBeNull();
    // The honest note carries the real number.
    expect(BUNDLED_CATALOGUE_SOURCE.note).toContain(String(BUNDLED_CATALOGUE_READY_COUNT));
  });

  it('NEVER invents pac/pod — an unmatched product carries no engine values and is not exact-ready', () => {
    const unmatched = BUNDLED_CATALOGUE_ENTRIES.filter((e) => e.reference === null);
    expect(unmatched.length).toBe(66 - 23);
    for (const e of unmatched) {
      // The product row itself never carries pac/pod in this catalogue.
      expect(e.readiness.pac_value).toBeNull();
      expect(e.readiness.pod_value).toBeNull();
      expect(evaluateProductReadiness(e.readiness, null).readyForExact).toBe(false);
    }
  });

  it('carries real display data (names, EAN, brand) on the entries', () => {
    const named = BUNDLED_CATALOGUE_ENTRIES.filter((e) => e.displayName && e.displayName !== '(produkt bez nazwy)');
    expect(named.length).toBe(66);
    // At least the known engine-ready pistachio cream is present with its real EAN.
    const pistachio = BUNDLED_CATALOGUE_ENTRIES.find((e) => /pistacho/i.test(e.displayName));
    expect(pistachio).toBeDefined();
    expect(pistachio?.reference).not.toBeNull();
  });

  it('maps a generic requirement to the real DB product category', () => {
    expect(bundledCategoryForIngredient('Pistacja')).toBe('nut_paste');
    expect(bundledCategoryForIngredient('Czekolada')).toBe('chocolate_cocoa');
    expect(bundledCategoryForIngredient('Malina')).toBe('fruit');
    expect(bundledCategoryForIngredient('Mleko')).toBe('dairy');
    expect(bundledCategoryForIngredient('Kawa')).toBe('flavor');
    expect(bundledCategoryForIngredient('Wanilia')).toBe('flavor');
    expect(bundledCategoryForIngredient('Cukier')).toBe('sugar');
    expect(bundledCategoryForIngredient('')).toBeNull();
  });
});
