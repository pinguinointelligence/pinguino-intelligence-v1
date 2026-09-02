/**
 * How the library loads version history (owner v1.4 §10) and how the save dialog numbers the next
 * version when a historical snapshot is open (§9).
 *
 * §10: ONE batched `.in(recipe_id, …)` read for the whole page. Never one query per row — this test
 * counts the actual calls the service makes against a fake client, so an N+1 regression fails here
 * rather than as a slow page nobody measures.
 */
import { describe, expect, it, vi } from 'vitest';

const from = vi.fn();
vi.mock('@/lib/supabase/client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  supabase: { from: (table: string) => from(table) },
  isSupabaseConfigured: true,
}));

const { listMine } = await import('@/services/recipes');

const RECIPES = [
  { id: 'r1', name: 'A', updated_at: '2026-08-23T08:00:00Z', recipe_input: {} },
  { id: 'r2', name: 'B', updated_at: '2026-08-22T08:00:00Z', recipe_input: {} },
  { id: 'r3', name: 'C', updated_at: '2026-08-21T08:00:00Z', recipe_input: {} },
];
const VERSIONS = [
  { recipe_id: 'r1', version_number: 3, created_at: '2026-08-23T08:30:00Z' },
  { recipe_id: 'r1', version_number: 1, created_at: '2026-08-22T23:29:59Z' },
  { recipe_id: 'r1', version_number: 2, created_at: '2026-08-23T08:28:00Z' },
  { recipe_id: 'r2', version_number: 1, created_at: '2026-08-22T08:00:00Z' },
];

const wireClient = (versionsResult: { data: unknown; error: unknown }) => {
  const inCalls: unknown[][] = [];
  from.mockReset();
  from.mockImplementation((table: string) => {
    if (table === 'saved_recipes') {
      return { select: () => ({ order: async () => ({ data: RECIPES, error: null }) }) };
    }
    return {
      select: () => ({
        in: (_column: string, ids: unknown[]) => {
          inCalls.push(ids);
          return { order: async () => versionsResult };
        },
      }),
    };
  });
  return { inCalls };
};

describe('listMine — batched version history (§10)', () => {
  it('reads every recipe and every version in exactly TWO queries', async () => {
    const { inCalls } = wireClient({ data: VERSIONS, error: null });
    await listMine();
    expect(from).toHaveBeenCalledTimes(2);
    expect(from).toHaveBeenNthCalledWith(1, 'saved_recipes');
    expect(from).toHaveBeenNthCalledWith(2, 'recipe_versions');
    // …and the single version read covers ALL the listed recipes at once.
    expect(inCalls).toHaveLength(1);
    expect(inCalls[0]).toEqual(['r1', 'r2', 'r3']);
  });

  it('attaches each recipe its own history, newest first', async () => {
    wireClient({ data: VERSIONS, error: null });
    const [r1, r2, r3] = await listMine();
    expect(r1!.versions?.map((v) => v.versionNumber)).toEqual([3, 2, 1]);
    expect(r1!.latest_version_number).toBe(3);
    expect(r1!.latest_version_at).toBe('2026-08-23T08:30:00Z');
    expect(r2!.versions?.map((v) => v.versionNumber)).toEqual([1]);
    // A recipe with no version rows (legacy orphan) carries no history rather than a fake one.
    expect(r3!.versions).toBeUndefined();
    expect(r3!.latest_version_number).toBeUndefined();
  });

  it('sorts newest-first even if the transport returns another order', async () => {
    wireClient({
      data: [
        { recipe_id: 'r1', version_number: 1, created_at: '2026-08-22T23:29:59Z' },
        { recipe_id: 'r1', version_number: 3, created_at: '2026-08-23T08:30:00Z' },
        { recipe_id: 'r1', version_number: 2, created_at: '2026-08-23T08:28:00Z' },
      ],
      error: null,
    });
    const [r1] = await listMine();
    expect(r1!.versions?.map((v) => v.versionNumber)).toEqual([3, 2, 1]);
  });

  it('still lists the recipes when the history read fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    wireClient({ data: null, error: { message: 'permission denied' } });
    const rows = await listMine();
    expect(rows).toHaveLength(3);
    expect(rows[0]!.versions).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
