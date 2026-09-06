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
          onAddIngredient={() => {}}
          onAddTopping={() => {}}
          onSave={() => {}}
          onLetsMakeIt={() => {}}
          onShare={() => {}}
          canShare={false}
          onBack={null}
          saveNotice={null}
        />
      </QueryClientProvider>,
    ),
  );
};

describe('a customer edits a topping amount', () => {
  it('shows the new value and stores it, leaving the recipe lines alone', async () => {
    const id = topping().id;
    const before = lineGrams();
    await renderSection();

    // 1. open the editor from the row's own menu, as a customer would
    const menus = host.querySelectorAll<HTMLButtonElement>('[data-testid="home-row-menu"]');
    // the topping row is the last one on screen
    await act(async () => menus[menus.length - 1]!.click());
    const change = host.querySelector<HTMLButtonElement>(
      `[data-testid="home-row-change-amount-${id}"]`,
    );
    expect(change, 'the topping row offers "Zmień ilość"').not.toBeNull();
    await act(async () => change!.click());

    // 2. type a new amount into the real control, the way the repo's own control test
    //    does: the spinbutton input, focused, then a genuine blur to commit.
    const editor = host.querySelector(`[data-testid="home-amount-editor-${id}"]`);
    const input = editor?.querySelector<HTMLInputElement>('[role="spinbutton"]') ?? null;
    expect(input, 'the amount control is on screen for the topping').not.toBeNull();
    await act(async () => input!.focus());
    await act(async () => type(input!, '25'));
    await act(async () => input!.blur());

    // 3. the store holds it
    expect(topping().planned_grams).toBe(25);

    // 4. the screen says it — re-render from the store, as HOME does
    await renderSection();
    const shown = host.querySelector(`[data-testid="home-amount-editor-${id}"]`)?.textContent ?? '';
    const readout = host.textContent ?? '';
    expect(`${shown}${readout}`).toContain('25');

    // 5. and nothing in the base moved
    expect(lineGrams()).toEqual(before);
  });
});
