import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecipeInput } from '@/engine';
import type { RecipesRepository } from '@/services/proCore/recipesRepository';
import {
  ensureDurableProductionRecipe,
  resetDurableProductionRecipeForTests,
} from './ensureDurableProductionRecipe';

/*
 * OD-24 (Owner 19.09.2026) — a HOME batch gets a durable run WITHOUT the customer being
 * made to save their recipe to the library first.
 *
 * The run keeps pointing at an immutable version, exactly as before; what this authority
 * adds is the technical, hidden snapshot that gives it one.
 */
const recipeInput = (grams = 1000): RecipeInput =>
  ({
    category: 'gelato',
    target_batch_grams: grams,
    target_temperature_c: -11,
    items: [
      { id: 'line-milk', ingredient: { name: 'MILK' }, planned_grams: grams * 0.6 },
      { id: 'line-sugar', ingredient: { name: 'SUCROSE SUGAR' }, planned_grams: grams * 0.12 },
    ],
  }) as unknown as RecipeInput;

const TRACE = { engineVersion: 'e1', configVersion: 'c1', mapperDatasetVersion: null };

function repositoryStub() {
  let sequence = 0;
  const createRecipe = vi.fn(async (args: Parameters<RecipesRepository['createRecipe']>[0]) => {
    sequence += 1;
    return {
      recipe: { recipeId: `recipe-${sequence}`, title: args.title } as never,
      version: { versionId: `version-${sequence}`, versionNumber: 1 } as never,
    };
  });
  return { createRecipe } as unknown as RecipesRepository & {
    createRecipe: ReturnType<typeof vi.fn>;
  };
}

const call = (
  repository: RecipesRepository,
  patch: Partial<Parameters<typeof ensureDurableProductionRecipe>[0]> = {},
) =>
  ensureDurableProductionRecipe({
    repository,
    ownerUserId: 'owner-1',
    recipeInput: recipeInput(),
    productComposition: null,
    title: 'Truskawkowe',
    capabilities: {} as never,
    trace: TRACE,
    existing: { recipeId: null, versionId: null, versionNumber: null, matchesCurrentRecipe: false },
    ...patch,
  });

describe('OD24-SNAPSHOT — a durable recipe reference without a library save', () => {
  beforeEach(() => {
    resetDurableProductionRecipeForTests();
  });

  it('OD24-SNAPSHOT-A a HOME draft with no saved version gets a snapshot and a version', async () => {
    const repository = repositoryStub();
    const durable = await call(repository);
    expect(durable).toEqual({
      recipeId: 'recipe-1',
      versionId: 'version-1',
      versionNumber: 1,
      created: true,
    });
    expect(repository.createRecipe).toHaveBeenCalledTimes(1);
  });

  it('OD24-SNAPSHOT-B the snapshot is written as production_snapshot / starter_draft, never a library save', async () => {
    const repository = repositoryStub();
    await call(repository);
    const args = repository.createRecipe.mock.calls[0]![0];
    // „Receptury → Moje" lists `library` rows; this one is infrastructure for a run.
    expect(args.origin).toBe('production_snapshot');
    expect(args.source).toBe('starter_draft');
  });

  it('OD24-SNAPSHOT-C an existing durable version that still matches is REUSED — no second row', async () => {
    const repository = repositoryStub();
    const durable = await call(repository, {
      existing: {
        recipeId: 'recipe-saved',
        versionId: 'version-saved',
        versionNumber: 3,
        matchesCurrentRecipe: true,
      },
    });
    expect(durable).toEqual({
      recipeId: 'recipe-saved',
      versionId: 'version-saved',
      versionNumber: 3,
      created: false,
    });
    expect(repository.createRecipe).not.toHaveBeenCalled();
  });

  it('OD24-SNAPSHOT-D a durable version that no longer matches the recipe gets a NEW version', async () => {
    // H4-9: a repeat of a CHANGED recipe is a new version, never the old one relabelled.
    const repository = repositoryStub();
    const durable = await call(repository, {
      existing: {
        recipeId: 'recipe-saved',
        versionId: 'version-saved',
        versionNumber: 3,
        matchesCurrentRecipe: false,
      },
    });
    expect(durable.created).toBe(true);
    expect(durable.versionId).toBe('version-1');
    expect(repository.createRecipe).toHaveBeenCalledTimes(1);
  });

  it('OD24-SNAPSHOT-E a double tap creates ONE snapshot — both callers get the same answer', async () => {
    const repository = repositoryStub();
    const [first, second] = await Promise.all([call(repository), call(repository)]);
    expect(repository.createRecipe).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it('OD24-SNAPSHOT-F a SECOND batch of the same unchanged recipe reuses the SAME version', async () => {
    /* Owner 19.09: a deliberate second batch gets a new run and a new LOT, but NOT a new
       snapshot — the recipe did not change, so the version it was made from did not
       either. Batch one writes the snapshot; batch two starts from it. */
    const repository = repositoryStub();
    const first = await call(repository);
    expect(first.created).toBe(true);

    const second = await call(repository, {
      existing: {
        recipeId: first.recipeId,
        versionId: first.versionId,
        versionNumber: first.versionNumber,
        matchesCurrentRecipe: true,
      },
    });
    expect(second).toEqual({ ...first, created: false });
    expect(repository.createRecipe).toHaveBeenCalledTimes(1);
  });

  it('OD24-SNAPSHOT-F2 a recipe with no durable reference at all still gets one on the next entry', async () => {
    // Not the second-batch case: nothing durable exists yet, so there is nothing to reuse.
    const repository = repositoryStub();
    await call(repository);
    await call(repository);
    expect(repository.createRecipe).toHaveBeenCalledTimes(2);
  });

  it('OD24-SNAPSHOT-G a failure does not poison the door — the next attempt tries again', async () => {
    const failing = {
      createRecipe: vi
        .fn()
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValueOnce({
          recipe: { recipeId: 'recipe-2' } as never,
          version: { versionId: 'version-2', versionNumber: 1 } as never,
        }),
    } as unknown as RecipesRepository & { createRecipe: ReturnType<typeof vi.fn> };
    await expect(call(failing)).rejects.toThrow('network');
    const durable = await call(failing);
    expect(durable.recipeId).toBe('recipe-2');
    expect(failing.createRecipe).toHaveBeenCalledTimes(2);
  });

  it('OD24-SNAPSHOT-H two different recipe states never share one snapshot', async () => {
    const repository = repositoryStub();
    const [small, large] = await Promise.all([
      call(repository, { recipeInput: recipeInput(500) }),
      call(repository, { recipeInput: recipeInput(1500) }),
    ]);
    expect(repository.createRecipe).toHaveBeenCalledTimes(2);
    expect(small.versionId).not.toBe(large.versionId);
  });

  it('OD24-SNAPSHOT-I the run’s own recipe travels with it — the snapshot carries the final input', async () => {
    const repository = repositoryStub();
    await call(repository, { recipeInput: recipeInput(1340) });
    const args = repository.createRecipe.mock.calls[0]![0];
    expect(args.recipeInput.target_batch_grams).toBe(1340);
    expect(args.ownerUserId).toBe('owner-1');
  });
});
