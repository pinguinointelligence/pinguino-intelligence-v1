import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => {
  const state = {
    result: { data: null as { user_id: string } | null, error: null as Error | null },
  };
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    maybeSingle: vi.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.maybeSingle.mockImplementation(async () => state.result);
  return { state, chain, from: vi.fn(() => chain) };
});

vi.mock('@/lib/supabase/client', () => ({
  supabase: { from: harness.from },
  isSupabaseConfigured: true,
}));

const { currentUserHasOwnerReviewAccess } = await import('./ownerReviewAccess');

describe('Owner Review authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.state.result = { data: null, error: null };
  });

  it('fails closed without an exact active self row', async () => {
    expect(await currentUserHasOwnerReviewAccess('')).toBe(false);
    expect(harness.from).not.toHaveBeenCalled();

    harness.state.result = { data: { user_id: 'someone-else' }, error: null };
    expect(await currentUserHasOwnerReviewAccess('owner-a')).toBe(false);

    harness.state.result = { data: null, error: new Error('RLS denied') };
    expect(await currentUserHasOwnerReviewAccess('owner-a')).toBe(false);
  });

  it('requires the exact unrevoked admin row and never writes it', async () => {
    harness.state.result = { data: { user_id: 'owner-a' }, error: null };
    expect(await currentUserHasOwnerReviewAccess('owner-a')).toBe(true);
    expect(harness.from).toHaveBeenCalledWith('admin_users');
    expect(harness.chain.eq).toHaveBeenCalledWith('user_id', 'owner-a');
    expect(harness.chain.is).toHaveBeenCalledWith('revoked_at', null);
    expect(harness.chain).not.toHaveProperty('insert');
    expect(harness.chain).not.toHaveProperty('update');
  });
});
