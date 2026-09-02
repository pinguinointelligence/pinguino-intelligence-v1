import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DIRECTION_TARGETS, type ProfileSettingsSnapshot } from '@/features/pro-workbench/recipeProfileStore';

const mock = vi.hoisted(() => {
  const state: { owner: string | null; rows: unknown[]; upserts: unknown[] } = {
    owner: 'owner-a', rows: [], upserts: [],
  };
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.order = vi.fn(async () => ({ data: state.rows, error: null }));
  builder.upsert = vi.fn(async (payload: unknown) => {
    state.upserts.push(payload);
    return { error: null };
  });
  return {
    state,
    client: {
      auth: { getUser: vi.fn(async () => ({ data: { user: state.owner ? { id: state.owner } : null }, error: null })) },
      from: vi.fn(() => builder),
    },
    builder,
  };
});

vi.mock('@/lib/supabase/client', () => ({ supabase: mock.client }));

const { listUserRecipeDefaults, upsertUserRecipeDefault } = await import('./userRecipeDefaults');

const settings = (batch = 1000): ProfileSettingsSnapshot => ({
  visibleProductType: 'gelato', mode: 'classic', formulationStrategy: 'optimal',
  targetBatchGrams: batch, machineKind: 'professional', machineId: null,
  machineLabel: 'Maszyna profesjonalna', servingModeId: 'temp_minus_11',
  targetTemperatureC: -11, machineCapacityGrams: null,
  directionTargets: { ...DEFAULT_DIRECTION_TARGETS, sweetness: -2, softness: 2 },
  directionIntents: { ...DEFAULT_DIRECTION_TARGETS, sweetness: -2, softness: 2 },
});

describe('account-owned recipe defaults persistence', () => {
  beforeEach(() => {
    mock.state.owner = 'owner-a';
    mock.state.rows = [];
    mock.state.upserts = [];
    vi.clearAllMocks();
  });

  it('reads only the authenticated owner and validates every stored snapshot', async () => {
    mock.state.rows = [{
      owner_user_id: 'owner-a', product_context_key: 'gelato', settings: settings(1400),
      updated_at: '2026-08-11T00:00:00.000Z',
    }];
    const rows = await listUserRecipeDefaults('owner-a');
    expect(rows[0]?.settings.targetBatchGrams).toBe(1400);
    expect(rows[0]?.settings.directionTargets).toMatchObject({ sweetness: -2, softness: 2 });
    expect(mock.builder.eq).toHaveBeenCalledWith('owner_user_id', 'owner-a');
  });

  it('rejects a caller owner that differs from the authenticated account', async () => {
    await expect(listUserRecipeDefaults('owner-b')).rejects.toThrow(/does not match/i);
    await expect(upsertUserRecipeDefault('owner-b', 'gelato', settings())).rejects.toThrow(/does not match/i);
    expect(mock.client.from).not.toHaveBeenCalled();
  });

  it('upserts a per-product snapshot without a client-controlled updated_at', async () => {
    await upsertUserRecipeDefault('owner-a', 'sorbet', {
      ...settings(875), visibleProductType: 'sorbet', targetTemperatureC: -13,
    });
    expect(mock.state.upserts).toEqual([expect.objectContaining({
      owner_user_id: 'owner-a', product_context_key: 'sorbet',
      settings: expect.objectContaining({ visibleProductType: 'sorbet', targetBatchGrams: 875 }),
    })]);
    expect(mock.state.upserts[0]).not.toHaveProperty('updated_at');
  });

  it('fails closed on invalid stored settings instead of applying fabricated defaults', async () => {
    mock.state.rows = [{
      owner_user_id: 'owner-a', product_context_key: 'gelato',
      settings: { ...settings(), targetBatchGrams: -1 }, updated_at: '2026-08-11T00:00:00.000Z',
    }];
    await expect(listUserRecipeDefaults('owner-a')).rejects.toThrow(/failed validation/i);
  });

  it('rejects a direction outside the exact five-step range', async () => {
    const invalid = settings();
    invalid.directionTargets = { ...invalid.directionTargets, sweetness: 3 } as never;
    await expect(upsertUserRecipeDefault('owner-a', 'gelato', invalid)).rejects.toThrow(
      /failed validation/i,
    );
  });

  it('rejects a stored or submitted context that disagrees with the settings product', async () => {
    mock.state.rows = [{
      owner_user_id: 'owner-a', product_context_key: 'sorbet',
      settings: settings(), updated_at: '2026-08-11T00:00:00.000Z',
    }];
    await expect(listUserRecipeDefaults('owner-a')).rejects.toThrow(/failed validation/i);
    await expect(
      upsertUserRecipeDefault('owner-a', 'sorbet', settings()),
    ).rejects.toThrow(/failed validation/i);
    expect(mock.state.upserts).toEqual([]);
  });
});
