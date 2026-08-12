import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { calculateRecipe, type EffectiveRecipeItem } from '@/engine';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { SurfaceToneContext } from '@/components/ui/surface';
import { IngredientBuilder } from './IngredientBuilder';
import { repairableCanonicalDuplicateCount } from './ingredientDuplicateRepair';
import {
  IngredientRow,
  RequiredRemovalDialog,
  SubstituteDialog,
  type IngredientRowActions,
  type IngredientRowLockView,
} from './IngredientRow';
import {
  DEFAULT_INGREDIENT_ROW_META,
  type IngredientRowMeta,
  type SubstituteCandidate,
} from './ingredientTableUx';
import { useIngredientTableUxStore } from './ingredientTableUxStore';

const input = starterMilkBase();
const calculated = calculateRecipe(input);
const baseItem = calculated.items[0]!;

const actions = (): IngredientRowActions => ({
  setPlannedGrams: vi.fn(),
  setActualGrams: vi.fn(),
  setLockType: vi.fn(),
  setMainIngredient: vi.fn(),
  removeItem: vi.fn(),
  setCustomerRole: vi.fn(),
  toggleRequired: vi.fn(),
  setIngredientUnavailable: vi.fn(),
  removeRequiredIngredient: vi.fn(),
});

const lock = (locked = false): IngredientRowLockView => ({
  state: locked ? 'locked' : 'ai',
  lockedGramsLabel: null,
  ariaLabel: 'lock',
  title: 'lock',
  badge: null,
  plannedDisabled: locked,
  toggleDisabled: false,
  onToggle: vi.fn(),
  percentLocked: false,
  percentToggleDisabled: false,
  onTogglePercent: vi.fn(),
});

const renderRow = (
  item: EffectiveRecipeItem = baseItem,
  meta: IngredientRowMeta = DEFAULT_INGREDIENT_ROW_META,
  locked = false,
) =>
  renderToStaticMarkup(
    <IngredientRow
      item={item}
      totalBatchG={calculated.total_batch_g}
      actions={actions()}
      lock={lock(locked)}
      meta={meta}
    />,
  );

const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const renderBuilder = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <SurfaceToneContext.Provider value="paper">
        <IngredientBuilder
          items={calculated.items}
          totalBatchG={calculated.total_batch_g}
          targetBatchG={input.target_batch_grams}
          demo
          layout="workbench"
        />
      </SurfaceToneContext.Provider>
    </QueryClientProvider>,
  );
};

const candidate: SubstituteCandidate = {
  id: 'candidate-a',
  name: 'Candidate A',
  fit: 'direct',
  expectedImpact: 'Bez zmiany profilu.',
  compatibility: 'Zgodny.',
};

describe('legacy duplicate repair detection', () => {
  it('counts Mapper aliases by canonical identity, not raw ingredient id', () => {
    const first = input.items[0]!;
    const canonicalId = first.ingredient.canonical_ingredient_id ?? first.ingredient.id;
    expect(
      repairableCanonicalDuplicateCount([
        first,
        {
          ...first,
          id: `${first.id}-alias`,
          ingredient: {
            ...first.ingredient,
            id: `${first.ingredient.id}-legacy-alias`,
            canonical_ingredient_id: canonicalId,
          },
        },
      ]),
    ).toBe(1);
  });
});

