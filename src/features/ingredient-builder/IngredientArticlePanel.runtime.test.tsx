// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateRecipe } from '@/engine';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { IngredientRow, type IngredientRowActions } from './IngredientRow';
import { DEFAULT_INGREDIENT_ROW_META, type IngredientRowMeta } from './ingredientTableUx';

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

const renderRow = async (
  actions: IngredientRowActions,
  item = baseItem,
  canMoveUp = false,
  canMoveDown = true,
  mainUnavailableReason: string | null = null,
  meta: IngredientRowMeta = DEFAULT_INGREDIENT_ROW_META,
) => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <IngredientRow
        item={item}
        totalBatchG={calculated.total_batch_g}
        actions={actions}
        meta={meta}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        mainUnavailableReason={mainUnavailableReason}
      />,
    );
  });
};

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

const click = async (element: Element | null) => {
  expect(element).not.toBeNull();
  await act(async () => element?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
};

describe('compact ingredient article panel', () => {
  it('renders the desktop actions as one compact icon grid and preserves disabled movement', async () => {
    const rowActions = actions();
    await renderRow(rowActions);
    await click(
      document.querySelector(`[aria-label="Opcje składnika ${baseItem.ingredient.name}"]`),
    );

    const panel = document.querySelector(`[data-testid="row-menu-${baseItem.id}"]`);
    expect(panel?.getAttribute('data-placement')).toBe('responsive');
    expect(panel?.getAttribute('data-overlay-scope')).toBe('viewport');
    expect(panel?.className).toContain('sm:justify-center');
    expect(host?.querySelector(`[data-testid="row-menu-${baseItem.id}"]`)).toBeNull();
    expect(panel?.parentElement).toBe(document.body);
    const quickActions = panel?.querySelector('[data-testid="article-panel-quick-actions"]');
    expect(quickActions).not.toBeNull();
    expect(quickActions?.getAttribute('data-control-height')).toBe('36');
    expect(
      panel
        ?.querySelector('[data-testid="article-panel-role-control"]')
        ?.getAttribute('data-control-height'),
    ).toBe('36');
    const iconActions = [
      ...(panel?.querySelectorAll<HTMLButtonElement>('[data-article-action="true"]') ?? []),
    ];
    expect(iconActions).toHaveLength(6);
    expect(iconActions.every((action) => action.className.includes('h-9'))).toBe(true);
    expect(panel?.querySelectorAll('[data-icon-family="gellatti-line"]')).toHaveLength(6);
    expect(panel?.querySelector('[data-testid="article-panel-header"]')).not.toBeNull();
    expect(panel?.textContent).not.toContain('Standardowy');
    expect(panel?.textContent).not.toContain('Kolejność');

    const main = panel?.querySelector<HTMLButtonElement>('[aria-label="Ustaw jako główny"]');
    const up = panel?.querySelector<HTMLButtonElement>('[aria-label="Przesuń wyżej"]');
    const down = panel?.querySelector<HTMLButtonElement>('[aria-label="Przesuń niżej"]');
    const swap = panel?.querySelector<HTMLButtonElement>('[aria-label="Znajdź zamiennik"]');
    const data = panel?.querySelector<HTMLButtonElement>('[aria-label="Dane składnika"]');
    const required = panel?.querySelector<HTMLButtonElement>('[aria-label="Oznacz jako wymagany"]');
    const unavailable = panel?.querySelector<HTMLButtonElement>(
      '[aria-label="Oznacz jako niedostępny"]',
    );

    expect(main).not.toBeNull();
    expect(up?.disabled).toBe(true);
    expect(down?.disabled).toBe(false);
    expect(down?.hasAttribute('aria-pressed')).toBe(false);
    expect(swap).not.toBeNull();
    expect(data).not.toBeNull();
    expect(required).not.toBeNull();
    expect(required?.getAttribute('aria-pressed')).toBe('false');
    expect(unavailable).not.toBeNull();
    await click(down ?? null);
    expect(rowActions.moveDown).toHaveBeenCalledWith(baseItem.id);
  });

  it('uses the same compact actions on mobile and routes Main through existing authority', async () => {
    const rowActions = actions();
    await renderRow(rowActions);
    await click(
      document.querySelector(
        `[aria-label="${baseItem.ingredient.name} — otwórz edycję składnika"]`,
      ),
    );

    const sheet = document.querySelector(`[data-testid="ingredient-mobile-sheet-${baseItem.id}"]`);
    expect(sheet?.querySelector('[data-testid="article-panel-quick-actions"]')).not.toBeNull();
    expect(sheet?.textContent).not.toContain('Więcej opcji składnika');
    expect(sheet?.textContent?.match(/Moja cena wymaga/g)).toHaveLength(1);
    const main = sheet?.querySelector<HTMLButtonElement>('[aria-label="Ustaw jako główny"]');
    await click(main ?? null);
    expect(rowActions.setCustomerRole).toHaveBeenCalledWith(baseItem.id, 'main');
  });

  it('shows an active Main as the accepted compact badge and demotes through existing authority', async () => {
    const rowActions = actions();
    await renderRow(rowActions, { ...baseItem, lock_type: 'main' });
    await click(
      document.querySelector(`[aria-label="Opcje składnika ${baseItem.ingredient.name}"]`),
    );

    const panel = document.querySelector(`[data-testid="row-menu-${baseItem.id}"]`);
    const badge = panel?.querySelector<HTMLButtonElement>('[data-main-presentation="badge"]');
    expect(badge?.textContent).toBe('Główny');
    expect(badge?.getAttribute('aria-label')).toBe('Usuń rolę główną');
    expect(badge?.className).toContain('h-9');
    const ratio = panel?.querySelector('[data-testid="article-panel-main-ratio"]');
    expect(ratio?.getAttribute('data-visual-priority')).toBe('quiet');
    expect(ratio?.textContent).toContain('Proporcja Main');
    expect(ratio?.textContent).not.toContain('Waga proporcji');
    await click(badge ?? null);
    expect(rowActions.setCustomerRole).toHaveBeenCalledWith(baseItem.id, 'standard');
  });

  it('keeps an ineligible Main trigger visible but disabled with its authority reason', async () => {
    const reason = 'Ten składnik nie może być Główny.';
    await renderRow(actions(), baseItem, true, true, reason);
    await click(
      document.querySelector(`[aria-label="Opcje składnika ${baseItem.ingredient.name}"]`),
    );

    const panel = document.querySelector(`[data-testid="row-menu-${baseItem.id}"]`);
    const main = panel?.querySelector<HTMLButtonElement>('[aria-label="Ustaw jako główny"]');
    expect(main?.disabled).toBe(true);
    expect(main?.title).toBe(reason);
    expect(panel?.textContent).toContain(reason);
  });

  it('keeps a compact Standard resolution for blocked legacy Add-on ambiguity', async () => {
    const rowActions = actions();
    await renderRow(rowActions, baseItem, true, true, 'Main niedostępny.', {
      ...DEFAULT_INGREDIENT_ROW_META,
      role: 'addition',
    });
    await click(
      document.querySelector(`[aria-label="Opcje składnika ${baseItem.ingredient.name}"]`),
    );

    const standard = document.querySelector<HTMLButtonElement>(
      '[aria-label="Ustaw jako Standardowy"]',
    );
    expect(standard).not.toBeNull();
    await click(standard);
    expect(rowActions.setCustomerRole).toHaveBeenCalledWith(baseItem.id, 'standard');
  });

  it('opens ingredient data as a compact responsive drawer', async () => {
    await renderRow(actions());
    await click(
      document.querySelector(`[aria-label="Opcje składnika ${baseItem.ingredient.name}"]`),
    );
    await click(document.querySelector('[aria-label="Dane składnika"]'));

    const data = document.querySelector('[data-testid="ingredient-data-dialog"]');
    expect(data?.getAttribute('data-placement')).toBe('responsive');
    const list = data?.querySelector('[data-testid="ingredient-data-compact-list"]');
    expect(list).not.toBeNull();
    expect(list?.children).toHaveLength(6);
  });

  it('opens the existing substitute flow as a responsive compact sheet', async () => {
    await renderRow(actions());
    await click(
      document.querySelector(`[aria-label="Opcje składnika ${baseItem.ingredient.name}"]`),
    );
    await click(document.querySelector('[aria-label="Znajdź zamiennik"]'));

    const substitute = document.querySelector('[data-testid="ingredient-substitute-dialog"]');
    expect(substitute?.getAttribute('data-placement')).toBe('responsive');
  });
});
