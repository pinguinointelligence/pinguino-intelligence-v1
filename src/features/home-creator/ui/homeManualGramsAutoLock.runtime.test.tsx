/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ownerSameInputRecipe } from '@/features/formulation/__fixtures__/ownerSameInputFixture';
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

const openEditor = async () => {
  const id = currentLine().id;
  const menu = host.querySelector<HTMLButtonElement>('[data-testid="home-row-menu"]');
  expect(menu).not.toBeNull();
  await act(async () => menu!.click());
  const change = host.querySelector<HTMLButtonElement>(
    `[data-testid="home-row-change-amount-${id}"]`,
  );
  expect(change).not.toBeNull();
  await act(async () => change!.click());
  const control = host.querySelector<HTMLElement>('[data-testid="home-change-amount-grams"]');
  expect(control).not.toBeNull();
  return control!;
};

const confirm = async () => {
  const button = host.querySelector<HTMLButtonElement>(
    '[data-testid="home-change-amount-confirm"]',
  );
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
});
