/** @vitest-environment jsdom */
/**
 * SHOP — the offer IS the entry block (DESIGN S1, owner correction 2026-09-18).
 *
 * The presentation contract pins this in the source; this pins it in the DOM,
 * which is where the customer meets it. It fails if the offer ever drifts back
 * out of the shared top, if the pack stops being the block's own photograph, or
 * if any of the six things the owner listed — name, contents, weight, country,
 * availability, price, €/kg, add to cart — stops rendering.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShopProduct } from '@/services/shop';

vi.mock('@/services/shopCountries', () => ({
  getShippingRate: () => Promise.resolve({ priceCents: 990, currency: 'eur' }),
}));

const { ShopStarterOffer } = await import('./ShopStarterOffer');

const BUNDLE: ShopProduct = {
  id: 'bundle',
  sku: 'GEL-STARTER',
  slug: 'starter',
  kind: 'bundle',
  title: 'Zestaw Startowy',
  description: null,
  canonicalIngredientId: null,
  packSizeG: null,
  priceCents: 5900,
  currency: 'eur',
  imageUrl: null,
  availability: 'in_stock',
  leadTimeWeeks: null,
  /* The packed contents as the catalogue delivers them: `packSizeG` is the
     PACKED amount, not the retail SKU size. Seven of them, 1 125 g in total —
     the real Starter Pack's own numbers. */
  contents: Array.from({ length: 7 }, (_, index) => ({
    sku: `GEL-${index}`,
    title: `Składnik ${index}`,
    packSizeG: 500,
    quantity: 1,
  })),
  contentsTotalG: 1125,
  allergens: [],
};

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root.render(
      <ShopStarterOffer product={BUNDLE} inCart={false} onAdd={() => {}} onLocalPack={() => {}} />,
    );
  });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const at = (testId: string) => host.querySelector<HTMLElement>(`[data-testid="${testId}"]`);

describe('the offer is the entry block', () => {
  it('renders inside the ONE shared destination top', () => {
    const top = host.querySelector('[data-destination-top]');
    expect(top).not.toBeNull();
    // One dark body on the page, and the offer lives in it.
    expect(host.querySelectorAll('[data-destination-top]')).toHaveLength(1);
    expect(top!.contains(at('shop-starter-offer'))).toBe(true);
  });

  it('makes the pack the block own photograph, not a card inside it', () => {
    const shot = at('shop-starter-shot');
    expect(shot).not.toBeNull();
    expect(host.querySelector('[data-destination-top]')!.contains(shot)).toBe(true);
    expect(shot!.getAttribute('src')).toBe('/shop/starter-front.jpg');
  });

  it('keeps the name, the pack facts and the question the owner listed', () => {
    expect(host.textContent).toContain('Zestaw Startowy');
    // „{count} składników · {grams}" — seven components and the weight.
    expect(host.textContent).toContain('7 składników');
    // The separator is the U+00A0 `shopGrams` uses everywhere else.
    expect(host.textContent).toContain('1\u00a0125 g');
    expect(at('shop-country-selector')).not.toBeNull();
  });
});
