// @vitest-environment jsdom
/**
 * PRO MOBILE UX v2 · A8 — owner review, 2026-09-10 — the topping rows.
 *
 * Same contract as the recipe rows (IngredientRow.touchTarget.runtime.test.tsx): on
 * a touch device the whole desktop-layout topping row opens the topping options that
 * ••• opens, the surface stays out of the tab order and away from assistive
 * technology, closing returns focus to •••, and the row's own controls — the grams
 * stepper and the drag handle — keep their taps. jsdom applies no CSS; the
 * coarse-pointer stylesheet contract lives in proMobileTouchTargets.test.ts.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateRecipe } from '@/engine';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import type { RecipeToppingItem } from '@/features/recipe-composition/recipeCompositionPersistence';
import { ToppingRow } from './ToppingRow';
import type { IngredientLibrary } from './ingredientLibrary';
import type { IngredientPriceView } from './IngredientPriceControl';

const baseItem = calculateRecipe(starterMilkBase()).items[0]!;
const topping: RecipeToppingItem = {
  id: 'topping-product',
  ingredient: { ...baseItem.ingredient, id: 'topping-product' },
  planned_grams: 20,
  actual_grams: null,
  process_scope: 'POST_PROCESS_ADDON',
  addon_sort_order: 0,
};

const library: IngredientLibrary = {
  ingredients: [],
  searchIndex: new Map(),
  nameIndex: new Map(),
  formIndex: new Map(),
  source: 'demo',
  status: 'ready',
  serverSearch: false,
  products: [],
  productProvenance: new Map(),
};

const priceView: IngredientPriceView = {
  cost: {
    canonicalIngredientId: 'topping-product',
    pricePerKg: null,
    currency: 'EUR',
    source: 'missing',
    mapperPricePerKg: null,
    customerOverridePerKg: null,
    overrideId: null,
  },
  lineCost: null,
  canEdit: false,
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const render = async (onChange: (grams: number) => void = () => undefined) => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <QueryClientProvider client={new QueryClient()}>
        {/* The page's FIRST control, like the header hamburger. */}
        <button type="button" data-testid="page-first-control">
          Otwórz menu
        </button>
        <ToppingRow
          item={topping}
          priceView={priceView}
          canMoveUp={false}
          canMoveDown={false}
          onChange={onChange}
          onRemove={() => undefined}
          onReplace={() => undefined}
          library={library}
          onMove={() => undefined}
          onDragStart={() => undefined}
          onDrop={() => undefined}
          behaviorContext={{
            accountId: 'owner',
            productProfile: 'milk_gelato',
            temperatureC: -12,
            mode: 'optimal',
          }}
        />
      </QueryClientProvider>,
    );
  });
};

const click = async (element: Element | null | undefined) => {
  expect(element).toBeTruthy();
  await act(async () => element?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
};

const closeWithEscape = async () => {
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  // DialogShell restores focus after the commit that closed it.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const desktopRow = () => document.querySelector('.gellatti-row-touch-surface');
const touchSurface = () =>
  document.querySelector<HTMLButtonElement>(`[data-testid="topping-touch-target-${topping.id}"]`);
const moreButton = () =>
  desktopRow()?.querySelector<HTMLButtonElement>(
    `button[aria-haspopup="dialog"][aria-label="Opcje toppingu ${topping.ingredient.name}"]`,
  ) ?? null;
const toppingMenu = () => document.querySelector(`[data-testid="topping-menu-${topping.id}"]`);

describe('A8 — a touch tap anywhere on the desktop-layout topping row opens its options', () => {
  it('opens the SAME topping options as •••', async () => {
    await render();
    await click(touchSurface());
    expect(toppingMenu()).not.toBeNull();
    await closeWithEscape();
    expect(toppingMenu()).toBeNull();

    await click(moreButton());
    expect(toppingMenu()).not.toBeNull();
  });

  it('stays out of the tab order and away from assistive technology; ••• is the accessible control', async () => {
    await render();
    const surface = touchSurface();
    expect(surface).not.toBeNull();
    expect(surface?.tabIndex).toBe(-1);
    expect(surface?.getAttribute('aria-hidden')).toBe('true');
    expect(surface?.className).toContain('gellatti-row-touch-target');
    expect(surface?.childElementCount).toBe(0);
    expect(moreButton()?.getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('returns focus to ••• when options opened from the row close — never to the page’s first control', async () => {
    await render();
    await click(touchSurface());
    await closeWithEscape();
    expect(document.activeElement).toBe(moreButton());
  });

  it('leaves the grams stepper and the drag handle to themselves', async () => {
    const onChange = vi.fn();
    await render(onChange);
    const stepper = desktopRow()?.querySelector<HTMLButtonElement>('button[aria-label$="zwiększ"]');
    expect(stepper).toBeTruthy();
    expect(touchSurface()?.contains(stepper ?? null)).toBe(false);
    await click(stepper);
    expect(onChange).toHaveBeenCalled();
    expect(toppingMenu()).toBeNull();

    const handle = desktopRow()?.querySelector<HTMLElement>('[draggable="true"]');
    expect(handle).toBeTruthy();
    expect(touchSurface()?.contains(handle ?? null)).toBe(false);
    await click(handle);
    expect(toppingMenu()).toBeNull();
  });
});
