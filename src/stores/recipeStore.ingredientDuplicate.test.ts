import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findDemoIngredient } from '@/data/demoIngredients';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import type { EngineIngredient, RecipeInput, RecipeItem } from '@/engine';
import {
  useConstraintStudioStore,
  type ConstraintStudioState,
} from '@/features/constraint-studio/constraintStudioStore';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import { useRecipeStore, type RecipeState } from './recipeStore';

const pickerMilk = (): EngineIngredient => structuredClone(findDemoIngredient('milk_3_5')!);

const generatedMilk = (): EngineIngredient => ({
  ...pickerMilk(),
  id: 'PI-ING-000236',
  canonical_ingredient_id: 'PI-ING-000236',
  identity_provenance: 'mapper',
  name: 'MILK 3.2% · Milk · Chilled',
});

const generatedMilkLine = (overrides: Partial<RecipeItem> = {}): RecipeItem => ({
  id: 'generated-base-milk',
  ingredient: generatedMilk(),
  planned_grams: 620,
  actual_grams: null,
  lock_type: 'main',
  grams_constraint: { grams: 620 },
  ...overrides,
});

const draftWith = (items: RecipeItem[]): RecipeInput => ({
  ...starterMilkBase(),
  items,
  target_batch_grams: Math.max(
    1,
    items.reduce((sum, item) => sum + item.planned_grams, 0),
  ),
});

