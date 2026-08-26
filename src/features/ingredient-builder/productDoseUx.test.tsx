// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { calculateRecipe } from '@/engine';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import type { RecipeToppingItem } from '@/features/recipe-composition/recipeCompositionPersistence';
import { IngredientRow, type IngredientRowActions } from './IngredientRow';
import { ToppingRow } from './ToppingRow';
import { DEFAULT_INGREDIENT_ROW_META } from './ingredientTableUx';
import type { IngredientLibrary } from './ingredientLibrary';
import type { IngredientPriceView } from './IngredientPriceControl';

const input = starterMilkBase();
const calculated = calculateRecipe(input);
const baseItem = calculated.items[0]!;

const actions: IngredientRowActions = {
  setPlannedGrams: vi.fn(),
  setActualGrams: vi.fn(),
  setLockType: vi.fn(),
  setMainIngredient: vi.fn(),
  removeItem: vi.fn(),
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

describe('missing product-dose copy', () => {
  const missingDoseMeta = {
    ...DEFAULT_INGREDIENT_ROW_META,
    dose: {
      provenance: 'UNKNOWN' as const,
      groupId: null,
      suggestedPercent: null,
      suggestedTotalGrams: null,
    },
  };

  it('replaces the inline notice with one compact hint and soft-danger controls only at zero', () => {
    const zero = renderToStaticMarkup(
      <IngredientRow
        item={{ ...baseItem, planned_grams: 0, effective_grams: 0 }}
        totalBatchG={calculated.total_batch_g}
        actions={actions}
        meta={missingDoseMeta}
      />,
    );
    const visibleText = zero.replace(/<[^>]+>/g, '');
    expect(visibleText).not.toContain('Brak zweryfikowanej ilości.');
    expect(visibleText).not.toContain('Ustaw ilość odpowiednią dla swojej receptury.');
    expect(zero).not.toContain(`data-testid="row-dose-missing-${baseItem.id}"`);
    expect(zero).toContain(`data-testid="row-dose-missing-hint-${baseItem.id}"`);
    expect(zero).toContain(`data-testid="row-mobile-dose-missing-hint-${baseItem.id}"`);
    expect(zero).toContain('after:-inset-[14px]');
    expect(zero.match(/data-soft-danger="true"/g)).toHaveLength(2);
    expect(zero).not.toContain('Brak zweryfikowanej dawki.');
    expect(zero).not.toContain('Podaj ilość zgodnie z zaleceniem producenta lub własną recepturą.');

    const entered = renderToStaticMarkup(
      <IngredientRow
        item={{ ...baseItem, planned_grams: 0.1, effective_grams: 0.1 }}
        totalBatchG={calculated.total_batch_g}
        actions={actions}
        meta={missingDoseMeta}
      />,
    );
    expect(entered).not.toContain(`data-testid="row-dose-missing-hint-${baseItem.id}"`);
    expect(entered).not.toContain(`data-testid="row-mobile-dose-missing-hint-${baseItem.id}"`);
    expect(entered).not.toContain('data-soft-danger="true"');
  });

  it('opens the exact premium tooltip on hover, keyboard focus and mobile-style tap', async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <IngredientRow
          item={{ ...baseItem, planned_grams: 0, effective_grams: 0 }}
          totalBatchG={calculated.total_batch_g}
          actions={actions}
          meta={missingDoseMeta}
        />,
      );
    });

    const hint = host.querySelector<HTMLElement>(
      `[data-testid="row-dose-missing-hint-${baseItem.id}"]`,
    )!;
    hint.getBoundingClientRect = () =>
      ({ left: 120, right: 136, top: 40, bottom: 56, width: 16, height: 16 }) as DOMRect;
    const exactCopy = 'Brak zweryfikowanej ilości. Ustaw ilość odpowiednią dla swojej receptury.';

    await act(async () => hint.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(exactCopy);
    await act(async () => hint.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })));

    await act(async () => hint.focus());
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(exactCopy);
    await act(async () => hint.blur());

    const mobileHint = host.querySelector<HTMLElement>(
      `[data-testid="row-mobile-dose-missing-hint-${baseItem.id}"]`,
    )!;
    mobileHint.getBoundingClientRect = () =>
      ({ left: 24, right: 40, top: 72, bottom: 88, width: 16, height: 16 }) as DOMRect;
    await act(async () => mobileHint.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const tappedTooltip = document.querySelector<HTMLElement>('[role="tooltip"]');
    expect(tappedTooltip?.textContent).toBe(exactCopy);
    expect(tappedTooltip?.className).toContain('bg-charcoal');

    await act(async () => root.unmount());
    host.remove();
  });
});

describe('Topping zero-dose copy', () => {
  const topping = (grams: number): RecipeToppingItem => ({
    id: 'topping-product',
    ingredient: { ...baseItem.ingredient, id: 'topping-product' },
    planned_grams: grams,
    actual_grams: null,
    process_scope: 'POST_PROCESS_ADDON',
    addon_sort_order: 0,
  });

  const renderTopping = (grams: number) =>
    renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <ToppingRow
          item={topping(grams)}
          priceView={priceView}
          canMoveUp={false}
          canMoveDown={false}
          onChange={() => undefined}
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

  it('keeps the topping row as quiet as an ingredient row at both 0 g and a positive dose', () => {
    for (const html of [renderTopping(0), renderTopping(1)]) {
      expect(html).not.toContain('Dodatek po produkcji');
      expect(html).not.toContain('Podaj ilość toppingu.');
      expect(html).not.toContain('>Topping<');
      expect(html).not.toContain('>Ilość<');
      expect(html).toContain('data-testid="topping-grams-topping-product"');
      expect(html).toContain('data-control-capacity="10000g"');
      expect(html).toContain('data-category-symbol="dairy"');
      expect(html).toContain('pro-focus-ring grid shrink-0 place-items-center rounded-full');
      expect(html).toContain('size-7 text-[11px]');
      expect(html).toContain('aria-label="Opcje toppingu');
      expect(html).toContain('•••');
    }
  });
});
