import { describe, expect, it } from 'vitest';
import { createCompleteLabel } from './masterLabelTestFixture';
import { applyPrintMissingValues, printMissingFields } from './printMissingData';
import type { MarketProfileCode } from './marketProfiles';

const MARKETS: readonly MarketProfileCode[] = ['EU', 'UK', 'US', 'CA', 'AU_NZ', 'WORLD'];

const partialAllergens = (market: MarketProfileCode) => {
  const complete = createCompleteLabel(market);
  return {
    ...complete,
    allergens: {
      ...complete.allergens,
      status: 'incomplete' as const,
      labelStatements: ['Contains milk'],
      reviewedByUser: false,
    },
  };
};

describe('shared missing print data', () => {
  it.each(MARKETS)('%s prefills partial allergens without losing their known part', (market) => {
    const label = partialAllergens(market);
    const allergen = printMissingFields(label).find((field) => field.id === 'allergens');

    expect(allergen).toMatchObject({ value: 'Contains milk' });
    expect(allergen?.help).toContain('części składników');
    expect(applyPrintMissingValues(label, { allergens: 'Contains milk' }, new Set())).toBe(label);
    expect(label.allergens.labelStatements).toEqual(['Contains milk']);
  });

  it.each(MARKETS)(
    '%s promotes an edited recipe-wide allergen line to manual authority',
    (market) => {
      const label = partialAllergens(market);
      const changed = applyPrintMissingValues(
        label,
        { allergens: 'Contains milk and hazelnuts' },
        new Set(['allergens']),
      );

      expect(changed.allergens).toMatchObject({
        status: 'complete',
        labelStatements: ['Contains milk and hazelnuts'],
        reviewedByUser: true,
      });
      expect(printMissingFields(changed).some((field) => field.id === 'allergens')).toBe(false);
    },
  );

  it('applies only entered values and leaves skipped missing fields unresolved', () => {
    const complete = createCompleteLabel('US');
    const label = {
      ...complete,
      nutritionSource: {
        ...complete.nutritionSource!,
        saturated_fat_g: null,
        sugars_g: null,
      },
    };
    const changed = applyPrintMissingValues(
      label,
      { saturated_fat_g: '3.4', sugars_g: '' },
      new Set(['saturated_fat_g', 'sugars_g']),
    );

    expect(changed.nutritionSource?.saturated_fat_g).toBe(3.4);
    expect(changed.nutritionSource?.sugars_g).toBeNull();
    expect(changed.saturatedFatAuthority).toMatchObject({ status: 'manual_final_value' });
  });

  it('keeps an entirely unknown allergen line absent when the user skips it', () => {
    const complete = createCompleteLabel('WORLD');
    const label = {
      ...complete,
      allergens: {
        ...complete.allergens,
        status: 'incomplete' as const,
        labelStatements: [],
        reviewedByUser: false,
      },
    };

    expect(printMissingFields(label).find((field) => field.id === 'allergens')?.value).toBe('');
    expect(applyPrintMissingValues(label, {}, new Set())).toBe(label);
    expect(label.allergens.labelStatements).toEqual([]);
  });

  it('does not ask for optional World-only gaps that its renderer can omit', () => {
    const complete = createCompleteLabel('WORLD');
    const label = {
      ...complete,
      legalProductName: { en: '' },
      operator: { ...complete.operator, operatorName: '', address: '', countryCode: '' },
      dateMark: {
        kind: 'unresolved' as const,
        date: null,
        basis: 'none' as const,
        reviewedByUser: false,
      },
    };
    const ids = printMissingFields(label).map((field) => field.id);

    expect(ids).not.toContain('legal_product_name:en');
    expect(ids).not.toContain('operator_name');
    expect(ids).not.toContain('operator_address');
    expect(ids).not.toContain('operator_country');
    expect(ids).not.toContain('date_mark');
  });
});
