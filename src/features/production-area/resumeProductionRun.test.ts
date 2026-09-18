// @vitest-environment jsdom
/**
 * Production v3 §6 — „Wróć do partii” opens EXACTLY the tapped run, also when two
 * runs of the same recipe version are in progress (R1 older, R2 newer). Only
 * existing mechanisms: the saved-version opening path and `restoreDurableSession`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecipeInput } from '@/engine';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { recipeCompositionFromState } from '@/features/recipe-composition/recipeCompositionPersistence';
import { createProductionSession } from '@/features/production-workspace/productionSession';
import {
  productionSessionAddressKey,
  productionSessionForAddress,
  useProductionSessionStore,
} from '@/features/production-workspace/productionSessionStore';
import type { ProductionRun } from '@/features/pro-core/productionContracts';
import type { RecipeVersion, SavedRecipe } from '@/features/pro-core/recipeContracts';
import { openSavedRecipeVersion } from '@/features/recipes/openSavedRecipeVersion';
import { useRecipeStore } from '@/stores/recipeStore';

const OWNER = 'owner-resume';
const RECIPE_ID = 'recipe-straw';
const VERSION_ID = 'version-straw-2';

const repo = vi.hoisted(() => ({
  latestVersionNumber: 2,
  version: null as unknown as RecipeVersion,
  readableVersions: new Set<number>([2]),
}));

vi.mock('@/features/pro-core/proCoreRecipeRepo', () => ({
  resolveRecipesRepository: () => ({
    repository: {
      getRecipe: async (): Promise<SavedRecipe> => ({
        recipeId: RECIPE_ID,
        ownerUserId: OWNER,
        workspaceId: null,
        title: 'Truskawkowe gelato',
        notes: null,
        productProfile: null,
        temperatureC: null,
        latestVersionNumber: repo.latestVersionNumber,
        archived: false,
        createdAt: '2026-09-01T10:00:00.000Z',
        updatedAt: '2026-09-02T10:00:00.000Z',
        createdBy: OWNER,
      }),
      getVersion: async (_recipeId: string, versionNumber: number) =>
        repo.readableVersions.has(versionNumber) ? structuredClone(repo.version) : null,
    },
  }),
}));

const { resumeProductionRun } = await import('./resumeProductionRun');

const recipeInput = (): RecipeInput => ({
  items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
  mode: DEFAULT_PRESET.mode,
  category: DEFAULT_PRESET.category,
  target_temperature_c: DEFAULT_PRESET.target_temperature_c,
  target_batch_grams: DEFAULT_PRESET.target_batch_grams,
  machine_capacity_grams: null,
});

const row = {
  id: RECIPE_ID,
  name: 'Truskawkowe gelato',
  recipe_input: recipeInput(),
  product_composition: null,
};

const address = { ownerUserId: OWNER, recipeId: RECIPE_ID, recipeVersionId: VERSION_ID };
const run = (runId: string) => ({
  runId,
  recipeId: RECIPE_ID,
  recipeVersionId: VERSION_ID,
  recipeVersionNumber: 2,
});

function localSession(sessionId: string, startedAt: string) {
  const input = recipeInput();
  return createProductionSession({
    sessionId,
    ownerUserId: OWNER,
    source: {
      recipeId: RECIPE_ID,
      recipeVersionId: VERSION_ID,
      recipeVersionNumber: 2,
      recipeName: 'Truskawkowe gelato',
    },
    plannedInput: input,
    plannedComposition: {
      schemaVersion: 1,
      baseScope: 'BASE_FORMULATION',
      baseOrder: input.items.map((item) => item.id),
      toppings: [],
      behaviorSnapshots: {},
      migrationAmbiguities: [],
    },
    startedAt,
  });
}

const noServer = { getRun: vi.fn(async () => null) };

describe('resumeProductionRun', () => {
  beforeEach(() => {
    repo.latestVersionNumber = 2;
    repo.readableVersions = new Set([2]);
    repo.version = {
      versionId: VERSION_ID,
      recipeId: RECIPE_ID,
      ownerUserId: OWNER,
      versionNumber: 2,
      recipeInput: recipeInput(),
      productComposition: null,
      totalBatchG: 1000,
      productProfile: null,
      temperatureC: null,
      engineVersion: 'test',
      configVersion: 'test',
      mapperDatasetVersion: null,
      source: 'save',
      createdBy: OWNER,
      createdAt: '2026-09-02T10:00:00.000Z',
      restoredFromVersion: null,
      note: null,
    } as RecipeVersion;
    useRecipeStore.getState().resetToDemo();
    useProductionSessionStore.setState({
      session: null,
      sessionsById: {
        'run-r1': localSession('run-r1', '2026-09-17T08:00:00.000Z'),
        'run-r2': localSession('run-r2', '2026-09-17T09:00:00.000Z'),
      },
      selectedSessionIdByAddress: {},
      activeAddressKey: null,
      archivedSessions: [],
    });
    noServer.getRun.mockClear();
  });

  it('opens the older run R1 exactly, not the newest run of the same version', async () => {
    const result = await resumeProductionRun({
      run: run('run-r1'),
      ownerUserId: OWNER,
      repository: noServer,
      loadSavedRecipe: async () => row,
    });
    expect(result).toEqual({ ok: true, to: '/pro/production' });
    const recipe = useRecipeStore.getState();
    expect(recipe.savedRecipeId).toBe(RECIPE_ID);
    expect(recipe.currentVersionId).toBe(VERSION_ID);
    const state = useProductionSessionStore.getState();
    expect(state.selectedSessionIdByAddress[productionSessionAddressKey(address)]).toBe('run-r1');
    // What `/pro/production` does on arrival: activate the open recipe's address.
    useProductionSessionStore.getState().activateSessionForAddress(address);
    expect(useProductionSessionStore.getState().session?.sessionId).toBe('run-r1');
    expect(
      productionSessionForAddress(useProductionSessionStore.getState(), address)?.sessionId,
    ).toBe('run-r1');
  });

  it('opens R2 when R2 is tapped, even right after R1', async () => {
    await resumeProductionRun({
      run: run('run-r1'),
      ownerUserId: OWNER,
      repository: noServer,
      loadSavedRecipe: async () => row,
    });
    useProductionSessionStore.getState().activateSessionForAddress(address);
    const result = await resumeProductionRun({
      run: run('run-r2'),
      ownerUserId: OWNER,
      repository: noServer,
      loadSavedRecipe: async () => row,
    });
    expect(result.ok).toBe(true);
    useProductionSessionStore.getState().activateSessionForAddress(address);
    expect(useProductionSessionStore.getState().session?.sessionId).toBe('run-r2');
  });

  it('hydrates a server-only run against the opened version (local copy cleared)', async () => {
    // Learn the exact plan of the opened version the same way the workbench does.
    await openSavedRecipeVersion(row, 2, { persona: 'pro' });
    const recipe = useRecipeStore.getState();
    const planned = buildRecipeInput(recipe, 'planning');
    const composition = recipeCompositionFromState(recipe);
    const plannedItems = composition.baseOrder.map((id, index) => {
      const item = planned.items.find((candidate) => candidate.id === id)!;
      return {
        id,
        name: item.ingredient.name,
        canonicalIngredientId: null,
        processScope: 'BASE_FORMULATION' as const,
        scopePosition: index,
        plannedGrams: item.planned_grams,
        displayGrams: item.planned_grams,
      };
    });
    const remote = {
      runId: 'run-server',
      ownerUserId: OWNER,
      recipeId: RECIPE_ID,
      recipeVersionId: VERSION_ID,
      recipeVersionNumber: 2,
      status: 'in_progress',
      plannedBatchG: planned.target_batch_grams,
      plannedItems,
      createdAt: '2026-09-17T10:00:00.000Z',
      updatedAt: '2026-09-17T10:00:00.000Z',
      completedAt: null,
      cancelledAt: null,
      actual: null,
      rescue: null,
      events: [{ type: 'started', at: '2026-09-17T10:00:00.000Z' }],
    } as unknown as ProductionRun;
    useProductionSessionStore.getState().clear();
    const repository = { getRun: vi.fn(async () => remote) };

    const result = await resumeProductionRun({
      run: run('run-server'),
      ownerUserId: OWNER,
      repository,
      loadSavedRecipe: async () => row,
    });
    expect(result).toEqual({ ok: true, to: '/pro/production' });
    expect(repository.getRun).toHaveBeenCalledWith('run-server', OWNER);
    expect(
      useProductionSessionStore.getState().selectedSessionIdByAddress[
        productionSessionAddressKey(address)
      ],
    ).toBe('run-server');
  });

  it('refuses honestly when the server plan differs, and selects no other run', async () => {
    useProductionSessionStore.getState().clear();
    const before = JSON.stringify(useProductionSessionStore.getState().sessionsById);
    const repository = {
      getRun: vi.fn(
        async () =>
          ({
            runId: 'run-other-plan',
            ownerUserId: OWNER,
            recipeId: RECIPE_ID,
            recipeVersionId: VERSION_ID,
            recipeVersionNumber: 2,
            status: 'in_progress',
            plannedItems: [
              {
                id: 'not-in-this-version',
                name: 'x',
                canonicalIngredientId: null,
                processScope: 'BASE_FORMULATION',
                scopePosition: 0,
                plannedGrams: 1,
                displayGrams: 1,
              },
            ],
            createdAt: '2026-09-17T10:00:00.000Z',
            actual: null,
            rescue: null,
            events: [],
          }) as unknown as ProductionRun,
      ),
    };
    const result = await resumeProductionRun({
      run: run('run-other-plan'),
      ownerUserId: OWNER,
      repository,
      loadSavedRecipe: async () => row,
    });
    expect(result).toEqual({ ok: false, reason: 'plan-differs' });
    expect(JSON.stringify(useProductionSessionStore.getState().sessionsById)).toBe(before);
    expect(useProductionSessionStore.getState().session).toBeNull();
  });

  it('reports a run that is no longer in progress', async () => {
    useProductionSessionStore.getState().clear();
    const result = await resumeProductionRun({
      run: run('run-gone'),
      ownerUserId: OWNER,
      repository: noServer,
      loadSavedRecipe: async () => row,
    });
    expect(result).toEqual({ ok: false, reason: 'run-missing' });
  });

  it('never opens another version when the run’s version cannot be read', async () => {
    repo.latestVersionNumber = 3;
    repo.readableVersions = new Set([3]);
    const result = await resumeProductionRun({
      run: run('run-r1'),
      ownerUserId: OWNER,
      repository: noServer,
      loadSavedRecipe: async () => row,
    });
    expect(result).toEqual({ ok: false, reason: 'version-mismatch' });
    expect(
      useProductionSessionStore.getState().selectedSessionIdByAddress[
        productionSessionAddressKey(address)
      ],
    ).toBeUndefined();
  });

  it('reports a recipe that is not on the account', async () => {
    const result = await resumeProductionRun({
      run: run('run-r1'),
      ownerUserId: OWNER,
      repository: noServer,
      loadSavedRecipe: async () => null,
    });
    expect(result).toEqual({ ok: false, reason: 'recipe-missing' });
  });
});
