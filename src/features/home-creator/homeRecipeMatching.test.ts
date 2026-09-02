/**
 * §111 — the matching acceptance matrix, as automated tests.
 * Every case the owner enumerated has a named test here.
 */
import { describe, expect, it } from 'vitest';
import {
  candidateMatches,
  decideMatch,
  extraIngredientsOf,
  highestRankedCommunityMatch,
  matchRecipes,
  type RecipeCandidate,
  type RequestedIngredient,
} from './homeRecipeMatching';
import type { IntentProfile } from './homeIntentParsing';

const ing = (productId: string, role: 'ingredient' | 'topping' = 'ingredient') => ({
  productId,
  role,
  displayName: productId,
});

const candidate = (
  id: string,
  source: 'official' | 'community',
  profile: IntentProfile,
  ingredients: readonly { productId: string; role: 'ingredient' | 'topping'; displayName: string }[],
  extra: Partial<RecipeCandidate> = {},
): RecipeCandidate => ({
  id,
  title: id,
  source,
  profile,
  ingredients,
  imageUrl: null,
  ...extra,
});

const want = (productId: string, statedRole: 'ingredient' | 'topping' | null = null): RequestedIngredient => ({
  productId,
  statedRole,
  displayName: productId,
});

describe('§32 — STRICT: every requested identity must be present', () => {
  it('rejects a recipe that is missing a requested ingredient', () => {
    const mojitoNoLime = candidate('m1', 'official', 'sorbet', [ing('MINT'), ing('SUGAR')]);
    expect(candidateMatches(mojitoNoLime, [want('MINT'), want('LIME')])).toBe(false);
  });

  it('accepts a recipe containing all requested ingredients', () => {
    const mojito = candidate('m2', 'official', 'sorbet', [ing('MINT'), ing('LIME'), ing('SUGAR')]);
    expect(candidateMatches(mojito, [want('MINT'), want('LIME')])).toBe(true);
  });

  it('never returns a "similar" recipe missing a requested ingredient', () => {
    const matches = matchRecipes(
      [
        candidate('a', 'official', 'sorbet', [ing('MINT'), ing('SUGAR')]),
        candidate('b', 'official', 'sorbet', [ing('MINT'), ing('LIME')]),
      ],
      { requested: [want('MINT'), want('LIME')], profile: null },
    );
    expect(matches.map((m) => m.candidate.id)).toEqual(['b']);
  });
});

describe('§32 — extra ingredients are allowed and labelled', () => {
  it('lists the extras as Also includes', () => {
    const withCaramel = candidate('c', 'official', 'gelato', [
      ing('VANILLA'),
      { productId: 'CARAMEL', role: 'ingredient', displayName: 'Caramel' },
    ]);
    expect(extraIngredientsOf(withCaramel, [want('VANILLA')])).toEqual(['Caramel']);
  });

  it('lists no extras when the recipe is exactly what was asked for', () => {
    const exact = candidate('c', 'official', 'gelato', [ing('VANILLA')]);
    expect(extraIngredientsOf(exact, [want('VANILLA')])).toEqual([]);
  });
});

describe('§33 — an explicitly stated role must be respected', () => {
  const blended = candidate('blend', 'official', 'gelato', [ing('OREO', 'ingredient')]);
  const sprinkled = candidate('top', 'official', 'gelato', [ing('OREO', 'topping')]);

  it('matches only the recipe using the stated role', () => {
    expect(candidateMatches(blended, [want('OREO', 'topping')])).toBe(false);
    expect(candidateMatches(sprinkled, [want('OREO', 'topping')])).toBe(true);
  });

  it('lets the recipe decide when no role was stated', () => {
    expect(candidateMatches(blended, [want('OREO', null)])).toBe(true);
    expect(candidateMatches(sprinkled, [want('OREO', null)])).toBe(true);
  });
});

