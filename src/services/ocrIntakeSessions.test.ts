import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IntakeImage, IntakeSessionState } from '@/features/ocr-intake/intakeContracts';

const h = vi.hoisted(() => {
  const state: { single: unknown; list: unknown; error: unknown } = { single: null, list: [], error: null };
  const chain: Record<string, ReturnType<typeof vi.fn>> & { then?: unknown } = {};
  for (const m of ['from', 'insert', 'update', 'select', 'eq', 'order', 'delete']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.single = vi.fn(async () => ({ data: state.single, error: state.error }));
  chain.maybeSingle = vi.fn(async () => ({ data: state.single, error: state.error }));
  // `await query` (list reads, bulk-insert.select()) resolves the list channel.
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    resolve({ data: state.list, error: state.error });
  return { chain, state };
});
vi.mock('@/lib/supabase/client', () => ({ supabase: h.chain }));
vi.mock('@/services/auth', () => ({ getCurrentUser: vi.fn() }));

import { getCurrentUser } from '@/services/auth';
import {
  createBatch,
  createSession,
  loadBatch,
  saveImageMetadata,
  sessionStateToOutcome,
  updateImageReview,
  updateSessionState,
} from './ocrIntakeSessions';

const asUser = (id: string | null) =>
  vi.mocked(getCurrentUser).mockResolvedValue(id ? ({ id } as never) : null);
const lastCall = (fn: ReturnType<typeof vi.fn> | undefined) =>
  fn!.mock.calls.at(-1)?.[0] as Record<string, unknown>;

afterEach(() => {
  vi.clearAllMocks();
  h.state.single = null;
  h.state.list = [];
  h.state.error = null;
});

describe('sessionStateToOutcome (pure, derived — never stored)', () => {
  it('maps every session state to a batch outcome', () => {
    const map: Record<IntakeSessionState, string> = {
      saved: 'saved',
      duplicate_blocked: 'duplicate',
      failed: 'failed',
      cancelled: 'failed',
      review: 'needs_review',
      ready_to_save: 'needs_review',
      collecting_images: 'pending',
      extracting: 'pending',
      saving: 'pending',
    };
    for (const [stateKey, outcome] of Object.entries(map)) {
      expect(sessionStateToOutcome(stateKey as IntakeSessionState)).toBe(outcome);
    }
  });
});

describe('createBatch / createSession — owner stamping + protected columns', () => {
  it('stamps the owner uid on a new batch', async () => {
    asUser('u1');
    h.state.single = { id: 'b1', user_id: 'u1' };
    await createBatch();
    expect(lastCall(h.chain.insert)).toEqual({ user_id: 'u1' });
  });

  it('creates a collecting_images session and NEVER writes saved_product_id/user_id override', async () => {
    asUser('u1');
    h.state.single = { id: 's1' };
    await createSession({ id: 's1', manualEan: '4012345678901' });
    const payload = lastCall(h.chain.insert);
    expect(payload).toMatchObject({
      user_id: 'u1',
      state: 'collecting_images',
      manual_ean: '4012345678901',
      id: 's1',
    });
    expect(payload).not.toHaveProperty('saved_product_id');
  });

  it('requires sign-in', async () => {
    asUser(null);
    await expect(createSession()).rejects.toThrow(/signed in/i);
  });
});

describe('updateSessionState — only grantable transition columns travel', () => {
  it('writes state + saved_at and NOTHING else on a save', async () => {
    h.state.single = { id: 's1', state: 'saved' };
    await updateSessionState('s1', 'saved', { savedAt: '2026-07-11T00:00:00Z' });
    const patch = lastCall(h.chain.update);
    expect(patch).toEqual({ state: 'saved', saved_at: '2026-07-11T00:00:00Z' });
    expect(patch).not.toHaveProperty('saved_product_id');
    expect(patch).not.toHaveProperty('user_id');
  });
});

describe('saveImageMetadata / updateImageReview — write-once file identity', () => {
  it('inserts the full image row incl. its id and no user_id (session is the anchor)', async () => {
    h.state.single = { id: 'i1' };
    const img: IntakeImage = {
      imageId: 'i1',
      role: 'front',
      order: 0,
      fileName: 'front.png',
      mime: 'image/png',
      byteSize: 100,
      checksumSha256: 'a'.repeat(64),
      width: 10,
      height: 20,
      state: 'ready',
      failure: null,
    };
    await saveImageMetadata('s1', img);
    const row = lastCall(h.chain.insert);
    expect(row).toMatchObject({ id: 'i1', session_id: 's1', role: 'front', display_order: 0, byte_size: 100 });
    expect(row).not.toHaveProperty('user_id');
  });

  it('strips write-once file-identity columns from a review patch (only 4 grantable cols pass)', async () => {
    h.state.single = { id: 'i1' };
    const hostile = {
      role: 'back',
      display_order: 2,
      state: 'ready',
      failure: null,
      // hostile/legacy attempt to rewrite file identity:
      file_name: 'evil.png',
      checksum_sha256: 'b'.repeat(64),
      byte_size: 999999,
    } as unknown as Parameters<typeof updateImageReview>[1];
    await updateImageReview('i1', hostile);
    const patch = lastCall(h.chain.update);
    expect(patch).toEqual({ role: 'back', display_order: 2, state: 'ready', failure: null });
    expect(patch).not.toHaveProperty('file_name');
    expect(patch).not.toHaveProperty('checksum_sha256');
    expect(patch).not.toHaveProperty('byte_size');
  });
});

describe('loadBatch — outcomes DERIVED from member session states', () => {
  it('derives per-session outcomes and preserves queue order', async () => {
    h.state.single = { id: 'b1', user_id: 'u1' }; // the batch row (maybeSingle)
    h.state.list = [
      { id: 's1', state: 'saved' },
      { id: 's2', state: 'duplicate_blocked' },
      { id: 's3', state: 'review' },
    ]; // listSessions (await)
    const batch = await loadBatch('b1');
    expect(batch?.sessionIds).toEqual(['s1', 's2', 's3']);
    expect(batch?.outcomes).toEqual({ s1: 'saved', s2: 'duplicate', s3: 'needs_review' });
  });

  it('returns null for an absent/unowned batch', async () => {
    h.state.single = null;
    expect(await loadBatch('nope')).toBeNull();
  });
});
