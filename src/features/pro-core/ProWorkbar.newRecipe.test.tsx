// @vitest-environment jsdom
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
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
/* Version 10 §H1b: the button says „Reset" now. The door behind it and the question it asks
   first are the ones „Nowa receptura" always used — the rename changed the word, not the act. */
vi.mock('@/pages/destinations/startNewProRecipe', () => ({
  hasUnsavedProRecipeChanges: mocks.hasUnsaved,
  resetWorkspaceToFreshStart: mocks.start,
}));

import { ProWorkbar } from './ProWorkbar';

describe('ProWorkbar new-recipe confirmation', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.hasUnsaved.mockReset();
    mocks.start.mockReset();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={['/pro/recipe']}>
          <Routes>
            <Route path="/pro/:section" element={<ProWorkbar />} />
          </Routes>
        </MemoryRouter>,
      ),
    );
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

    await click(host.querySelector('[data-testid="pro-workspace-reset"]'));

    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.start).toHaveBeenCalledWith('gelato');
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  it('shows the exact confirmation copy and cancels or confirms an unsaved draft', async () => {
    mocks.hasUnsaved.mockReturnValue(true);

    await click(host.querySelector('[data-testid="pro-workspace-reset"]'));
    expect(mocks.start).not.toHaveBeenCalled();
    // Unchanged by the rename: the same question, about the same recipe.
    expect(document.body.textContent).toContain('Rozpocząć nową recepturę?');
    expect(document.body.textContent).toContain(
      'Niezapisane zmiany w bieżącej recepturze zostaną usunięte.',
    );
    // „Reset" is only the word on the button that confirms it.
    expect(document.body.querySelector('[data-testid="confirm-new-recipe"]')?.textContent).toBe(
      'Reset',
    );

    await click(
      Array.from(document.body.querySelectorAll('button')).find(
        (button) => button.textContent === 'Anuluj',
      ) ?? null,
    );
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(mocks.start).not.toHaveBeenCalled();

    await click(host.querySelector('[data-testid="pro-workspace-reset"]'));
    await click(document.body.querySelector('[data-testid="confirm-new-recipe"]'));
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });
});
