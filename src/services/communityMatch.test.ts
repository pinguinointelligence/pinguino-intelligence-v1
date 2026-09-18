/**
 * Owner 2026-09-18 — the v2 Community match oracle, at the IO boundary. The Supabase
 * client is mocked; the assertions are on what the client sends and on how every kind
 * of answer is classified: `ok`, `unavailable` (v2 not deployed) or `error` (unknown —
 * never „no match”).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type RpcAnswer = { data: unknown; error: { code?: string; message: string } | null };

const h = vi.hoisted(() => ({
  configured: true,
  calls: [] as Array<{ fn: string; args: Record<string, unknown>; signal: AbortSignal }>,
  answer: (): Promise<RpcAnswer> => Promise.resolve({ data: [], error: null }),
}));

vi.mock('@/lib/supabase/client', () => ({
  get supabase() {
    if (!h.configured) return null;
    return {
      rpc: (fn: string, args: Record<string, unknown>) => ({
        abortSignal: (signal: AbortSignal) => {
          h.calls.push({ fn, args, signal });
          return h.answer();
        },
      }),
    };
  },
}));

const {
  COMMUNITY_MATCH_V2_TIMEOUT_MS,
  communityGroupsWithinLimits,
  matchCommunityTop100GroupRows,
} = await import('./communityMatch');

const GROUPS = [
  ['PI-ING-001553', 'PI-ING-002331'],
  ['PI-ING-000345', 'PI-ING-002332'],
];

const card = (patch: Record<string, unknown> = {}) => ({
  publication_id: '00000000-0000-0000-0000-000000000001',
  slug: 'truskawka-banan',
  title: 'Truskawka z bananem',
  description: null,
  image_url: null,
  category: 'Sorbet',
  published_at: '2026-09-01T10:00:00Z',
  version_number: 1,
  rank: 3,
  all_requested_present: true,
  also_includes: ['Cukier'],
  matched_ids: ['PI-ING-002331', 'PI-ING-000345'],
  creator: { handle: 'anna', display_name: 'Anna', display_handle: '@anna' },
  based_on: { creator_display_name: 'Maria', title: 'Oryginał', slug: 'o', handle: null },
  ...patch,
});

const ask = (patch: Partial<Parameters<typeof matchCommunityTop100GroupRows>[0]> = {}) =>
  matchCommunityTop100GroupRows({ groups: GROUPS, category: 'Sorbet', ...patch });

beforeEach(() => {
  h.configured = true;
  h.calls = [];
  h.answer = () => Promise.resolve({ data: [], error: null });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('communityMatch v2 — one request, a typed answer', () => {
  it('SVC-V2-01: sends ONE v2 request with every group and parses the cards', async () => {
    h.answer = () => Promise.resolve({ data: [card()], error: null });
    const outcome = await ask();
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]!.fn).toBe('gellatti_match_community_top100_v2');
    expect(h.calls[0]!.args).toEqual({
      p_ingredient_groups: GROUPS,
      p_category: 'Sorbet',
      p_limit: 10,
    });
    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') {
      expect(outcome.rejected).toBe(0);
      expect(outcome.rows).toHaveLength(1);
      expect(outcome.rows[0]!.matched_ids).toEqual(['PI-ING-002331', 'PI-ING-000345']);
    }
  });

  it('SVC-V2-02: an empty list is a real answer — ok with no rows, not an error', async () => {
    await expect(ask()).resolves.toEqual({ kind: 'ok', rows: [], rejected: 0 });
  });

  it('SVC-V2-03: v2 not deployed (PGRST202, or 42883 naming v2) → unavailable', async () => {
    h.answer = () =>
      Promise.resolve({
        data: null,
        error: {
          code: 'PGRST202',
          message:
            'Could not find the function public.gellatti_match_community_top100_v2(p_category, p_ingredient_groups, p_limit) in the schema cache',
        },
      });
    await expect(ask()).resolves.toEqual({ kind: 'unavailable', reason: 'not_deployed' });

    h.answer = () =>
      Promise.resolve({
        data: null,
        error: {
          code: '42883',
          message:
            'function public.gellatti_match_community_top100_v2(jsonb, text, integer) does not exist',
        },
      });
    await expect(ask()).resolves.toEqual({ kind: 'unavailable', reason: 'not_deployed' });
  });

  it('SVC-V2-04: a 42883 about something else is a BROKEN oracle, not a missing one → error', async () => {
    h.answer = () =>
      Promise.resolve({
        data: null,
        error: { code: '42883', message: 'operator does not exist: text <> text[]' },
      });
    await expect(ask()).resolves.toEqual({ kind: 'error', reason: 'failed' });
  });

  it('SVC-V2-05: any other failure → error, never an empty „no match”', async () => {
    for (const error of [
      { code: '57014', message: 'canceling statement due to statement timeout' },
      { code: 'PGRST203', message: 'Could not choose the best candidate function' },
      { message: 'Internal Server Error' },
    ]) {
      h.answer = () => Promise.resolve({ data: null, error });
      await expect(ask()).resolves.toEqual({ kind: 'error', reason: 'failed' });
    }
    h.answer = () => Promise.reject(new TypeError('Failed to fetch'));
    await expect(ask()).resolves.toEqual({ kind: 'error', reason: 'failed' });
    for (const data of [null, {}, 'x']) {
      h.answer = () => Promise.resolve({ data, error: null });
      await expect(ask()).resolves.toEqual({ kind: 'error', reason: 'malformed' });
    }
  });

  it('SVC-V2-06: no answer by the deadline → error timeout, and the request is aborted', async () => {
    vi.useFakeTimers();
    h.answer = () => new Promise<RpcAnswer>(() => undefined);
    const pending = ask();
    await vi.advanceTimersByTimeAsync(COMMUNITY_MATCH_V2_TIMEOUT_MS - 1);
    expect(h.calls[0]!.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({ kind: 'error', reason: 'timeout' });
    expect(h.calls[0]!.signal.aborted).toBe(true);
  });

  it('SVC-V2-07: a card carrying a quantity key is dropped — logged, never rendered', async () => {
    h.answer = () =>
      Promise.resolve({
        data: [
          card({ publication_id: 'keep' }),
          card({ publication_id: 'p-planned', planned_grams: 120 }),
          card({ publication_id: 'p-actual', actual_grams: 118 }),
          card({ publication_id: 'p-grams', grams: 300 }),
          card({ publication_id: 'p-batch', total_batch_g: 1000 }),
          card({ publication_id: 'p-nested', based_on: { total_batch_g: 1000 } }),
          card({ publication_id: 'p-listed', also_includes: [{ name: 'Mleko', grams: 300 }] }),
        ],
        error: null,
      });
    const outcome = await ask();
    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok') {
      expect(outcome.rows.map((row) => row.publication_id)).toEqual(['keep']);
      expect(outcome.rejected).toBe(6);
    }
    const logs = vi.mocked(console.warn).mock.calls.map((call) => String(call[0]));
    expect(logs.filter((line) => line.includes('quantity key'))).toHaveLength(6);
    // Only the defect is logged — never the card's content.
    expect(logs.join('\n')).not.toContain('Truskawka z bananem');
  });

  it('SVC-V2-08: a malformed card is dropped and counted', async () => {
    const withoutMatched: Record<string, unknown> = card();
    delete withoutMatched.matched_ids;
    h.answer = () =>
      Promise.resolve({
        data: [
          withoutMatched,
          card({ all_requested_present: false }),
          card({ rank: '3' }),
          card({ publication_id: '' }),
          card({ matched_ids: [1, 2] }),
          'not a card',
          card({ publication_id: 'keep' }),
        ],
        error: null,
      });
    const outcome = await ask();
    expect(outcome).toMatchObject({ kind: 'ok', rejected: 6 });
    if (outcome.kind === 'ok') {
      expect(outcome.rows.map((row) => row.publication_id)).toEqual(['keep']);
    }
  });

  it('SVC-V2-09: a request the oracle would refuse with `[]` is never sent', async () => {
    const nine = Array.from({ length: 9 }, (_, index) => [`PI-${index}`]);
    const wide = [
      Array.from({ length: 33 }, (_, i) => `A${i}`),
      Array.from({ length: 32 }, (_, i) => `B${i}`),
    ];
    for (const groups of [[], nine, wide, [['PI-1'], []], [['PI-1'], ['']]]) {
      await expect(ask({ groups })).resolves.toEqual({ kind: 'error', reason: 'invalid_request' });
    }
    expect(h.calls).toHaveLength(0);

    const atLimit = Array.from({ length: 8 }, (_, group) =>
      Array.from({ length: 8 }, (_, index) => `PI-${group}-${index}`),
    );
    expect(communityGroupsWithinLimits(atLimit)).toBe(true);
    await expect(ask({ groups: atLimit })).resolves.toMatchObject({ kind: 'ok' });
    expect(h.calls).toHaveLength(1);
  });

  it('SVC-V2-10: no backend configured → unavailable, nothing sent', async () => {
    h.configured = false;
    await expect(ask()).resolves.toEqual({ kind: 'unavailable', reason: 'not_configured' });
    expect(h.calls).toHaveLength(0);
  });
});
