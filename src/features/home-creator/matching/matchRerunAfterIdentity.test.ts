/**
 * REGRESSION — matching must re-run after a §23 identity answer.
 *
 * Found in served QA on staging, 2026-08-31, and invisible to every unit test that
 * existed: they all fed `searchExistingRecipes` identities that were ALREADY resolved.
 *
 * The real sequence is different. Matching may only use resolved identities (§22), so:
 *
 *   1. user types "cream gelato" and presses `Create my recipe`
 *   2. "cream" is genuinely ambiguous — staging offers six real creams — so at submit
 *      time there are ZERO resolved identities and matching correctly finds nothing
 *   3. the user answers "which cream?" (§23)
 *   4. …and nothing happened. Matching never ran again.
 *
 * Because "which one did you mean?" is the COMMON case rather than the exception, the
 * popup would almost never appear in practice. This test pins the ordering contract:
 * an intent that is only completed by the identity answer must still be matched.
 */
import { describe, expect, it, vi } from 'vitest';
import type { RequestedIngredient } from '../homeRecipeMatching';

const matchCommunityTop100 = vi.fn();
vi.mock('./communityMatchService', () => ({
  matchCommunityTop100: (...args: unknown[]) => matchCommunityTop100(...args),
}));

const { searchExistingRecipes } = await import('./homeMatchSearch');

const COCOA = 'PI-ING-001579';

/** A chip exactly as the draft store holds it, before and after the §23 answer. */
const chip = (patch: Partial<{ productId: string | null; ambiguous: boolean }>) => ({
  productId: null as string | null,
  ambiguous: false,
  role: null,
  label: 'cream',
  productName: null as string | null,
  ...patch,
});

/** The page's own selection rule, kept in step with HomeCreatorPage.runMatching. */
const requestedFrom = (chips: ReturnType<typeof chip>[]): RequestedIngredient[] =>
  chips
    .filter((c) => c.productId !== null && !c.ambiguous)
    .map((c) => ({
      productId: c.productId as string,
      statedRole: c.role,
      displayName: c.productName ?? c.label,
    }));

describe('an ambiguous chip contributes nothing until it is answered', () => {
  it('yields no requested identity while ambiguous', () => {
    expect(requestedFrom([chip({ ambiguous: true })])).toEqual([]);
  });

  it('yields the identity once answered', () => {
    expect(requestedFrom([chip({ productId: COCOA })])).toHaveLength(1);
  });
});

describe('the two runs produce different verdicts — which is why the re-run exists', () => {
  it('matches nothing at submit time, then matches after the answer', async () => {
    matchCommunityTop100.mockResolvedValue([]);

    // Run 1 — at `Create my recipe`, the chip is still ambiguous.
    const first = await searchExistingRecipes({
      requested: requestedFrom([chip({ ambiguous: true })]),
      profile: 'gelato',
      canOpenOwnerReview: false,
    });
    expect(first.decision.kind).toBe('create_my_own');
    // §22: an unresolved identity must not even reach the oracle.
    expect(matchCommunityTop100).not.toHaveBeenCalled();

    // Run 2 — after the §23 answer the identity is real, so the oracle is consulted.
    matchCommunityTop100.mockResolvedValue([
      {
        publicationId: 'pub-1',
        slug: 'pub-1',
        handle: 'anna',
        title: 'QA Gelato',
        creatorDisplayName: 'Anna QA',
        alsoIncludes: ['Mleko'],
        candidate: {
          id: 'pub-1',
          title: 'QA Gelato',
          source: 'community' as const,
          profile: 'gelato' as const,
          ingredients: [{ productId: COCOA, role: 'ingredient' as const, displayName: COCOA }],
          imageUrl: null,
          authorName: 'Anna QA',
          rank: 4,
          originalCreatorName: null,
        },
      },
    ]);

    const second = await searchExistingRecipes({
      requested: requestedFrom([chip({ productId: COCOA })]),
      profile: 'gelato',
      canOpenOwnerReview: false,
    });
    expect(second.decision.kind).toBe('show_popup');
    expect(matchCommunityTop100).toHaveBeenCalledTimes(1);
  });
});

describe('the page wires the re-run', () => {
  it('calls runMatching from the identity answer, not only from the CTA', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync('src/pages/home/HomeCreatorPage.tsx', 'utf8'),
    );
    const handler = source.slice(
      source.indexOf('onChooseIdentity'),
      source.indexOf('onScan={'),
    );
    expect(handler).toContain('runMatching()');
    // A stale dismissal must not suppress the newly-earned popup.
    expect(handler).toContain('setMatchDismissed(false)');
  });
});
