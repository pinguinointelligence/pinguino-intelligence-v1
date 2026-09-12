// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRecipeStore } from '@/stores/recipeStore';

vi.mock('@/features/design-review/useReviewMode', () => ({ useReviewMode: () => true }));
vi.mock('@/features/design-review/useOwnerReviewAccess', () => ({
  useOwnerReviewAccess: () => true,
}));
vi.mock('@/features/pro-core/useProCorePersona', () => ({ useProCorePersona: () => 'pro' }));
/* Under the FINAL 2541 Mapper no registered Owner Review Base is current-Engine-executable, so
   this contract marks ONE template executable inside this test only. The confirmation contract
   is about replacing an unsaved draft, not about any template's readiness. */
vi.mock('@/data/recipes/executableRecipeLibrary', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/data/recipes/executableRecipeLibrary')>();
  return {
    ...actual,
    EXECUTABLE_RECIPE_TEMPLATES: actual.EXECUTABLE_RECIPE_TEMPLATES.map((template) =>
      template.id === 'fantasy-rocero-v1'
        ? {
            ...template,
            currentEngineEvaluation: {
              ...template.currentEngineEvaluation!,
              violations: [],
              executable: true,
            },
          }
        : template,
    ),
  };
});

const { RecipesHubPage } = await import('./RecipesHubPage');

describe('Owner Review handoff over an unsaved draft', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    useRecipeStore.getState().resetToDemo();
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/recipes']}>
          <RecipesHubPage />
        </MemoryRouter>,
      );
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  const clickByText = async (text: string) => {
    const target = Array.from(document.body.querySelectorAll('button')).find((button) =>
      button.textContent?.includes(text),
    );
    if (!target) throw new Error(`Missing button: ${text}`);
    await act(async () => target.click());
  };

  it('requires explicit confirmation before an Owner Review handoff can replace an unsaved draft', async () => {
    useRecipeStore.setState({ dirty: true });
    await clickByText('Fantasy');
    await clickByText('Otwórz w Pro');

    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain(
      'Niezapisane zmiany w bieżącej recepturze zostaną usunięte.',
    );

    await clickByText('Anuluj');
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(useRecipeStore.getState().dirty).toBe(true);

    await clickByText('Otwórz w Pro');
    const confirm = document.body.querySelector<HTMLButtonElement>(
      '[data-testid="confirm-new-recipe"]',
    );
    expect(confirm).not.toBeNull();
    await act(async () => confirm?.click());
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(useRecipeStore.getState().dirty).toBe(false);
  });
});
