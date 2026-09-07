// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductScannerV1Page } from '@/pages/products/ProductScannerV1Page';

/**
 * Produkty → „Skanuj produkt” is the shared scan flow (camera → Scan Core → EAN/GTIN →
 * Scan Import 2.0). Under jsdom there is no camera, so the flow must degrade to the typed code
 * without any extra gate — and it must never show a technical parameter to the customer.
 */
describe('Product Scanner destination — shared scan flow', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root.render(
        <MemoryRouter>
          <ProductScannerV1Page />
        </MemoryRouter>,
      );
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it('mounts the one shared flow in catalogue mode', () => {
    const flow = host.querySelector('[data-testid="scan-flow"]');
    expect(flow).not.toBeNull();
    expect(flow?.getAttribute('data-scan-flow-mode')).toBe('catalog');
    expect(host.textContent).toContain('Skanuj produkt');
  });

  it('without a camera it degrades to the typed code, with no extra form gate', () => {
    const code = host.querySelector('input[aria-label="Kod kreskowy z opakowania"]');
    expect(code).not.toBeNull();
    expect(host.textContent).toContain('Wpisz kod z opakowania');
    expect(host.querySelector('input[type="checkbox"]')).toBeNull();
  });

  it('never shows a technical parameter to the customer', () => {
    expect(host.textContent).not.toMatch(/\b(PAC|POD|NPAC|Mapper|ProductBehavior)\b/);
  });
});