describe('Recipe ingredient table — quiet primary surface', () => {
  beforeEach(() => useIngredientTableUxStore.getState().reset());

  it('shows exactly the requested primary headers without Role or Availability columns', () => {
    const html = renderBuilder();
    const header = html.match(/data-testid="recipe-table-header"[\s\S]*?<\/div>/)?.[0] ?? '';
    for (const label of ['Składnik', '%', 'Ilość', 'Cena/kg']) expect(header).toContain(label);
    expect(header).not.toContain('Rola');
    expect(header).not.toContain('Dostępność');
  });

  it('exposes active range bounds to the direct grams control', () => {
    const rangeLock: IngredientRowLockView = {
      ...lock(false),
      state: 'range',
      lockedGramsLabel: '12 g – 14 g',
      badge: 'ZAKRES',
      minGrams: 12,
      maxGrams: 14,
    };
    const html = renderToStaticMarkup(
      <IngredientRow
        item={{ ...baseItem, planned_grams: 13 }}
        totalBatchG={calculated.total_batch_g}
        actions={actions()}
        lock={rangeLock}
        meta={DEFAULT_INGREDIENT_ROW_META}
      />,
    );
    const gramsControl = html.match(
      new RegExp(`data-testid="row-grams-control-${baseItem.id}"[\\s\\S]*?</div>`),
    )?.[0];
    expect(gramsControl).toContain('aria-valuemin="12"');
    expect(gramsControl).toContain('aria-valuemax="14"');
  });

  it('exposes Role editing through one contextual dialog trigger without row noise', () => {
    const row = renderRow();
    expect(row).toContain('aria-haspopup="dialog"');
    expect(row).toContain(`aria-controls="row-menu-dialog-${baseItem.id}"`);
    expect(row).toContain('aria-expanded="false"');
    expect(text(row)).not.toContain('supplementary');
  });

  it('shows a minimal Main icon and no Standard badge noise', () => {
    const main = renderRow({ ...baseItem, lock_type: 'main' });
    expect(main).toContain('aria-label="Składnik główny"');
    const standard = renderRow();
    expect(standard).not.toContain('aria-label="Dodatek"');
    expect(standard).not.toContain('aria-label="Składnik główny"');
  });

  it('keeps a legacy Add-on line visible as an ambiguity, never as a new Base role', () => {
    const html = renderRow(baseItem, { ...DEFAULT_INGREDIENT_ROW_META, role: 'addition' });
    expect(html).toContain('aria-label="Dawny Dodatek — wymaga decyzji"');
    expect(text(html)).toContain('Dawny Dodatek · decyzja');
    expect(text(html)).not.toContain('Proces dodatku jest w przygotowaniu');
    expect(text(html)).not.toContain('CZĘŚCIOWO PODŁĄCZONE');
    expect(html).not.toContain("setRole('addition')");
  });

  it('hides provenance noise in the verified normal row and exposes full data under menu', () => {
    const verified = {
      ...baseItem,
      ingredient: { ...baseItem.ingredient, is_verified: true, confidence_score: 100 },
    };
    const html = renderRow(verified);
    const visibleNameArea = html.slice(0, html.indexOf('data-testid="row-lock-percent'));
    expect(visibleNameArea).not.toContain(verified.ingredient.source_type);
    expect(visibleNameArea).not.toContain('Very high confidence');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain('data-testid="ingredient-data-dialog"');
  });

  it('shows only a small amber indicator when ingredient data is estimated', () => {
    const estimated = {
      ...baseItem,
      ingredient: { ...baseItem.ingredient, is_verified: false, confidence_score: 82 },
    };
    const html = renderRow(estimated);
    expect(html).toContain(`data-testid="row-estimated-${baseItem.id}"`);
    expect(html).toContain('Część danych składnika jest szacowana.');
  });

  it('does not expose Already added in Recipe mode while Production actuals remain intact', () => {
    expect(text(renderRow())).not.toContain('Oznacz jako już dodany');
    const productionLine = {
      lineId: baseItem.id,
      canonicalIngredientId: baseItem.ingredient.canonical_ingredient_id ?? baseItem.ingredient.id,
      name: baseItem.ingredient.name,
      plannedGrams: baseItem.planned_grams,
      targetGrams: baseItem.planned_grams,
      draftActualGrams: baseItem.planned_grams,
      physicalAddedGrams: 0,
      confirmed: false,
      confirmedAt: null,
      confirmationOrder: null,
      recordCorrectionCount: 0,
    };
    const production = renderToStaticMarkup(
      <IngredientRow
        item={baseItem}
        totalBatchG={calculated.total_batch_g}
        actions={actions()}
        mode="production"
        productionLine={productionLine}
        productionActions={{
          setDraftActual: vi.fn(),
          confirmLine: vi.fn(),
          reopenRecord: vi.fn(),
        }}
      />,
    );
    expect(text(production)).toContain('Faktycznie');
    expect(text(production)).toContain('potwierdź');
    expect(production).toContain(`data-testid="production-stepper-${baseItem.id}"`);
  });
});

