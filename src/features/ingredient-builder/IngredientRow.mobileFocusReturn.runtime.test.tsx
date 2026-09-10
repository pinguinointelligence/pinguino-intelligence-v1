// @vitest-environment jsdom
/**
 * PRO MOBILE UX v2 · A11 — closing the mobile product sheet returns the reader to
 * the recipe line that opened it, so the page does not jump.
 *
 * Found during the A11 regression on the local DEV server: after Escape, focus
 * landed on the header's hamburger and the document scrolled to the top
 * (232 → 0 px at 375 × 600). That is React StrictMode's DEV-only double effect:
 * the second mount records the sheet's own back button as the "previous focus",
 * so DialogShell falls back to the first control on the page. Production mounts
 * effects once. This pins the production path with the REAL mobile row: a plain
 * root, exactly as the app mounts in a production build.
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

describe('A11 — the mobile product sheet gives focus back to its recipe line', () => {
  it('returns focus to the line that opened the sheet (production mount)', async () => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(
        <>
          {/* The page's FIRST control, like the header hamburger. DialogShell's
              last-resort fallback lands here, so a pass cannot come from that
              fallback happening to pick the row. */}
          <button type="button" data-testid="page-first-control">
            Otwórz menu
          </button>
          <IngredientRow
            item={baseItem}
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

    const line = document.querySelector<HTMLButtonElement>(
      `[aria-label="${baseItem.ingredient.name} — otwórz edycję składnika"]`,
    )!;
    expect(line).not.toBeNull();
    line.focus();
    await act(async () => line.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const sheet = () =>
      document.querySelector(`[data-testid="ingredient-mobile-sheet-${baseItem.id}"]`);
    expect(sheet()).not.toBeNull();
    expect(sheet()?.contains(document.activeElement)).toBe(true);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    // DialogShell restores after the commit that closed it.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(sheet()).toBeNull();
    expect(document.activeElement).toBe(line);
  });
});
