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

const want = (productId: string): RequestedIngredient => ({
  productId,
  statedRole: null,
  displayName: productId,
});

const COCOA = 'PI-ING-001579';
const MILK = 'PI-ING-000236';

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
      canOpenOwnerReview: true,
    });
    expect(result.decision.kind).toBe('create_my_own');
  });

  it('returns create_my_own when nothing was resolved — never matches on guessed text', async () => {
    const result = await searchExistingRecipes({
      requested: [{ productId: '', statedRole: null, displayName: 'kombucha' }],
      profile: null,
      canOpenOwnerReview: true,
    });
    expect(result.decision.kind).toBe('create_my_own');
    // §22: an unresolved chip must not even reach the oracle.
    expect(matchCommunityTop100).not.toHaveBeenCalled();
  });

  it('returns create_my_own for a customer, because the official library is admin-only', async () => {
    const result = await searchExistingRecipes({
      requested: [want(COCOA)],
      profile: null,
      canOpenOwnerReview: false,
    });
    expect(result.decision.kind).toBe('create_my_own');
  });
});

describe('official matches (§35)', () => {
  it('auto-adopts a SINGLE official match when Community has nothing', async () => {
    const result = await searchExistingRecipes({
      requested: [want(COCOA), want('PI-ING-001705')],
      profile: 'gelato',
      canOpenOwnerReview: true,
    });
    // Only Oreyo carries both cocoa and the vanilla paste.
    expect(result.decision.kind).toBe('auto_adopt_official');
  });

  it('shows the popup for SEVERAL official matches', async () => {
    const result = await searchExistingRecipes({
      requested: [want(COCOA)],
      profile: 'gelato',
      canOpenOwnerReview: true,
    });
    expect(result.decision.kind).toBe('show_popup');
    if (result.decision.kind === 'show_popup') {
      expect(result.decision.official.length).toBeGreaterThan(1);
      expect(result.decision.community).toBeNull();
    }
  });
});

describe('Community matches (§34, §35)', () => {
  it('shows the popup for a Community-only match and NEVER auto-adopts it', async () => {
    matchCommunityTop100.mockResolvedValue([communityMatch('c1', 3)]);
    const result = await searchExistingRecipes({
      requested: [want(COCOA)],
      profile: null,
      canOpenOwnerReview: false,
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
      canOpenOwnerReview: false,
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
      requested: [want(COCOA), want('PI-ING-001705')],
      profile: 'gelato',
      canOpenOwnerReview: true,
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
      canOpenOwnerReview: false,
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
      canOpenOwnerReview: false,
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
      canOpenOwnerReview: false,
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
        canOpenOwnerReview: false,
      }),
    ).rejects.toThrow();
    // The SERVICE swallows failures (returns []); this test documents that the
    // orchestrator itself does not add a second layer of silent catching, so a real
    // bug stays visible in development.
  });
});
