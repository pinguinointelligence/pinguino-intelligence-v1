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
  it('shows the exact unknown-dose instruction only while the tracked Base product is below 1 g', () => {
    const meta = {
      ...DEFAULT_INGREDIENT_ROW_META,
      dose: {
        provenance: 'UNKNOWN' as const,
        groupId: null,
        suggestedPercent: null,
        suggestedTotalGrams: null,
      },
    };
    const zero = renderToStaticMarkup(
      <IngredientRow
        item={{ ...baseItem, planned_grams: 0 }}
        totalBatchG={calculated.total_batch_g}
        actions={actions}
        meta={meta}
      />,
    );
    expect(zero).toContain('Brak zweryfikowanej ilości.');
    expect(zero).toContain('Ustaw ilość odpowiednią dla swojej receptury.');
    expect(zero).not.toContain('Brak zweryfikowanej dawki.');
    expect(zero).not.toContain('Podaj ilość zgodnie z zaleceniem producenta lub własną recepturą.');

    const entered = renderToStaticMarkup(
      <IngredientRow
        item={{ ...baseItem, planned_grams: 1 }}
        totalBatchG={calculated.total_batch_g}
        actions={actions}
        meta={meta}
      />,
    );
    expect(entered).not.toContain('Brak zweryfikowanej ilości.');
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
