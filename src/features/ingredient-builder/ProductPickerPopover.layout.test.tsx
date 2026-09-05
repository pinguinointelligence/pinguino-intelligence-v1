// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findDemoIngredient } from '@/data/demoIngredients';
import { HomeSection } from '@/features/home-creator/ui/HomeSection';
import type { IngredientLibrary } from './ingredientLibrary';
import { ProductPickerPopover } from './ProductPickerPopover';

const milk = findDemoIngredient('milk_3_5')!;
const library: IngredientLibrary = {
  ingredients: [milk],
  searchIndex: new Map([[milk.id, 'milk 3.5 dairy']]),
  nameIndex: new Map([[milk.id, 'milk 3.5']]),
  formIndex: new Map([[milk.id, 'dairy']]),
  source: 'demo',
  status: 'ready',
  serverSearch: false,
  products: [],
  productProvenance: new Map(),
};

const rect = (left: number, top: number, width: number, height: number): DOMRect =>
  ({
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect;

describe('ProductPickerPopover HOME width contract', () => {
  let host: HTMLDivElement;
  let root: Root;
  let homeRect: DOMRect;
  let proRect: DOMRect;
  let desktop = true;

  const setViewport = (width: number, height: number) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
  };

  const renderPicker = async (surface: 'home' | 'pro') => {
    const picker = (
      <ProductPickerPopover library={library} scope="BASE_FORMULATION" onAdd={() => {}} />
    );
    await act(async () => {
      root.render(
        <MemoryRouter>
          <QueryClientProvider client={new QueryClient()}>
            {surface === 'home' ? (
              <HomeSection id="recipe" productPickerWidthAnchor>
                {picker}
              </HomeSection>
            ) : (
              <>
                <div data-testid="workbench-editor-pane" />
                {picker}
              </>
            )}
          </QueryClientProvider>
        </MemoryRouter>,
      );
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]')!.click();
    });
    return document.body.querySelector<HTMLElement>('[role="dialog"]')!;
  };

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    homeRect = rect(440, 120, 720, 900);
    proRect = rect(80, 92, 824, 650);
    desktop = true;
    document.body.style.removeProperty('--gellatti-ui-scale');
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        get matches() {
          return desktop;
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.getAttribute('data-product-picker-width-anchor') === 'home-content') {
        return homeRect;
      }
      if (this.getAttribute('data-testid') === 'workbench-editor-pane') return proRect;
      return rect(0, 0, 44, 44);
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it.each([
    ['large desktop', 1600, 900, 440, 720],
    ['medium desktop', 1100, 800, 190, 720],
  ] as const)(
    'matches the HOME content container on %s',
    async (_label, width, height, left, size) => {
      setViewport(width, height);
      homeRect = rect(left, 120, size, 900);
      const dialog = await renderPicker('home');

      expect(
        document.querySelector('[data-product-picker-width-anchor="home-content"]'),
      ).not.toBeNull();
      expect(dialog.dataset.pickerPosition).toBe('anchored');
      expect(dialog.style.left).toBe(`${left}px`);
      expect(dialog.style.width).toBe(`${size}px`);
      expect(left + size).toBeLessThanOrEqual(width - 8);
    },
  );

  it('re-measures the HOME container after resize and keeps both edges aligned', async () => {
    setViewport(1600, 900);
    const dialog = await renderPicker('home');
    expect([dialog.style.left, dialog.style.width]).toEqual(['440px', '720px']);

    homeRect = rect(190, 120, 720, 900);
    setViewport(1100, 800);
    await act(async () => window.dispatchEvent(new Event('resize')));

    expect([dialog.style.left, dialog.style.width]).toEqual(['190px', '720px']);
  });

  it('bounds an oversized HOME container to safe desktop margins', async () => {
    setViewport(1000, 800);
    homeRect = rect(4, 120, 1200, 900);
    const dialog = await renderPicker('home');

    expect(dialog.style.left).toBe('8px');
    expect(dialog.style.width).toBe('984px');
    expect(Number.parseFloat(dialog.style.left) + Number.parseFloat(dialog.style.width)).toBe(992);
  });

  it.each([
    ['tablet', 820, 900, 804],
    ['mobile', 390, 844, 374],
  ] as const)(
    'uses safe viewport margins without horizontal overflow on %s',
    async (_label, width, height, expectedWidth) => {
      desktop = false;
      setViewport(width, height);
      const dialog = await renderPicker('home');

      expect(dialog.dataset.pickerPosition).toBe('keyboard-safe-sheet');
      expect(dialog.style.left).toBe('8px');
      expect(dialog.style.width).toBe(`${expectedWidth}px`);
      expect(8 + expectedWidth).toBe(width - 8);
    },
  );

  it('preserves the existing PRO editor-pane geometry', async () => {
    setViewport(1440, 900);
    const dialog = await renderPicker('pro');

    expect(dialog.dataset.pickerPosition).toBe('anchored');
    expect(dialog.style.left).toBe('80px');
    expect(dialog.style.top).toBe('92px');
    expect(dialog.style.width).toBe('824px');
    expect(dialog.style.height).toBe('650px');
  });
});
