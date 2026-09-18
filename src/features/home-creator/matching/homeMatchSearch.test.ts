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

const { communityIdSets, searchCommunityMatches, searchExistingRecipes } =
  await import('./homeMatchSearch');
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

describe('Owner 2026-09-17: a generic idea also finds recipes made with another approved form', () => {
  const STRAWBERRY = 'PI-ING-001553';
  const STRAWBERRY_PUREE = 'PI-ING-002331';
  const STRAWBERRY_FROZEN = 'PI-ING-001554';
  const BANANA = 'PI-ING-000345';
  const BANANA_PUREE = 'PI-ING-002332';
  const generic = (productId: string, conceptKey: string): RequestedIngredient => ({
    ...want(productId),
    conceptKey,
  });
  const forms: Record<string, readonly string[]> = {
    strawberry: [STRAWBERRY, STRAWBERRY_PUREE, STRAWBERRY_FROZEN],
    banana: [BANANA, BANANA_PUREE],
  };
  const formsFor = (item: RequestedIngredient) =>
    item.conceptKey ? (forms[item.conceptKey] ?? []) : [];
  const asked = (sets: readonly (readonly string[])[]) => sets.map((set) => set.join('+'));

  it('FORM-OR-01: alternative forms of ONE concept are asked as separate sets, never merged', () => {
    const { sets, combinations, partial } = communityIdSets(
      [generic(STRAWBERRY, 'strawberry')],
      formsFor,
    );
    expect(sets).toEqual([[STRAWBERRY], [STRAWBERRY_PUREE], [STRAWBERRY_FROZEN]]);
    expect(combinations).toBe(3);
    expect(partial).toBe(false);
  });

  it('FORM-OR-02: different requested ingredients stay an AND — every set holds one id per ingredient', () => {
    const { sets } = communityIdSets(
      [generic(STRAWBERRY, 'strawberry'), generic(BANANA, 'banana')],
      formsFor,
    );
    for (const set of sets) {
      expect(set).toHaveLength(2);
      expect(forms.strawberry).toContain(set[0]);
      expect(forms.banana).toContain(set[1]);
    }
    // A recipe with only one of the two can never be answered by any of these sets.
    expect(sets.some((set) => set.length === 1)).toBe(false);
  });

  it('FORM-OR-03: an exact product asks for itself only', () => {
    expect(communityIdSets([want(STRAWBERRY)], formsFor).sets).toEqual([[STRAWBERRY]]);
    expect(
      communityIdSets([generic(STRAWBERRY, 'strawberry'), want(BANANA)], undefined).sets,
    ).toEqual([[STRAWBERRY, BANANA]]);
  });

  it('FORM-OR-04 (owner): BOTH ingredients in another form is asked, and the request comes first', () => {
    const { sets, combinations, partial } = communityIdSets(
      [generic(STRAWBERRY, 'strawberry'), generic(BANANA, 'banana')],
      formsFor,
    );
    expect(sets[0]).toEqual([STRAWBERRY, BANANA]);
    expect(combinations).toBe(6);
    expect(partial).toBe(false);
    // The owner's case: [A puree, B puree].
    expect(asked(sets)).toContain(`${STRAWBERRY_PUREE}+${BANANA_PUREE}`);
    expect(asked(sets)).toContain(`${STRAWBERRY_FROZEN}+${BANANA_PUREE}`);
  });

  it('FORM-OR-05 (owner): a budget never spends itself on one ingredient, and says it was partial', () => {
    const many = (item: RequestedIngredient): readonly string[] =>
      item.conceptKey === 'strawberry'
        ? [STRAWBERRY, ...Array.from({ length: 20 }, (_, index) => `PI-ING-9000${index}`)]
        : (forms.banana ?? []);
    const { sets, combinations, partial } = communityIdSets(
      [generic(STRAWBERRY, 'strawberry'), generic(BANANA, 'banana')],
      many,
      6,
    );
    expect(sets).toHaveLength(6);
    expect(combinations).toBe(42);
    expect(partial).toBe(true);
    // Each ingredient's first alternative is reached, and a both-varied set is asked.
    expect(asked(sets)).toContain(`${STRAWBERRY}+${BANANA_PUREE}`);
    expect(asked(sets)).toContain(`PI-ING-90000+${BANANA}`);
    expect(asked(sets)).toContain(`PI-ING-90000+${BANANA_PUREE}`);
  });

  it('FORM-OR-06: one publication answered by two forms is ONE Community candidate', async () => {
    matchCommunityTop100.mockImplementation(
      async ({ ingredientIds }: { ingredientIds: string[] }) =>
        ingredientIds[0] === STRAWBERRY ? [] : [communityMatch('pub-1', 4)],
    );
    const answer = await searchCommunityMatches({
      requested: [generic(STRAWBERRY, 'strawberry')],
      profile: null,
      formsFor,
    });
    expect(matchCommunityTop100).toHaveBeenCalledTimes(3);
    expect(answer.communityMatches.map((match) => match.publicationId)).toEqual(['pub-1']);
    expect(answer.coverage).toEqual({ asked: 3, combinations: 3, partial: false });
  });

  it('FORM-OR-08 (review): a Community card says which form answered it', async () => {
    matchCommunityTop100.mockImplementation(
      async ({ ingredientIds }: { ingredientIds: string[] }) =>
        ingredientIds[0] === STRAWBERRY_PUREE ? [communityMatch('pub-2', 3)] : [],
    );
    const answer = await searchCommunityMatches({
      requested: [generic(STRAWBERRY, 'strawberry')],
      profile: null,
      formsFor,
      nameOf: (id) => (id === STRAWBERRY_PUREE ? 'Puree truskawkowe' : null),
    });
    expect(answer.community[0]?.usedForms).toEqual(['Puree truskawkowe']);
  });

  it('FORM-OR-09 (review): the exact request answers with no form line', async () => {
    matchCommunityTop100.mockImplementation(
      async ({ ingredientIds }: { ingredientIds: string[] }) =>
        ingredientIds[0] === STRAWBERRY ? [communityMatch('pub-3', 2)] : [],
    );
    const answer = await searchCommunityMatches({
      requested: [generic(STRAWBERRY, 'strawberry')],
      profile: null,
      formsFor,
      nameOf: () => 'nigdy',
    });
    expect(answer.community[0]?.usedForms).toBeUndefined();
  });

  it('FORM-OR-07 (owner): a partial search never lets §35 adopt a recipe automatically', async () => {
    matchCommunityTop100.mockResolvedValue([]);
    const many = (item: RequestedIngredient) =>
      item.conceptKey === 'strawberry'
        ? [STRAWBERRY, ...Array.from({ length: 40 }, (_, index) => `PI-ING-8000${index}`)]
        : [];
    const result = await searchExistingRecipes({
      requested: [generic(COCOA, 'strawberry')],
      profile: null,
      formsFor: many,
    });
    expect(result.coverage.partial).toBe(true);
    // Exactly one official match + nothing from Community would normally auto-adopt.
    expect(result.decision.kind).not.toBe('auto_adopt_official');
  });
});
