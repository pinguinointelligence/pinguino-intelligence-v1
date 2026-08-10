import { describe, expect, it } from 'vitest';
import { recipePersistPartialize, useRecipeStore, type RecipeState } from './recipeStore';
import { findDemoIngredient } from '@/data/demoIngredients';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import {
  selectCanonicalDraft,
  useConstraintStudioStore,
} from '@/features/constraint-studio/constraintStudioStore';
import { useIngredientTableUxStore } from '@/features/ingredient-builder/ingredientTableUxStore';

const state = {
  mode: 'classic',
  formulation_strategy: 'eco',
  category: 'milk_gelato',
  target_temperature_c: -11,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  flavor_intensity: 'balanced',
  cost_priority: 'balanced',
  items: [{ id: 'line-1' }],
  target_protein_percent: 22.4,
  direction_targets: { sweetness: -1, softness: 1, creaminess: 0, flavor: 0 },
  direction_targets_active: true,
  activePresetId: 'milk-base',
  savedRecipeId: 'aggregate-42',
  savedRecipeName: 'Moja receptura',
  currentVersionNumber: 3,
  dirty: true,
} as unknown as RecipeState;

describe('recipePersistPartialize', () => {
  it('PERSISTS the canonical aggregate link (S2 repair — version continuity survives reload)', () => {
    // The link is persisted so the next save appends v(n+1) to the SAME aggregate instead of a
    // new v1. Stale ids are safe: the adapter re-reads the DB-authoritative version and fails
    // honestly if the aggregate is gone (see supabaseRecipes.saveNewVersion).
    const persisted = recipePersistPartialize(state) as Record<string, unknown>;
    expect(persisted.savedRecipeId).toBe('aggregate-42');
    expect(persisted.savedRecipeName).toBe('Moja receptura');
    expect(persisted.currentVersionNumber).toBe(3);
    expect(persisted.dirty).toBe(true);
  });

  it('still persists the in-progress recipe content + preset highlight', () => {
    const persisted = recipePersistPartialize(state);
    expect(persisted.mode).toBe('classic');
    expect(persisted.formulation_strategy).toBe('eco');
    expect(persisted.category).toBe('milk_gelato');
    expect(persisted.items).toBe(state.items);
    expect(persisted.activePresetId).toBe('milk-base');
    expect(persisted.target_batch_grams).toBe(1000);
    expect(persisted.target_protein_percent).toBe(22.4);
    expect(persisted.direction_targets).toEqual({
      sweetness: -1,
      softness: 1,
      creaminess: 0,
      flavor: 0,
    });
    expect(persisted.direction_targets_active).toBe(true);
  });
});

describe('recipe direction target store contract', () => {
  it('uses exact three-state targets and invalidates Preview material state once per move', () => {
    const prior = useRecipeStore.getState();
    try {
      useRecipeStore.setState({
        direction_targets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
        direction_targets_active: false,
        dirty: false,
        draftRevision: 70,
      });
      useRecipeStore.getState().moveDirectionTarget('sweetness', 1);
      expect(useRecipeStore.getState()).toMatchObject({
        direction_targets: { sweetness: 1, softness: 0, creaminess: 0, flavor: 0 },
        direction_targets_active: true,
        dirty: true,
        draftRevision: 71,
      });
      useRecipeStore.getState().moveDirectionTarget('sweetness', 1);
      expect(useRecipeStore.getState().direction_targets.sweetness).toBe(1);
      expect(useRecipeStore.getState().draftRevision).toBe(71);
    } finally {
      useRecipeStore.setState(prior, true);
    }
  });
});

describe('formulation strategy store contract', () => {
  it('changes strategy without changing Engine mode and invalidates the draft exactly once', () => {
    const prior = useRecipeStore.getState();
    try {
      useRecipeStore.setState({
        mode: 'classic',
        formulation_strategy: 'optimal',
        dirty: false,
        draftRevision: 40,
      });
      useRecipeStore.getState().setFormulationStrategy('eco');
      const next = useRecipeStore.getState();
      expect(next.formulation_strategy).toBe('eco');
      expect(next.mode).toBe('classic');
      expect(next.dirty).toBe(true);
      expect(next.draftRevision).toBe(41);
    } finally {
      useRecipeStore.setState(prior, true);
    }
  });
});

describe('saved range and availability sidecars', () => {
  it('survives save → reopen with the exact line range and canonical exclusion', () => {
    const priorRecipe = useRecipeStore.getState();
    const priorConstraint = useConstraintStudioStore.getState();
    try {
      useRecipeStore.setState({
        ...priorRecipe,
        items: [],
        excludedIngredientIds: [],
        unavailableMainIngredientIds: [],
        draftRevision: 0,
      });
      useConstraintStudioStore.getState().resetForTests();
      useRecipeStore.getState().addIngredient(findDemoIngredient('milk_3_5')!, 600);
      useRecipeStore.getState().addIngredient(findDemoIngredient('sucrose')!, 400);
      const [milk, sucrose] = useRecipeStore.getState().items;
      expect(
        useConstraintStudioStore.getState().setRangeConstraint(milk!.id, 550, 650).ok,
      ).toBe(true);
      useRecipeStore.getState().setIngredientUnavailable(sucrose!.id, true);

      const saved = buildRecipeInput(useRecipeStore.getState());
      expect(saved.items.find((item) => item.id === milk!.id)?.range_constraint).toEqual({
        min_grams: 550,
        max_grams: 650,
      });
      expect(saved.goals?.excluded_ingredient_ids).toContain(
        sucrose!.ingredient.canonical_ingredient_id,
      );

      useRecipeStore.getState().loadRecipeInput(structuredClone(saved), {
        savedId: 'range-recipe',
        savedName: 'Zakres',
        versionNumber: 2,
      });
      useConstraintStudioStore.getState().resetDraftSession();
      expect(selectCanonicalDraft().constraints.byLineId[milk!.id]).toEqual({
        mode: 'range',
        minGrams: 550,
        maxGrams: 650,
      });
      expect(useRecipeStore.getState().excludedIngredientIds).toContain(
        sucrose!.ingredient.canonical_ingredient_id,
      );
    } finally {
      useRecipeStore.setState(priorRecipe, true);
      useConstraintStudioStore.setState(priorConstraint, true);
    }
  });
});

describe('ingredient-table draft isolation', () => {
  it('drops unresolved Required metadata when another recipe is opened', () => {
    const priorRecipe = useRecipeStore.getState();
    const priorUx = useIngredientTableUxStore.getState();
    try {
      useIngredientTableUxStore.getState().markRequiredRemoved('recipe-a-line', 'Private A');
      expect(useIngredientTableUxStore.getState().unresolvedRequiredByLineId).not.toEqual({});

      useRecipeStore.getState().loadRecipeInput(buildRecipeInput(priorRecipe), {
        savedId: 'recipe-b',
        savedName: 'Recipe B',
        versionNumber: 1,
      });

      expect(useIngredientTableUxStore.getState().unresolvedRequiredByLineId).toEqual({});
      expect(useIngredientTableUxStore.getState().metaByLineId).toEqual({});
    } finally {
      useRecipeStore.setState(priorRecipe, true);
      useIngredientTableUxStore.setState(priorUx, true);
    }
  });
});
