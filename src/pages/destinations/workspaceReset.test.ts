/**
 * DESIGN V3.0 Version 10 §H1b — „Reset": ONE clean start for the whole workspace.
 *
 * The point of these cases is the sentence the owner wrote: „Po Reset HOME/PRO ma być
 * semantycznie w takim stanie, jak po świeżym wejściu do workspace. Nie może brać niczego
 * ze starej receptury." HOME and PRO are two presentations of the SAME live recipe, so the
 * reset that one of them offers has to leave the other with nothing to inherit either.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { useHomeDraftStore } from '@/features/home-creator/homeDraftStore';
import { useIngredientTableUxStore } from '@/features/ingredient-builder/ingredientTableUxStore';
import { useProductionSessionStore } from '@/features/production-workspace/productionSessionStore';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { resetWorkspaceToFreshStart, workspaceHasResettableState } from './startNewProRecipe';

const chip = { id: 'chip-truskawka', label: 'truskawka' } as never;

describe('H1b — Reset is one clean start for HOME and PRO', () => {
  beforeEach(() => {
    useRecipeProfileStore.getState().resetForTests();
    useRecipeStore.getState().resetToDemo();
    useConstraintStudioStore.getState().resetDraftSession();
    useProductionSessionStore.getState().clear();
    useIngredientTableUxStore.getState().reset();
    useHomeDraftStore.getState().startNew();
  });

  it('H1B-RESET-A an untouched workspace has nothing to reset', () => {
    // Empty HOME: the action stays on screen, quietly, instead of promising a no-op.
    expect(workspaceHasResettableState()).toBe(false);
  });

  it('H1B-RESET-B a HOME idea alone is enough to make Reset mean something', () => {
    useHomeDraftStore.setState({ chips: [chip] });
    expect(workspaceHasResettableState()).toBe(true);
  });

  it('H1B-RESET-C an edited PRO recipe alone is enough as well', () => {
    useRecipeStore.setState({ dirty: true });
    expect(workspaceHasResettableState()).toBe(true);
  });

  it('H1B-RESET-D Reset from PRO leaves no HOME state behind (route HOME → PRO → Reset)', () => {
    useHomeDraftStore.setState({ chips: [chip], recipeReady: true, profile: 'gelato' } as never);
    const before = useHomeDraftStore.getState().draftId;

    resetWorkspaceToFreshStart();

    const draft = useHomeDraftStore.getState();
    expect(draft.chips).toEqual([]);
    expect(draft.recipeReady).toBe(false);
    expect(draft.profile).toBeNull();
    // A new draft id is what the start screen keys its own state on — the chosen source,
    // the library view and a picked recipe all go with it.
    expect(draft.draftId).not.toBe(before);
  });

  it('H1B-RESET-E Reset from HOME leaves no PRO state behind (PRO → HOME → Reset)', () => {
    const recipe = useRecipeStore.getState();
    recipe.loadRecipeInput(
      {
        items: recipe.items.map((item) => ({ ...item, ingredient: { ...item.ingredient } })),
        mode: recipe.mode,
        category: recipe.category,
        target_temperature_c: recipe.target_temperature_c,
        target_batch_grams: 875,
        machine_capacity_grams: recipe.machine_capacity_grams,
      },
      { savedId: 'saved-old', savedName: 'Nie zmieniaj', versionNumber: 4 },
    );
    useRecipeStore.setState({ dirty: true });

    resetWorkspaceToFreshStart();

    const after = useRecipeStore.getState();
    expect(after.savedRecipeId).toBeNull();
    expect(after.currentVersionNumber).toBeNull();
    expect(after.dirty).toBe(false);
    expect(useConstraintStudioStore.getState().proCoreRecipeId).toBeNull();
    expect(useProductionSessionStore.getState().session).toBeNull();
  });

  it('H1B-RESET-F after Reset there is nothing left to reset', () => {
    useHomeDraftStore.setState({ chips: [chip] });
    useRecipeStore.setState({ dirty: true });

    resetWorkspaceToFreshStart();

    expect(workspaceHasResettableState()).toBe(false);
  });
});
