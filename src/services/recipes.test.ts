import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaveRecipeInput } from '@/features/recipes/recipePayload';

/** Shared, controllable state for the mocked backend. */
const h = vi.hoisted(() => ({
  updateRow: null as unknown,
  createdRow: { id: 'created-id', name: 'Fresh' } as unknown,
  insertCalled: 0,
}));

vi.mock('@/lib/supabase/client', () => {
  type Builder = {
    update: () => Builder;
    insert: () => Builder;
    eq: () => Builder;
    select: () => Builder;
    maybeSingle: () => Promise<{ data: unknown; error: null }>;
    single: () => Promise<{ data: unknown; error: null }>;
  };
  const builder: Builder = {
    update: () => builder,
    insert: () => {
      h.insertCalled += 1;
      return builder;
    },
    eq: () => builder,
    select: () => builder,
    maybeSingle: () => Promise.resolve({ data: h.updateRow, error: null }),
    single: () => Promise.resolve({ data: h.createdRow, error: null }),
  };
  return { supabase: { from: () => builder }, isSupabaseConfigured: true };
});

vi.mock('@/services/auth', () => ({
  getCurrentUser: () => Promise.resolve({ id: 'user-1' }),
}));

import { update } from './recipes';

const payload = {
  name: 'X',
  description: null,
  recipe_input: { items: [] },
  product_type: null,
  serving_profile: 'display-minus-11',
  active_engine_label: '−11°C Engine',
  engine_version: '0.4.0',
  config_version: '0.5.0',
  batch_grams: 1000,
} as unknown as SaveRecipeInput;

describe('recipes.update self-heal', () => {
  beforeEach(() => {
    h.insertCalled = 0;
  });

  it('falls back to create when the saved id is stale / missing / not owned', async () => {
    h.updateRow = null; // no row matched the update
    const row = await update('stale-id', payload);
    expect(row).toEqual(h.createdRow); // a fresh recipe was created instead of erroring
    expect(h.insertCalled).toBeGreaterThan(0);
  });

  it('overwrites the existing row when the id is valid (no create fallback)', async () => {
    h.updateRow = { id: 'existing-id', name: 'Loaded' };
    const row = await update('existing-id', payload);
    expect(row).toEqual({ id: 'existing-id', name: 'Loaded' });
    expect(h.insertCalled).toBe(0);
  });
});
