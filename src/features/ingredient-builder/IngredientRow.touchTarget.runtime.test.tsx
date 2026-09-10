// @vitest-environment jsdom
/**
 * PRO MOBILE UX v2 · A8 + A10 — owner review, 2026-09-10.
 *
 * A8 — on a TOUCH device the whole product row opens the existing product panel in
 * every layout. Below 960 px the collapsed line already is one tap target. From
 * 960 px (a touch tablet) the desktop row gains a surface UNDER its controls that
 * CSS shows only for a coarse pointer. jsdom applies no CSS, so these tests pin the
 * DOM and the wiring; the stylesheet contract lives in proMobileTouchTargets.test.ts.
 * The surface calls the SAME action as •••, stays out of the tab order and away from
 * assistive technology (••• remains the accessible control), and closing a panel it
 * opened returns focus to ••• — never to the page's first control.
 *
 * A10 — the small estimated-data dot beside the ingredient icon is removed (owner
 * decision). The uncertainty itself stays readable in the product data view.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateRecipe } from '@/engine';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { IngredientRow, type IngredientRowActions } from './IngredientRow';
import { DEFAULT_INGREDIENT_ROW_META } from './ingredientTableUx';

const calculated = calculateRecipe(starterMilkBase());
const baseItem = calculated.items[0]!;
const estimatedItem = {
  ...baseItem,
  ingredient: { ...baseItem.ingredient, is_verified: false, confidence_score: 82 },
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

const actions = (): IngredientRowActions => ({
  setPlannedGrams: vi.fn(),
  setActualGrams: vi.fn(),
  setLockType: vi.fn(),
  setMainIngredient: vi.fn(),
  setStandardIngredient: vi.fn(),
  setCustomerRole: vi.fn(),
  setMainRatioWeight: vi.fn(),
  removeItem: vi.fn(),
  toggleRequired: vi.fn(),
  setIngredientUnavailable: vi.fn(),
  requestSubstitutes: vi.fn(async () => []),
  moveUp: vi.fn(),
  moveDown: vi.fn(),
});

const render = async (item = baseItem) => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <>
        {/* The page's FIRST control, like the header hamburger. */}
        <button type="button" data-testid="page-first-control">
          Otwórz menu
        </button>
        <IngredientRow
          item={item}
          totalBatchG={calculated.total_batch_g}
          actions={actions()}
          meta={DEFAULT_INGREDIENT_ROW_META}
          canMoveUp={false}
          canMoveDown
          mainUnavailableReason={null}
        />
      </>,
    );
  });
};

const click = async (element: Element | null) => {
  expect(element).not.toBeNull();
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

const touchSurface = () =>
  document.querySelector<HTMLButtonElement>(`[data-testid="row-touch-target-${baseItem.id}"]`);
const moreButton = () =>
  document.querySelector<HTMLButtonElement>(
    `[aria-label="Opcje składnika ${baseItem.ingredient.name}"]`,
  );
const productPanel = () => document.querySelector(`[data-testid="row-menu-${baseItem.id}"]`);

describe('A8 — a touch tap anywhere on the desktop-layout row opens the product panel', () => {
  it('opens the SAME product panel as •••', async () => {
    await render();
    await click(touchSurface());
    expect(productPanel()).not.toBeNull();
    await closeWithEscape();
    expect(productPanel()).toBeNull();

    await click(moreButton());
    expect(productPanel()).not.toBeNull();
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

  it('returns focus to ••• when a panel opened from the row closes — never to the page’s first control', async () => {
    await render();
    await click(touchSurface());
    await closeWithEscape();
    expect(document.activeElement).toBe(moreButton());
  });

  it('leaves the row’s own controls to themselves', async () => {
    await render();
    const desktopRow = document.querySelector('.pro-ingredient-row-desktop');
    const stepper = desktopRow?.querySelector<HTMLButtonElement>('button[aria-label$="zwiększ"]');
    expect(stepper).toBeTruthy();
    expect(touchSurface()?.contains(stepper ?? null)).toBe(false);
    await click(stepper ?? null);
    expect(productPanel()).toBeNull();
  });

  it('leaves the drag handle to itself: it is not part of the surface and a tap on it opens nothing', async () => {
    await render();
    const desktopRow = document.querySelector('.pro-ingredient-row-desktop');
    const handle = desktopRow?.querySelector<HTMLElement>('[draggable="true"]');
    expect(handle).toBeTruthy();
    expect(touchSurface()?.contains(handle ?? null)).toBe(false);
    await click(handle ?? null);
    expect(productPanel()).toBeNull();
  });
});

describe('A10 — no estimated-data badge beside the ingredient icon', () => {
  it('shows no dot on the recipe line or the desktop row of an estimated product', async () => {
    await render(estimatedItem);
    expect(document.querySelector('[data-testid^="row-estimated-"]')).toBeNull();
    expect(host?.innerHTML).not.toContain('Część danych składnika jest szacowana.');
  });

  it('keeps the uncertainty readable, in words, in the product data view', async () => {
    await render(estimatedItem);
    await click(
      document.querySelector(
        `[aria-label="${estimatedItem.ingredient.name} — otwórz edycję składnika"]`,
      ),
    );
    const sheet = document.querySelector(`[data-testid="ingredient-mobile-sheet-${baseItem.id}"]`);
    await click(sheet?.querySelector('[aria-label="Informacja o roli składnika"]') ?? null);
    const data = sheet?.querySelector('[data-testid="ingredient-data-view"]');
    expect(data?.textContent).toContain('Częściowo szacowane');
  });
});
