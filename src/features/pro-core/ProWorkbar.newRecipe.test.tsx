// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasUnsaved: vi.fn(),
  start: vi.fn(),
}));

const recipeState = {
  savedRecipeId: 'saved-recipe',
  savedRecipeName: 'Pistacja',
  currentVersionNumber: 2,
  dirty: false,
  visibleProductType: 'gelato',
  formulation_strategy: 'optimal',
  target_temperature_c: -12,
  target_batch_grams: 1_000,
  machineKind: 'professional',
  servingModeId: 'temp_minus_12',
  machineLabel: 'Maszyna profesjonalna',
};

vi.mock('@/stores/recipeStore', () => ({
  useRecipeStore: Object.assign(
    (selector: (state: typeof recipeState) => unknown) => selector(recipeState),
    { getState: () => recipeState },
  ),
}));
vi.mock('@/features/recipes/useCanonicalRecipeSave', () => ({
  useCanonicalRecipeSave: () => ({
    blocked: null,
    busy: false,
    error: null,
    practicalBlocked: false,
    practicalBlockMessage: null,
    createNew: vi.fn(),
    saveVersion: vi.fn(),
    rename: vi.fn(),
  }),
}));
vi.mock('@/features/pro-workbench/WorkbenchActionBar', () => ({
  WorkbenchActionBar: () => null,
}));
vi.mock('@/features/design-review/ReviewBadge', () => ({
  ReviewDecisionLabel: () => null,
}));
vi.mock('@/features/constraint-studio/constraintStudioStore', () => ({
  useConstraintStudioStore: (selector: (state: { history: unknown[] }) => unknown) =>
    selector({ history: [] }),
}));
vi.mock('@/pages/destinations/startNewProRecipe', () => ({
  hasUnsavedProRecipeChanges: mocks.hasUnsaved,
  startNewProRecipe: mocks.start,
}));

import { ProWorkbar } from './ProWorkbar';

describe('ProWorkbar new-recipe confirmation', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    mocks.hasUnsaved.mockReset();
    mocks.start.mockReset();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root.render(<ProWorkbar />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  const click = async (element: Element | null) => {
    if (!(element instanceof HTMLElement)) throw new Error('Expected clickable element.');
    await act(async () => element.click());
  };

  it('starts immediately when no unsaved material state exists', async () => {
    mocks.hasUnsaved.mockReturnValue(false);

    await click(host.querySelector('[data-testid="pro-workbar-new-recipe"]'));

    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.start).toHaveBeenCalledWith('gelato');
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it('shows the exact confirmation copy and cancels or confirms an unsaved draft', async () => {
    mocks.hasUnsaved.mockReturnValue(true);

    await click(host.querySelector('[data-testid="pro-workbar-new-recipe"]'));
    expect(mocks.start).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Rozpocząć nową recepturę?');
    expect(host.textContent).toContain(
      'Niezapisane zmiany w bieżącej recepturze zostaną usunięte.',
    );

    await click(Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'Anuluj') ?? null);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(mocks.start).not.toHaveBeenCalled();

    await click(host.querySelector('[data-testid="pro-workbar-new-recipe"]'));
    await click(host.querySelector('[data-testid="confirm-new-recipe"]'));
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });
});
