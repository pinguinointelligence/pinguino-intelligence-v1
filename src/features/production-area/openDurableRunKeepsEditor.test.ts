/**
 * „Kontynuuj partię" must not cost the user their open recipe — Produkcja v3, Etap 2.
 *
 * The whole reason Production is run-centric rather than editor-centric is this: an
 * operator with an unsaved draft on screen taps a batch in „Partie" to carry on weighing,
 * and expects to come back to the draft they left. The earlier path could only open a
 * batch by loading its recipe VERSION into the workbench, which silently replaced that
 * draft — so continuing a batch had to be guarded by „stracisz niezapisane zmiany".
 *
 * This proves the new path takes nothing: the recipe store is byte-identical afterwards,
 * while the batch is hydrated under the RUN's own address from the run's frozen version.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRecipeStore } from '@/stores/recipeStore';
import { useProductionSessionStore } from '@/features/production-workspace/productionSessionStore';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { openDurableRun } from './openDurableRun';

const OWNER = 'owner-1';
const RECIPE_ID = 'recipe-1';
const VERSION_ID = 'version-1';
const RUN_ID = 'run-1';

const versionInput = () => {
  useRecipeStore.getState().startNewRecipe();
  return buildRecipeInput(useRecipeStore.getState(), 'planning');
};

const getVersion = vi.fn();
vi.mock('@/features/pro-core/proCoreRecipeRepo', () => ({
  resolveRecipesRepository: () => ({ repository: { getVersion: (...a: unknown[]) => getVersion(...a) } }),
}));

describe('„Kontynuuj partię" leaves the workbench alone', () => {
  beforeEach(() => {
    useProductionSessionStore.getState().clear();
    getVersion.mockReset();
  });

  const openRun = () =>
    openDurableRun({
      run: {
        runId: RUN_ID,
        recipeId: RECIPE_ID,
        recipeVersionId: VERSION_ID,
        recipeVersionNumber: 1,
      },
      ownerUserId: OWNER,
      repository: { getRun: async () => null },
      loadSavedRecipe: async () => ({ name: 'Receptura partii' }),
    });

  it('reads the run’s own version and writes nothing into the open recipe', async () => {
    const plannedInput = versionInput();
    // The user's own draft, with an edit that was never saved.
    useRecipeStore.getState().setTargetTemperature(-13);
    const draftBefore = JSON.stringify(useRecipeStore.getState());

    getVersion.mockResolvedValue({
      versionId: VERSION_ID,
      recipeId: RECIPE_ID,
      ownerUserId: OWNER,
      versionNumber: 1,
      recipeInput: plannedInput,
      productComposition: null,
    });

    await openRun();

    // The EXACT version of the run was asked for — never „the latest".
    expect(getVersion).toHaveBeenCalledWith(RECIPE_ID, 1);
    // And the open draft is untouched, which is the point of the whole change.
    expect(JSON.stringify(useRecipeStore.getState())).toBe(draftBefore);
    expect(useRecipeStore.getState().target_temperature_c).toBe(-13);
  });

  it('refuses a version that is not the one the run was planned from', async () => {
    const plannedInput = versionInput();
    const draftBefore = JSON.stringify(useRecipeStore.getState());
    getVersion.mockResolvedValue({
      versionId: 'another-version',
      recipeId: RECIPE_ID,
      ownerUserId: OWNER,
      versionNumber: 1,
      recipeInput: plannedInput,
      productComposition: null,
    });

    const result = await openRun();

    // No substitution and no batch — a different version would weigh different grams.
    expect(result).toEqual({ ok: false, reason: 'version-mismatch' });
    expect(useProductionSessionStore.getState().session).toBeNull();
    expect(JSON.stringify(useRecipeStore.getState())).toBe(draftBefore);
  });
});
