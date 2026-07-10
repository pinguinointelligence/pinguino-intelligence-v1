/**
 * Accepted-corrections service tests (Spine Slice 24) — the write path is
 * gated, explicit and write-once. Backend + auth mocked; assertions run on
 * what the service would actually send.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACCEPTED_CORRECTION_DRAFT_KEYS,
  sourceRecipeHash,
  type AcceptedCorrectionDraft,
} from '@/features/optimization/acceptedCorrectionDraft';

const h = vi.hoisted(() => ({
  user: { id: 'owner-1' } as { id: string } | null,
  fromTable: '',
  inserted: null as Record<string, unknown> | null,
  insertCalled: 0,
  createdRow: { id: 'rec-1', created_at: '2026-07-10T00:00:00Z' } as unknown,
  insertError: null as { message: string } | null,
  listRows: [] as unknown[],
  deleteError: null as { message: string } | null,
}));

vi.mock('@/lib/supabase/client', () => {
  type Builder = {
    insert: (payload: Record<string, unknown>) => Builder;
    select: (cols?: string) => Builder;
    order: () => Promise<{ data: unknown[]; error: null }>;
    single: () => Promise<{ data: unknown; error: { message: string } | null }>;
    delete: () => Builder;
    eq: () => Promise<{ error: { message: string } | null }>;
  };
  const builder: Builder = {
    insert: (payload) => {
      h.inserted = payload;
      h.insertCalled += 1;
      return builder;
    },
    select: () => builder,
    order: () => Promise.resolve({ data: h.listRows, error: null }),
    single: () => Promise.resolve({ data: h.insertError ? null : h.createdRow, error: h.insertError }),
    delete: () => builder,
    eq: () => Promise.resolve({ error: h.deleteError }),
  };
  return {
    supabase: {
      from: (table: string) => {
        h.fromTable = table;
        return builder;
      },
    },
    isSupabaseConfigured: true,
  };
});

vi.mock('@/services/auth', () => ({
  getCurrentUser: () => Promise.resolve(h.user),
}));

import * as service from './acceptedCorrections';
import {
  ACCEPTED_CORRECTION_ROW_KEYS,
  createAcceptedCorrection,
  deleteAcceptedCorrection,
  draftToRow,
  guardDraftForInsert,
  listMyAcceptedCorrections,
} from './acceptedCorrections';

const originalRecipe = {
  items: [{ ingredient: { name: 'Sucrose' }, grams: 100 }],
} as unknown as AcceptedCorrectionDraft['originalRecipeSnapshot'];

function validDraft(overrides: Partial<AcceptedCorrectionDraft> = {}): AcceptedCorrectionDraft {
  const base: AcceptedCorrectionDraft = {
    schemaVersion: '1',
    ownerId: 'owner-1',
    recipeId: null,
    sourceRecipeHash: sourceRecipeHash(originalRecipe),
    originalRecipeSnapshot: originalRecipe,
    correctedRecipeSnapshot: { items: [] },
    optimizerDecision: 'optimized',
    correctionActions: [
      { type: 'add', ingredient: 'Dextrose', grams: 12.5 },
    ] as unknown as AcceptedCorrectionDraft['correctionActions'],
    beforeMetrics: { pac: 25 } as unknown as AcceptedCorrectionDraft['beforeMetrics'],
    afterMetrics: { pac: 27 } as unknown as AcceptedCorrectionDraft['afterMetrics'],
    targetMode: 'engine_seeded',
    productProfile: 'standard_gelato',
    servingTemperatureC: -12,
    warnings: [],
    trace: {
      rerunState: 'rerun_complete',
      improvementDetected: true,
      injectedMetrics: [],
      regulatorProfile: null,
    },
    engineVersion: 'engine-v',
    configVersion: 'config-v',
    createdBy: 'owner-1',
  };
  return { ...base, ...overrides };
}

beforeEach(() => {
  h.user = { id: 'owner-1' };
  h.fromTable = '';
  h.inserted = null;
  h.insertCalled = 0;
  h.insertError = null;
  h.listRows = [];
  h.deleteError = null;
});

describe('draftToRow — explicit closed mapping', () => {
  it('maps the closed draft key set 1:1 to the closed snake_case column set', () => {
    const row = draftToRow(validDraft());
    expect(Object.keys(row).sort()).toEqual([...ACCEPTED_CORRECTION_ROW_KEYS].sort());
    // one column per draft key — nothing dropped, nothing invented
    expect(ACCEPTED_CORRECTION_ROW_KEYS).toHaveLength(ACCEPTED_CORRECTION_DRAFT_KEYS.length);
  });

  it('never sends DB-generated columns (id, created_at)', () => {
    const row = draftToRow(validDraft()) as unknown as Record<string, unknown>;
    expect('id' in row).toBe(false);
    expect('created_at' in row).toBe(false);
  });

  it('carries ownership and payload verbatim', () => {
    const draft = validDraft();
    const row = draftToRow(draft);
    expect(row.user_id).toBe(draft.ownerId);
    expect(row.created_by).toBe(draft.createdBy);
    expect(row.original_recipe_snapshot).toBe(draft.originalRecipeSnapshot);
    expect(row.corrected_recipe_snapshot).toBe(draft.correctedRecipeSnapshot);
    expect(row.target_mode).toBe('engine_seeded');
    expect(row.serving_temperature_c).toBe(-12);
    expect(row.source_recipe_hash).toBe(draft.sourceRecipeHash);
  });

  it('an unknown key smuggled onto the draft never reaches the row (explicit mapping)', () => {
    const draft = validDraft();
    (draft as unknown as Record<string, unknown>).pac_value = 99;
    const row = draftToRow(draft) as unknown as Record<string, unknown>;
    expect('pac_value' in row).toBe(false);
  });
});

describe('guardDraftForInsert — signed-in, owner-matched, validated', () => {
  it('rejects when not signed in', () => {
    const guard = guardDraftForInsert(null, validDraft());
    expect(guard).toEqual({ ok: false, message: expect.stringContaining('signed in') });
  });

  it('rejects when the signed-in user is not the draft owner', () => {
    const guard = guardDraftForInsert({ id: 'intruder' }, validDraft());
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.message).toContain('different account');
  });

  it('rejects a tampered draft (source hash mismatch)', () => {
    const guard = guardDraftForInsert(
      { id: 'owner-1' },
      validDraft({ sourceRecipeHash: '00000000' }),
    );
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.message).toContain('source_recipe_hash_mismatch');
  });

  it('rejects a draft carrying an unknown key (closed key set)', () => {
    const draft = validDraft();
    (draft as unknown as Record<string, unknown>).status = 'pi_calculated';
    const guard = guardDraftForInsert({ id: 'owner-1' }, draft);
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.message).toContain('unexpected_key:status');
  });

  it('accepts the owner with a valid draft', () => {
    expect(guardDraftForInsert({ id: 'owner-1' }, validDraft())).toEqual({ ok: true });
  });
});

describe('createAcceptedCorrection', () => {
  it('inserts exactly the mapped row into accepted_corrections and returns the stored record', async () => {
    const record = await createAcceptedCorrection(validDraft());
    expect(record).toEqual(h.createdRow);
    expect(h.fromTable).toBe('accepted_corrections');
    expect(h.insertCalled).toBe(1);
    expect(Object.keys(h.inserted ?? {}).sort()).toEqual([...ACCEPTED_CORRECTION_ROW_KEYS].sort());
    expect(h.inserted?.user_id).toBe('owner-1');
    expect(h.inserted?.created_by).toBe('owner-1');
  });

  it('refuses when signed out — nothing is sent', async () => {
    h.user = null;
    await expect(createAcceptedCorrection(validDraft())).rejects.toThrow(/signed in/);
    expect(h.insertCalled).toBe(0);
  });

  it('refuses when the session user is not the draft owner — nothing is sent', async () => {
    h.user = { id: 'someone-else' };
    await expect(createAcceptedCorrection(validDraft())).rejects.toThrow(/different account/);
    expect(h.insertCalled).toBe(0);
  });

  it('refuses an invalid draft — nothing is sent', async () => {
    await expect(
      createAcceptedCorrection(validDraft({ correctionActions: [] })),
    ).rejects.toThrow(/not saveable/);
    expect(h.insertCalled).toBe(0);
  });

  it('surfaces the DB error honestly (no fake success)', async () => {
    h.insertError = { message: 'new row violates row-level security policy' };
    await expect(createAcceptedCorrection(validDraft())).rejects.toThrow(/row-level security/);
  });
});

describe('immutability — write-once at the module surface', () => {
  it('exports NO update function of any kind', () => {
    const updateLike = Object.keys(service).filter((k) => /update/i.test(k));
    expect(updateLike).toEqual([]);
  });
});

describe('listMyAcceptedCorrections / deleteAcceptedCorrection', () => {
  it('lists the rows the backend returns (RLS scopes to the owner)', async () => {
    h.listRows = [{ id: 'rec-2' }];
    await expect(listMyAcceptedCorrections()).resolves.toEqual([{ id: 'rec-2' }]);
    expect(h.fromTable).toBe('accepted_corrections');
  });

  it('delete requires a signed-in user', async () => {
    h.user = null;
    await expect(deleteAcceptedCorrection('rec-1')).rejects.toThrow(/signed in/);
  });

  it('delete resolves when the backend accepts', async () => {
    await expect(deleteAcceptedCorrection('rec-1')).resolves.toBeUndefined();
  });

  it('delete surfaces backend errors honestly', async () => {
    h.deleteError = { message: 'permission denied' };
    await expect(deleteAcceptedCorrection('rec-1')).rejects.toThrow(/permission denied/);
  });
});
