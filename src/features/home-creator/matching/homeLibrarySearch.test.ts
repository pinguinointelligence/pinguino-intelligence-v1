/**
 * DESIGN V3.0 IX — the „Receptury” search is not a matcher of its own: a typed flavour takes
 * the idea chip's road through the central resolver door and the §32–§36 matching. These
 * cases pin that it never guesses (§22) and asks the authorities exactly what a chip would.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('./homeMatchSearch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./homeMatchSearch')>()),
  searchOfficialMatches: authorities.searchOfficialMatches,
  searchCommunityMatches: authorities.searchCommunityMatches,
  loadConceptMatchContext: authorities.loadConceptMatchContext,
}));

import {
  communityLibraryMatch,
  officialLibraryMatches,
  resolveLibraryQuery,
} from './homeLibrarySearch';

const resolved = (id: string, conceptKey?: string) => ({
  kind: 'resolved',
  row: { ingredient_id: id, ingredient_name_display: id },
  provenance: conceptKey
    ? { authority: 'SA03_CONCEPT_DEFAULT', conceptKey, scope: null }
    : { authority: 'LITERAL_CATALOGUE' },
});

beforeEach(() => {
  for (const authority of Object.values(authorities)) authority.mockReset();
});

describe('the words → canonical identities, through the central resolver door', () => {
  it('asks the resolver with the typed word and the profile the words state', async () => {
    authorities.resolveChipTerm.mockResolvedValue(resolved('PI-1'));
    const query = await resolveLibraryQuery('sorbet truskawkowy');
    expect(authorities.resolveChipTerm).toHaveBeenCalledWith(
      expect.objectContaining({ label: expect.stringMatching(/truskaw/) }),
      undefined,
      { profile: 'sorbet' },
    );
    expect(query).toMatchObject({
      kind: 'query',
      profile: 'sorbet',
      requested: [{ productId: 'PI-1', conceptKey: null }],
    });
  });

  it('never guesses: an ambiguous or unknown word finds nothing', async () => {
    authorities.resolveChipTerm.mockResolvedValue({ kind: 'ambiguous', candidates: [] });
    expect(await resolveLibraryQuery('czekolada')).toEqual({ kind: 'none' });
    authorities.resolveChipTerm.mockResolvedValue({ kind: 'unresolved' });
    expect(await resolveLibraryQuery('durian')).toEqual({ kind: 'none' });
  });

  it('says so when the catalogue could not answer at all', async () => {
    authorities.resolveChipTerm.mockResolvedValue({ kind: 'unavailable', reason: 'offline' });
    expect(await resolveLibraryQuery('truskawka')).toEqual({ kind: 'unavailable' });
  });

  it('loads the central concept authority only for a generic flavour', async () => {
    const context = { matcher: vi.fn(), formsOf: vi.fn(() => ['PI-2']), nameOf: vi.fn() };
    authorities.loadConceptMatchContext.mockResolvedValue(context);
    authorities.resolveChipTerm.mockResolvedValue(resolved('PI-1', 'strawberry'));
    const query = await resolveLibraryQuery('truskawka');
    expect(authorities.loadConceptMatchContext).toHaveBeenCalledTimes(1);
    expect(query).toMatchObject({ kind: 'query', context });
  });
});

describe('the identities → the §32–§36 matching the suggestions layer uses', () => {
  it('asks the official library with the concept membership', async () => {
    const context = { matcher: vi.fn(), formsOf: vi.fn(() => []), nameOf: vi.fn() };
    authorities.loadConceptMatchContext.mockResolvedValue(context);
    authorities.resolveChipTerm.mockResolvedValue(resolved('PI-1', 'strawberry'));
    authorities.searchOfficialMatches.mockReturnValue([]);
    const query = await resolveLibraryQuery('truskawka');
    if (query.kind !== 'query') throw new Error('expected a query');
    officialLibraryMatches(query);
    expect(authorities.searchOfficialMatches).toHaveBeenCalledWith({
      requested: query.requested,
      profile: null,
      conceptMatcher: context.matcher,
    });
  });

  it('offers only the ONE highest-ranked Community match, with its canonical address', async () => {
    authorities.resolveChipTerm.mockResolvedValue(resolved('PI-1'));
    const row = (id: string, rank: number) => ({
      candidate: {
        id,
        title: id,
        source: 'community',
        profile: 'gelato',
        ingredients: [],
        imageUrl: null,
        rank,
      },
      alsoIncludes: [],
    });
    authorities.searchCommunityMatches.mockResolvedValue({
      community: [row('pub-9', 9), row('pub-2', 2)],
      communityMatches: [
        {
          ...row('pub-9', 9),
          publicationId: 'pub-9',
          slug: 's9',
          handle: 'h',
          title: 't',
          creatorDisplayName: 'c',
        },
        {
          ...row('pub-2', 2),
          publicationId: 'pub-2',
          slug: 's2',
          handle: 'h',
          title: 't',
          creatorDisplayName: 'c',
        },
      ],
      coverage: { asked: 1, combinations: 1, partial: false },
    });
    const query = await resolveLibraryQuery('truskawka');
    if (query.kind !== 'query') throw new Error('expected a query');
    const answer = await communityLibraryMatch(query);
    expect(answer.match?.candidate.id).toBe('pub-2');
    expect(answer.target?.publicationId).toBe('pub-2');
    expect(answer.partial).toBe(false);
  });
});
