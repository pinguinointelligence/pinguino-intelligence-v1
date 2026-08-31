import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * SHOP — reconciled to the owner-approved C3 screen (approved 2026-08-31;
 * product-emphasis correction and global header override 2026-09-01).
 *
 * C3 SUPERSEDES the Designbook §7 Shop screen this file used to pin. The hero,
 * the second full-width Starter Pack card, the dashed packaging frames and the
 * orange-ruled closing note were removed BY OWNER DECISION, not by drift, and
 * the assertions that pinned them are replaced here by the ones that pin C3.
 *
 * Everything below is either a rule the owner stated or a defect that was
 * actually on served staging — never a style preference. The behavioural and
 * regulatory assertions (allergens, double-order, disabled contrast, shipping
 * authority, confirmation states, the email promise) are carried over unchanged.
 */
const SRC = join(process.cwd(), 'src');
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');

describe('shop C3 · one product, no duplicate', () => {
  it('has no hero and no second Starter Pack block', () => {
    const page = read('pages', 'destinations', 'GlobalDestinationPages.tsx');
    expect(page).not.toContain('ShopHeroPack');
    expect(page).not.toContain('ShopHeroActions');
    expect(page).not.toContain('DestinationHero\n        variant="shop"');
    // ONE offer component, rendered once, above the contents.
    const catalog = read('features', 'shop', 'ShopCatalog.tsx');
    expect(catalog.match(/<ShopStarterOffer/g) ?? []).toHaveLength(1);
    expect(catalog).toContain('<ShopStarterContents');
    expect(catalog).not.toContain('ShopStarterPack');
  });

  it('closes the page without the orange-ruled note the old screen ended on', () => {
    const catalog = read('features', 'shop', 'ShopCatalog.tsx');
    expect(catalog).not.toContain('shop-closing-note');
    expect(catalog).not.toContain('border-l-2 border-[var(--g-orange)]');
  });

  it('never routes the empty cart back to the one product the page leads with', () => {
    const cart = read('features', 'shop', 'ShopCart.tsx');
    expect(cart).not.toContain('emptyCta');
    expect(cart).not.toContain('onBrowse');
  });
});

