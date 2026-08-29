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
  lineCost: number | null = 0.24,
): IngredientPriceView => ({
  cost: {
    canonicalIngredientId: 'PI-ING-000236',
    pricePerKg: 3,
    currency: 'EUR',
    source: 'customer_override',
    mapperPricePerKg: 1.2,
    customerOverridePerKg: 3,
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
    expect(html).toContain('3,00 €/kg');
    expect(html).toContain('0,24 €');
    // Owner 2026-08-24: the „Moja" badge is gone — it broke the shape of the
    // price block and had to be re-read on every row. A custom price is now a
    // small dot that explains itself on hover.
    expect(html).not.toContain('>Moja<');
    expect(html).toContain('customer-price-indicator');
    expect(html).toContain('data-price-source="customer_override"');
    expect(html).toContain('Moja cena: 3,00 €/kg · Bazowa: 1,20 €/kg');
    expect(html).not.toContain('wprowadzona przez Ciebie');
    expect(html).not.toContain('Cena własna —');
    expect(html).not.toContain('W PRZYGOTOWANIU');
  });

  it('a reference price carries no marker at all', () => {
    const html = renderToStaticMarkup(
      <IngredientPriceCell
        view={{
          ...view(),
          cost: {
            ...view().cost,
            pricePerKg: 1.2,
            source: 'mapper_reference',
            mapperPricePerKg: 1.2,
            customerOverridePerKg: null,
            overrideId: null,
          },
          lineCost: 0.096,
        }}
      />,
    );
    expect(html).toContain('data-price-source="reference"');
    expect(html).toContain('1,20 €/kg');
    expect(html).toContain('0,10 €');
    expect(html).toContain('Cena bazowa: 1,20 €/kg');
    expect(html).not.toContain('customer-price-indicator');
    expect(html).not.toContain('Moja cena:');
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
    expect(html).not.toContain('0,00 €');
  });

  it('keeps the editor compact with save and true reset actions', () => {
    const html = renderToStaticMarkup(<CustomerPriceEditor view={view()} />);
    expect(html).toContain('data-testid="customer-price-editor"');
    expect(html).toContain('data-active-price-source="customer_override"');
    expect(html).toContain('Moja cena');
    expect(html).toContain('Bazowa: 1,20 €/kg');
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
            pricePerKg: 1.2,
            source: 'mapper_reference',
            mapperPricePerKg: 1.2,
            customerOverridePerKg: null,
            overrideId: null,
          },
        }}
      />,
    );
    expect(html).toContain('data-active-price-source="mapper_reference"');
    expect(html).toContain('Cena bazowa');
    expect(html).toContain('1,20 €/kg');
    expect(html).not.toContain('Przywróć cenę bazową');
  });

  it('uses Moja cena as the stable article heading and keeps base price as quiet meta', () => {
    const html = renderToStaticMarkup(
      <CustomerPriceEditor
        variant="article"
        footerAction={<button type="button">Usuń z receptury</button>}
        view={{
          ...view(),
          cost: {
            ...view().cost,
            pricePerKg: 1.2,
            source: 'mapper_reference',
            mapperPricePerKg: 1.2,
            customerOverridePerKg: null,
            overrideId: null,
          },
        }}
      />,
    );
    expect(html).toContain('Moja cena');
    expect(html).toContain('Bazowa: 1,20 €/kg');
    expect(html).toContain('data-layout="compact-inline"');
    expect(html).toContain('class="sr-only">Cena za kg</span>');
    expect(html).toContain('h-9');
    expect(html).toContain('w-[112px]');
    expect(html).toContain('article-panel-base-price');
    expect(html).toContain('Usuń z receptury');
    expect(html).not.toContain('h-10');
    expect(html).not.toContain('>Cena bazowa<');
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
