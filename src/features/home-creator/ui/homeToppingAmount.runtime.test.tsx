/** @vitest-environment jsdom */
/**
 * A topping amount, edited the way a customer edits it.
 *
 * The store-level test proves the right action works. It cannot prove the ROW calls it,
 * and calling the wrong one is exactly what the defect was: HOME rendered the amount
 * control on a topping and committed through `setPlannedGrams`, which looks the line up
 * in `state.items` and returns early. The number the customer typed went nowhere.
 *
 * So this drives the real control in a real document: open the editor, type, commit, and
 * then check BOTH what the screen says and what the store holds — and that the recipe
 * lines beside it were left alone.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useRecipeStore } from '@/stores/recipeStore';
import type { RecipeToppingIngredient } from '@/features/recipe-composition/recipeCompositionPersistence';
import { HomeRecipeSection } from './HomeRecipeSection';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const SPRINKLES = {
  id: 'PI-ING-000900',
  name: 'Posypka czekoladowa',
  category: 'other',
  water: 0,
  fat: 30,
  msnf: 0,
  other_solids: 70,
  sugars: { sucrose: 60 },
  pac: 0,
  pod: 0,
} as unknown as RecipeToppingIngredient;

const SCORE = {
  score: null,
  label: '—',
  tooltipKey: 'unscored',
  display: '—',
  ariaText: 'brak wyniku',
} as unknown as Parameters<typeof HomeRecipeSection>[0]['score'];

const LIBRARY = {
  ingredients: [],
  searchIndex: new Map(),
  nameIndex: new Map(),
} as unknown as Parameters<typeof HomeRecipeSection>[0]['library'];

let host: HTMLDivElement;
let root: Root;

const topping = () => useRecipeStore.getState().toppings[0]!;
const lineGrams = () => useRecipeStore.getState().items.map((i) => [i.id, i.planned_grams]);

beforeEach(() => {
  useRecipeStore.setState({ toppings: [] });
  useRecipeStore.getState().addTopping(SPRINKLES, 10);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  Element.prototype.scrollIntoView = () => {};
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

/** Set a controlled input's value the way a real keystroke does. */
const type = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

const renderSection = async () => {
  const store = useRecipeStore.getState();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <HomeRecipeSection
          name=""
          onNameChange={() => {}}
          items={store.items}
          toppings={store.toppings}
          crownLineIds={[]}
          score={SCORE}
          machineLine=""
          canSeeGrams
          sweetnessStored={0}
          onSweetness={() => {}}
          library={LIBRARY}
          onGramsBlocked={() => {}}
          onRemoveItem={() => {}}
          onRemoveTopping={() => {}}
          onAddIngredient={() => {}}
          onAddTopping={() => {}}
          onSave={() => {}}
          onLetsMakeIt={() => {}}
          onShare={() => {}}
          onCommunity={() => {}}
          onBack={null}
          saveNotice={null}
        />
      </QueryClientProvider>,
    ),
  );
};

/* DESIGN V3.0 IV-B/C: the whole topping row opens the ingredient panel (portalled). */
const openEditorForToppingRow = async (id: string) => {
  const row = host.querySelector<HTMLButtonElement>(`[data-testid="home-row-${id}"]`);
  expect(row, 'the topping row is a button').not.toBeNull();
  await act(async () => row!.click());
  const panel = document.querySelector('[data-testid="home-ingredient-panel"]');
  expect(panel, 'the ingredient panel is on screen').not.toBeNull();
  expect(panel!.querySelector('[data-testid="home-panel-tag"]')?.textContent).toBe('Topping');
  const input =
    panel!.querySelector<HTMLInputElement>(
      '[data-testid="home-panel-grams"] [role="spinbutton"]',
    ) ?? null;
  expect(input, 'the amount control is on screen for the topping').not.toBeNull();
  return input!;
};

describe('a customer edits a topping amount', () => {
  it('shows the new value and stores it, leaving the recipe lines alone', async () => {
    const id = topping().id;
    const before = lineGrams();
    await renderSection();

    const input = await openEditorForToppingRow(id);
    await act(async () => input.focus());
    await act(async () => type(input, '25'));
    await act(async () => input.blur());

    // The panel holds a DRAFT — nothing reaches the store until „Gotowe".
    expect(topping().planned_grams).not.toBe(25);

    const confirm = document.querySelector<HTMLButtonElement>('[data-testid="home-panel-done"]');
    expect(confirm, '„Gotowe" is offered').not.toBeNull();
    await act(async () => confirm!.click());

    // #207: a topping commits through `setToppingGrams`, not `setPlannedGrams`.
    expect(topping().planned_grams).toBe(25);

    // the screen says it — re-render from the store, as HOME does
    await renderSection();
    expect(host.textContent ?? '').toContain('25');

    // and nothing in the base moved
    expect(lineGrams()).toEqual(before);
  });

  it('changes nothing when the customer cancels', async () => {
    const id = topping().id;
    const before = topping().planned_grams;
    const baseBefore = lineGrams();
    await renderSection();

    const input = await openEditorForToppingRow(id);
    await act(async () => input.focus());
    await act(async () => type(input, '99'));
    await act(async () => input.blur());

    // DESIGN V3.0 IV-C: the panel has „Usuń” | „Gotowe” and no „Anuluj”; leaving it with
    // Escape is the cancel, and it confirms nothing.
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(topping().planned_grams).toBe(before);
    expect(lineGrams()).toEqual(baseBefore);
    expect(document.querySelector('[data-testid="home-ingredient-panel"]')).toBeNull();
  });

  it('HOME-REPLACE-01 opens manual compatibility-first Replace for Base and Topping rows', async () => {
    await renderSection();
    const baseId = useRecipeStore.getState().items[0]!.id;
    const toppingId = topping().id;

    // DESIGN V3.0 IV-C: „⇄” in the ingredient panel replaces the row menu's „Zamień produkt”.
    await act(async () =>
      host.querySelector<HTMLButtonElement>(`[data-testid="home-row-${baseId}"]`)!.click(),
    );
    const baseReplace = document.querySelector<HTMLButtonElement>(
      '[data-testid="home-panel-replace"]',
    );
    expect(baseReplace?.getAttribute('aria-label')).toContain('Zamień produkt');
    await act(async () => baseReplace?.click());
    expect(document.querySelector('[data-testid="home-ingredient-panel"]')).toBeNull();
    expect(
      document.querySelector('[data-testid="product-picker-no-compatible-replacements"]')
        ?.textContent,
    ).toContain('Brak zgodnych zamienników');

    // HOME's picker closes with its own „Anuluj” at the bottom (DESIGN XI).
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[data-testid="product-picker-cancel"]')?.click(),
    );
    await act(async () =>
      host.querySelector<HTMLButtonElement>(`[data-testid="home-row-${toppingId}"]`)!.click(),
    );
    const toppingReplace = document.querySelector<HTMLButtonElement>(
      '[data-testid="home-panel-replace"]',
    );
    expect(toppingReplace?.getAttribute('aria-label')).toContain('Zamień produkt');
    await act(async () => toppingReplace?.click());
    expect(
      document.querySelector('[data-testid="product-picker-no-compatible-replacements"]')
        ?.textContent,
    ).toContain('Brak zgodnych zamienników');
  });
});
