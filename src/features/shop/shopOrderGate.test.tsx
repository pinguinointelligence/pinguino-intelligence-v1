/**
 * PUBLIC VIEW for everyone, ORDER only with an active HOME or PRO plan (owner, 2026-09-18) — the shop side.
 *
 * The server decides (`plan_required` from the order functions); the shop only has to say it the same way on every
 * order path — the 0 € PDF, the cart and the local pack — with the existing way to a plan, and never hide the shop.
 */
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { shopCopyEn, shopCopyPl } from '@/copy/shop';
import { checkoutErrorCode, ShopCheckoutError, type ShopProduct } from '@/services/shop';
import { ShopCart, type ShopCartEntry } from './ShopCart';
import { PLAN_REQUIRED, ShopPlanRequired } from './ShopPlanRequired';

const PRODUCT: ShopProduct = {
  id: 'gate-single',
  sku: 'GEL-GATE-SINGLE',
  slug: 'gate-single',
  kind: 'single',
  title: 'Dekstroza',
  description: null,
  canonicalIngredientId: null,
  packSizeG: 500,
  priceCents: 990,
  currency: 'eur',
  imageUrl: null,
  availability: 'in_stock',
  leadTimeWeeks: null,
  contents: [],
  contentsTotalG: null,
  allergens: [],
};
const ENTRIES: ShopCartEntry[] = [{ line: { sku: PRODUCT.sku, quantity: 1 }, product: PRODUCT }];

const cart = (checkoutNeedsPlan: boolean) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <ShopCart
        entries={ENTRIES}
        authed
        checkoutPending={false}
        checkoutError={null}
        checkoutNeedsPlan={checkoutNeedsPlan}
        onQuantity={() => {}}
        onRemove={() => {}}
        onCheckout={() => {}}
        onSignIn={() => {}}
      />
    </MemoryRouter>,
  );

describe('one sentence for a refused order, wherever it was placed', () => {
  it("says the owner's sentence and links the existing plan page", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ShopPlanRequired testId="gate" />
      </MemoryRouter>,
    );
    expect(html).toContain(
      'Zamawianie w sklepie jest dostępne z aktywnym planem Gellatti HOME lub PRO.',
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('href="/subscription"');
    expect(html).toContain('data-testid="gate-plans"');
    expect(html).toContain('Wybierz plan');
    expect(shopCopyEn.orderGate.planRequired).toBe(
      'Ordering in the shop is available with an active Gellatti HOME or PRO plan.',
    );
  });

  it('never calls the shop a subscribers-only place', () => {
    for (const copy of [shopCopyPl, shopCopyEn]) {
      expect(`${copy.orderGate.planRequired} ${copy.orderGate.plansCta}`).not.toMatch(
        /tylko dla abonent|subscribers only|members only/i,
      );
    }
  });
});

describe('the cart and the local pack answer plan_required the same way', () => {
  it('reads the machine code the checkout function answered', () => {
    expect(checkoutErrorCode('{"error":"plan_required"}')).toBe(PLAN_REQUIRED);
    expect(checkoutErrorCode('{"error":"product_out_of_stock","sku":"X"}')).toBe(
      'product_out_of_stock',
    );
    expect(checkoutErrorCode('<html>Bad gateway</html>')).toBe('checkout_failed');
    expect(checkoutErrorCode(null)).toBe('checkout_failed');
    expect(new ShopCheckoutError(PLAN_REQUIRED, 'x').code).toBe('plan_required');
  });

  it('shows the plan notice under the cart and keeps the cart and its button in place', () => {
    const refused = cart(true);
    expect(refused).toContain('data-testid="shop-checkout-plan-required"');
    expect(refused).toContain(
      'Zamawianie w sklepie jest dostępne z aktywnym planem Gellatti HOME lub PRO.',
    );
    expect(refused).toContain('href="/subscription"');
    expect(refused).toContain('data-testid="shop-checkout"');
    expect(cart(false)).not.toContain('shop-checkout-plan-required');
  });

  it('maps only the server answer, never a plan flag held in the browser', () => {
    const catalog = readFileSync('src/features/shop/ShopCatalog.tsx', 'utf8');
    expect(catalog).toContain(
      'const needsPlan = error instanceof ShopCheckoutError && error.code === PLAN_REQUIRED;',
    );
    const localPack = readFileSync('src/pages/shop/LocalStarterPackPage.tsx', 'utf8');
    expect(localPack).toContain('if (code === PLAN_REQUIRED) setNeedsPlan(true);');
    expect(localPack).toContain('<ShopPlanRequired testId="local-pack-plan-required" />');
    for (const source of [catalog, localPack]) {
      expect(source).not.toMatch(
        /hasHome|hasPro|canHome|canPro|effectiveAccess|useHomeEntitlement/,
      );
    }
  });
});
