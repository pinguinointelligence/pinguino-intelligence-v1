// @vitest-environment jsdom
/**
 * DESIGN V3.0 VI + IX — the HOME start screen, driven the way a customer drives it.
 *
 *   • two modes, „Twój pomysł” | „Receptury” (Community is a collection, not a mode);
 *   • ONE „Rozpocznij recepturę”, visibly inactive until there is a minimal input;
 *   • „Twój pomysł” hands the press to the page's existing CTA handler;
 *   • a chosen card shows „Wybrana: …”, and the press opens it through the EXISTING door —
 *     the official adoption (the page's `adoptOfficialRecipe`) or the Community derivation
 *     (`useRecipeDerivation`, mocked here), which asks a guest to sign in first;
 *   • the search runs on the existing central authorities (the resolver door and the
 *     §32–§36 matching, mocked here) — and nothing found carries the word to „Twój pomysł”.
 */
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { useAuthStore } from '@/stores/authStore';
import type { CommunityCard } from '@/services/community';
import type { HomeStartMode } from '../homeComposerGate';
import { useHomeDraftStore } from '../homeDraftStore';
import type { RecipeMatch } from '../homeRecipeMatching';
import type { CommunityMatch } from '../matching/communityMatchService';

const derivation = vi.hoisted(() => ({ useThisRecipe: vi.fn() }));
vi.mock('@/features/community/useRecipeDerivation', () => ({
  useRecipeDerivation: () => ({
    state: { status: 'idle' },
    useThisRecipe: derivation.useThisRecipe,
  }),
}));

const community = vi.hoisted(() => ({ topRecipes: vi.fn() }));
vi.mock('@/services/community', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/community')>()),
  topRecipes: community.topRecipes,
}));

const authorities = vi.hoisted(() => ({
  resolveChipTerm: vi.fn(),
  searchOfficialMatches: vi.fn(),
  searchCommunityMatches: vi.fn(),
  loadConceptMatchContext: vi.fn(),
}));
vi.mock('../homeIntentResolutionService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../homeIntentResolutionService')>()),
  resolveChipTerm: authorities.resolveChipTerm,
}));
vi.mock('../matching/homeMatchSearch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../matching/homeMatchSearch')>()),
  searchOfficialMatches: authorities.searchOfficialMatches,
  searchCommunityMatches: authorities.searchCommunityMatches,
  loadConceptMatchContext: authorities.loadConceptMatchContext,
}));

import { HomeStart } from './HomeStart';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const spies = {
  mode: vi.fn(),
  startIdea: vi.fn(),
  openOfficial: vi.fn(),
  communityOpened: vi.fn(),
};

function Harness({
  ideaReady = false,
  atStart = true,
  libraryRefusal = null,
}: {
  ideaReady?: boolean;
  atStart?: boolean;
  libraryRefusal?: { recipeId: string; message: string } | null;
}) {
  const [mode, setMode] = useState<HomeStartMode>('idea');
  return (
    <HomeStart
      draftId="draft-1"
      mode={mode}
      onModeChange={(next) => {
        spies.mode(next);
        setMode(next);
      }}
      atStart={atStart}
      idea={<div data-testid="idea-section">idea</div>}
      ideaReady={ideaReady}
      onStartIdea={spies.startIdea}
      onOpenOfficial={spies.openOfficial}
      onCommunityOpened={spies.communityOpened}
      libraryRefusal={libraryRefusal}
    />
  );
}

let host: HTMLDivElement;
let root: Root;

const q = <T extends Element = HTMLElement>(id: string): T | null =>
  host.querySelector<T>(`[data-testid="${id}"]`);
