import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Agent 5 (E2E authenticity) — WIRING PROOF that every service read which used to
 * return a SILENT `[]` / `null` when the Supabase env is absent now routes through
 * the explicit unconfigured-read guard: in DEV/test the value is still empty (so
 * local acceptance keeps working) but the surface is LOGGED; in a production build
 * the same guard throws (proven in backendGuard.test.ts).
 */
vi.mock('@/lib/supabase/client', () => ({ supabase: null, isSupabaseConfigured: false }));
vi.mock('@/services/auth', () => ({ getCurrentUser: vi.fn(async () => ({ id: 'u1' })) }));

import { __resetUnconfiguredReadWarnings } from './backendGuard';
import { listMyAcceptedCorrections } from './acceptedCorrections';
import { getMySubscription } from './billing';
import {
  getIngredientById,
  listActiveIngredients,
  listEngineApprovedIngredients,
  listIngredientsByIds,
  searchEngineApprovedIngredients,
} from './ingredients';
import { listEvidence, listOcrRuns } from './ocrIntakeEvidence';
import {
  listBatches,
  listSessionImages,
  listSessions,
  loadBatch,
  loadSession,
} from './ocrIntakeSessions';
import { createIntakeImageSignedUrl } from './ocrIntakeStorage';
import { findExistingProductForIdentity, getProduct, listMyProducts } from './products';
import { getLatestSnapshot, listProductSnapshots } from './productSnapshots';
import { get as getSavedRecipe, listMine } from './recipes';

describe('unconfigured backend reads are explicit (logged empty in DEV, never silent)', () => {
  beforeEach(() => {
    __resetUnconfiguredReadWarnings();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const loggedSurfaces = (): string[] =>
    vi.mocked(console.warn).mock.calls.map((call) => String(call[0]));

  it('products reads resolve empty AND tag their surface', async () => {
    expect(await listMyProducts()).toEqual([]);
    expect(await getProduct('p1')).toBeNull();
    expect(
      await findExistingProductForIdentity({ product_name: 'X' } as never),
    ).toBeNull();
    const logs = loggedSurfaces().join('\n');
    expect(logs).toContain('products.listMyProducts');
    expect(logs).toContain('products.getProduct');
    expect(logs).toContain('products.findExistingProductForIdentity');
  });

  it('ingredient reads resolve empty AND tag their surface', async () => {
    expect(await listActiveIngredients()).toEqual([]);
    expect(await listEngineApprovedIngredients()).toEqual([]);
    expect(await searchEngineApprovedIngredients('milk')).toEqual([]);
    expect(await listIngredientsByIds(['PI-ING-0001'])).toEqual([]);
    expect(await getIngredientById('PI-ING-0001')).toBeNull();
    const logs = loggedSurfaces().join('\n');
    expect(logs).toContain('ingredients.listActiveIngredients');
    expect(logs).toContain('ingredients.listEngineApprovedIngredients');
    expect(logs).toContain('ingredients.searchEngineApprovedIngredients');
    expect(logs).toContain('ingredients.listIngredientsByIds');
    expect(logs).toContain('ingredients.getIngredientById');
  });

  it('an EMPTY id set is an honest empty — no unconfigured log for asking nothing', async () => {
    expect(await listIngredientsByIds([])).toEqual([]);
    expect(loggedSurfaces().join('\n')).not.toContain('ingredients.listIngredientsByIds');
  });

  it('OCR intake reads resolve empty AND tag their surface', async () => {
    expect(await listBatches()).toEqual([]);
    expect(await loadBatch('b1')).toBeNull();
    expect(await loadSession('s1')).toBeNull();
    expect(await listSessions()).toEqual([]);
    expect(await listSessionImages('s1')).toEqual([]);
    expect(await listOcrRuns('s1')).toEqual([]);
    expect(await listEvidence('s1')).toEqual([]);
    expect(await createIntakeImageSignedUrl('u1/s1/i1.png')).toBeNull();
    const logs = loggedSurfaces().join('\n');
    expect(logs).toContain('ocrIntakeSessions.listBatches');
    expect(logs).toContain('ocrIntakeSessions.loadBatch');
    expect(logs).toContain('ocrIntakeSessions.loadSession');
    expect(logs).toContain('ocrIntakeSessions.listSessions');
    expect(logs).toContain('ocrIntakeSessions.listSessionImages');
    expect(logs).toContain('ocrIntakeEvidence.listOcrRuns');
    expect(logs).toContain('ocrIntakeEvidence.listEvidence');
    expect(logs).toContain('ocrIntakeStorage.createIntakeImageSignedUrl');
  });

  it('recipes / corrections / snapshots / billing reads resolve empty AND tag their surface', async () => {
    expect(await listMine()).toEqual([]);
    expect(await getSavedRecipe('r1')).toBeNull();
    expect(await listMyAcceptedCorrections()).toEqual([]);
    expect(await listProductSnapshots('p1')).toEqual([]);
    expect(await getLatestSnapshot('p1')).toBeNull();
    expect(await getMySubscription()).toBeNull();
    const logs = loggedSurfaces().join('\n');
    expect(logs).toContain('recipes.listMine');
    expect(logs).toContain('recipes.get');
    expect(logs).toContain('acceptedCorrections.listMyAcceptedCorrections');
    expect(logs).toContain('productSnapshots.listProductSnapshots');
    expect(logs).toContain('productSnapshots.getLatestSnapshot');
    expect(logs).toContain('billing.getMySubscription');
  });
});
