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
  const registry = new Map<string, unknown>();
  const ports = fakes.ports({
    discovery,
    external: { research: async (identity) => registry.get(identity.canonicalGtin13) ?? null },
    externalTimeoutMs: 200,
  });
  (globalThis as Record<string, unknown>)['__realScannerRouteFakes'] = { discovery, registry };
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
import { ProductsHubPage } from '@/pages/destinations/GlobalDestinationPages';
import { ProductScannerV1Page } from '@/pages/products/ProductScannerV1Page';

const fakes = () =>
  (globalThis as Record<string, unknown>)['__realScannerRouteFakes'] as {
    discovery: FakeDiscovery;
    registry: Map<string, unknown>;
  };

const setValue = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

const flush = async () => {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
};

describe('real Hamburger → Produkty → Skanuj route', () => {
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
    fakes().registry.set(code, {
      provider: 'openfoodfacts',
      queriedAt: 1,
      query: code,
      confidence: 0.9,
      facts: [
        ['identity.displayName', 'Queso fresco batido desnatado'],
        ['identity.brand', 'Hacendado'],
        ['identity.quantity', '500 g'],
        ['category.tags', 'en:dairy;en:cheeses'],
        ['nutrition.basis', 'per_100g'],
        ['nutrition.energyKcal', '46'],
        ['ingredientsText', 'Leche desnatada pasteurizada y fermentos lácticos'],
      ].map(([field, value]) => ({
        field,
        value,
        sourceUrl: `https://world.openfoodfacts.org/product/${code}`,
        authority: 'barcode_registry',
      })),
    });
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
            <Route path="/products" element={<ProductsHubPage />} />
            <Route path="/products/scan" element={<ProductScannerV1Page />} />
          </Routes>
        </MemoryRouter>,
      );
    });

    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-testid="app-nav-trigger"]')!.click(),
    );
    await act(async () =>
      host.querySelector<HTMLAnchorElement>('[data-testid="app-nav-item-products"]')!.click(),
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
