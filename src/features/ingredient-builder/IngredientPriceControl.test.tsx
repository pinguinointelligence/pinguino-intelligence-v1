import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { EffectiveIngredientCost } from '@/features/pro-core/costContracts';
import {
  CustomerPriceEditor,
  IngredientPriceCell,
  type IngredientPriceView,
} from './IngredientPriceControl';
import { parseCustomerPriceText } from './customerPriceInput';

const view = (
  cost: Partial<EffectiveIngredientCost> = {},
  lineCost: number | null = 0.0896,
): IngredientPriceView => ({
  cost: {
    canonicalIngredientId: 'PI-ING-000236',
    pricePerKg: 1.12,
    currency: 'EUR',
    source: 'customer_override',
    mapperPricePerKg: 0.97,
    customerOverridePerKg: 1.12,
    overrideId: 'price-1',
    ...cost,
  },
  lineCost,
  canEdit: true,
  onSave: async () => undefined,
  onReset: async () => undefined,
});

describe('customer price input', () => {
  it('accepts normal comma/dot input and rejects negative, NaN and excessive precision', () => {
    expect(parseCustomerPriceText('1,12')).toBe(1.12);
    expect(parseCustomerPriceText('0.0001')).toBe(0.0001);
    expect(parseCustomerPriceText('0')).toBe(0);
    expect(parseCustomerPriceText('-1')).toBeNull();
    expect(parseCustomerPriceText('NaN')).toBeNull();
    expect(parseCustomerPriceText('1,12345')).toBeNull();
  });

  it('renders effective price, line contribution and a QUIET custom-price marker', () => {
    const html = renderToStaticMarkup(<IngredientPriceCell view={view()} />);
    expect(html).toContain('1,12');
    expect(html).toContain('0,09');
    expect(html).toContain('0,97');
    // Owner 2026-08-24: the „Moja" badge is gone — it broke the shape of the
    // price block and had to be re-read on every row. A custom price is now a
    // small dot that explains itself on hover.
    expect(html).not.toContain('>Moja<');
    expect(html).toContain('customer-price-indicator');
    expect(html).toContain('data-price-source="customer_override"');
    expect(html).toContain('Moja cena');
    expect(html).toContain('Bazowa: 0,97 EUR/kg');
    expect(html).not.toContain('wprowadzona przez Ciebie');
    expect(html).not.toContain('W PRZYGOTOWANIU');
  });

  it('a reference price carries no marker at all', () => {
    const html = renderToStaticMarkup(
      <IngredientPriceCell
        view={{
          ...view(),
          cost: { ...view().cost, source: 'mapper_reference', customerOverridePerKg: null },
        }}
      />,
    );
    expect(html).toContain('data-price-source="reference"');
    expect(html).not.toContain('customer-price-indicator');
  });

  it('keeps missing price incomplete rather than presenting zero', () => {
    const html = renderToStaticMarkup(
      <IngredientPriceCell
        view={view(
          {
            pricePerKg: null,
            source: 'missing',
            mapperPricePerKg: null,
            customerOverridePerKg: null,
            overrideId: null,
          },
          null,
        )}
      />,
    );
    expect(html).toContain('Koszt niepełny');
    expect(html).not.toContain('0,00 EUR');
  });

  it('keeps the editor compact with save and true reset actions', () => {
    const html = renderToStaticMarkup(<CustomerPriceEditor view={view()} />);
    expect(html).toContain('data-testid="customer-price-editor"');
    expect(html).toContain('data-active-price-source="customer_override"');
    expect(html).toContain('Moja cena');
    expect(html).toContain('Bazowa: 0,97 EUR/kg');
    expect(html).toContain('Cena za kg');
    expect(html).toContain('Zapisz');
    expect(html).toContain('Przywróć cenę bazową');
  });

  it('shows one active base-price state and no meaningless reset action', () => {
    const html = renderToStaticMarkup(
      <CustomerPriceEditor
        view={{
          ...view(),
          cost: {
            ...view().cost,
            pricePerKg: 0.97,
            source: 'mapper_reference',
            customerOverridePerKg: null,
            overrideId: null,
          },
        }}
      />,
    );
    expect(html).toContain('data-active-price-source="mapper_reference"');
    expect(html).toContain('Cena bazowa');
    expect(html).toContain('0,97 EUR/kg');
    expect(html).not.toContain('Przywróć cenę bazową');
  });

  it('names catalog-price reset as deletion when no shared base price exists', () => {
    const html = renderToStaticMarkup(
      <CustomerPriceEditor view={{ ...view(), resetLabel: 'Usuń moją cenę' }} />,
    );
    expect(html).toContain('Usuń moją cenę');
    expect(html).not.toContain('Przywróć cenę bazową');
  });
});
