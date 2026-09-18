/** @vitest-environment jsdom */
/**
 * DESIGN V3.0 — the HOME recipe screen (corrections IV, VI, XI, XII, XIII), driven in a
 * real document: the row opens the panel, a picked product waits as „0 g · Wpisz ilość”
 * with a black „Ilość”, the sweetness icon opens its layer and writes through the SAME
 * setter, „Reset” asks first, „Zaczynamy” calls the existing make handler, production
 * turns the black action into „Wróć do produkcji”, and the bottom actions take their
 * own place in the flow instead of covering the last row.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRecipeStore } from '@/stores/recipeStore';
import { HomeRecipeSection, type HomePendingAmount } from './HomeRecipeSection';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

type Props = Parameters<typeof HomeRecipeSection>[0];

const SCORE = {
  score: 8,
  label: 'Bardzo dobrze dopasowana',
  ariaText: '8 na 10 — Bardzo dobrze dopasowana',
} as unknown as Props['score'];

const LIBRARY = {
  ingredients: [],
  searchIndex: new Map(),
  nameIndex: new Map(),
} as unknown as Props['library'];

const BANANA: HomePendingAmount = {
  key: 'PI-ING-BANANA',
  name: 'BANANA · Fresh Fruit',
  category: 'fruit',
  kind: 'ingredient',
  initialGrams: null,
  recommendedDose: null,
  behavior: null,
};

let host: HTMLDivElement;
let root: Root;

const q = <T extends Element = HTMLElement>(testId: string) =>
  document.querySelector<T>(`[data-testid="${testId}"]`);
const click = (testId: string) => {
  const button = q<HTMLButtonElement>(testId);
  if (!button) throw new Error(`missing ${testId}`);
  act(() => button.click());
};

const renderSection = (patch: Partial<Props> = {}) => {
  const store = useRecipeStore.getState();
  const props: Props = {
    name: 'Truskawkowe gelato',
    onNameChange: vi.fn(),
    items: store.items,
    toppings: store.toppings,
    crownLineIds: [],
    score: SCORE,
    machineLine: 'Ninja CREAMi Deluxe · 1 pojemnik',
    canSeeGrams: true,
    sweetnessStored: 0,
    onSweetness: vi.fn(),
    library: LIBRARY,
    onGramsBlocked: vi.fn(),
    onRemoveItem: vi.fn(),
    onRemoveTopping: vi.fn(),
    onAddIngredient: vi.fn(),
    onAddTopping: vi.fn(),
    onSave: vi.fn(),
    onLetsMakeIt: vi.fn(),
    onShare: vi.fn(),
    onCommunity: vi.fn(),
    onBack: vi.fn(),
    saveNotice: null,
    onReset: vi.fn(),
    ...patch,
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <HomeRecipeSection {...props} />
      </QueryClientProvider>,
    ),
  );
  return props;
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  act(() => {
    root = createRoot(host);
  });
  Element.prototype.scrollIntoView = () => {};
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('the recipe header and score (DESIGN IV, VI)', () => {
  it('shows „‹ Wróć”, a light „Reset”, the name as the title and the shared score ring', () => {
    renderSection();
    expect(q('home-back-recipe')?.textContent).toContain('Wróć');
    expect(q('home-reset')?.textContent).toBe('Reset');
    expect(q('home-recipe-title')?.textContent).toBe('Truskawkowe gelato');
    expect(q('home-score-ring')?.getAttribute('data-score')).toBe('8');
    expect(q('home-recipe-score')?.textContent).toContain('Bardzo dobrze dopasowana');
    expect(q('home-recipe-machine-line')?.textContent).toBe('Ninja CREAMi Deluxe · 1 pojemnik');
  });

  it('the title opens the name panel, whose „Gotowe” keeps the name through the same setter', () => {
    const props = renderSection({ name: '' });
    expect(q('home-recipe-title')?.textContent).toBe('Nazwij swoje lody');
    click('home-recipe-name-open');
    const input = q<HTMLInputElement>('home-recipe-name')!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'Moje lody');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    click('home-name-done');
    expect(props.onNameChange).toHaveBeenCalledWith('Moje lody');
    expect(q('home-name-sheet')).toBeNull();
  });

  it('„Reset” asks first: „Wróć” keeps the recipe, „Reset” goes back to the empty start', () => {
    const props = renderSection();
    click('home-reset');
    expect(q('home-reset-sheet')?.textContent).toContain('Reset receptury?');
    click('home-reset-keep');
    expect(props.onReset).not.toHaveBeenCalled();
    expect(q('home-reset-sheet')).toBeNull();
    click('home-reset');
    click('home-reset-confirm');
    expect(props.onReset).toHaveBeenCalledTimes(1);
  });
});

describe('rows open the ingredient panel (DESIGN IV-B)', () => {
  it('the whole row is the button; no „•••”, no row Crown, no „Zmień ilość”', () => {
    renderSection();
    const first = useRecipeStore.getState().items[0]!;
    expect(host.querySelector('[data-testid="home-row-menu"]')).toBeNull();
    expect(host.querySelector(`[data-testid="home-crown-${first.id}"]`)).toBeNull();
    expect(host.textContent).not.toContain('Zmień ilość');
    click(`home-row-${first.id}`);
    expect(q('home-ingredient-panel')).not.toBeNull();
    expect(q('home-panel-name')?.textContent).toBeTruthy();
  });

  it('shows „Główny” as information and a padlock on a locked amount', () => {
    const first = useRecipeStore.getState().items[0]!;
    renderSection({ crownLineIds: [first.id] });
    expect(q(`home-main-chip-${first.id}`)?.textContent).toContain('Główny');
    expect(q(`home-main-chip-${first.id}`)?.tagName).toBe('SPAN');
  });
});

describe('a picked product waits in the panel, then as „0 g · Wpisz ilość” (IV-C, 5B)', () => {
  it('opens the panel at once; „Gotowe” without an amount leaves a 5B row and the black „Ilość”', () => {
    const props = renderSection({
      pendingAmounts: [BANANA],
      onConfirmPending: vi.fn(),
      onRemovePending: vi.fn(),
    });
    expect(q('home-ingredient-panel')).not.toBeNull();
    expect(q('home-panel-name')?.textContent).toBe('BANANA');
    click('home-panel-done');
    expect(props.onConfirmPending).not.toHaveBeenCalled();
    expect(q('home-ingredient-panel')).toBeNull();
    expect(q(`home-enter-amount-${BANANA.key}`)?.textContent).toBe('Wpisz ilość');
    expect(q(`home-amount-${BANANA.key}`)?.textContent).toContain('0');
    // One black action: „Ilość” instead of „Zaczynamy”.
    expect(q('home-lets-make-it')).toBeNull();
    click('home-enter-amount');
    expect(q('home-ingredient-panel')).not.toBeNull();

    const input = q('home-panel-grams')!.querySelector<HTMLInputElement>('input')!;
    act(() => {
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, '40');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => input.blur());
    click('home-panel-done');
    expect(props.onConfirmPending).toHaveBeenCalledWith(BANANA.key, 40);
  });

  it('„Usuń” removes the waiting product through the page', () => {
    const props = renderSection({
      pendingAmounts: [BANANA],
      onConfirmPending: vi.fn(),
      onRemovePending: vi.fn(),
    });
    click('home-panel-remove');
    expect(props.onRemovePending).toHaveBeenCalledWith(BANANA.key);
  });
});

describe('sweetness is an icon with its own layer (DESIGN XI)', () => {
  it('writes −1 / 0 / +1 through the existing setter, one tap each', () => {
    const props = renderSection({ sweetnessStored: 0 });
    const icon = q('home-sweetness-open')!;
    expect(icon.getAttribute('aria-label')).toBe('Słodycz: Optymalne');
    expect(q('home-sweetness-badge')).toBeNull();
    // No sweetness row in the recipe body.
    expect(q('home-sweetness')).toBeNull();

    click('home-sweetness-open');
    const sheet = q('home-sweetness-sheet')!;
    expect(sheet.textContent).toContain('Domyślnie: Optymalne');
    expect(sheet.textContent).toContain('Dostosuj recepturę');
    expect(q('home-sweetness-balanced')?.getAttribute('aria-checked')).toBe('true');

    click('home-sweetness-less');
    expect(props.onSweetness).toHaveBeenLastCalledWith('less');
    click('home-sweetness-sweeter');
    expect(props.onSweetness).toHaveBeenLastCalledWith('sweeter');
    click('home-sweetness-balanced');
    expect(props.onSweetness).toHaveBeenLastCalledWith('balanced');
    click('home-sweetness-done');
    expect(q('home-sweetness-sheet')).toBeNull();
  });

  it('a PRO +2 shows as „+1” on the icon and on the rail, and is not rewritten by looking', () => {
    const props = renderSection({ sweetnessStored: 2 });
    expect(q('home-sweetness-badge')?.textContent).toBe('+1');
    expect(q('home-sweetness-open')?.getAttribute('aria-label')).toBe('Słodycz: +1');
    click('home-sweetness-open');
    expect(q('home-sweetness-sweeter')?.getAttribute('aria-checked')).toBe('true');
    click('home-sweetness-done');
    expect(props.onSweetness).not.toHaveBeenCalled();
  });
});

describe('the bottom actions (DESIGN IV, „Zaczynamy”)', () => {
  it('„Zaczynamy” calls the existing make handler; Zapisz · Udostępnij · Community are the row above', () => {
    const props = renderSection();
    const actions = q('home-recipe-actions')!;
    expect(actions.textContent).toContain('Zapisz');
    expect(actions.textContent).toContain('Udostępnij');
    expect(actions.textContent).toContain('Community');
    expect(q('home-lets-make-it')?.textContent).toBe('Zaczynamy');
    click('home-lets-make-it');
    expect(props.onLetsMakeIt).toHaveBeenCalledTimes(1);
    click('home-save-recipe');
    click('home-share-recipe');
    click('home-publish-community');
    expect(props.onSave).toHaveBeenCalledTimes(1);
    expect(props.onShare).toHaveBeenCalledTimes(1);
    expect(props.onCommunity).toHaveBeenCalledTimes(1);
  });

  it('is sticky in the flow — after the last row and the add row — so it never covers the last row', () => {
    renderSection();
    const section = q('home-section-recipe')!;
    const actions = q('home-recipe-actions')!;
    const lines = q('home-recipe-lines')!;
    const addRow = q('home-add-controls')!;
    // In the section's own flow, below everything it acts on: its height is reserved.
    expect(actions.parentElement).toBe(section);
    expect(lines.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(addRow.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(actions.className).toContain('sticky');
    expect(actions.className).toContain('bottom-0');
    expect(actions.className).not.toMatch(/(^|\s)fixed(\s|$)/);
    // Safe-area aware.
    expect(actions.className).toContain('env(safe-area-inset-bottom)');
    // The last element of the section: nothing after it is hidden behind it.
    const lastInFlow = [...section.children].filter((node) => !node.matches('[data-dialog-shell]'));
    expect(lastInFlow.at(-1)).toBe(actions);
  });

  it('in production: „Wróć do produkcji”, no Reset, and a row explains instead of opening', () => {
    const props = renderSection({ productionActive: true, onResumeProduction: vi.fn() });
    expect(q('home-lets-make-it')).toBeNull();
    expect(q('home-reset')).toBeNull();
    click('home-back-to-production');
    expect(props.onResumeProduction).toHaveBeenCalledTimes(1);
    const first = useRecipeStore.getState().items[0]!;
    click(`home-row-${first.id}`);
    expect(q('home-ingredient-panel')).toBeNull();
    expect(q('home-production-lock-notice')?.textContent).toContain('Ta partia jest w produkcji');
  });
});
