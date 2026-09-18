// @vitest-environment jsdom
/**
 * DESIGN V3.0 VIII on a real document — what the static markup cannot show.
 *
 *   • opening the layer chooses nothing, so focus starts on „Tworzę swoją”, never on a card
 *     (its focus ring reads as „chosen” while „Wybierz” waits) nor on a dead arrow;
 *   • ‹ › are disabled at the ends and absent when every card already fits.
 *
 * jsdom lays nothing out, so the track's scroll geometry is supplied explicitly.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { homeCreatorCopy } from '../homeCreatorCopy';
import type { RecipeMatch } from '../homeRecipeMatching';
import { suggestionCards } from '../matching/homeIdeaSuggestions';
import { HomeSuggestionsSheet } from './HomeSuggestionsSheet';

const match = (id: string): RecipeMatch => ({
  candidate: {
    id,
    title: `Recipe ${id}`,
    source: 'official',
    profile: 'gelato',
    ingredients: [],
    imageUrl: null,
  },
  alsoIncludes: [],
});

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.body.style.overflow = '';
});

const render = async (ids: readonly string[]) => {
  await act(async () =>
    root.render(
      <HomeSuggestionsSheet
        cards={suggestionCards({ official: ids.map(match), community: null })}
        ideaLabel="truskawka"
        selectedId={null}
        onSelect={vi.fn()}
        onChoose={vi.fn()}
        onCreateOwn={vi.fn()}
        onSkip={vi.fn()}
      />,
    ),
  );
};

const q = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector);
const arrow = (label: string) => q<HTMLButtonElement>(`.home-rnav button[aria-label="${label}"]`);
const previous = () => arrow(homeCreatorCopy.match.previousCards);
const next = () => arrow(homeCreatorCopy.match.nextCards);

/** Give the track a real scroll geometry and tell it that it moved. */
const scrollTrack = async (geometry: {
  scrollWidth: number;
  clientWidth: number;
  scrollLeft: number;
}) => {
  const track = q<HTMLDivElement>('[data-testid="home-suggestions-carousel"]')!;
  for (const [key, value] of Object.entries(geometry)) {
    Object.defineProperty(track, key, { configurable: true, value });
  }
  await act(async () => {
    track.dispatchEvent(new Event('scroll'));
  });
};

describe('VIII — opening the layer chooses nothing', () => {
  it('starts focus on „Tworzę swoją”, not on the first card or an arrow', async () => {
    await render(['a', 'b', 'c']);
    const focused = document.activeElement as HTMLElement | null;
    expect(focused?.dataset.testid).toBe('home-suggestions-create-own');
    expect(q('[data-testid="home-suggestions-choose"]')?.getAttribute('aria-disabled')).toBe(
      'true',
    );
  });
});

describe('‹ › say where there is still something to see', () => {
  it('disables ‹ at the start, both in the middle stay live, › at the end', async () => {
    await render(['a', 'b', 'c', 'd', 'e']);

    await scrollTrack({ scrollWidth: 1200, clientWidth: 600, scrollLeft: 0 });
    expect(previous()?.disabled).toBe(true);
    expect(next()?.disabled).toBe(false);

    await scrollTrack({ scrollWidth: 1200, clientWidth: 600, scrollLeft: 300 });
    expect(previous()?.disabled).toBe(false);
    expect(next()?.disabled).toBe(false);

    // Sub-pixel short of the end (zoom, snap rounding) is the end.
    await scrollTrack({ scrollWidth: 1200, clientWidth: 600, scrollLeft: 598.6 });
    expect(previous()?.disabled).toBe(false);
    expect(next()?.disabled).toBe(true);
  });

  it('shows no arrows at all when every card already fits', async () => {
    await render(['a', 'b']);
    await scrollTrack({ scrollWidth: 900, clientWidth: 600, scrollLeft: 0 });
    expect(q('.home-rnav')).not.toBeNull();
    // A wider layer now holds both cards (or there was only ever one): nothing to scroll.
    await scrollTrack({ scrollWidth: 600, clientWidth: 600, scrollLeft: 0 });
    expect(q('.home-rnav')).toBeNull();
  });
});
