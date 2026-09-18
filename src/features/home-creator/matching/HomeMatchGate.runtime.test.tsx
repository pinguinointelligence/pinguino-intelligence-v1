// @vitest-environment jsdom
/**
 * §37 — „Wybierz” on a Community card.
 *
 * A derivation is saved to an account. A GUEST therefore gets the sign-in dialog and the
 * layer stays with the choice — exactly as the official-recipe path does — instead of a
 * derivation attempt that can only end in „Nie udało się otworzyć tej receptury”.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { useAuthStore } from '@/stores/authStore';
import type { RecipeMatch } from '../homeRecipeMatching';
import type { CommunityMatch } from './communityMatchService';
import { suggestionCards } from './homeIdeaSuggestions';

const derivation = vi.hoisted(() => ({
  useThisRecipe: vi.fn(),
}));

vi.mock('@/features/community/useRecipeDerivation', () => ({
  useRecipeDerivation: () => ({
    state: { status: 'idle' },
    useThisRecipe: derivation.useThisRecipe,
  }),
}));

import { HomeMatchGate } from './HomeMatchGate';

const community: RecipeMatch = {
  candidate: {
    id: 'pub-1',
    title: 'Truskawka Community',
    source: 'community',
    profile: 'gelato',
    ingredients: [],
    imageUrl: null,
  },
  alsoIncludes: [],
};

const communityMatch: CommunityMatch = {
  candidate: community.candidate,
  alsoIncludes: [],
  slug: 'truskawka-community',
  publicationId: 'pub-1',
  handle: 'marysia',
  title: 'Truskawka Community',
  creatorDisplayName: 'Marysia',
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  derivation.useThisRecipe.mockReset();
  derivation.useThisRecipe.mockResolvedValue({ status: 'done' });
  useAuthModalStore.setState({ isOpen: false, notice: null });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.body.style.overflow = '';
  useAuthStore.setState({ status: 'loading', user: null });
});

const chooseCommunityCard = async () => {
  const cards = suggestionCards({ official: [], community });
  const onDerived = vi.fn();
  await act(async () =>
    root.render(
      <HomeMatchGate
        cards={cards}
        communityMatch={communityMatch}
        ideaLabel="truskawka"
        selectedId={cards[0]!.id}
        onSelect={vi.fn()}
        onChooseOfficial={vi.fn()}
        onCreateMyOwn={vi.fn()}
        onSkip={vi.fn()}
        onDerived={onDerived}
      />,
    ),
  );
  await act(async () => {
    document.querySelector<HTMLButtonElement>('[data-testid="home-suggestions-choose"]')!.click();
  });
  return onDerived;
};

describe('§37 — a Community „Wybierz”', () => {
  it('asks a guest to sign in and keeps the layer, without attempting a derivation', async () => {
    useAuthStore.setState({ status: 'anon', user: null });
    const onDerived = await chooseCommunityCard();
    expect(useAuthModalStore.getState().isOpen).toBe(true);
    expect(derivation.useThisRecipe).not.toHaveBeenCalled();
    expect(onDerived).not.toHaveBeenCalled();
    expect(document.querySelector('[data-testid="home-suggestions"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="home-suggestions-message"]')).toBeNull();
  });

  it('derives through the canonical authority for a signed-in customer', async () => {
    useAuthStore.setState({
      status: 'authed',
      user: { id: 'user-1', email: 'qa@example.test', displayName: null },
    });
    const onDerived = await chooseCommunityCard();
    expect(useAuthModalStore.getState().isOpen).toBe(false);
    expect(derivation.useThisRecipe).toHaveBeenCalledTimes(1);
    expect(onDerived).toHaveBeenCalledTimes(1);
  });
});
