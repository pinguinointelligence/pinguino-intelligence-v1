// @vitest-environment jsdom
/**
 * Community „Zrób te lody" replaces the current draft with a working copy, so unsaved work is
 * confirmed first — never discarded silently — and a clean draft opens without a question.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  unsaved: false,
  copy: vi.fn(async () => ({ status: 'done' as const })),
  remix: vi.fn(async () => ({ status: 'done' as const })),
}));

vi.mock('@/features/community/useRecipeDerivation', () => ({
  useRecipeDerivation: () => ({
    state: { status: 'idle' },
    useThisRecipe: mocks.copy,
    createMyVersion: mocks.remix,
    isWorking: false,
  }),
}));
vi.mock('@/pages/destinations/startNewProRecipe', () => ({
  hasUnsavedProRecipeChanges: () => mocks.unsaved,
}));

const { UseRecipeActions } = await import('./UseRecipeActions');

const TARGET = {
  source: { kind: 'publication', publicationId: 'pub-1', handle: 'anna', slug: 'qa' },
  sourceTitle: 'QA Gelato',
  sourceCreatorDisplayName: 'Anna QA',
} as const;

describe('Community „Zrób te lody” and unsaved work', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.unsaved = false;
    mocks.copy.mockClear();
    mocks.remix.mockClear();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root.render(<UseRecipeActions target={TARGET} />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  const click = async (testId: string) =>
    act(async () => host.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!.click());
  const confirmation = () => document.querySelector('[data-testid="new-recipe-confirmation"]');

  it('opens a clean draft straight away', async () => {
    await click('community-use-recipe');
    expect(confirmation()).toBeNull();
    expect(mocks.copy).toHaveBeenCalledTimes(1);
  });

  it('asks before replacing unsaved work, and opens only after the customer confirms', async () => {
    mocks.unsaved = true;
    await click('community-create-version');
    expect(confirmation()).not.toBeNull();
    expect(mocks.remix).not.toHaveBeenCalled();
    const confirm = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Nowa receptura',
    )!;
    await act(async () => confirm.click());
    expect(mocks.remix).toHaveBeenCalledTimes(1);
    expect(mocks.copy).not.toHaveBeenCalled();
    expect(confirmation()).toBeNull();
  });

  it('keeps the current draft when the customer cancels', async () => {
    mocks.unsaved = true;
    await click('community-use-recipe');
    const cancel = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Anuluj',
    )!;
    await act(async () => cancel.click());
    expect(mocks.copy).not.toHaveBeenCalled();
    expect(confirmation()).toBeNull();
  });
});
