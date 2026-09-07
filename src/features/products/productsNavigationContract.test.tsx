// @vitest-environment jsdom
/**
 * OWNER CORRECTION 2026-09-07 — the product area has ONE hamburger entry.
 *
 * PR #219 promoted „Dodaj produkt" and „Niezweryfikowane" to the drawer as destinations of their
 * own, so the same area appeared three times in one menu. „Skanuj produkt" is an ACTION on the
 * products page and „Niezweryfikowane" is a FILTER of its list; neither is a destination. These are
 * the owner's eight contract points, in their order.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { visibleNavItems } from '../shell/appNav';
import { ProductsFilterTabs } from './ProductsFilterTabs';
import { productsReturnPath } from './productsFilter';
import { UnverifiedProductsPanel } from './UnverifiedProductsPanel';

const REPO = join(import.meta.dirname, '..', '..', '..');

vi.mock('@/services/unverifiedProducts', () => ({
  fetchMyUnverifiedProducts: vi.fn(),
}));
import { fetchMyUnverifiedProducts } from '@/services/unverifiedProducts';

describe('the hamburger carries one product entry', () => {
  for (const audience of ['home', 'pro'] as const) {
    it(`1. ${audience}: exactly one „Produkty"`, () => {
      const items = visibleNavItems(audience);
      expect(items.filter((item) => item.label === 'Produkty')).toHaveLength(1);
      expect(
        items.filter((item) => item.group === 'product' && item.to.startsWith('/products')).length,
      ).toBe(1);
    });

    it(`2. ${audience}: no „Dodaj produkt"`, () => {
      const items = visibleNavItems(audience);
      expect(items.map((item) => item.label)).not.toContain('Dodaj produkt');
      expect(items.map((item) => item.id)).not.toContain('scanProduct');
      expect(items.some((item) => item.to === '/products/scan')).toBe(false);
    });

    it(`3. ${audience}: no „Niezweryfikowane"`, () => {
      const items = visibleNavItems(audience);
      expect(items.map((item) => item.label)).not.toContain('Niezweryfikowane');
      expect(items.map((item) => item.id)).not.toContain('unverifiedProducts');
      expect(items.some((item) => item.to.includes('filter=unverified'))).toBe(false);
    });
  }

  it('8. no two hamburger items are active at once, on any product URL', () => {
    const urls = [
      '/products',
      '/products?filter=unverified',
      '/products?filter=mine',
      '/products/scan',
      '/products/scan?code=8402001042911&from=unverified',
    ];
    for (const audience of ['home', 'pro'] as const) {
      for (const url of urls) {
        const [pathname = '/', search = ''] = url.split('?');
        const active = visibleNavItems(audience).filter((item) =>
          item.isActive({ pathname, search: search ? `?${search}` : '' }),
        );
        expect(
          active.map((item) => item.id),
          `${audience} ${url}`,
        ).toHaveLength(1);
      }
    }
  });
});

describe('the products page carries the action and the filters', () => {
  let host: HTMLDivElement;
  let root: Root;
  const text = () => host.textContent ?? '';

  const render = (initial: string, node: React.ReactNode) =>
    act(() => {
      root.render(<MemoryRouter initialEntries={[initial]}>{node}</MemoryRouter>);
    });

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    vi.mocked(fetchMyUnverifiedProducts).mockReset();
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('4. „Skanuj produkt" is an action on the products page, not a menu entry', () => {
    // the page's own source is the authority for its actions; the drawer contract is asserted above
    const page = readFileSync(
      join(REPO, 'src', 'pages', 'destinations', 'GlobalDestinationPages.tsx'),
      'utf8',
    );
    const hub = page.slice(page.indexOf('export function ProductsHubPage'));
    expect(hub).toContain('Skanuj produkt');
    expect(hub).toContain('to="/products/scan"');
  });

  it('5. the products page offers the „Niezweryfikowane" filter', async () => {
    await render('/products', <ProductsFilterTabs />);
    const labels = [...host.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent?.trim());
    expect(labels).toEqual(['Wszystkie', 'Moje produkty', 'Niezweryfikowane']);
  });

  it('5b. choosing a filter selects it in the URL, and „Wszystkie" leaves no residue', async () => {
    function Probe() {
      const location = useLocation();
      return <span data-testid="url">{`${location.pathname}${location.search}`}</span>;
    }
    await render(
      '/products',
      <>
        <ProductsFilterTabs />
        <Probe />
      </>,
    );
    const tab = (filter: string) =>
      host.querySelector<HTMLButtonElement>(`[role="tab"][data-filter="${filter}"]`)!;
    await act(async () => tab('unverified').click());
    expect(host.querySelector('[data-testid="url"]')?.textContent).toBe(
      '/products?filter=unverified',
    );
    expect(tab('unverified').getAttribute('aria-selected')).toBe('true');
    await act(async () => tab('all').click());
    expect(host.querySelector('[data-testid="url"]')?.textContent).toBe('/products');
  });

  it('6. the filter shows the caller’s own not-ready products, in plain words', async () => {
    vi.mocked(fetchMyUnverifiedProducts).mockResolvedValue([
      {
        productId: 'p-1',
        ean: '8402001042911',
        name: 'Cola Zero',
        brand: 'Hacendado',
        savedAt: '2026-09-07T02:53:51Z',
        missing: ['ingredients', 'nutrition_energyKcal'],
      },
    ]);
    await render('/products?filter=unverified', <UnverifiedProductsPanel />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(text()).toContain('Cola Zero');
    expect(text()).toContain('skład z etykiety');
    expect(text()).toContain('kalorie');
    // the list is the caller's own by construction: the RPC filters on the authenticated account
    const migration = readFileSync(
      join(REPO, 'supabase', 'migrations', '20260907030000_scanner_final_pr_pm_routing.sql'),
      'utf8',
    );
    const rpc = migration.slice(migration.indexOf('gellatti_my_unverified_products_v1'));
    expect(rpc).toContain('p.owning_account_id = v_uid');
    expect(rpc).toContain("p.product_kind = 'customer_provisional'");
    expect(rpc).toContain('gellattiReadiness,ready');
    expect(rpc).toContain('false');
  });

  it('7. leaving for the scanner and coming back keeps the list the customer was on', async () => {
    vi.mocked(fetchMyUnverifiedProducts).mockResolvedValue([
      {
        productId: 'p-1',
        ean: '8402001042911',
        name: 'Cola Zero',
        brand: null,
        savedAt: null,
        missing: ['ingredients'],
      },
    ]);
    await render('/products?filter=unverified', <UnverifiedProductsPanel />);
    await act(async () => {
      await Promise.resolve();
    });
    const complete = host.querySelector<HTMLAnchorElement>('[data-testid="unverified-complete"]')!;
    // the origin travels with the link…
    expect(complete.getAttribute('href')).toContain('from=unverified');

    // …and the scanner's back link is derived from it, by the function the page calls
    expect(productsReturnPath('unverified')).toBe('/products?filter=unverified');
    expect(productsReturnPath('mine')).toBe('/products?filter=mine');
    expect(productsReturnPath(null)).toBe('/products');
    expect(productsReturnPath('nonsense')).toBe('/products');
    const page = readFileSync(
      join(REPO, 'src', 'pages', 'products', 'ProductScannerV1Page.tsx'),
      'utf8',
    );
    expect(page).toContain("productsReturnPath(scanParams.get('from'))");
    expect(page).toContain('to={backTo}');
  });
});
