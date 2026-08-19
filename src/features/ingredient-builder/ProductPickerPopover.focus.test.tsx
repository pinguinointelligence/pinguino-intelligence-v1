// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findDemoIngredient } from '@/data/demoIngredients';
import type { IngredientLibrary } from './ingredientLibrary';
import { ProductPickerPopover } from './ProductPickerPopover';

vi.mock('@/services/globalCatalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/globalCatalog')>()),
  markCatalogProductUsed: vi.fn().mockResolvedValue(undefined),
}));

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

describe('ProductPickerPopover duplicate focus handoff', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('closes without a second row and focuses the existing Base line returned by onAdd', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    const existingRow = document.createElement('div');
    existingRow.dataset.lineId = 'existing-generated-milk';
    existingRow.tabIndex = -1;
    document.body.append(existingRow);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const onAdd = vi.fn();
    const onPreflightDuplicate = vi.fn(() => ({
      focusLineId: 'existing-generated-milk',
    }));

    await act(async () => {
      root.render(
        <MemoryRouter>
          <QueryClientProvider client={new QueryClient()}>
            <ProductPickerPopover
              library={library}
              scope="BASE_FORMULATION"
              onPreflightDuplicate={onPreflightDuplicate}
              onAdd={onAdd}
            />
          </QueryClientProvider>
        </MemoryRouter>,
      );
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const option = document.body.querySelector<HTMLButtonElement>('[role="option"]');
    expect(option).not.toBeNull();

    await act(async () => {
      option!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(onPreflightDuplicate).toHaveBeenCalledTimes(1);
    expect(onAdd).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(existingRow);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    act(() => root.unmount());
  });
});
