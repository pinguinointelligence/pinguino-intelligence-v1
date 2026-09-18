// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FakeDiscovery } from '@/scan-import-v2/__tests__/fakeDiscovery';

vi.mock('@/services/scanImportV2', async () => {
  const fakes = await import('@/scan-import-v2/__tests__/fakes');
  const { FakeDiscovery } = await import('@/scan-import-v2/__tests__/fakeDiscovery');
  const discovery = new FakeDiscovery();
  const ports = fakes.ports({
    discovery,
    external: null,
    externalTimeoutMs: 200,
  });
  (globalThis as Record<string, unknown>)['__realScannerRouteFakes'] = { discovery };
  return {
    createScanImportV2AppPorts: () => ports,
    getScanImportV2AccountId: async () => 'route-owner',
  };
});
vi.mock('./scanCoreCapture', () => ({
  ScanCoreCapture: { supported: () => false },
  describeCaptureError: () => 'no camera',
}));
vi.mock('@/features/global-catalog/GlobalCatalogSearchPanel', () => ({
  GlobalCatalogSearchPanel: () => <div data-testid="catalog-placeholder" />,
}));

import { AppShell } from '@/features/shell/AppShell';
import { useProCoreAccessStore } from '@/features/pro-core/proCoreAccessStore';
import { useAuthStore } from '@/stores/authStore';
import { ProductionHubPage, ProductsHubPage } from '@/pages/destinations/GlobalDestinationPages';
import { ProductScannerV1Page } from '@/pages/products/ProductScannerV1Page';

const fakes = () =>
  (globalThis as Record<string, unknown>)['__realScannerRouteFakes'] as {
    discovery: FakeDiscovery;
  };

const setValue = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

const flush = async () => {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
};

describe('real Hamburger → Produkcja → Produkty → Skanuj route', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    useAuthStore.setState({
      status: 'authed',
      user: { id: 'route-owner', email: null, displayName: null },
      available: true,
    });
    useProCoreAccessStore.setState({ devPersona: 'home' });
    fakes().discovery.sessions.clear();
    fakes().discovery.serverResult.clear();
    fakes().discovery.automaticFamily.clear();
    fakes().discovery.calls.length = 0;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('SCN-REAL-ROUTE-01 reaches the real catalog ScanFlow and blocks technical-only photo fallback', async () => {
    const code = '8480000510716';
    fakes().discovery.serverResult.set(code, {
      identity: {
        displayName: 'Queso fresco batido desnatado',
        originalName: 'Queso fresco batido desnatado',
        brand: 'Hacendado',
        category: 'en:dairy;en:cheeses',
      },
      package: { netQuantity: 500, unit: 'g', netQuantityText: '500 g' },
      nutrition: { basis: 'per_100g', energyKcal: 46 },
      ingredientsText: 'Leche desnatada pasteurizada y fermentos lácticos',
      externalSources: [
        {
          sourceType: 'barcode_registry',
          url: `https://world.openfoodfacts.org/api/v2/product/${code}.json`,
          title: 'Queso fresco batido desnatado · Hacendado',
          fieldsUsed: [
            'identity.displayName',
            'identity.brand',
            'identity.category',
            'package.netQuantity',
            'nutrition.basis',
            'nutrition.energyKcal',
            'ingredientsText',
          ],
          sourceAuthorityClass: 'STRUCTURED_PRODUCT_DATABASE',
          sourceStatedEan: code,
          sourceEanConfirmationMethod: 'url',
          sourceEanConfirmedAt: '2026-09-13T08:00:00.000Z',
          receiptId: `off:${code}:2026-09-13T08:00:00.000Z`,
          evidenceAuthority: 'AUTOMATIC_REGISTRY',
          confidence: 0.9,
        },
      ],
    });
    fakes().discovery.automaticFamily.set(code, 'dairy');
    fakes().discovery.notReadyMissing.set(code, [
      'MISSING_TOTAL_SOLIDS_PERCENT',
      'MISSING_WATER_PERCENT',
      'UNRESOLVED_SWEETENING_FREEZING_PATH',
    ]);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/home']}>
          <Routes>
            <Route path="/home" element={<AppShell>Home</AppShell>} />
            <Route path="/production" element={<ProductionHubPage />} />
            <Route path="/products" element={<ProductsHubPage />} />
            <Route path="/products/scan" element={<ProductScannerV1Page />} />
          </Routes>
        </MemoryRouter>,
      );
    });

    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-testid="app-nav-trigger"]')!.click(),
    );
    // Owner decision 2026-09-17: ☰ carries ONE „Produkcja” entry; Produkty is its section.
    await act(async () =>
      host.querySelector<HTMLAnchorElement>('[data-testid="app-nav-item-production"]')!.click(),
    );
    await act(async () =>
      host
        .querySelector<HTMLAnchorElement>('[data-testid="production-area-section-products"]')!
        .click(),
    );
    expect(host.textContent).toContain('Produkty');
    await act(async () => {
      [...host.querySelectorAll<HTMLAnchorElement>('a')]
        .find((link) => link.textContent?.trim() === 'Skanuj produkt')!
        .click();
    });
    expect(host.querySelector('[data-testid="scan-flow"]')).not.toBeNull();
    expect(host.querySelector('[data-scan-flow-mode="catalog"]')).not.toBeNull();

    const barcode = host.querySelector<HTMLInputElement>(
      'input[aria-label="Kod kreskowy z opakowania"]',
    )!;
    await act(async () => setValue(barcode, code));
    await act(async () =>
      [...host.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent?.trim() === 'Sprawdź')!
        .click(),
    );
    await flush();
    await flush();

    expect(host.textContent).toContain('Queso fresco batido desnatado');
    expect(host.textContent).toContain('Sucha masa produktu');
    expect(host.textContent).not.toContain('Zrób zdjęcie etykiety');
    expect(host.querySelectorAll('input[type="file"]')).toHaveLength(0);
  });
});
