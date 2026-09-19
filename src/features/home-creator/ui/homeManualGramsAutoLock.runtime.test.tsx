/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ownerSameInputRecipe } from '@/features/formulation/__fixtures__/ownerSameInputFixture';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';
import { HomeRecipeSection } from './HomeRecipeSection';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

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

const currentLine = () => useRecipeStore.getState().items[0]!;
const type = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

beforeEach(() => {
  useRecipeStore.getState().loadRecipeInput(ownerSameInputRecipe());
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  Element.prototype.scrollIntoView = () => {};
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

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
          crownLineIds={store.items
            .filter((item) => item.lock_type === 'main')
            .map((item) => item.id)}
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

/* DESIGN V3.0 IV-B/C (2026-09-17): the whole row opens the ingredient panel — the
   „•••” menu and its „Zmień ilość” are gone. The panel is portalled to <body>. */
const openEditor = async () => {
  const id = currentLine().id;
  const row = host.querySelector<HTMLButtonElement>(`[data-testid="home-row-${id}"]`);
  expect(row).not.toBeNull();
  await act(async () => row!.click());
  const control = document.querySelector<HTMLElement>('[data-testid="home-panel-grams"]');
  expect(control).not.toBeNull();
  return control!;
};

const confirm = async () => {
  const button = document.querySelector<HTMLButtonElement>('[data-testid="home-panel-done"]');
  expect(button).not.toBeNull();
  await act(async () => button!.click());
};

const expectExact = (grams: number) => {
  expect(currentLine()).toMatchObject({
    planned_grams: grams,
    lock_type: 'grams',
    grams_constraint: { grams },
  });
};

describe('HOME manual grams auto-lock', () => {
  it('MGAL-HOME-01 direct numeric commit turns Lock on', async () => {
    await renderSection();
    const control = await openEditor();
    const input = control.querySelector<HTMLInputElement>('[role="spinbutton"]')!;
    const next = currentLine().planned_grams + 20;

    await act(async () => input.focus());
    await act(async () => type(input, String(next)));
    await act(async () => input.blur());
    await confirm();

    expectExact(next);
  });

  it('MGAL-HOME-02 plus commit turns Lock on', async () => {
    await renderSection();
    const before = currentLine().planned_grams;
    const control = await openEditor();
    const plus = control.querySelector<HTMLButtonElement>('button[aria-label$="zwiększ"]')!;

    await act(async () => plus.click());
    await confirm();

    expectExact(before + 1);
  });

  it('MGAL-HOME-03 minus commit turns Lock on', async () => {
    await renderSection();
    const before = currentLine().planned_grams;
    const control = await openEditor();
    const minus = control.querySelector<HTMLButtonElement>('button[aria-label$="zmniejsz"]')!;

    await act(async () => minus.click());
    await confirm();

    expectExact(before - 1);
  });

  it('MGAL-HOME-04 Crown and exact Lock stay independently visible and mutable', async () => {
    const before = currentLine();
    const snapshots = productBehaviorTestSnapshots(buildRecipeInput(useRecipeStore.getState()));
    snapshots[before.id] = {
      ...snapshots[before.id]!,
      mainClassification: 'MAIN_ALLOWED',
    };
    act(() => useRecipeStore.setState({ productBehaviorSnapshots: snapshots }));
    act(() => useRecipeStore.getState().setLockType(before.id, 'main', 'home'));
    await renderSection();

    const control = await openEditor();
    const plus = control.querySelector<HTMLButtonElement>('button[aria-label$="zwiększ"]')!;
    await act(async () => plus.click());
    await confirm();

    expect(currentLine()).toMatchObject({
      planned_grams: before.planned_grams + 1,
      lock_type: 'main',
      grams_constraint: { grams: before.planned_grams + 1 },
    });

    await renderSection();
    const amount = host.querySelector<HTMLElement>(`[data-testid="home-amount-${before.id}"]`);
    expect(amount?.dataset.locked).toBe('true');
    // The Crown moved from the row into the panel (DESIGN IV-B); the row only says „Główny”.
    expect(host.querySelector(`[data-testid="home-main-chip-${before.id}"]`)).not.toBeNull();
    await openEditor();
    const crown = document.querySelector<HTMLButtonElement>(
      `[data-testid="home-crown-${before.id}"]`,
    );
    expect(crown?.getAttribute('aria-pressed')).toBe('true');

    await act(async () => crown!.click());
    expect(currentLine()).toMatchObject({
      planned_grams: before.planned_grams + 1,
      lock_type: 'grams',
      grams_constraint: { grams: before.planned_grams + 1 },
    });
    await renderSection();
    const recrown = document.querySelector<HTMLButtonElement>(
      `[data-testid="home-crown-${before.id}"]`,
    );
    expect(recrown?.getAttribute('aria-pressed')).toBe('false');
    await act(async () => recrown!.click());
    expect(currentLine()).toMatchObject({
      planned_grams: before.planned_grams + 1,
      lock_type: 'main',
      grams_constraint: { grams: before.planned_grams + 1 },
    });

    await renderSection();
    // The padlock is the panel's amount-pill lock (the row menu's toggle is gone).
    const unlock = document.querySelector<HTMLButtonElement>('[data-testid="home-panel-lock"]')!;
    expect(unlock.getAttribute('aria-label')).toContain('Odblokuj ilość');
    expect(unlock.getAttribute('aria-pressed')).toBe('true');
    await act(async () => unlock.click());

    expect(currentLine()).toMatchObject({
      planned_grams: before.planned_grams + 1,
      lock_type: 'main',
    });
    expect(currentLine().grams_constraint).toBeUndefined();
  });
});
