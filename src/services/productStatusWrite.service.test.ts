import { afterEach, describe, expect, it, vi } from 'vitest';

/** Chainable supabase-client stub: every builder method returns the chain; maybeSingle resolves
 * with the current stub state so allowed paths can complete. */
const h = vi.hoisted(() => {
  const state: { data: unknown; error: unknown } = { data: null, error: null };
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ['from', 'update', 'eq', 'neq', 'select']) chain[m] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => ({ data: state.data, error: state.error }));
  return { chain, state };
});
vi.mock('@/lib/supabase/client', () => ({ supabase: h.chain }));

import { setProductLifecycleStatus } from './productStatusWrite';

afterEach(() => {
  vi.clearAllMocks();
  h.state.data = null;
  h.state.error = null;
});

const FULL_REVIEW = {
  reviewed_by: 'owner',
  review_notes: 'producer technical sheet on file',
  independent_provenance: true,
  red_flags_clear: true,
} as const;

describe('setProductLifecycleStatus — service-level PI Verified guard', () => {
  it('refuses a plain pi_verified write (no review at all) BEFORE touching the client', async () => {
    await expect(setProductLifecycleStatus('p1', 'pi_verified')).rejects.toThrow(/PI Verified was refused/);
    expect(h.chain.update).not.toHaveBeenCalled();
  });

  it('refuses pi_verified without a written reason', async () => {
    await expect(
      setProductLifecycleStatus('p1', 'pi_verified', { ...FULL_REVIEW, review_notes: '  ' }),
    ).rejects.toThrow(/written reason/);
    expect(h.chain.update).not.toHaveBeenCalled();
  });

  it('refuses pi_verified without the independent-provenance attestation', async () => {
    await expect(
      setProductLifecycleStatus('p1', 'pi_verified', { reviewed_by: 'owner', review_notes: 'reason' }),
    ).rejects.toThrow(/independent-provenance/);
    expect(h.chain.update).not.toHaveBeenCalled();
  });

  it('refuses pi_verified without the clean red-flag attestation', async () => {
    await expect(
      setProductLifecycleStatus('p1', 'pi_verified', { ...FULL_REVIEW, red_flags_clear: undefined }),
    ).rejects.toThrow(/red-flag/);
    expect(h.chain.update).not.toHaveBeenCalled();
  });

  it('persists pi_verified with the FULL verified review — attestations gate but are never written', async () => {
    h.state.data = { id: 'p1', status: 'pi_verified' };
    const row = await setProductLifecycleStatus('p1', 'pi_verified', FULL_REVIEW);
    expect((row as { status: string }).status).toBe('pi_verified');
    const patch = h.chain.update!.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patch.status).toBe('pi_verified');
    expect(patch.reviewed_by).toBe('owner');
    expect(patch.review_notes).toBe('producer technical sheet on file');
    // the attestation flags are a GATE, not columns — they must not reach the database patch
    expect(patch).not.toHaveProperty('independent_provenance');
    expect(patch).not.toHaveProperty('red_flags_clear');
  });

  it('normal non-verified updates keep working without attestations', async () => {
    h.state.data = { id: 'p1', status: 'pi_generated' };
    await setProductLifecycleStatus('p1', 'pi_generated', { reviewed_by: 'dev', review_notes: 'apply recommended' });
    h.state.data = { id: 'p2', status: 'rejected' };
    await setProductLifecycleStatus('p2', 'rejected');
    expect(h.chain.update).toHaveBeenCalledTimes(2);
  });
});
