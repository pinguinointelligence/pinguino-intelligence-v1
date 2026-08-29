// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calculateRecipe } from '@/engine';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { IngredientRow, type IngredientRowActions } from './IngredientRow';
import type { IngredientPriceView } from './IngredientPriceControl';
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
  priceView?: IngredientPriceView,
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
        priceView={priceView}
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

function ReorderHarness() {
  const [ordered, setOrdered] = useState(calculated.items.slice(0, 3));
  const [mainId, setMainId] = useState<string | null>(null);
  const move = (lineId: string, delta: -1 | 1) => {
    setOrdered((current) => {
      const from = current.findIndex((item) => item.id === lineId);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      if (!moved) return current;
      next.splice(to, 0, moved);
      return next;
    });
  };
  const rowActions: IngredientRowActions = {
    ...actions(),
    setCustomerRole: (lineId, role) => setMainId(role === 'main' ? lineId : null),
    moveUp: (lineId) => move(lineId, -1),
    moveDown: (lineId) => move(lineId, 1),
  };
  return (
    <>
      {ordered.map((item, index) => (
        <IngredientRow
          key={item.id}
          item={{
            ...item,
            lock_type:
              mainId === item.id ? 'main' : item.lock_type === 'main' ? 'unlocked' : item.lock_type,
          }}
          totalBatchG={calculated.total_batch_g}
          actions={rowActions}
          canMoveUp={index > 0}
          canMoveDown={index < ordered.length - 1}
        />
      ))}
    </>
  );
}

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
    expect(quickActions?.className).toContain('grid-cols-[36px_36px_80px_repeat(3,minmax(0,1fr))]');
    expect(quickActions?.getAttribute('data-control-height')).toBe('36');
    expect(
      panel
        ?.querySelector('[data-testid="article-panel-role-control"]')
        ?.getAttribute('data-control-height'),
    ).toBe('36');
    const topIconActions = [
      ...(quickActions?.querySelectorAll<HTMLButtonElement>('[data-article-action="true"]') ?? []),
    ];
    expect(topIconActions).toHaveLength(5);
    expect(topIconActions.every((action) => action.className.includes('h-9'))).toBe(true);
    expect(panel?.querySelector('[data-testid="article-panel-order-actions"]')).toBeNull();
    expect(panel?.querySelectorAll('[data-icon-family="gellatti-line"]')).toHaveLength(5);
    expect(panel?.querySelector('[data-testid="article-panel-header"]')).not.toBeNull();
    expect(panel?.textContent).not.toContain('Standardowy');
    expect(panel?.textContent).not.toContain('Kolejność');

    const main = panel?.querySelector<HTMLButtonElement>('[aria-label="Ustaw jako główny"]');
    const up = panel?.querySelector<HTMLButtonElement>('[aria-label="Przesuń wyżej"]');
    const down = panel?.querySelector<HTMLButtonElement>('[aria-label="Przesuń niżej"]');
    const swap = panel?.querySelector<HTMLButtonElement>('[aria-label="Znajdź zamiennik"]');
    const data = panel?.querySelector<HTMLButtonElement>('[aria-label="Dane składnika"]');
    const unavailable = panel?.querySelector<HTMLButtonElement>(
      '[aria-label="Oznacz jako niedostępny"]',
    );

    expect(main).not.toBeNull();
    expect(up?.disabled).toBe(true);
    expect(down?.disabled).toBe(false);
    expect(down?.hasAttribute('aria-pressed')).toBe(false);
    expect(swap).not.toBeNull();
    expect(data).not.toBeNull();
    expect(panel?.querySelector('[aria-label="Oznacz jako wymagany"]')).toBeNull();
    expect(unavailable).not.toBeNull();
    expect(
      [...(quickActions?.querySelectorAll<HTMLButtonElement>('button') ?? [])].map((button) =>
        button.getAttribute('aria-label'),
      ),
    ).toEqual([
      'Przesuń wyżej',
      'Przesuń niżej',
      'Ustaw jako główny',
      'Informacja o roli składnika',
      'Oznacz jako niedostępny',
      'Znajdź zamiennik',
      'Dane składnika',
    ]);
    const remove = panel?.querySelector<HTMLButtonElement>('[aria-label="Usuń z receptury"]');
    expect(remove?.className).toContain('h-9');
    expect(remove?.className).toContain('text-status-error');
    expect(remove?.closest('[data-testid="customer-price-editor"]')).not.toBeNull();
    await click(down ?? null);
    expect(rowActions.moveDown).toHaveBeenCalledWith(baseItem.id);
    expect(document.querySelector(`[data-testid="row-menu-${baseItem.id}"]`)).not.toBeNull();
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
    expect(
      document.querySelector(`[data-testid="ingredient-mobile-sheet-${baseItem.id}"]`),
    ).not.toBeNull();
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
    expect(panel?.querySelector('[data-testid="article-panel-main-ratio"]')).toBeNull();
    expect(panel?.textContent).not.toContain('Proporcja Main');
    expect(panel?.textContent).not.toContain('Waga odzwierciedla bieżącą proporcję gramów');
    expect(panel?.querySelector('[aria-label*="waga proporcji Main"]')).toBeNull();
    expect(
      panel
        ?.querySelector('[data-testid="article-panel-quick-actions"]')
        ?.nextElementSibling?.querySelector('[data-testid="customer-price-editor"]'),
    ).not.toBeNull();
    await click(badge ?? null);
    expect(rowActions.setCustomerRole).toHaveBeenCalledWith(baseItem.id, 'standard');
    expect(document.querySelector(`[data-testid="row-menu-${baseItem.id}"]`)).not.toBeNull();
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
    expect(panel?.textContent).not.toContain(reason);
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
    expect(document.querySelector(`[data-testid="row-menu-${baseItem.id}"]`)).not.toBeNull();
  });

  it('keeps one stable ingredient dialog open through repeated reorder and Main updates', async () => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root?.render(<ReorderHarness />));

    const target = calculated.items[2]!;
    await click(document.querySelector(`[aria-label="Opcje składnika ${target.ingredient.name}"]`));
    const panelId = `[data-testid="row-menu-${target.id}"]`;
    expect(document.querySelector(panelId)).not.toBeNull();

    await click(document.querySelector(`${panelId} [aria-label="Przesuń wyżej"]`));
    expect(document.querySelector(panelId)).not.toBeNull();
    expect(
      [...document.querySelectorAll<HTMLElement>('[data-line-id]')].map(
        (row) => row.dataset.lineId,
      ),
    ).toEqual([calculated.items[0]!.id, target.id, calculated.items[1]!.id]);

    await click(document.querySelector(`${panelId} [aria-label="Przesuń wyżej"]`));
    expect(document.querySelector(panelId)).not.toBeNull();
    expect(
      [...document.querySelectorAll<HTMLElement>('[data-line-id]')].map(
        (row) => row.dataset.lineId,
      ),
    ).toEqual([target.id, calculated.items[0]!.id, calculated.items[1]!.id]);

    await click(document.querySelector(`${panelId} [aria-label="Przesuń niżej"]`));
    expect(document.querySelector(panelId)).not.toBeNull();
    await click(document.querySelector(`${panelId} [aria-label="Ustaw jako główny"]`));
    expect(document.querySelector(panelId)).not.toBeNull();
    expect(document.querySelector(`${panelId} [aria-label="Usuń rolę główną"]`)).not.toBeNull();
  });

  it('keeps the dialog open after compact price save and base-price restore', async () => {
    const onSave = vi.fn(async () => undefined);
    const onReset = vi.fn(async () => undefined);
    const priceView: IngredientPriceView = {
      cost: {
        canonicalIngredientId: 'PI-ING-000001',
        pricePerKg: 4,
        currency: 'EUR',
        source: 'customer_override',
        mapperPricePerKg: 3.5,
        customerOverridePerKg: 4,
        overrideId: 'price-1',
      },
      lineCost: 0.4,
      canEdit: true,
      onSave,
      onReset,
    };
    await renderRow(actions(), baseItem, true, true, null, DEFAULT_INGREDIENT_ROW_META, priceView);
    await click(
      document.querySelector(`[aria-label="Opcje składnika ${baseItem.ingredient.name}"]`),
    );
    const panelId = `[data-testid="row-menu-${baseItem.id}"]`;
    const priceEditor = document.querySelector(`${panelId} [data-testid="customer-price-editor"]`);
    const priceRow = priceEditor?.firstElementChild;
    expect(
      [...(priceRow?.querySelectorAll<HTMLButtonElement>('button') ?? [])].map((button) =>
        button.getAttribute('aria-label'),
      ),
    ).toEqual(['Zapisz', 'Usuń z receptury']);
    expect(
      priceEditor?.querySelector('[data-testid="article-panel-base-price"]')?.textContent,
    ).toContain('Bazowa: 3,50 €/kg');

    await click(document.querySelector(`${panelId} [aria-label="Zapisz"]`));
    expect(onSave).toHaveBeenCalledWith(4);
    expect(document.querySelector(panelId)).not.toBeNull();

    await click(document.querySelector(`${panelId} [aria-label="Przywróć cenę bazową"]`));
    expect(onReset).toHaveBeenCalledOnce();
    expect(document.querySelector(panelId)).not.toBeNull();
  });

  it('replaces the desktop actions with ingredient data inside one stable modal shell', async () => {
    await renderRow(actions());
    await click(
      document.querySelector(`[aria-label="Opcje składnika ${baseItem.ingredient.name}"]`),
    );
    const panel = document.querySelector(`[data-testid="row-menu-${baseItem.id}"]`);
    const shell = panel?.querySelector('[role="dialog"]');
    await click(panel?.querySelector('[aria-label="Dane składnika"]') ?? null);

    const data = panel?.querySelector('[data-testid="ingredient-data-view"]');
    const list = data?.querySelector('[data-testid="ingredient-data-compact-list"]');
    expect(list).not.toBeNull();
    expect(list?.children).toHaveLength(5);
    expect(list?.textContent).not.toContain('Źródło');
    expect(list?.textContent).not.toContain(baseItem.ingredient.source_type);
    expect(document.querySelector(`[data-testid="row-menu-${baseItem.id}"]`)).toBe(panel);
    expect(panel?.querySelector('[role="dialog"]')).toBe(shell);
    expect(document.querySelectorAll('[aria-modal="true"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-overlay-scope="viewport"]')).toHaveLength(1);
    expect(panel?.querySelector('[data-testid="article-panel-content"]')).toBeNull();
    expect(data?.querySelector('[aria-label="Zamknij dane składnika"]')).toBeNull();

    await click(data?.querySelector('[aria-label="Wróć do opcji składnika"]') ?? null);
    expect(panel?.querySelector('[data-testid="ingredient-data-view"]')).toBeNull();
    expect(panel?.querySelector('[data-testid="article-panel-content"]')).not.toBeNull();
    expect(document.querySelector(`[data-testid="row-menu-${baseItem.id}"]`)).toBe(panel);
    expect(panel?.querySelector('[role="dialog"]')).toBe(shell);
  });

  it('navigates from the Main help into data and back to the same desktop ingredient dialog', async () => {
    await renderRow(actions());
    await click(
      document.querySelector(`[aria-label="Opcje składnika ${baseItem.ingredient.name}"]`),
    );
    const panel = document.querySelector(`[data-testid="row-menu-${baseItem.id}"]`);
    const shell = panel?.querySelector('[role="dialog"]');

    await click(panel?.querySelector('[aria-label="Informacja o roli składnika"]') ?? null);
    const data = panel?.querySelector('[data-testid="ingredient-data-view"]');
    expect(data).not.toBeNull();
    expect(document.querySelector(`[data-testid="row-menu-${baseItem.id}"]`)).toBe(panel);
    expect(panel?.querySelector('[role="dialog"]')).toBe(shell);
    expect(document.querySelectorAll('[aria-modal="true"]')).toHaveLength(1);
    expect(data?.querySelector('[aria-label="Zamknij dane składnika"]')).toBeNull();

    await click(data?.querySelector('[aria-label="Wróć do opcji składnika"]') ?? null);
    expect(panel?.querySelector('[data-testid="ingredient-data-view"]')).toBeNull();
    expect(panel?.querySelector('[data-testid="article-panel-content"]')).not.toBeNull();
    expect(document.querySelector(`[data-testid="row-menu-${baseItem.id}"]`)).toBe(panel);

    await click(panel?.querySelector('[aria-label="Zamknij opcje składnika"]') ?? null);
    expect(document.querySelector(`[data-testid="row-menu-${baseItem.id}"]`)).toBeNull();
  });

  it('navigates from the Main help into data and back to the same mobile ingredient sheet', async () => {
    await renderRow(actions());
    await click(
      document.querySelector(
        `[aria-label="${baseItem.ingredient.name} — otwórz edycję składnika"]`,
      ),
    );
    const sheet = document.querySelector(`[data-testid="ingredient-mobile-sheet-${baseItem.id}"]`);
    const shell = sheet?.querySelector('[role="dialog"]');

    await click(sheet?.querySelector('[aria-label="Informacja o roli składnika"]') ?? null);
    const data = sheet?.querySelector('[data-testid="ingredient-data-view"]');
    expect(data).not.toBeNull();
    expect(document.querySelector(`[data-testid="ingredient-mobile-sheet-${baseItem.id}"]`)).toBe(
      sheet,
    );
    expect(sheet?.querySelector('[role="dialog"]')).toBe(shell);
    expect(document.querySelectorAll('[aria-modal="true"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-overlay-scope="viewport"]')).toHaveLength(1);
    expect(sheet?.querySelector('[data-testid="article-panel-content"]')).toBeNull();

    await click(data?.querySelector('[aria-label="Wróć do opcji składnika"]') ?? null);
    expect(sheet?.querySelector('[data-testid="ingredient-data-view"]')).toBeNull();
    expect(sheet?.querySelector('[data-testid="article-panel-content"]')).not.toBeNull();
    expect(document.querySelector(`[data-testid="ingredient-mobile-sheet-${baseItem.id}"]`)).toBe(
      sheet,
    );
    expect(sheet?.querySelector('[role="dialog"]')).toBe(shell);

    await click(sheet?.querySelector('[aria-label="Zamknij edycję składnika"]') ?? null);
    expect(
      document.querySelector(`[data-testid="ingredient-mobile-sheet-${baseItem.id}"]`),
    ).toBeNull();
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
