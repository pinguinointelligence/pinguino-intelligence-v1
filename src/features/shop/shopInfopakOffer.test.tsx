import { readFileSync, existsSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { shopCopyEn, shopCopyPl } from '@/copy/shop';
import {
  STARTER_LOCAL_DOCUMENT_KEY,
  findActiveDocumentOrder,
  type MyDocumentOrder,
} from '@/services/shopDigitalDocument';
import { withDocumentMarkets, type ShopCountry } from '@/services/shopCountries';
import {
  INFOPAK_IMAGE_SRC,
  ShopInfopakOfferView,
  type ShopInfopakOfferViewProps,
} from './ShopInfopakOffer';

const base: ShopInfopakOfferViewProps = {
  offered: true,
  marketState: 'READY',
  countryName: 'Polska',
  languages: ['pl'],
  language: 'pl',
  onLanguage: () => {},
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
  });

  it('describes the seven Starter Pack items for the chosen country, never "75 countries in one file"', () => {
    const items = new Map([
      [
        shopCopyPl,
        [
          'dekstrozę',
          'mleko odtłuszczone w proszku',
          'śmietankę w proszku',
          'fruktozę',
          'inulinę',
          'suszone żółtko jaja',
          'stabilizator',
        ],
      ],
      [
        shopCopyEn,
        [
          'dextrose',
          'skim milk powder',
          'cream powder',
          'fructose',
          'inulin',
          'dried egg yolk',
          'stabilizer',
        ],
      ],
    ]);
    for (const [copy, names] of items) {
      const text = [copy.infopak.lede, ...copy.infopak.description, ...copy.infopak.details].join(
        ' ',
      );
      expect(text).not.toMatch(/75/);
      for (const name of names) expect(copy.infopak.description.join(' ')).toContain(name);
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

  it('tells a signed-in account without a plan that ordering needs HOME or PRO, and keeps the offer open', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ShopInfopakOfferView {...base} signedIn notice="planRequired" />
      </MemoryRouter>,
    );
    expect(html).toContain(
      'Zamawianie w sklepie jest dostępne z aktywnym planem Gellatti HOME lub PRO.',
    );
    expect(html).toContain('data-testid="shop-infopak-plan-required-plans"');
    expect(html).toContain('href="/subscription"');
    expect(html).toContain('Wybierz plan');
    // No paywall over the shop: the offer, its price and the order button stay where they were.
    expect(html).toContain('Gellatti — Składniki bazy lodów');
    expect(html).toContain('PDF · 0 €');
    expect(html).toContain('data-testid="shop-infopak-order"');
  });

  it('offers the way to a plan only for the plan refusal', () => {
    for (const notice of ['notAvailable', 'fileMissing', 'failed', 'downloadFailed'] as const) {
      const html = render({ signedIn: true, notice });
      expect(html).toContain('data-testid="shop-infopak-notice"');
      expect(html).not.toContain('shop-infopak-plan-required');
    }
  });

  it('takes the plan refusal from the server, never from a plan flag in the browser', () => {
    const offer = readFileSync('src/features/shop/ShopInfopakOffer.tsx', 'utf8');
    expect(offer).toContain("if (code === PLAN_REQUIRED) return 'planRequired';");
    expect(offer).not.toMatch(/hasHome|hasPro|canHome|canPro|effectiveAccess|useHomeEntitlement/);
  });

  it('renders nothing while no market offers the document', () => {
    expect(render({ offered: false })).toBe('');
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

describe('one offer, made per country and language', () => {
  it('asks for a country first and never offers an order without one', () => {
    const html = render({
      marketState: 'CHOOSE_COUNTRY',
      countryName: null,
      languages: [],
      language: null,
    });
    expect(html).toContain('Wybierz kraj, a zamówisz PDF przygotowany dla Twojego kraju.');
    expect(html).toContain('href="#shop-country"');
    expect(html).not.toContain('data-testid="shop-infopak-order"');
  });

  it('says honestly when the chosen country has no PDF yet', () => {
    const html = render({
      marketState: 'NOT_READY',
      countryName: 'Japonia',
      languages: [],
      language: null,
    });
    expect(html).toContain('PDF dla kraju: Japonia jeszcze przygotowujemy.');
    expect(html).not.toContain('data-testid="shop-infopak-order"');
  });

  it('names the country and language, and lets a multilingual country pick its version', () => {
    const single = render();
    expect(single).toContain('Polska');
    expect(single).toContain('polski');
    expect(single).not.toContain('data-testid="shop-infopak-language"');
    const belgium = render({ countryName: 'België', languages: ['fr', 'nl'], language: 'nl' });
    expect(belgium).toContain('data-testid="shop-infopak-language"');
    expect(belgium).toContain('niderlandzki');
    expect(belgium).toContain('francuski');
  });

  it('finds the account order for THAT market and language only', () => {
    const order = (overrides: Partial<MyDocumentOrder>): MyDocumentOrder => ({
      id: 'id',
      orderNumber: 'G-20260917-AAA111',
      status: 'paid',
      createdAt: '2026-09-17T12:00:00Z',
      totalCents: 0,
      currency: 'EUR',
      documentKey: STARTER_LOCAL_DOCUMENT_KEY,
      documentVersion: '1.0',
      language: 'nl',
      countryIso2: 'BE',
      emailStatus: 'queued',
      ...overrides,
    });
    const orders = [
      order({
        id: 'base-guide',
        documentKey: 'GELATO_BASE_INGREDIENTS',
        countryIso2: null,
        language: 'en',
      }),
      order({ id: 'be-cancelled', status: 'cancelled' }),
      order({ id: 'be-nl' }),
      order({ id: 'be-fr', language: 'fr' }),
    ];
    const key = STARTER_LOCAL_DOCUMENT_KEY;
    expect(findActiveDocumentOrder(orders, key, { countryIso2: 'BE', language: 'nl' })?.id).toBe(
      'be-nl',
    );
    expect(findActiveDocumentOrder(orders, key, { countryIso2: 'BE', language: 'fr' })?.id).toBe(
      'be-fr',
    );
    expect(findActiveDocumentOrder(orders, key, { countryIso2: 'PL', language: 'pl' })).toBeNull();
    expect(
      findActiveDocumentOrder(undefined, key, { countryIso2: 'BE', language: 'nl' }),
    ).toBeNull();
  });

  it('adds document markets to the one country list without inventing shipping', () => {
    const country = (over: Partial<ShopCountry>): ShopCountry => ({
      iso2: 'PL',
      name: 'Polska',
      physicalAvailable: true,
      localIntended: false,
      localLive: false,
      missingComponents: [],
      componentsRequired: 7,
      componentsReady: 0,
      ...over,
    });
    const merged = withDocumentMarkets(
      [country({}), country({ iso2: 'US', name: 'United States', physicalAvailable: false })],
      [
        {
          countryIso2: 'PL',
          variants: [{ language: 'pl', state: 'TEST_ACCOUNTS_ONLY', orderable: false }],
        },
        {
          countryIso2: 'JP',
          variants: [{ language: 'ja', state: 'TEST_ACCOUNTS_ONLY', orderable: false }],
        },
      ],
    );
    expect(merged.map((entry) => entry.iso2).sort()).toEqual(['JP', 'PL', 'US']);
    const japan = merged.find((entry) => entry.iso2 === 'JP');
    expect(japan).toMatchObject({
      physicalAvailable: false,
      localLive: false,
      documentAvailable: true,
    });
    expect(japan?.name).toBe('日本');
    expect(merged.find((entry) => entry.iso2 === 'PL')?.documentAvailable).toBe(true);
    expect(merged.find((entry) => entry.iso2 === 'US')?.documentAvailable).toBe(false);
  });

  it('continues the clicked market after sign-in and keeps one order per market', () => {
    const offer = readFileSync('src/features/shop/ShopInfopakOffer.tsx', 'utf8');
    expect(offer).toContain('rememberInfopakIntent(choice)');
    expect(offer).toContain('orderDocument(STARTER_LOCAL_DOCUMENT_KEY, target)');
    expect(offer).toContain(
      'findActiveDocumentOrder(knownDocuments, STARTER_LOCAL_DOCUMENT_KEY, intent)',
    );
    expect(offer).toContain("queryKey: ['shop-documents', 'mine']");
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

  it('is the only 0 € path: the Starter Pack local button leads to it, not to a second product', () => {
    const catalog = readFileSync('src/features/shop/ShopCatalog.tsx', 'utf8');
    expect(catalog).toContain("getElementById('shop-infopak')");
    expect(catalog).not.toContain("navigate('/shop/local-starter-pack')");
  });
});
