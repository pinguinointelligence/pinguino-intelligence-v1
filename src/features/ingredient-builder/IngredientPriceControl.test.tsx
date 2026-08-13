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

  it('renders effective price, line contribution, neutral owner marker and base tooltip', () => {
    const html = renderToStaticMarkup(<IngredientPriceCell view={view()} />);
    expect(html).toContain('1,12');
    expect(html).toContain('0,09');
    expect(html).toContain('Moja');
    expect(html).toContain('0,97');
    expect(html).not.toContain('W PRZYGOTOWANIU');
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
    expect(html).toContain('Cena za kg');
    expect(html).toContain('Zapisz');
    expect(html).toContain('Przywróć cenę bazową');
  });

  it('names catalog-price reset as deletion when no shared base price exists', () => {
    const html = renderToStaticMarkup(
      <CustomerPriceEditor view={{ ...view(), resetLabel: 'Usuń moją cenę' }} />,
    );
    expect(html).toContain('Usuń moją cenę');
    expect(html).not.toContain('Przywróć cenę bazową');
  });
});
