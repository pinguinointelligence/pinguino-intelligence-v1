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

describe('a REFUSED derivation must not look like success', () => {
  it('renders the refusal in customer language and keeps the user on the popup', () => {
    const html = renderToStaticMarkup(
      <HomeMatchPopup
        official={[]}
        community={match('c1', 'community')}
        onChooseOfficial={vi.fn()}
        onChooseCommunity={vi.fn()}
        onCreateMyOwn={vi.fn()}
        derivationMessage="Nie udało się otworzyć tej receptury."
      />,
    );
    expect(html).toContain('home-match-derivation-error');
    expect(html).toContain('Nie udało się otworzyć tej receptury.');
    // Still offers the way forward rather than trapping.
    expect(html).toContain('home-match-create-my-own');
  });

  it('shows nothing when there is no refusal', () => {
    expect(render({ community: match('c1', 'community') })).not.toContain(
      'home-match-derivation-error',
    );
  });

  it('closes ONLY on a completed derivation — the gate checks the typed status', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync('src/features/home-creator/matching/HomeMatchGate.tsx', 'utf8'),
    );
    // Served QA found `onDerived` being called unconditionally, which closed the
    // popup and marked the recipe ready with ZERO lines after a refusal.
    //
    // This originally asserted `derivation.state.status === 'done'`. That pinned the
    // right RULE with the wrong MECHANISM: `state` is React state from the handler's
    // own render, so it reads `idle` even for a derivation that succeeded. The rule is
    // unchanged — only a completed derivation may close the popup — but the status now
    // comes from the awaited return value.
    expect(source).toContain("outcome.status === 'done'");
    expect(source).not.toMatch(/\.then\(onDerived\)/);
  });
});

describe('a SUCCESSFUL derivation must actually open the recipe', () => {
  const gate = () =>
    import('node:fs').then((fs) =>
      fs.readFileSync('src/features/home-creator/matching/HomeMatchGate.tsx', 'utf8'),
    );

  it('reads the derived recipe through the canonical repository and loads the shared store', async () => {
    // Served QA 2026-08-31: the derivation succeeded server-side (recipe + lineage
    // written) but the hook opens by navigating to /pro/recipe, which §13 bounces for
    // a HOME subscriber — leaving the customer on an empty intent screen holding a
    // recipe they could not see.
    const source = await gate();
    expect(source).toContain('repository.getRecipe');
    expect(source).toContain('repository.getVersions');
    expect(source).toContain('loadRecipeInput');
  });

  it('opens through the hook, so the hook never navigates HOME to the PRO editor', async () => {
    const source = await gate();
    expect(source).toContain('openDerived: openDerivedRecipe');
  });

  it('never branches on `state` after awaiting the derivation', async () => {
    // `state` is React state from the handler's own render, so reading it back after
    // the await reports `idle` for a derivation that actually succeeded. The outcome
    // must come from the RETURN value.
    const source = await gate();
    expect(source).toContain("outcome.status === 'done'");
    expect(source).not.toMatch(/derivation\.state\.status === 'done'/);
  });

  it('picks the latest version by number, not by array position', async () => {
    const source = await gate();
    expect(source).toContain('v.versionNumber > best.versionNumber');
    expect(source).not.toContain('versions.at(-1)');
  });

  it('adds no HOME-specific derive or copy logic — it only READS the result', async () => {
    const source = await gate();
    for (const forbidden of [
      'createRecipe(',
      'recordDerivation(',
      'saveNewVersion(',
      'buildDerivedRecipe(',
    ]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
    expect(source).toContain('useRecipeDerivation');
  });
});
