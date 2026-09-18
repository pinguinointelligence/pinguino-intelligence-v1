/**
 * Owner 2026-09-18 — mapping the v2 oracle's answer into Community candidates. The IO
 * service is mocked at its boundary; these tests pin what `matched_ids` becomes and
 * which answers may never be shown.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const matchCommunityTop100GroupRows = vi.fn();
vi.mock('@/services/communityMatch', () => ({
  matchCommunityTop100GroupRows: (...args: unknown[]) => matchCommunityTop100GroupRows(...args),
  matchCommunityTop100Rows: async () => [],
}));

const { matchCommunityTop100Groups } = await import('./communityMatchService');

const STRAWBERRY = 'PI-ING-001553';
const STRAWBERRY_PUREE = 'PI-ING-002331';
const STRAWBERRY_FROZEN = 'PI-ING-001554';
const BANANA = 'PI-ING-000345';
const BANANA_PUREE = 'PI-ING-002332';
const GROUPS = [
  [STRAWBERRY, STRAWBERRY_PUREE, STRAWBERRY_FROZEN],
  [BANANA, BANANA_PUREE],
];

const row = (id: string, matched_ids: string[]) => ({
  publication_id: id,
  slug: `s-${id}`,
  title: `Title ${id}`,
  description: null,
  image_url: null,
  category: 'Sorbet',
  rank: 2,
  all_requested_present: true,
  also_includes: ['Cukier'],
  matched_ids,
  creator: { handle: 'anna', display_name: 'Anna' },
  based_on: { creator_display_name: 'Maria' },
});

beforeEach(() => {
  matchCommunityTop100GroupRows.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('matchCommunityTop100Groups', () => {
  it('MAP-V2-01: asks with the groups and the profile category; maps matched_ids in request order', async () => {
    // The oracle sorts `matched_ids` by text; the client re-orders by the approved order.
    matchCommunityTop100GroupRows.mockResolvedValue({
      kind: 'ok',
      rejected: 0,
      rows: [row('p1', [BANANA, STRAWBERRY_FROZEN, STRAWBERRY_PUREE])],
    });
    const answer = await matchCommunityTop100Groups({ groups: GROUPS, profile: 'sorbet' });
    expect(matchCommunityTop100GroupRows).toHaveBeenCalledTimes(1);
    expect(matchCommunityTop100GroupRows).toHaveBeenCalledWith({
      groups: GROUPS,
      category: 'Sorbet',
      limit: undefined,
    });
    expect(answer.kind).toBe('ok');
    if (answer.kind !== 'ok') return;
    const [match] = answer.matches;
    expect(match?.matchedIds).toEqual([STRAWBERRY_PUREE, STRAWBERRY_FROZEN, BANANA]);
    // One proven identity per requested ingredient: the first approved form that answered.
    expect(match?.candidate.ingredients.map((line) => line.productId)).toEqual([
      STRAWBERRY_PUREE,
      BANANA,
    ]);
    expect(match).toMatchObject({
      publicationId: 'p1',
      handle: 'anna',
      alsoIncludes: ['Cukier'],
      candidate: { source: 'community', profile: 'sorbet', rank: 2, originalCreatorName: 'Maria' },
    });
  });

  it('MAP-V2-02: a card that leaves an ingredient unanswered is not a §32 match — dropped and counted', async () => {
    matchCommunityTop100GroupRows.mockResolvedValue({
      kind: 'ok',
      rejected: 1,
      rows: [row('only-strawberry', [STRAWBERRY_PUREE]), row('both', [STRAWBERRY, BANANA])],
    });
    const answer = await matchCommunityTop100Groups({ groups: GROUPS, profile: null });
    expect(answer).toMatchObject({ kind: 'ok', rejected: 2 });
    if (answer.kind === 'ok') {
      expect(answer.matches.map((match) => match.publicationId)).toEqual(['both']);
    }
  });

  it('MAP-V2-03: unavailable and error outcomes pass through — never an empty match list', async () => {
    matchCommunityTop100GroupRows.mockResolvedValue({
      kind: 'unavailable',
      reason: 'not_deployed',
    });
    await expect(matchCommunityTop100Groups({ groups: GROUPS, profile: null })).resolves.toEqual({
      kind: 'unavailable',
    });
    matchCommunityTop100GroupRows.mockResolvedValue({ kind: 'error', reason: 'timeout' });
    await expect(matchCommunityTop100Groups({ groups: GROUPS, profile: null })).resolves.toEqual({
      kind: 'error',
      reason: 'timeout',
    });
    for (const reason of ['failed', 'malformed', 'invalid_request']) {
      matchCommunityTop100GroupRows.mockResolvedValue({ kind: 'error', reason });
      await expect(matchCommunityTop100Groups({ groups: GROUPS, profile: null })).resolves.toEqual({
        kind: 'error',
        reason: 'failed',
      });
    }
  });
});
