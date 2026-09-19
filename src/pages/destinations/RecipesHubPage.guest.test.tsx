// @vitest-environment jsdom
/**
 * The Recipes library as a GUEST (served staging walk, 2026-09-18).
 *
 *   • „+ Nowa receptura” opens the canonical HOME creator, never the legacy `/start` shell;
 *   • „Udostępnione” without a session is the signed-out state „Moje” already uses — a failed
 *     read of the received shares must never read as „nothing was shared with you”.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@/copy/en';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { useAuthStore } from '@/stores/authStore';

const mocks = vi.hoisted(() => ({
  listReceivedShares: vi.fn(),
}));

vi.mock('@/features/pro-core/useProCorePersona', () => ({
  useProCorePersona: () => 'demo',
}));
vi.mock('@/services/community', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/community')>()),
  listReceivedShares: mocks.listReceivedShares,
}));

import { RecipesHubPage } from './RecipesHubPage';

describe('Recipes library for a guest', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  const render = async (entry: string) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={[entry]}>
            <Routes>
              <Route path="/recipes" element={<RecipesHubPage />} />
              <Route path="/home" element={<p data-testid="home-creator-probe">HOME</p>} />
              <Route path="/start" element={<p data-testid="legacy-start-probe">START</p>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
  };

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.listReceivedShares.mockReset();
    mocks.listReceivedShares.mockRejectedValue(new Error('not signed in'));
    useAuthStore.setState({ status: 'anon', user: null, available: true });
    useAuthModalStore.setState({ isOpen: false, notice: null });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('„+ Nowa receptura” opens the canonical HOME creator, not the legacy /start shell', async () => {
    await render('/recipes');
    const newRecipe = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === '+ Nowa receptura',
    );
    expect(newRecipe).toBeDefined();
    await act(async () => newRecipe!.click());
    expect(host.querySelector('[data-testid="home-creator-probe"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="legacy-start-probe"]')).toBeNull();
  });

  it('„Udostępnione” asks a guest to sign in instead of claiming nothing was shared', async () => {
    await render('/recipes?tab=shared');
    const signedOut = host.querySelector('[data-testid="recipes-shared-signed-out"]');
    expect(signedOut?.textContent).toContain(copy.recipes.signInToView);
    // The received-shares read is never attempted without a session.
    expect(mocks.listReceivedShares).not.toHaveBeenCalled();

    const signIn = Array.from(signedOut!.querySelectorAll('button')).find(
      (button) => button.textContent === copy.recipes.signInCta,
    );
    await act(async () => signIn!.click());
    expect(useAuthModalStore.getState().isOpen).toBe(true);
  });
});