const need = <T extends Element = HTMLElement>(id: string): T => {
  const element = q<T>(id);
  if (!element) throw new Error(`missing ${id}`);
  return element;
};
const click = async (id: string) => {
  await act(async () => need<HTMLElement>(id).click());
};
const cta = () => need<HTMLButtonElement>('home-intent-cta');
const render = async (props: Parameters<typeof Harness>[0] = {}) => {
  await act(async () => root.render(<Harness {...props} />));
};
const typeSearch = async (text: string) => {
  const input = need<HTMLInputElement>('home-library-search');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // The search waits for the customer to stop typing (debounce), then answers.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 380));
  });
  await act(async () => {
    await Promise.resolve();
  });
};

const official = (id: string, title: string): RecipeMatch => ({
  candidate: { id, title, source: 'official', profile: 'gelato', ingredients: [], imageUrl: null },
  alsoIncludes: [],
});
const communityRow: CommunityCard = {
  publication_id: 'pub-1',
  title: 'Truskawki z mascarpone',
  slug: 'truskawki-z-mascarpone',
  version_number: 1,
  published_at: '2026-09-01T00:00:00Z',
  creator: { handle: 'marysia', display_name: 'Marysia' },
  metrics: {
    unique_users: 1,
    unique_makers: 1,
    total_makes: 1,
    remix_count: 0,
    rating_count: 0,
    rating_average: null,
  },
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  for (const spy of Object.values(spies)) spy.mockReset();
  derivation.useThisRecipe.mockReset();
  derivation.useThisRecipe.mockResolvedValue({ status: 'done' });
  community.topRecipes.mockReset();
  community.topRecipes.mockResolvedValue([communityRow]);
  for (const authority of Object.values(authorities)) authority.mockReset();
  authorities.loadConceptMatchContext.mockRejectedValue(new Error('not needed'));
  authorities.searchCommunityMatches.mockResolvedValue({
    community: [],
    communityMatches: [],
    coverage: { asked: 1, combinations: 1, partial: false },
  });
  useAuthModalStore.setState({ isOpen: false, notice: null });
  useAuthStore.setState({ status: 'anon', user: null });
  useHomeDraftStore.setState({ chips: [], profile: null });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  useHomeDraftStore.setState({ chips: [], profile: null });
  useAuthStore.setState({ status: 'loading', user: null });
});

