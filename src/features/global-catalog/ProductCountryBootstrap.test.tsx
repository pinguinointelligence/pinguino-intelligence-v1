// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCatalogMarketPreferences: vi.fn(),
}));

vi.mock('@/services/globalCatalog', () => ({
  getCatalogMarketPreferences: mocks.getCatalogMarketPreferences,
}));

import { ProductCountryBootstrap } from './ProductCountryBootstrap';

describe('ProductCountryBootstrap', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCatalogMarketPreferences.mockResolvedValue({});
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('bootstraps guest Product Country even when no live picker surface opens', async () => {
    await act(async () => {
      root.render(<ProductCountryBootstrap />);
    });
    expect(mocks.getCatalogMarketPreferences).toHaveBeenCalledTimes(1);
  });

  it('never blocks app rendering when the country authority is unavailable', async () => {
    mocks.getCatalogMarketPreferences.mockRejectedValue(new Error('edge unavailable'));
    await act(async () => {
      root.render(<ProductCountryBootstrap />);
    });
    expect(host.innerHTML).toBe('');
  });
});
