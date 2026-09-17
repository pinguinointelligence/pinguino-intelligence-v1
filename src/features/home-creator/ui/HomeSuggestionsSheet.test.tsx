/**
 * DESIGN V3.0 VIII — the suggestions layer: user control and CUSTOMER LANGUAGE.
 * Carries over every §32–§38 guarantee of the retired list popup.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { OFFICIAL_RECIPES } from '@/data/recipes/official/officialRecipeLibrary';
import { homeCreatorCopy } from '../homeCreatorCopy';
import type { RecipeMatch } from '../homeRecipeMatching';
import { suggestionCards } from '../matching/homeIdeaSuggestions';
import { HomeSuggestionsSheet } from './HomeSuggestionsSheet';

const SOURCES = [
  'src/features/home-creator/ui/HomeSuggestionsSheet.tsx',
  'src/features/home-creator/ui/HomeRecipeCarousel.tsx',
].map((path) => readFileSync(join(process.cwd(), path), 'utf8'));

const official = OFFICIAL_RECIPES.find((recipe) => recipe.number === 57)!;
const match = (id: string, source: 'official' | 'community', extra = {}): RecipeMatch => ({
  candidate: {
    id,
    title: `Recipe ${id}`,
    source,
    profile: 'gelato',
    ingredients: [],
    imageUrl: null,
    ...extra,
  },
  alsoIncludes: [],
});

const render = (
  input: { official?: RecipeMatch[]; community?: RecipeMatch | null },
  props: Partial<Parameters<typeof HomeSuggestionsSheet>[0]> = {},
) =>
  renderToStaticMarkup(
    <HomeSuggestionsSheet
      cards={suggestionCards({
        official: input.official ?? [],
        community: input.community ?? null,
      })}
      ideaLabel="truskawka"
      selectedId={null}
      onSelect={vi.fn()}
      onChoose={vi.fn()}
      onCreateOwn={vi.fn()}
      onSkip={vi.fn()}
      {...props}
    />,
  );

describe('VIII — the layer offers, it never chooses', () => {
  it('shows „Tworzę swoją”, „Pomiń” and a „Wybierz” that waits for a tapped card', () => {
    const html = render({ official: [match(official.recipeId, 'official')] });
    expect(html).toContain(homeCreatorCopy.match.suggestionsTitle);
    expect(html).toContain(homeCreatorCopy.match.suggestionsSubtitle);
    expect(html).toContain('home-suggestions-create-own');
    expect(html).toContain('home-suggestions-skip');
    expect(html).toMatch(
      /data-testid="home-suggestions-choose"[^>]*|aria-disabled="true"[^>]*home-suggestions-choose/,
    );
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('aria-pressed="false"');
  });

  it('a tapped card is pressed and „Wybierz” becomes available', () => {
    const html = render(
      { official: [match(official.recipeId, 'official')] },
      { selectedId: official.recipeId },
    );
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain('aria-disabled="true"');
  });

  it('nothing in the layer calls a choice from an effect', () => {
    for (const source of SOURCES) {
      expect(source).not.toMatch(/useEffect\([\s\S]{0,400}on(Choose|Select)\(/);
    }
  });
});

describe('IX — one card: photo, collection, name, one quiet line', () => {
  it('an official card reads collection · name · „typ · pochodzenie”', () => {
    const [card] = suggestionCards({
      official: [
        {
          ...match(official.recipeId, 'official'),
          candidate: { ...match(official.recipeId, 'official').candidate, title: official.name },
        },
      ],
      community: null,
    });
    expect(card).toMatchObject({ eyebrow: 'Classics', title: official.name });
    expect(card?.subline).toContain('Gelato');
  });

  it('§34 — at most one Community card, labelled as Community · Top 100 with its place in words', () => {
    const cards = suggestionCards({
      official: [],
      community: match('c1', 'community', { authorName: 'Anna', rank: 3 }),
    });
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      eyebrow: homeCreatorCopy.match.communityEyebrow,
      subline: `Anna · ${homeCreatorCopy.match.rankShort(3)}`,
    });
  });

  it('§38 — the original creator is shown for a Community family', () => {
    const html = render({
      community: match('c1', 'community', { originalCreatorName: 'Maria QA' }),
    });
    expect(html).toContain('home-recipe-card-based-on');
    expect(html).toContain('Maria QA');
  });
});

describe('CUSTOMER LANGUAGE — no matcher vocabulary, no grams', () => {
  it('renders no technical matching terms', () => {
    const html = render({
      official: [match(official.recipeId, 'official')],
      community: match('c1', 'community', { authorName: 'Anna', rank: 3 }),
    });
    for (const term of [
      'match_tier',
      'canonical',
      'PI-ING-',
      'containment',
      'confidence',
      'oracle',
      'strict',
      'SQL',
    ]) {
      expect(html, term).not.toContain(term);
    }
  });

  it('takes every visible sentence from the copy authority', () => {
    for (const source of SOURCES) {
      expect(source).not.toMatch(/>[^<>{}\n]*[ąćęłńóśźż][^<>{}\n]*</);
    }
  });

  it('§32 — Also-includes names, never a quantity', () => {
    const html = render({
      official: [{ ...match(official.recipeId, 'official'), alsoIncludes: ['Karmel', 'Wanilia'] }],
    });
    expect(html).toContain('Karmel, Wanilia');
    expect(html).not.toMatch(/\d+\s*g\b/);
  });
});

describe('a REFUSED choice must not look like success', () => {
  it('keeps the layer with the refusal and the way forward', () => {
    const html = render(
      { community: match('c1', 'community') },
      { message: 'Nie udało się otworzyć tej receptury.' },
    );
    expect(html).toContain('home-suggestions-message');
    expect(html).toContain('Nie udało się otworzyć tej receptury.');
    expect(html).toContain('home-suggestions-create-own');
  });
});

describe('one dimmed overlay at a time', () => {
  it('stops painting its own scrim when another shell is on top (the sign-in modal)', () => {
    const css = readFileSync(join(process.cwd(), 'src/components/ui/homeLayer.css'), 'utf8');
    expect(css).toMatch(
      /\.home-layer-scrim\[data-dialog-active='false'\]\s*\{\s*background:\s*transparent;/,
    );
  });
});