describe('canonical Base duplicate selection', () => {
  let priorRecipe: RecipeState;
  let priorConstraint: ConstraintStudioState;
  let priorProfile: ReturnType<typeof useRecipeProfileStore.getState>;

  beforeEach(() => {
    priorRecipe = useRecipeStore.getState();
    priorConstraint = useConstraintStudioStore.getState();
    priorProfile = useRecipeProfileStore.getState();
    useRecipeStore.setState({
      items: [],
      baseOrder: [],
      toppings: [],
      productBehaviorSnapshots: {},
      excludedIngredientIds: [],
      unavailableMainIngredientIds: [],
      dirty: false,
      draftRevision: 50,
    });
    useConstraintStudioStore.getState().resetForTests();
  });

  afterEach(() => {
    useRecipeStore.setState(priorRecipe, true);
    useConstraintStudioStore.setState(priorConstraint, true);
    useRecipeProfileStore.setState(priorProfile, true);
  });

  it('A — blocks the first picker retry when a generated Base already contains the product', () => {
    useRecipeStore.getState().loadRecipeInput(draftWith([generatedMilkLine()]));
    const before = useRecipeStore.getState();

    const result = before.addIngredient(pickerMilk(), 0);

    expect(result).toEqual({
      status: 'duplicate',
      lineId: 'generated-base-milk',
      canonicalId: 'PI-ING-000236',
    });
    expect(useRecipeStore.getState()).toBe(before);
    expect(useRecipeStore.getState().items).toHaveLength(1);
  });

  it('B — adds a manual product once and blocks the second selection', () => {
    const first = useRecipeStore.getState().addIngredient(pickerMilk(), 125);
    const afterFirst = useRecipeStore.getState();
    const second = afterFirst.addIngredient(pickerMilk(), 0);

    expect(first.status).toBe('added');
    expect(second).toEqual({
      status: 'duplicate',
      lineId: first.lineId,
      canonicalId: 'PI-ING-000236',
    });
    expect(useRecipeStore.getState()).toBe(afterFirst);
    expect(afterFirst.items).toHaveLength(1);
    expect(afterFirst.items[0]).toMatchObject({ planned_grams: 125 });
  });

  it('C — treats an existing 0 g line as selected and never creates a second row', () => {
    useRecipeStore.getState().loadRecipeInput(
      draftWith([
        generatedMilkLine({
          planned_grams: 0,
          lock_type: 'unlocked',
          grams_constraint: undefined,
        }),
      ]),
    );

    const result = useRecipeStore.getState().addIngredient(pickerMilk(), 300);

    expect(result.status).toBe('duplicate');
    expect(useRecipeStore.getState().items).toHaveLength(1);
    expect(useRecipeStore.getState().items[0]!.planned_grams).toBe(0);
  });

  it('D — keeps genuinely different milk products distinct', () => {
    const otherMilk: EngineIngredient = {
      ...pickerMilk(),
      id: 'PI-ING-000177',
      canonical_ingredient_id: 'PI-ING-000177',
      identity_provenance: 'mapper',
      name: 'GOAT MILK · Chilled',
    };

    const first = useRecipeStore.getState().addIngredient(pickerMilk(), 500);
    const second = useRecipeStore.getState().addIngredient(otherMilk, 200);

    expect(first.status).toBe('added');
    expect(second.status).toBe('added');
    expect(
      useRecipeStore.getState().items.map((item) => canonicalIngredientId(item.ingredient)),
    ).toEqual(['PI-ING-000236', 'PI-ING-000177']);
  });

  it('E — detects the same canonical product after save/load hydration', () => {
    const saved = draftWith([generatedMilkLine({ lock_type: 'already_added', actual_grams: 620 })]);
    useRecipeStore.getState().loadRecipeInput(structuredClone(saved), {
      savedId: 'hydrated-recipe',
      savedName: 'Hydrated Base',
      versionNumber: 4,
    });
    const hydrated = useRecipeStore.getState();

    const result = hydrated.addIngredient(pickerMilk(), 0);

    expect(result).toMatchObject({ status: 'duplicate', lineId: 'generated-base-milk' });
    expect(useRecipeStore.getState()).toBe(hydrated);
    expect(useRecipeStore.getState().savedRecipeId).toBe('hydrated-recipe');
  });

  it('F — serializes two rapid calls into one add and one duplicate result', () => {
    let notifications = 0;
    const unsubscribe = useRecipeStore.subscribe(() => {
      notifications += 1;
    });
    const revision = useRecipeStore.getState().draftRevision;

    const first = useRecipeStore.getState().addIngredient(pickerMilk(), 0);
    const second = useRecipeStore.getState().addIngredient(pickerMilk(), 0);
    unsubscribe();

    expect(first.status).toBe('added');
    expect(second).toMatchObject({ status: 'duplicate', lineId: first.lineId });
    expect(useRecipeStore.getState().items).toHaveLength(1);
    expect(useRecipeStore.getState().draftRevision).toBe(revision + 1);
    expect(notifications).toBe(1);
  });

  it('G — leaves recipe, mass, product authority, Preview and Undo history byte-stable', () => {
    useRecipeStore.getState().loadRecipeInput(draftWith([generatedMilkLine()]));
    const marker = { marker: 'keep-preview-and-undo' };
    const preview = marker as unknown as NonNullable<ConstraintStudioState['preview']>;
    const history = [marker] as unknown as ConstraintStudioState['history'];
    useConstraintStudioStore.setState({ preview, history });
    const beforeRecipe = useRecipeStore.getState();
    const beforeConstraint = useConstraintStudioStore.getState();
    const beforeProfile = useRecipeProfileStore.getState();
    const beforeMass = beforeRecipe.items.reduce((sum, item) => sum + item.planned_grams, 0);
    let notifications = 0;
    const unsubscribe = useRecipeStore.subscribe(() => {
      notifications += 1;
    });

    const result = beforeRecipe.addIngredient(pickerMilk(), 999);
    unsubscribe();

    expect(result.status).toBe('duplicate');
    expect(useRecipeStore.getState()).toBe(beforeRecipe);
    expect(useConstraintStudioStore.getState()).toBe(beforeConstraint);
    expect(useRecipeProfileStore.getState()).toBe(beforeProfile);
    expect(useConstraintStudioStore.getState().preview).toBe(preview);
    expect(useConstraintStudioStore.getState().history).toBe(history);
    expect(useRecipeStore.getState().items.reduce((sum, item) => sum + item.planned_grams, 0)).toBe(
      beforeMass,
    );
    expect(notifications).toBe(0);
  });

  it('keeps one Base and one Topping occurrence as separate valid scopes', () => {
    const base = useRecipeStore.getState().addIngredient(pickerMilk(), 500);
    useRecipeStore.getState().addTopping(pickerMilk(), 25);

    expect(base.status).toBe('added');
    expect(useRecipeStore.getState().items).toHaveLength(1);
    expect(useRecipeStore.getState().toppings).toHaveLength(1);
  });

  it('does not auto-clean historical duplicates and focuses the first visible row', () => {
    useRecipeStore.getState().loadRecipeInput(
      draftWith([
        generatedMilkLine(),
        generatedMilkLine({
          id: 'historical-second-milk',
          ingredient: pickerMilk(),
          planned_grams: 80,
          lock_type: 'unlocked',
          grams_constraint: undefined,
        }),
      ]),
    );
    useRecipeStore.setState({
      baseOrder: ['historical-second-milk', 'generated-base-milk'],
    });

    const result = useRecipeStore.getState().addIngredient(pickerMilk(), 40);

    expect(result).toMatchObject({ status: 'duplicate', lineId: 'historical-second-milk' });
    expect(useRecipeStore.getState().items).toHaveLength(2);
  });
});
