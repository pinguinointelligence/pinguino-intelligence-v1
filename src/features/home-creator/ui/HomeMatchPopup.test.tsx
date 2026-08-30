/**
 * §36 popup — user control and CUSTOMER LANGUAGE.
 *
 * The language test is a source scan on purpose: the failure it guards against is a
 * developer surfacing a match_tier / canonical id / confidence value "just for now",
 * which reads as a bug to a customer and is exactly what the owner forbade.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { homeCreatorCopy } from '../homeCreatorCopy';
import type { RecipeMatch } from '../homeRecipeMatching';
import { HomeMatchPopup } from './HomeMatchPopup';

const SOURCE = readFileSync(
  join(process.cwd(), 'src/features/home-creator/ui/HomeMatchPopup.tsx'),
  'utf8',
);

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

const render = (props: Partial<Parameters<typeof HomeMatchPopup>[0]> = {}) =>
  renderToStaticMarkup(
    <HomeMatchPopup
      official={[]}
      community={null}
      onChooseOfficial={vi.fn()}
      onChooseCommunity={vi.fn()}
      onCreateMyOwn={vi.fn()}
      {...props}
    />,
  );

describe('user control — a match is an option, never a replacement', () => {
  it('always offers "continue creating my own"', () => {
    const html = render({ official: [match('o1', 'official')] });
    expect(html).toContain('home-match-create-my-own');
    expect(html).toContain(homeCreatorCopy.match.continueCreating);
  });

  it('offers a backdrop that also resolves to creating', () => {
    expect(render()).toContain('home-match-backdrop');
    // Both the backdrop and Escape call the SAME handler as the primary button.
    expect(SOURCE).toMatch(/onClick=\{onCreateMyOwn\}[\s\S]{0,200}home-match-backdrop/);
    expect(SOURCE).toMatch(/if \(event\.key === 'Escape'\) onCreateMyOwn\(\)/);
  });

  it('selects nothing on its own — every choice is an explicit click', () => {
    // No effect may call a choose handler.
    expect(SOURCE).not.toMatch(/useEffect\([\s\S]{0,400}onChoose(Official|Community)\(/);
  });
});

describe('§34 — at most one Community result', () => {
  it('takes a single community match, not an array', () => {
    expect(SOURCE).toMatch(/community: RecipeMatch \| null/);
  });

  it('renders the Community section only when there is one', () => {
    expect(render()).not.toContain('home-match-community');
    expect(render({ community: match('c1', 'community') })).toContain('home-match-community');
  });
});

describe('§38 — the original creator is shown, never the intermediate remixer', () => {
  it('renders the based-on byline from originalCreatorName', () => {
    const html = render({
      community: match('c1', 'community', { originalCreatorName: 'Maria QA' }),
    });
    expect(html).toContain('home-match-based-on');
    expect(html).toContain('Maria QA');
  });
});

describe('CUSTOMER LANGUAGE — no internal matcher vocabulary reaches the screen', () => {
  it('renders no technical matching terms', () => {
    const html = render({
      official: [match('o1', 'official')],
      community: match('c1', 'community', { authorName: 'Anna', rank: 3 }),
    });
    for (const term of [
      'match_tier',
      'matchTier',
      'all_requested_present',
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

  it('takes every visible string from the copy authority, not inline literals', () => {
    // Any user-visible Polish sentence hardcoded here would bypass PL/EN parity.
    expect(SOURCE).not.toMatch(/>[^<>{}\n]*[ąćęłńóśźż][^<>{}\n]*</);
  });

  it('shows the Community position in words from the copy authority', () => {
    const html = render({ community: match('c1', 'community', { authorName: 'Anna', rank: 3 }) });
    expect(html).toContain(homeCreatorCopy.match.rank);
    expect(html).toContain('Anna');
  });
});

describe('§32 — extras are names, never quantities', () => {
  it('renders Also-includes names with no gram unit', () => {
    const html = renderToStaticMarkup(
      <HomeMatchPopup
        official={[{ ...match('o1', 'official'), alsoIncludes: ['Karmel', 'Wanilia'] }]}
        community={null}
        onChooseOfficial={vi.fn()}
        onChooseCommunity={vi.fn()}
        onCreateMyOwn={vi.fn()}
      />,
    );
    expect(html).toContain('Karmel, Wanilia');
    expect(html).not.toMatch(/\d+\s*g\b/);
  });
});
