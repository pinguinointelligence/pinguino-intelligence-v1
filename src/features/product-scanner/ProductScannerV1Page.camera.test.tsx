// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductScannerV1Page } from '@/pages/products/ProductScannerV1Page';

describe('Product Scanner native camera boundary', () => {
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

  const button = (label: string) =>
    [...host.querySelectorAll('button')].find(
      (item) => item.textContent === label,
    ) as HTMLButtonElement;

  it('requires privacy consent before native capture or gallery access', async () => {
    expect(button('Zrób zdjęcie').disabled).toBe(true);
    expect(button('Wybierz zdjęcia').disabled).toBe(true);
    const checkbox = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    await act(async () => checkbox.click());
    expect(button('Zrób zdjęcie').disabled).toBe(false);
    expect(button('Wybierz zdjęcia').disabled).toBe(false);
  });

  it('uses the system rear-camera file contract and never embeds a video viewport', () => {
    const capture = host.querySelector<HTMLInputElement>(
      'input[type="file"][capture="environment"]',
    );
    expect(capture).not.toBeNull();
    expect(capture?.accept).toContain('image/jpeg');
    expect(host.querySelector('video')).toBeNull();
  });

  it('keeps a separate multiple-photo gallery fallback', () => {
    const gallery = [...host.querySelectorAll<HTMLInputElement>('input[type="file"]')].find(
      (input) => !input.hasAttribute('capture'),
    );
    expect(gallery?.multiple).toBe(true);
    expect(gallery?.accept).toContain('image/heic');
  });
});
