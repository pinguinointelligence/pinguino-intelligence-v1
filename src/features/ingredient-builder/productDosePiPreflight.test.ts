import { beforeEach, describe, expect, it } from 'vitest';
import { calculateRecipe } from '@/engine';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';
import {
  missingProductDosePreviewIssue,
  useConstraintStudioStore,
} from '@/features/constraint-studio/constraintStudioStore';
import { useIngredientTableUxStore } from './ingredientTableUxStore';

beforeEach(() => {
  useRecipeStore.getState().resetToDemo();
  useConstraintStudioStore.getState().resetForTests();
  useIngredientTableUxStore.getState().reset();
});

describe('PI product-dose preflight', () => {
  it('blocks a picker-owned zero-gram Base line with exact names and focus evidence', () => {
    const input = structuredClone(starterMilkBase());
    input.items[0] = { ...input.items[0]!, planned_grams: 0 };
    useRecipeStore.getState().loadRecipeInput(input);
    const tracked = useRecipeStore.getState().items[0]!;
    useIngredientTableUxStore.getState().setDoseMeta(tracked.id, {
      provenance: 'UNKNOWN',
      groupId: null,
      suggestedPercent: null,
      suggestedTotalGrams: null,
    });

    const before = buildRecipeInput(useRecipeStore.getState());
    useConstraintStudioStore.getState().createOptimizePreview();
    const after = useConstraintStudioStore.getState();

    expect(after.preview).toBeNull();
    expect(after.previewIssue).toEqual({
      ok: false,
      code: 'missing_required_role',
      role: 'product_dose',
      lineIds: [tracked.id],
      messagePl: `Podaj gramaturę dla:\n${tracked.ingredient.name}.\n\nMinimalna ilość to 1 g.`,
    });
    expect(after.recalculationTerminal).toEqual({
      state: 'PRODUCT_GRAMS_REQUIRED',
      code: 'missing_required_role',
      lineIds: [tracked.id],
    });
    expect(buildRecipeInput(useRecipeStore.getState())).toEqual(before);
  });

  it('blocks a legacy/template Base zero too — a selected Base product is never silent', () => {
    const input = structuredClone(starterMilkBase());
    input.items[0] = { ...input.items[0]!, planned_grams: 0 };
    expect(missingProductDosePreviewIssue(input)).toMatchObject({
      code: 'missing_required_role',
      role: 'product_dose',
      lineIds: [input.items[0]!.id],
    });
  });
});

describe('Topping 0 g remains outside Base', () => {
  it.each(['eco', 'optimal'] as const)('starts at 0 g in %s and leaves Engine input/results unchanged', (strategy) => {
    const input = structuredClone(starterMilkBase());
    input.goals = { ...input.goals, formulation_strategy: strategy };
    useRecipeStore.getState().loadRecipeInput(input);
    const beforeInput = buildRecipeInput(useRecipeStore.getState());
    const beforeResult = calculateRecipe(beforeInput);

    useRecipeStore.getState().addTopping(input.items[0]!.ingredient);

    expect(useRecipeStore.getState().toppings).toHaveLength(1);
    expect(useRecipeStore.getState().toppings[0]!.planned_grams).toBe(0);
    const afterInput = buildRecipeInput(useRecipeStore.getState());
    expect(afterInput).toEqual(beforeInput);
    expect(calculateRecipe(afterInput)).toEqual(beforeResult);
    expect(missingProductDosePreviewIssue(afterInput)).toBeNull();
  });
});
