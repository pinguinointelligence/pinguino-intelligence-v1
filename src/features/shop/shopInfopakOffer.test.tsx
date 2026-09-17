import { readFileSync, existsSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { shopCopyEn, shopCopyPl } from '@/copy/shop';
import {
  INFOPAK_IMAGE_SRC,
  ShopInfopakOfferView,
  type ShopInfopakOfferViewProps,
} from './ShopInfopakOffer';

const base: ShopInfopakOfferViewProps = {
  state: 'TEST_ACCOUNTS_ONLY',
  signedIn: false,
  ordering: false,
  downloading: false,
  orderNumber: null,
  notice: null,
  onOrder: () => {},
  onDownload: () => {},
};

const render = (props: Partial<ShopInfopakOfferViewProps> = {}) =>
  renderToStaticMarkup(<ShopInfopakOfferView {...base} {...props} />);

describe('the infopak offer says what it is', () => {
  it('leads with the approved name and benefit, then a quiet PDF · 0 € and the order button', () => {
    const html = render();
    expect(html).toContain('Gellatti — Składniki bazy lodów');
    expect(html).toContain('Infopak zakupowy: co kupić i gdzie znaleźć składniki w Twoim kraju.');
    expect(html).toContain('PDF · 0 €');
    expect(html).toContain('Zamów za 0 €');
    expect(html.indexOf('Składniki bazy lodów')).toBeLessThan(html.indexOf('PDF · 0 €'));
    expect(html).toContain('Język dokumentu: angielski.');
  });

  it('keeps "75 countries" as a detail, never in the name, subtitle or button', () => {
    for (const copy of [shopCopyPl, shopCopyEn]) {
      for (const text of [
        copy.infopak.name,
        copy.infopak.subtitle,
        copy.infopak.cta,
        copy.infopak.formatPrice,
      ]) {
        expect(text).not.toMatch(/75/);
      }
      expect(copy.infopak.details.join(' ')).toMatch(/75/);
    }
  });

  it('promises no parcel, no recipes with grams and no individual file', () => {
    for (const copy of [shopCopyPl, shopCopyEn]) {
      const promise = [
        copy.infopak.name,
        copy.infopak.subtitle,
        copy.infopak.cta,
        copy.infopak.lede,
      ].join(' ');
      expect(promise).not.toMatch(/paczk|parcel|gram|receptur|recipe|indywidualn|personal/i);
    }
    expect(shopCopyPl.infopak.description[0]).toContain(
      'Nie jest to paczka składników ani zbiór receptur z gramaturami.',
    );
    expect(shopCopyEn.infopak.description[0]).toContain(
      'not a parcel of ingredients and not a recipe collection',
    );
  });

  it('shows the download only for a confirmed order, never before', () => {
    expect(render()).not.toContain('Pobierz PDF');
    const ready = render({ signedIn: true, orderNumber: 'G-20260917-ABC123' });
    expect(ready).toContain('Zamówienie przyjęte. Twój infopak jest gotowy.');
    expect(ready).toContain('Pobierz PDF');
    expect(ready).not.toContain('Zamów za 0 €');
  });

  it('says a refusal or a missing file plainly instead of "ready"', () => {
    const refused = render({ signedIn: true, notice: 'notAvailable' });
    expect(refused).toContain('Ten infopak nie jest jeszcze dostępny dla Twojego konta.');
    expect(refused).not.toContain('jest gotowy');
    expect(render({ signedIn: true, notice: 'fileMissing' })).toContain(
      'Plik jest chwilowo niedostępny.',
    );
  });

  it('renders nothing while the server says OFF', () => {
    expect(render({ state: 'OFF' })).toBe('');
  });

  it('asks a signed-out visitor to sign in and still offers the button', () => {
    const html = render({ signedIn: false });
    expect(html).toContain('Zaloguj się, aby zamówić infopak za 0 €.');
    expect(html).toContain('data-testid="shop-infopak-order"');
  });

  it('uses the committed cover image', () => {
    expect(render()).toContain(`src="${INFOPAK_IMAGE_SRC}"`);
    expect(existsSync(`public${INFOPAK_IMAGE_SRC}`)).toBe(true);
  });
});

describe('placement', () => {
  it('sits after "Kup osobno" and before the cart, outside the Starter Pack block', () => {
    const catalog = readFileSync('src/features/shop/ShopCatalog.tsx', 'utf8');
    const singles = catalog.indexOf('id="shop-singles"');
    const offer = catalog.indexOf('<ShopInfopakOffer />');
    const cart = catalog.indexOf('<ShopCart');
    expect(singles).toBeGreaterThan(-1);
    expect(offer).toBeGreaterThan(singles);
    expect(cart).toBeGreaterThan(offer);
  });
});
