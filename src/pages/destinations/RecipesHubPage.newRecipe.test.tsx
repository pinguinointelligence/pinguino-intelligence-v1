// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasUnsaved: vi.fn(),
  start: vi.fn(),
  persona: vi.fn(),
  hasHomeDraft: vi.fn(),
  startHome: vi.fn(),
}));

vi.mock('@/features/pro-core/useProCorePersona', () => ({
  useProCorePersona: () => mocks.persona(),
}));
vi.mock('./startNewProRecipe', () => ({
  hasUnsavedProRecipeChanges: mocks.hasUnsaved,
  startNewProRecipe: mocks.start,
}));
vi.mock('@/features/home-creator/homeDraftStore', () => ({
  useHomeDraftStore: {
    getState: () => ({
      hasDraft: mocks.hasHomeDraft,
      startNew: mocks.startHome,
    }),
  },
}));

import { RecipesHubPage } from './RecipesHubPage';

describe('Recipes Hub new-recipe guard', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.hasUnsaved.mockReset();
    mocks.start.mockReset();
    mocks.persona.mockReset();
    mocks.persona.mockReturnValue('pro');
    mocks.hasHomeDraft.mockReset();
    mocks.hasHomeDraft.mockReturnValue(false);
    mocks.startHome.mockReset();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={['/recipes']}>
            <RecipesHubPage />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  const click = async (element: Element | null) => {
    if (!(element instanceof HTMLElement)) throw new Error('Expected clickable element.');
    await act(async () => element.click());
  };

  it('does not destroy an unsaved Pro draft before explicit confirmation', async () => {
    mocks.hasUnsaved.mockReturnValue(true);
    const newRecipe = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === '+ Nowa receptura',
    );

    await click(newRecipe ?? null);
    expect(mocks.start).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Rozpocząć nową recepturę?');

    await click(
      Array.from(document.body.querySelectorAll('button')).find(
        (button) => button.textContent === 'Anuluj',
      ) ?? null,
    );
    expect(mocks.start).not.toHaveBeenCalled();

    await click(newRecipe ?? null);
    await click(document.body.querySelector('[data-testid="confirm-new-recipe"]'));
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.start).toHaveBeenCalledWith('gelato');
  });

  it('confirms and resets both HOME draft state and its shared working copy', async () => {
    mocks.persona.mockReturnValue('home');
    mocks.hasHomeDraft.mockReturnValue(true);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={['/recipes']}>
            <RecipesHubPage />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    const newRecipe = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === '+ Nowa receptura',
    );

    await click(newRecipe ?? null);
    expect(mocks.startHome).not.toHaveBeenCalled();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Rozpocząć nową recepturę?');

    await click(document.body.querySelector('[data-testid="confirm-new-recipe"]'));
    expect(mocks.startHome).toHaveBeenCalledTimes(1);
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.start).toHaveBeenCalledWith('gelato');
  });
});
