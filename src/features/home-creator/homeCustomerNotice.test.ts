/**
 * OWNER SERVED QA, 2026-09-02 — internal diagnostics reached a HOME screen.
 *
 * The strings below are taken from the real refusal builders in
 * `constraintStudioStore` / `productIntelligence`, not invented for the test.
 */
import { describe, expect, it } from 'vitest';
import { homeCreatorCopy } from './homeCreatorCopy';
import { exposesInternals, homeCustomerNotice } from './homeCustomerNotice';

const CALM = homeCreatorCopy.recipe.unresolvedProduct;

/** Real pipeline output that must never reach a customer. */
const INTERNAL = [
  'Nie udało się potwierdzić aktualnego powiązania technicznego dla: Malina. Brakująca warstwa: walidacja serwerowa. Odśwież dane produktu.',
  'Nie udało się potwierdzić aktualnej authority produktu Starter Pack. Receptura pozostała bez zmian.',
  'Malina · Mapper brak · wersja v3 · moduł BASE_RECIPE',
  'ProductBehavior binding',
  'brak aktualnego snapshotu zachowania',
  'behavior_snapshot_missing_or_unresolved',
  'mapper_mapping_stale',
  'Produkt PI-ING-000236 wymaga ponownej klasyfikacji.',
];

/** Ordinary customer sentences that must survive untouched. */
const SAFE = [
  'Nie udało się pobrać produktów. Spróbuj ponownie.',
  'Nie udało się potwierdzić aktualnych danych produktu Malina. Spróbuj ponownie.',
  'Składnik demonstracyjny nie ma aktualnie dostępnego odpowiednika w katalogu składników.',
  'Receptura pozostała bez zmian.',
  'Podaj ilość większą od zera.',
];

describe('internal vocabulary never reaches a HOME screen', () => {
  it.each(INTERNAL)('replaces %s', (text) => {
    expect(exposesInternals(text)).toBe(true);
    expect(homeCustomerNotice(text)).toBe(CALM);
  });

  it('the replacement itself names nothing internal', () => {
    expect(exposesInternals(CALM)).toBe(false);
    expect(CALM).toBe('Nie możemy teraz potwierdzić danych jednego ze składników.');
  });
});

describe('ordinary customer copy is left alone', () => {
  it.each(SAFE)('keeps %s', (text) => {
    expect(exposesInternals(text)).toBe(false);
    expect(homeCustomerNotice(text)).toBe(text);
  });
});

describe('silence is preserved', () => {
  it('never manufactures a refusal that was not there', () => {
    expect(homeCustomerNotice(null)).toBeNull();
    expect(homeCustomerNotice(undefined)).toBeNull();
    expect(homeCustomerNotice('   ')).toBeNull();
  });
});

describe('the filter changes presentation only', () => {
  it('a refusal stays a refusal — it is never turned into a success sentence', () => {
    // Every internal input maps to a sentence that still says we cannot confirm.
    for (const text of INTERNAL) {
      expect(homeCustomerNotice(text)).toContain('Nie możemy teraz potwierdzić');
    }
  });
});