describe('Recipe ingredient table — locks, units and availability', () => {
  it('rehydrates the visible Required state from the persisted Engine lock', () => {
    const html = renderRow({ ...baseItem, lock_type: 'required' });
    expect(html).toContain('aria-label="Składnik wymagany"');
    expect(html).toContain('title="Składnik wymagany dla tej receptury."');
  });

  it('keeps percentage lock visible and operational', () => {
    const html = renderRow();
    const button =
      html.match(/<button[^>]*data-testid="row-lock-percent-[\s\S]*?<\/button>/)?.[0] ?? '';
    expect(button).not.toContain('disabled');
    expect(button).toContain('Zablokuj % partii');
    expect(button).toContain('aria-pressed="false"');
    expect(button).toContain('<span aria-hidden="true">%</span>');
    expect(html.toLowerCase()).not.toContain('blokada procentowa w przygotowaniu');
  });

  it('makes an active exact gram lock obvious in charcoal, never red', () => {
    const html = renderRow({ ...baseItem, lock_type: 'grams' }, DEFAULT_INGREDIENT_ROW_META, false);
    const gramButton =
      html.match(/<button[^>]*data-testid="row-lock-grams-[\s\S]*?<\/button>/)?.[0] ?? '';
    expect(gramButton).toContain('bg-ink');
    expect(gramButton).toContain('text-white');
    expect(gramButton).toContain('Gramatura zablokowana');
    expect(gramButton).toContain('<span aria-hidden="true">g</span>');
    expect(gramButton).not.toContain('status-error');
    expect(html).toMatch(/<input[^>]*disabled/);
  });

  it('keeps executable quantity in canonical grams without an invisible unit focus stop', () => {
    const html = renderRow();
    expect(html).toContain(`data-testid="row-grams-control-${baseItem.id}"`);
    expect(html).toContain('ilość w g');
    expect(html).not.toContain(`data-testid="row-unit-${baseItem.id}"`);
    expect(html).not.toContain('<option value="kg">');
  });

  it('keeps an unavailable ingredient in the same row and offers restoration', () => {
    const html = renderRow(baseItem, { ...DEFAULT_INGREDIENT_ROW_META, unavailable: true });
    expect(html).toContain(`data-line-id="${baseItem.id}"`);
    expect(html).toContain('data-unavailable="true"');
    expect(text(html)).toContain('NIEDOSTĘPNY');
    expect(text(html)).toContain('Znajdź zamiennik');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(text(html)).not.toContain('Znajdź zamiennik · W PRZYGOTOWANIU');
  });

  it('opens the operational substitute picker and fails closed without a safe candidate', () => {
    const html = renderToStaticMarkup(
      <SubstituteDialog ingredientName="Milk" candidates={[]} onClose={() => {}} />,
    );
    expect(text(html)).toContain('Zamiennik dla: Milk');
    expect(text(html)).toContain('Brak bezpiecznego zamiennika');
    expect(html).not.toContain('Candidate A');
    expect(html).not.toContain('>Użyj<');
  });
});

describe('Required ingredient deletion guard', () => {
  const baseProps = {
    ingredientName: 'Milk',
    onFindSubstitute: () => {},
    onRequestDestructive: () => {},
    onConfirmDestructive: () => {},
    onClose: () => {},
  };

  it('offers substitute flow when an evaluated candidate exists', () => {
    const html = renderToStaticMarkup(
      <RequiredRemovalDialog {...baseProps} candidates={[candidate]} />,
    );
    expect(text(html)).toContain('Ten składnik jest wymagany');
    expect(text(html)).toContain('Możesz zastąpić ten składnik.');
    expect(text(html)).toContain('Znajdź zamiennik');
    expect(text(html)).not.toContain('Usuń i oznacz recepturę jako niewykonalną');
  });

  it('states that the recipe cannot be completed when no substitute exists', () => {
    const html = renderToStaticMarkup(<RequiredRemovalDialog {...baseProps} candidates={[]} />);
    expect(text(html)).toContain('Brak odpowiedniego zamiennika');
    expect(text(html)).toContain('PINGÜINO nie może obecnie utworzyć poprawnej wersji');
    expect(text(html)).toContain('Zostaw składnik');
    expect(text(html)).toContain('Usuń i oznacz recepturę jako niewykonalną');
  });

  it('requires a second explicit confirmation before destructive removal', () => {
    const html = renderToStaticMarkup(
      <RequiredRemovalDialog {...baseProps} candidates={[]} confirmDestructive />,
    );
    expect(text(html)).toContain('Potwierdź niewykonalność receptury');
    expect(text(html)).toContain('Tak, usuń składnik');
    expect(text(html)).toContain('przeliczenie PI pozostanie zablokowane');
  });
});