describe('two modes — „Twój pomysł” | „Receptury”', () => {
  it('offers exactly two modes, the idea first and chosen', async () => {
    await render();
    const modes = [...host.querySelectorAll('[role="radio"]')];
    expect(modes.map((mode) => mode.textContent)).toEqual(['Twój pomysł', 'Receptury']);
    expect(modes.map((mode) => mode.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    expect(q('idea-section')).not.toBeNull();
    // The old third tab and its navigation away from HOME are gone.
    expect(host.textContent).not.toContain('Receptury Gellatti');
    expect(host.querySelector('a[href="/community"], a[href="/recipes"]')).toBeNull();
  });

  it('„Receptury” shows six collections — Community is the sixth — in place of the idea', async () => {
    await render();
    await click('home-start-mode-library');
    expect(spies.mode).toHaveBeenLastCalledWith('library');
    expect(q('idea-section')).toBeNull();
    const tiles = [...need('home-library-collections').querySelectorAll('button')];
    expect(tiles.map((tile) => tile.querySelector('b')?.textContent)).toEqual([
      'Classics',
      'Icons',
      'Cocktails & Spirits',
      'Lost & Legendary',
      'Technical Bases',
      'Community',
    ]);
    expect(tiles[0]!.querySelector('small')?.textContent).toBe('76 receptur');
    expect(tiles[0]!.querySelector('img')?.getAttribute('src')).toBe(
      '/recipes/official/collections/classics-960.webp',
    );
  });

  it('after the idea was sent the modes step aside and the action returns to the page', async () => {
    await render({ atStart: false, ideaReady: true });
    expect(host.querySelector('[role="radiogroup"]')).toBeNull();
    expect(need('home-start-cta-bar').getAttribute('data-placement')).toBe('inline');
  });
});

describe('ONE „Rozpocznij recepturę”, inactive until there is a minimal input', () => {
  it('is pinned and visibly inactive on the empty idea screen', async () => {
    await render();
    expect(cta().textContent).toBe('Rozpocznij recepturę');
    expect(cta().getAttribute('aria-disabled')).toBe('true');
    expect(need('home-start-cta-bar').getAttribute('data-placement')).toBe('pinned');
    await click('home-intent-cta');
    expect(spies.startIdea).not.toHaveBeenCalled();
  });

  it('„Twój pomysł”: an idea makes it active and the press runs the page’s CTA handler', async () => {
    await render({ ideaReady: true });
    expect(cta().getAttribute('aria-disabled')).toBe('false');
    await click('home-intent-cta');
    expect(spies.startIdea).toHaveBeenCalledTimes(1);
  });

  it('„Receptury”: inactive until a card is chosen, then „Wybrana: …” above it', async () => {
    await render({ ideaReady: true });
    await click('home-start-mode-library');
    expect(cta().getAttribute('aria-disabled')).toBe('true');
    expect(q('home-start-chosen')).toBeNull();

    await click('home-library-collection-classics');
    expect(need('home-library-carousel-summary').textContent).toBe('76 receptur');
    await click('home-recipe-card-classic-frutilla-crema');
    expect(need('home-recipe-card-classic-frutilla-crema').getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(need('home-start-chosen').textContent).toBe('Wybrana: Frutilla a la Crema');
    expect(cta().getAttribute('aria-disabled')).toBe('false');
    // The idea is not what this press starts.
    await click('home-intent-cta');
    expect(spies.startIdea).not.toHaveBeenCalled();
  });
});

describe('a chosen recipe opens through the EXISTING doors', () => {
  it('a Gellatti recipe goes to the official adoption door', async () => {
    await render();
    await click('home-start-mode-library');
    await click('home-library-collection-classics');
    await click('home-recipe-card-classic-frutilla-crema');
    await click('home-intent-cta');
    expect(spies.openOfficial).toHaveBeenCalledWith('classic-frutilla-crema');
  });

  it('the official door’s refusal is said next to the action, only for that recipe', async () => {
    await render({
      libraryRefusal: { recipeId: 'classic-frutilla-crema', message: 'Nie można otworzyć.' },
    });
    await click('home-start-mode-library');
    await click('home-library-collection-classics');
    await click('home-recipe-card-classic-frutilla-crema');
    expect(need('home-start-message').textContent).toBe('Nie można otworzyć.');
    await click('home-recipe-card-classic-dark-chocolate');
    expect(q('home-start-message')).toBeNull();
  });

  it('a Community recipe asks a guest to sign in and derives nothing', async () => {
    await render();
    await click('home-start-mode-library');
    await click('home-library-collection-community');
    expect(community.topRecipes).toHaveBeenCalledWith('all_time', 100);
    await click('home-recipe-card-pub-1');
    expect(need('home-start-chosen').textContent).toBe('Wybrana: Truskawki z mascarpone');
    await click('home-intent-cta');
    expect(useAuthModalStore.getState().isOpen).toBe(true);
    expect(derivation.useThisRecipe).not.toHaveBeenCalled();
    expect(spies.communityOpened).not.toHaveBeenCalled();
  });

  it('a Community recipe goes through the canonical derivation for a signed-in customer', async () => {
    useAuthStore.setState({
      status: 'authed',
      user: { id: 'user-1', email: 'qa@example.test', displayName: null },
    });
    await render();
    await click('home-start-mode-library');
    await click('home-library-collection-community');
    await click('home-recipe-card-pub-1');
    await click('home-intent-cta');
    expect(derivation.useThisRecipe).toHaveBeenCalledTimes(1);
    expect(spies.communityOpened).toHaveBeenCalledTimes(1);
  });
});

describe('the search uses the existing central authorities', () => {
  it('resolves the word through the resolver door and matches through §32–§36', async () => {
    authorities.resolveChipTerm.mockResolvedValue({
      kind: 'resolved',
      row: { ingredient_id: 'PI-ING-001553', ingredient_name_display: 'STRAWBERRIES' },
      provenance: { authority: 'LITERAL_CATALOGUE' },
    });
    authorities.searchOfficialMatches.mockReturnValue([
      official('classic-frutilla-crema', 'Frutilla a la Crema'),
    ]);
    const communityMatch: CommunityMatch = {
      candidate: {
        id: 'pub-1',
        title: 'Truskawki z mascarpone',
        source: 'community',
        profile: 'gelato',
        ingredients: [],
        imageUrl: null,
        authorName: 'Marysia',
        rank: 3,
      },
      alsoIncludes: [],
      slug: 'truskawki-z-mascarpone',
      publicationId: 'pub-1',
      handle: 'marysia',
      title: 'Truskawki z mascarpone',
      creatorDisplayName: 'Marysia',
    };
    authorities.searchCommunityMatches.mockResolvedValue({
      community: [{ candidate: communityMatch.candidate, alsoIncludes: [] }],
      communityMatches: [communityMatch],
      coverage: { asked: 1, combinations: 1, partial: false },
    });

    await render();
    await click('home-start-mode-library');
    const input = need<HTMLInputElement>('home-library-search');
    act(() => input.focus());
    await typeSearch('truskawka');

    expect(authorities.resolveChipTerm).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'truskawka' }),
      expect.anything(),
      expect.anything(),
    );
    expect(authorities.searchOfficialMatches).toHaveBeenCalledWith(
      expect.objectContaining({
        requested: [expect.objectContaining({ productId: 'PI-ING-001553' })],
      }),
    );
    expect(need('home-library-results-summary').textContent).toBe(
      'truskawka · 1 receptura · 1 z Community',
    );
    expect(q('home-recipe-card-classic-frutilla-crema')).not.toBeNull();
    expect(q('home-recipe-card-pub-1')).not.toBeNull();
    // Typing never took the focus away from the field.
    expect(document.activeElement).toBe(need('home-library-search'));

    // × clears the words and returns to the level the customer was on.
    await click('home-library-search-clear');
    expect(q('home-library-collections')).not.toBeNull();
  });

  it('nothing found → „Twój pomysł” carries the typed flavour over as an idea chip', async () => {
    authorities.resolveChipTerm.mockResolvedValue({ kind: 'unresolved' });
    await render();
    await click('home-start-mode-library');
    await typeSearch('durian');
    expect(need('home-library-none').textContent).toContain('Nie mamy jeszcze takich receptur.');
    expect(authorities.searchOfficialMatches).not.toHaveBeenCalled();

    await click('home-library-carry-idea');
    expect(spies.mode).toHaveBeenLastCalledWith('idea');
    expect(useHomeDraftStore.getState().chips.map((chip) => chip.label)).toEqual(['durian']);
    expect(q('idea-section')).not.toBeNull();
  });
});

describe('the page hands the press to its existing doors', () => {
  const page = readFileSync('src/pages/home/HomeCreatorPage.tsx', 'utf8');
  const handler = (name: string) =>
    page.slice(page.indexOf(`${name}={`), page.indexOf(`${name}={`) + 600);

  it('„Twój pomysł” commits the typed words, then runs the existing submitIdea', () => {
    const onStartIdea = handler('onStartIdea');
    expect(onStartIdea.indexOf('commitTyped()')).toBeGreaterThan(-1);
    expect(onStartIdea.indexOf('submitIdea()')).toBeGreaterThan(
      onStartIdea.indexOf('commitTyped()'),
    );
  });

  it('a Gellatti recipe goes to adoptOfficialRecipe, as the library handoff does', () => {
    expect(handler('onOpenOfficial')).toContain(
      'adoptOfficialRecipe(recipeId, { keepIdea: false, automatic: false })',
    );
  });
});
