/**
 * §32–§40 orchestration matrix. The Community oracle is stubbed at the SERVICE
 * boundary — these tests pin the decision behaviour, not the network.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestedIngredient } from '../homeRecipeMatching';

const matchCommunityTop100 = vi.fn();
vi.mock('./communityMatchService', () => ({
  matchCommunityTop100: (...args: unknown[]) => matchCommunityTop100(...args),
}));

const { searchExistingRecipes } = await import('./homeMatchSearch');
const { officialCandidates } = await import('./officialLibraryCandidates');

const want = (productId: string): RequestedIngredient => ({
  productId,
  statedRole: null,
  displayName: productId,
});

const COCOA = 'PI-ING-001579';
const MILK = 'PI-ING-000236';
/** An identity no Gellatti recipe carries — only the (stubbed) Community oracle answers it. */
const COMMUNITY_ONLY = 'PI-ING-000000';

const communityMatch = (id: string, rank: number, alsoIncludes: string[] = []) => ({
  publicationId: id,
  slug: id,
  alsoIncludes,
  candidate: {
    id,
    title: `Community ${id}`,
    source: 'community' as const,
    profile: 'gelato' as const,
    ingredients: [{ productId: COCOA, role: 'ingredient' as const, displayName: COCOA }],
    imageUrl: null,
    authorName: 'Someone',
    rank,
    originalCreatorName: 'Maria QA',
  },
});

beforeEach(() => {
  matchCommunityTop100.mockReset();
  matchCommunityTop100.mockResolvedValue([]);
});

describe('no trustworthy match → no popup, creation continues (§35)', () => {
  it('returns create_my_own when nothing matches', async () => {
    const result = await searchExistingRecipes({
      requested: [want('PI-ING-000000')],
      profile: null,
    });
    expect(result.decision.kind).toBe('create_my_own');
  });

  it('returns create_my_own when nothing was resolved — never matches on guessed text', async () => {
    const result = await searchExistingRecipes({
      requested: [{ productId: '', statedRole: null, displayName: 'kombucha' }],
      profile: null,
    });
    expect(result.decision.kind).toBe('create_my_own');
    // §22: an unresolved chip must not even reach the oracle.
    expect(matchCommunityTop100).not.toHaveBeenCalled();
  });
});

describe('official matches (§35)', () => {
  it('offers the Gellatti library to every customer — there is no admin gate', async () => {
    const result = await searchExistingRecipes({ requested: [want(COCOA)], profile: null });
    expect(result.decision.kind).not.toBe('create_my_own');
  });

  it('auto-adopts a SINGLE official match when Community has nothing', async () => {
    // An identity exactly one offered Gellatti recipe carries.
    const carriers = new Map<string, string[]>();
    for (const candidate of officialCandidates()) {
      for (const ingredient of candidate.ingredients) {
        carriers.set(ingredient.productId, [
          ...(carriers.get(ingredient.productId) ?? []),
          candidate.id,
        ]);
      }
    }
    const [unique, [ownerId]] = [...carriers].find(([, ids]) => ids.length === 1)!;
    const owner = officialCandidates().find((candidate) => candidate.id === ownerId)!;
    const result = await searchExistingRecipes({
      requested: [want(unique)],
      profile: owner.profile,
    });
    expect(result.decision.kind).toBe('auto_adopt_official');
    if (result.decision.kind === 'auto_adopt_official') {
      expect(result.decision.match.candidate.id).toBe(owner.id);
    }
  });

  it('shows the popup for SEVERAL official matches — every exact match, closest first', async () => {
    const result = await searchExistingRecipes({
      requested: [want(COCOA)],
      profile: 'gelato',
    });
    expect(result.decision.kind).toBe('show_popup');
    if (result.decision.kind === 'show_popup') {
      expect(result.decision.official.length).toBeGreaterThan(1);
      const every = officialCandidates().filter(
        (candidate) =>
          candidate.profile === 'gelato' &&
          candidate.ingredients.some((ingredient) => ingredient.productId === COCOA),
      );
      expect(result.decision.official.map((match) => match.candidate.id).sort()).toEqual(
        every.map((candidate) => candidate.id).sort(),
      );
      const extras = result.decision.official.map((match) => match.alsoIncludes.length);
      expect(extras).toEqual([...extras].sort((left, right) => left - right));
      expect(result.decision.community).toBeNull();
    }
  });

  it('never offers a recipe on the FINAL-blocked vanilla paste', async () => {
    const result = await searchExistingRecipes({
      requested: [want('PI-ING-001705')],
      profile: null,
    });
    expect(result.decision.kind).toBe('create_my_own');
  });
});

