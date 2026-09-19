/**
 * DESIGN V3.0 Version 10 §H1b — „Reset".
 *
 * OWNER CORRECTION 19.09.2026: „Reset" is a RENAME of PRO's „+ Nowa receptura" and nothing
 * else. Test users who were already inside recipe creation could not tell what „Nowa receptura"
 * offered them; „Reset" they read correctly at once — discard what I am doing, start again.
 *
 * So the thing these cases guard is a NEGATIVE: the action must not have grown. It clears what
 * „Nowa receptura" cleared — the working recipe, the staged calculation, the batch — and nothing
 * else. HOME additionally clears HOME's own draft, on HOME's own screen, exactly as it did
 * before the rename; PRO has no business touching it.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { useHomeDraftStore } from '@/features/home-creator/homeDraftStore';
import { useIngredientTableUxStore } from '@/features/ingredient-builder/ingredientTableUxStore';
import { useProductionSessionStore } from '@/features/production-workspace/productionSessionStore';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { resetWorkspaceToFreshStart, startNewProRecipe } from './startNewProRecipe';

const chip = { id: 'chip-truskawka', label: 'truskawka' } as never;

const loadSavedRecipe = () => {
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
};

describe('H1b — „Reset" is the old „Nowa receptura", renamed', () => {
  beforeEach(() => {
    useRecipeProfileStore.getState().resetForTests();
    useRecipeStore.getState().resetToDemo();
    useConstraintStudioStore.getState().resetDraftSession();
    useProductionSessionStore.getState().clear();
    useIngredientTableUxStore.getState().reset();
    useHomeDraftStore.getState().startNew();
  });

  it('H1B-RESET-A it clears exactly what the old action cleared', () => {
    loadSavedRecipe();

    resetWorkspaceToFreshStart();

    const after = useRecipeStore.getState();
    expect(after.savedRecipeId).toBeNull();
    expect(after.currentVersionNumber).toBeNull();
    expect(after.dirty).toBe(false);
    expect(useConstraintStudioStore.getState().proCoreRecipeId).toBeNull();
    expect(useProductionSessionStore.getState().session).toBeNull();
  });

  it('H1B-RESET-B PRO’s Reset does NOT reach into HOME’s idea', () => {
    /* THE regression this file exists for. A „Reset" that also wiped HOME's chips, profile
       answers and draft id would be a different, wider action wearing the same name — the
       owner's correction is that it is a rename, not a new feature. */
    useHomeDraftStore.setState({ chips: [chip], recipeReady: true, profile: 'gelato' } as never);
    const draftId = useHomeDraftStore.getState().draftId;
    loadSavedRecipe();

    resetWorkspaceToFreshStart();

    const draft = useHomeDraftStore.getState();
    expect(draft.chips).toEqual([chip]);
    expect(draft.recipeReady).toBe(true);
    expect(draft.profile).toBe('gelato');
    expect(draft.draftId).toBe(draftId);
  });

  it('H1B-RESET-C it is the same door „Nowa receptura" opened, not a second one', () => {
    // Same starting state, two names: the resulting store state must be indistinguishable.
    loadSavedRecipe();
    resetWorkspaceToFreshStart();
    const viaReset = JSON.stringify(useRecipeStore.getState().items);
    const studioViaReset = useConstraintStudioStore.getState().proCoreRecipeId;

    useRecipeStore.getState().resetToDemo();
    useConstraintStudioStore.getState().resetDraftSession();
    loadSavedRecipe();
    startNewProRecipe();

    expect(JSON.stringify(useRecipeStore.getState().items)).toBe(viaReset);
    expect(useConstraintStudioStore.getState().proCoreRecipeId).toBe(studioViaReset);
  });

  it('H1B-RESET-D HOME clears HOME’s own draft itself, on its own screen', () => {
    /* HOME's „Reset" has always cleared the idea as well — that is HOME's own surface state,
       cleared by HOME's own handler (`resetToEmptyStart`), not by the shared door. */
    const page = readFileSync('src/pages/home/HomeCreatorPage.tsx', 'utf8');
    const reset = page.slice(
      page.indexOf('const resetToEmptyStart = () => {'),
      page.indexOf('/** §35'),
    );
    expect(reset).toContain('resetWorkspaceToFreshStart(');
    expect(reset).toContain('useHomeDraftStore.getState().startNew();');
  });
});