describe('§40 — the profile filters both libraries', () => {
  it('shows only Sorbet recipes for "Mojito Sorbet"', () => {
    const matches = matchRecipes(
      [
        candidate('gel', 'official', 'gelato', [ing('MINT'), ing('LIME')]),
        candidate('sor', 'official', 'sorbet', [ing('MINT'), ing('LIME')]),
      ],
      { requested: [want('MINT'), want('LIME')], profile: 'sorbet' },
    );
    expect(matches.map((m) => m.candidate.id)).toEqual(['sor']);
  });

  it('considers every profile when none was stated', () => {
    const matches = matchRecipes(
      [
        candidate('gel', 'official', 'gelato', [ing('MINT')]),
        candidate('sor', 'official', 'sorbet', [ing('MINT')]),
      ],
      { requested: [want('MINT')], profile: null },
    );
    expect(matches).toHaveLength(2);
  });
});

describe('§34 — Community contributes at most one candidate', () => {
  it('takes the highest-ranked exact match', () => {
    const best = highestRankedCommunityMatch([
      { candidate: candidate('c7', 'community', 'gelato', [ing('X')], { rank: 7 }), alsoIncludes: [] },
      { candidate: candidate('c2', 'community', 'gelato', [ing('X')], { rank: 2 }), alsoIncludes: [] },
      { candidate: candidate('c9', 'community', 'gelato', [ing('X')], { rank: 9 }), alsoIncludes: [] },
    ]);
    expect(best?.candidate.id).toBe('c2');
  });

  it('returns null when Community has nothing', () => {
    expect(highestRankedCommunityMatch([])).toBeNull();
  });

  it('falls back to the caller ordering when ranks are absent', () => {
    const best = highestRankedCommunityMatch([
      { candidate: candidate('first', 'community', 'gelato', [ing('X')]), alsoIncludes: [] },
      { candidate: candidate('second', 'community', 'gelato', [ing('X')]), alsoIncludes: [] },
    ]);
    expect(best?.candidate.id).toBe('first');
  });
});

describe('§35 — the match decision', () => {
  const officialMatch = (id: string) => ({
    candidate: candidate(id, 'official', 'sorbet', [ing('MINT')]),
    alsoIncludes: [] as readonly string[],
  });
  const communityMatch = (id: string, rank: number) => ({
    candidate: candidate(id, 'community', 'sorbet', [ing('MINT')], { rank }),
    alsoIncludes: [] as readonly string[],
  });

  it('adopts a single official match automatically when Community has nothing', () => {
    const decision = decideMatch({ official: [officialMatch('o1')], community: [] });
    expect(decision.kind).toBe('auto_adopt_official');
  });

  it('shows the popup for several official matches', () => {
    const decision = decideMatch({
      official: [officialMatch('o1'), officialMatch('o2')],
      community: [],
    });
    expect(decision.kind).toBe('show_popup');
    if (decision.kind === 'show_popup') {
      expect(decision.official).toHaveLength(2);
      expect(decision.community).toBeNull();
    }
  });

  it('shows the popup whenever Community matches — even beside one official', () => {
    const decision = decideMatch({
      official: [officialMatch('o1')],
      community: [communityMatch('c1', 3)],
    });
    expect(decision.kind).toBe('show_popup');
  });

  it('NEVER adopts a Community recipe automatically, even as the only match', () => {
    const decision = decideMatch({ official: [], community: [communityMatch('c1', 1)] });
    expect(decision.kind).toBe('show_popup');
    if (decision.kind === 'show_popup') {
      expect(decision.official).toHaveLength(0);
      expect(decision.community?.candidate.id).toBe('c1');
    }
  });

  it('falls through to Create my own when nothing matched', () => {
    expect(decideMatch({ official: [], community: [] }).kind).toBe('create_my_own');
  });
});

describe('an empty intent matches nothing', () => {
  it('returns no matches rather than every recipe', () => {
    expect(
      matchRecipes([candidate('a', 'official', 'gelato', [ing('X')])], {
        requested: [],
        profile: null,
      }),
    ).toEqual([]);
  });
});