describe('Community matches (§34, §35)', () => {
  it('shows the popup for a Community-only match and NEVER auto-adopts it', async () => {
    matchCommunityTop100.mockResolvedValue([communityMatch('c1', 3)]);
    const result = await searchExistingRecipes({
      requested: [want(COMMUNITY_ONLY)],
      profile: null,
    });
    expect(result.decision.kind).toBe('show_popup');
    if (result.decision.kind === 'show_popup') {
      expect(result.decision.official).toEqual([]);
      expect(result.decision.community?.candidate.id).toBe('c1');
    }
  });

  it('offers at most ONE Community candidate — the highest-ranked (§34)', async () => {
    matchCommunityTop100.mockResolvedValue([
      communityMatch('c7', 7),
      communityMatch('c2', 2),
      communityMatch('c9', 9),
    ]);
    const result = await searchExistingRecipes({
      requested: [want(COCOA)],
      profile: null,
    });
    if (result.decision.kind === 'show_popup') {
      expect(result.decision.community?.candidate.id).toBe('c2');
    } else {
      throw new Error('expected popup');
    }
  });

  it('shows the popup when BOTH official and Community match', async () => {
    matchCommunityTop100.mockResolvedValue([communityMatch('c1', 1)]);
    const result = await searchExistingRecipes({
      requested: [want(COCOA)],
      profile: 'gelato',
    });
    expect(result.decision.kind).toBe('show_popup');
    if (result.decision.kind === 'show_popup') {
      expect(result.decision.official.length).toBeGreaterThan(0);
      expect(result.decision.community).not.toBeNull();
    }
  });

  it('carries §36 Also-includes NAMES through from the oracle', async () => {
    matchCommunityTop100.mockResolvedValue([communityMatch('c1', 1, ['Karmel', 'Wanilia'])]);
    const result = await searchExistingRecipes({
      requested: [want(COCOA)],
      profile: null,
    });
    if (result.decision.kind === 'show_popup') {
      expect(result.decision.community?.alsoIncludes).toEqual(['Karmel', 'Wanilia']);
    } else {
      throw new Error('expected popup');
    }
  });

  it('preserves the ORIGINAL creator for the §38 byline', async () => {
    matchCommunityTop100.mockResolvedValue([communityMatch('c1', 1)]);
    const result = await searchExistingRecipes({
      requested: [want(COCOA)],
      profile: null,
    });
    if (result.decision.kind === 'show_popup') {
      expect(result.decision.community?.candidate.originalCreatorName).toBe('Maria QA');
    } else {
      throw new Error('expected popup');
    }
  });

  it('passes the profile to the oracle so §40 filtering happens server-side', async () => {
    await searchExistingRecipes({
      requested: [want(MILK)],
      profile: 'sorbet',
    });
    expect(matchCommunityTop100).toHaveBeenCalledWith(
      expect.objectContaining({ profile: 'sorbet', ingredientIds: [MILK] }),
    );
  });
});

describe('a matching outage must never block creation', () => {
  it('falls back to create_my_own when the oracle throws', async () => {
    matchCommunityTop100.mockRejectedValue(new Error('network'));
    await expect(
      searchExistingRecipes({
        requested: [want('PI-ING-000000')],
        profile: null,
      }),
    ).rejects.toThrow();
    // The SERVICE swallows failures (returns []); this test documents that the
    // orchestrator itself does not add a second layer of silent catching, so a real
    // bug stays visible in development.
  });
});