describe('shop C3 · the product carries the emphasis, never the money', () => {
  it('names the product simply, and only once', () => {
    const copy = read('copy', 'shop.ts');
    expect(copy).toContain("name: 'Zestaw Startowy'");
    // No second prominent brand treatment beside the official wordmark.
    expect(copy).not.toContain('offerKicker');
    const offer = read('features', 'shop', 'ShopStarterOffer.tsx');
    expect(offer.match(/shopProductName\(product\)/g) ?? []).toHaveLength(1);
  });

  it('puts graphite on the product name and nothing else in the offer', () => {
    const offer = read('features', 'shop', 'ShopStarterOffer.tsx');
    // The identity field: graphite ground, orange edge, holding the <h2>.
    expect(offer).toContain('bg-[var(--g-graphite)]');
    expect(offer).toContain('border-l-[3px] border-[var(--g-orange)]');
    // Exactly one graphite ground in the offer — the price must never get one.
    expect(offer.match(/bg-\[var\(--g-graphite\)\]/g) ?? []).toHaveLength(1);
    // Orange fills ONE thing: the 6 px made-to-order dot. It is never the
    // ground of anything that carries text, and never touches the price.
    const orangeFills = offer.match(/[^"']*bg-\[var\(--g-orange\)\]/g) ?? [];
    expect(orangeFills).toHaveLength(1);
    expect(orangeFills[0]).toContain('rounded-full');
    expect(orangeFills[0]).toContain('size-1.5');
  });

  it('keeps the price on the page ground, below the conditions', () => {
    const offer = read('features', 'shop', 'ShopStarterOffer.tsx');
    const availability = offer.indexOf('shop-starter-availability');
    const price = offer.indexOf('shopMoney(product.priceCents');
    const cta = offer.indexOf('shop-add-');
    expect(availability).toBeGreaterThan(-1);
    // product → availability → price → add to cart, in source order.
    expect(price).toBeGreaterThan(availability);
    expect(cta).toBeGreaterThan(price);
  });

  it('uses the real product photography, and never invents any', () => {
    const shots = read('features', 'shop', 'shopStarterShots.ts');
    for (const shot of [
      '/shop/starter-front.jpg',
      '/shop/starter-angle.jpg',
      '/shop/starter-side.jpg',
    ]) {
      expect(shots).toContain(shot);
    }
    const packaging = read('features', 'shop', 'ShopPackaging.tsx');
    // The strip offers only what is NOT on display.
    const offer = read('features', 'shop', 'ShopStarterOffer.tsx');
    expect(offer).toContain('SHOP_STARTER_SHOTS.filter((s) => s.id !== primary.id)');
    // No single-ingredient photography exists: the frame stays reserved.
    expect(packaging).toContain('ShopReservedFrame');
    expect(packaging).toContain('#fcfbf9');
    expect(read('features', 'shop', 'ShopProductCard.tsx')).toContain('<ShopReservedFrame />');
  });
});

describe('shop C3 · structure below the offer', () => {
  it('states the packed gramatures once, with the total', () => {
    const contents = read('features', 'shop', 'ShopStarterContents.tsx');
    expect(contents).toContain('entry.packSizeG');
    expect(contents).toContain('contentsTotalG');
    expect(contents).toContain('shop-contents-total');
    // One hairline joins the list to the offer; the list itself has no rules.
    expect(contents).toContain('border-t border-[var(--g-line)]');
    expect(contents).not.toContain('border-b border-[var(--g-line)]');
  });

  it('states one pack size per line', () => {
    // Served staging printed „Dekstroza · 500 g · 250 g": the retail SKU size
    // and the packed portion, contradicting each other on one line.
    const helper = read('features', 'shop', 'shopContentTitle.ts');
    expect(helper).toContain('export const shopContentTitle');
    expect(read('features', 'shop', 'ShopStarterContents.tsx')).toContain('shopContentTitle');
    for (const file of ['ShopProductCard.tsx', 'ShopStarterOffer.tsx'] as const) {
      expect(read('features', 'shop', file)).toContain('shopProductName');
    }
    expect(read('features', 'shop', 'ShopCart.tsx')).toContain('shopContentTitle');
  });

  it('renders a single ingredient as a compact row, not an ecommerce card', () => {
    const card = read('features', 'shop', 'ShopProductCard.tsx');
    // No border, fill or shadow around the article itself.
    expect(card).not.toMatch(/<article\s+className="[^"]*\brounded-\[12px\]/);
    expect(card).not.toMatch(/<article\s+className="[^"]*\bbg-white/);
    expect(card).toContain('border-t border-[var(--g-line-quiet)]');
    // Availability once per row, from the one shared component.
    expect(card.match(/shopAvailabilityLabelPl\(/g) ?? []).toHaveLength(1);
    expect(card).toContain('export function ShopAvailabilityChip');
  });

  it('keeps orange to its approved roles across the Shop', () => {
    for (const file of [
      'ShopCatalog.tsx',
      'ShopProductCard.tsx',
      'ShopStarterOffer.tsx',
      'ShopStarterContents.tsx',
      'ShopCart.tsx',
      'ShopPackaging.tsx',
      'shopStarterShots.ts',
    ] as const) {
      const source = read('features', 'shop', file);
      // No orange body text, and no orange ground on anything with content:
      // the only permitted fill is the small round status dot.
      expect(source).not.toMatch(/text-\[var\(--g-orange\)\]/);
      for (const fill of source.match(/[^"']*bg-\[var\(--g-orange\)\]/g) ?? []) {
        expect(fill).toContain('rounded-full');
      }
    }
  });

  it('uses ONE button family at the approved 12 px radius', () => {
    // The approved control is `border-radius: var(--radius-pro-studio)` = 12 px.
    // The bare `buttonClasses` recipe renders 10 px, so mixing the two put two
    // button radii on one page.
    for (const file of [
      'ShopProductCard.tsx',
      'ShopStarterOffer.tsx',
      'ShopCart.tsx',
      'ShopConfirmation.tsx',
    ] as const) {
      const source = read('features', 'shop', file);
      expect(source).toMatch(/application(Primary|Secondary|Quiet)Classes\(/);
      expect(source).not.toMatch(/\bbuttonClasses\(/);
    }
  });

  it('keeps disabled controls readable', () => {
    // `opacity-45` measures 2.88:1 on a graphite primary; --g-lock on
    // --g-line-quiet measures 5.03:1.
    for (const file of ['ShopProductCard.tsx', 'ShopStarterOffer.tsx'] as const) {
      const source = read('features', 'shop', file);
      expect(source).toContain('disabled:bg-[var(--g-line-quiet)]');
      expect(source).toContain('disabled:text-[var(--g-lock)]');
      expect(source).toContain('disabled:opacity-100');
    }
  });
});

describe('shop C3 · the ONE global header', () => {
  it('adds nothing of its own to the frozen header row', () => {
    const page = read('pages', 'destinations', 'GlobalDestinationPages.tsx');
    // The canonical lockup: the official wordmark alone, and HOME | PRO.
    expect(page).toContain('canonicalHeader');
    expect(page).toContain('headerActions={<HomeProSwitch');
    // The basket is a Shop utility, not a header control.
    expect(page).toContain('shop-cart-link');
    const surface = read('components', 'shared', 'DestinationSurface.tsx');
    expect(surface).toContain('canonicalHeader ? undefined : (');
  });

  it('gives every route the same primary column, so nothing moves between them', () => {
    const shell = read('features', 'shell', 'AppShell.tsx');
    // The workbench split is applied on EVERY route, not only under viewportLock.
    expect(shell).toContain('`xl:grid ${DESKTOP_WORKBENCH_COLUMNS}`');
    expect(shell).not.toContain('viewportLock && `xl:grid ${DESKTOP_WORKBENCH_COLUMNS}`');
    // HOME | PRO closes the PRIMARY column, never the viewport.
    expect(shell).toContain('app-shell-trailing');
    expect(shell).toContain('ml-auto flex min-w-0 flex-wrap items-center justify-end');
    // A destination no longer redeclares the row's width or gutters.
    const css = read('styles', 'gellatti-v2-1.css');
    const rule = css.slice(css.indexOf('.gellatti-destination-shell > header'));
    const block = rule.slice(0, rule.indexOf('}'));
    expect(block).not.toContain('padding-inline');
    expect(block).not.toContain('max-width');
    expect(block).toContain('height: var(--pro-header-height)');
  });

  it('uses the official wordmark asset, never a typeset one', () => {
    const logo = read('components', 'shared', 'OfficialProLogo.tsx');
    expect(logo).toContain('/brand/gellatti-wordmark-graphite.svg');
  });
});

describe('shop C3 · commerce behaviour is unchanged', () => {
  it('states the shipping cost before the payment page, from one authority', () => {
    const cart = read('features', 'shop', 'ShopCart.tsx');
    expect(cart).toContain('SHOP_SHIPPING_FLAT_CENTS');
    expect(cart).toContain('shopOrderTotals');
    // No invented tax row: the session charges items + shipping and returns
    // amount_tax 0. A VAT line here would be a claim checkout cannot honour.
    expect(cart).not.toMatch(/>\s*VAT\s*</);
  });

  it('closes the purchase with a real confirmation', () => {
    const confirmation = read('features', 'shop', 'ShopConfirmation.tsx');
    for (const fact of ['orderNumber', 'shipping', 'items', 'totalCents']) {
      expect(confirmation).toContain(fact);
    }
    for (const state of ['paid', 'pending', 'failed', 'cancelled', 'checking']) {
      expect(confirmation).toContain(`'${state}'`);
    }
  });

  it('never announces an absence of allergens', () => {
    const card = read('features', 'shop', 'ShopProductCard.tsx');
    expect(card).toContain('if (allergens.length === 0) return null;');
  });

  it('cannot mint a second order from one click', () => {
    const catalog = read('features', 'shop', 'ShopCatalog.tsx');
    expect(catalog).toContain('starting.current');
    expect(catalog).toContain('checkoutPending');
    const checkout = readFileSync(
      join(process.cwd(), 'supabase', 'functions', 'shop-checkout', 'index.ts'),
      'utf8',
    );
    expect(checkout).toContain('DOUBLE-CLICK / BACK-BUTTON GUARD');
    expect(checkout).toContain('reused: true');
  });

  it('gives fulfilment the address, the money and the tracking number', () => {
    const admin = readFileSync(join(SRC, 'features', 'admin', 'AdminShopOrderCard.tsx'), 'utf8');
    for (const needed of [
      'shipping.line1',
      'shipping.postalCode',
      'shipping.country',
      'admin.packingList',
      'trackingNumber',
      'shippingCents',
    ]) {
      expect(admin).toContain(needed);
    }
    expect(admin).toContain("fulfillmentStatus: 'shipped',");
    expect(admin).toContain('trackingNumber: trackingNumber.trim(),');
  });
});

/**
 * S-29. Gellatti has NO transactional email provider, no shared email job and
 * no mail module — audited 2026-08-31 across `supabase/functions/**` and
 * `src/**`. Until one exists, the Shop must not tell a customer that a message
 * is on its way. The order IS saved and IS visible under „Zamówienia", so the
 * confirmation points there instead.
 */
describe('shop makes no promise the system cannot keep', () => {
  it('never claims an email was or will be sent', () => {
    const copy = readFileSync(join(SRC, 'copy', 'shop.ts'), 'utf8');
    for (const claim of [
      'trafia na Twój adres e-mail',
      'dostaniesz mailem',
      'goes to your email',
      'arrives by email',
    ]) {
      expect(copy).not.toContain(claim);
    }
  });
});
