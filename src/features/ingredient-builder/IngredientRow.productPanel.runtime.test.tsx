// @vitest-environment jsdom
/**
 * PRO MOBILE UX v2 · B10 / B11 — the product sheet of the collapsed line.
 *
 * B10 the everyday controls lead and „Moja cena" is secondary: folded to one
 *     row until asked for, with removing the ingredient in plain sight below it.
 * B11 the sheet is the one translucent dialog tone, so the recipe stays partly
 *     visible behind it, and the line it edits is marked in the list.
 * jsdom applies no CSS: the fold is asserted through its state attributes.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateRecipe } from '@/engine';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { IngredientRow, type IngredientRowActions } from './IngredientRow';
import { DEFAULT_INGREDIENT_ROW_META } from './ingredientTableUx';

const calculated = calculateRecipe(starterMilkBase());
const item = calculated.items[0]!;
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

const render = async () => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <IngredientRow
        item={item}
        totalBatchG={calculated.total_batch_g}
        actions={actions()}
        meta={DEFAULT_INGREDIENT_ROW_META}
        canMoveUp={false}
        canMoveDown
        mainUnavailableReason={null}
      />,
    );
  });
};

const click = async (element: Element | null | undefined) => {
  expect(element).toBeTruthy();
  await act(async () => element?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
};

const openSheet = async () => {
  await click(
    document.querySelector(`[aria-label="${item.ingredient.name} — otwórz edycję składnika"]`),
  );
  const sheet = document.querySelector(`[data-testid="ingredient-mobile-sheet-${item.id}"]`);
  expect(sheet).not.toBeNull();
  return sheet!;
};

const line = () => document.querySelector(`[data-testid="row-mobile-line-${item.id}"]`);

describe('B11 — the product sheet keeps its recipe in view', () => {
  it('opens in the translucent context tone and marks the line it edits', async () => {
    await render();
    expect(line()?.getAttribute('data-editing')).toBeNull();
    const sheet = await openSheet();
    expect(
      sheet.querySelector('[data-dialog-panel="gellatti"]')?.getAttribute('data-dialog-tone'),
    ).toBe('context');
    expect(line()?.getAttribute('data-editing')).toBe('true');

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(line()?.getAttribute('data-editing')).toBeNull();
  });
});

describe('B10 — „Moja cena" is secondary in the product sheet', () => {
  it('stays folded to one row until asked for, and opens on request', async () => {
    await render();
    const sheet = await openSheet();
    const secondary = sheet.querySelector(`[data-testid="article-price-secondary-${item.id}"]`);
    const toggle = sheet.querySelector(`[data-testid="article-price-toggle-${item.id}"]`);
    expect(secondary?.getAttribute('data-price-open')).toBe('false');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(toggle?.textContent).toContain('Moja cena i koszt');
    // The editor stays mounted — folding is presentation, not a lost control.
    expect(secondary?.querySelector('[data-testid="customer-price-editor"]')).not.toBeNull();

    await click(toggle);
    expect(secondary?.getAttribute('data-price-open')).toBe('true');
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
  });

  it('keeps ONE remove action, outside the folded price row', async () => {
    await render();
    const sheet = await openSheet();
    const removes = sheet.querySelectorAll('button[aria-label="Usuń z receptury"]');
    expect(removes).toHaveLength(1);
    expect(
      sheet
        .querySelector(`[data-testid="article-price-secondary-${item.id}"]`)
        ?.contains(removes[0]!),
    ).toBe(false);
  });
});
