/**
 * SOL-041 regression: batch rescale must hand every PRO formulation family an
 * executable stabilizer hold through that family's authority. The historical
 * store helper was owner-named but called Sorbet-only selectors, so Gelato,
 * Vegan and Protein retained a fractional stabilizer after 1000 -> 670 g.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { findDemoIngredient } from '@/data/demoIngredients';
import type { ProductCategory } from '@/engine';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { withTemplateControlledStabilizerLocks } from '@/features/formulation/stabilizerDosage';
import { resolveFunctionalRole } from '@/features/formulation/ingredientRoles';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import type { VisibleProductType } from '@/features/studio/productType';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from './recipeStore';

const CASES: ReadonlyArray<{
  visible: VisibleProductType;
  category: ProductCategory;
  sourceStabilizerGrams: number;
  resizedStabilizerGrams: number;
}> = [
  {
    visible: 'gelato',
    category: 'milk_gelato',
    sourceStabilizerGrams: 3,
    resizedStabilizerGrams: 2,
  },
  { visible: 'sorbet', category: 'sorbet', sourceStabilizerGrams: 4, resizedStabilizerGrams: 3 },
  {
    visible: 'vegan',
    category: 'vegan_gelato',
    sourceStabilizerGrams: 2,
    resizedStabilizerGrams: 1,
  },
  {
    visible: 'protein',
    category: 'protein_gelato',
    sourceStabilizerGrams: 2,
    resizedStabilizerGrams: 1,
  },
];

const stabilizers = () =>
  useRecipeStore
    .getState()
    .items.filter((item) => resolveFunctionalRole(item.ingredient) === 'stabilizer');

const makeSorbetMainExecutable = () => {
  const state = useRecipeStore.getState();
  if (state.visibleProductType !== 'sorbet' || state.starterReservedMainGrams <= 0) return;
  const added = state.addIngredient(
    findDemoIngredient('raspberry')!,
    state.starterReservedMainGrams,
  );
  useRecipeStore.getState().setLockType(added.lineId, 'main');
};

describe('SOL-041 — role-aware stabilizer rescale', () => {
  beforeEach(() => {
    useRecipeProfileStore.getState().resetForTests();
    useRecipeStore.getState().resetToDemo();
    useConstraintStudioStore.getState().resetForTests();
  });

  it.each(CASES)(
    'BASIC-PRO-001 $visible: 1000 -> 670 produces a whole-gram heldGrams contract',
    ({ visible, category, sourceStabilizerGrams, resizedStabilizerGrams }) => {
      useRecipeStore.getState().startNewRecipe(visible);
      expect(useRecipeStore.getState().category).toBe(category);
      expect(useRecipeStore.getState().target_batch_grams).toBe(1_000);
      expect(stabilizers()).toHaveLength(1);
      expect(stabilizers()[0]!.planned_grams).toBe(sourceStabilizerGrams);

      const ordinaryBefore = useRecipeStore
        .getState()
        .items.filter((item) => resolveFunctionalRole(item.ingredient) !== 'stabilizer')
        .map((item) => ({ id: item.id, grams: item.planned_grams }));
      const ordinaryBeforeTotal = ordinaryBefore.reduce((sum, item) => sum + item.grams, 0);

      expect(useRecipeStore.getState().setBatchGrams(670)).toEqual({ ok: true });

      const resizedStabilizers = stabilizers();
      expect(resizedStabilizers).toHaveLength(1);
      expect(resizedStabilizers[0]!.planned_grams).toBe(resizedStabilizerGrams);
      expect(Number.isInteger(resizedStabilizers[0]!.planned_grams)).toBe(true);

      const ordinaryAfter = useRecipeStore
        .getState()
        .items.filter((item) => resolveFunctionalRole(item.ingredient) !== 'stabilizer');
      const ordinaryAfterTotal = ordinaryAfter.reduce((sum, item) => sum + item.planned_grams, 0);
      ordinaryAfter.forEach((item, index) => {
        expect(item.id).toBe(ordinaryBefore[index]!.id);
        expect(item.planned_grams / ordinaryAfterTotal).toBeCloseTo(
          ordinaryBefore[index]!.grams / ordinaryBeforeTotal,
          10,
        );
      });

      const resized = buildRecipeInput(useRecipeStore.getState());
      const held = withTemplateControlledStabilizerLocks(resized, { byLineId: {} });
      expect(held.byLineId[resizedStabilizers[0]!.id]).toEqual({
        mode: 'locked',
        grams: resizedStabilizers[0]!.planned_grams,
      });
      expect(
        Number.isInteger((held.byLineId[resizedStabilizers[0]!.id] as { grams: number }).grams),
      ).toBe(true);
    },
  );

  it.each(CASES)(
    'BASIC-PRO-001 $visible: keeps user locks, Main and Topping; repeat resize is idempotent',
    ({ visible }) => {
      useRecipeStore.getState().startNewRecipe(visible);
      makeSorbetMainExecutable();

      const main = useRecipeStore
        .getState()
        .items.find((item) => resolveFunctionalRole(item.ingredient) !== 'stabilizer')!;
      useRecipeStore.getState().setLockType(main.id, 'main');
      const locked = useRecipeStore
        .getState()
        .items.find(
          (item) => item.id !== main.id && resolveFunctionalRole(item.ingredient) !== 'stabilizer',
        )!;
      const lockedGrams = locked.planned_grams;
      useRecipeStore.getState().setGramLock(locked.id, lockedGrams);
      useRecipeStore.getState().addTopping(findDemoIngredient('raspberry')!, 17);
      const toppingBefore = structuredClone(useRecipeStore.getState().toppings);

      expect(useRecipeStore.getState().setBatchGrams(670)).toEqual({ ok: true });
      const after = useRecipeStore.getState();
      expect(after.items.find((item) => item.id === locked.id)).toMatchObject({
        planned_grams: lockedGrams,
        grams_constraint: { grams: lockedGrams },
      });
      expect(after.items.find((item) => item.id === main.id)?.lock_type).toBe('main');
      expect(after.toppings).toEqual(toppingBefore);
      expect(stabilizers().every((item) => Number.isInteger(item.planned_grams))).toBe(true);
      expect(after.items.reduce((sum, item) => sum + item.planned_grams, 0)).toBeCloseTo(670, 8);

      const firstResize = structuredClone(after.items);
      expect(useRecipeStore.getState().setBatchGrams(670)).toEqual({ ok: true });
      expect(useRecipeStore.getState().items).toEqual(firstResize);
      expect(useRecipeStore.getState().toppings).toEqual(toppingBefore);
    },
  );

  it.each(CASES)(
    'BASIC-PRO-001 $visible: an explicit stabilizer gram lock stays authoritative',
    ({ visible, sourceStabilizerGrams }) => {
      useRecipeStore.getState().startNewRecipe(visible);
      const stabilizer = stabilizers()[0]!;
      useRecipeStore.getState().setGramLock(stabilizer.id, sourceStabilizerGrams);

      expect(useRecipeStore.getState().setBatchGrams(670)).toEqual({ ok: true });
      expect(
        useRecipeStore.getState().items.find((item) => item.id === stabilizer.id),
      ).toMatchObject({
        planned_grams: sourceStabilizerGrams,
        grams_constraint: { grams: sourceStabilizerGrams },
      });
    },
  );

  it.each(CASES)(
    'BASIC-PRO-001 $visible: batch Preview -> Apply keeps whole grams and Undo is byte-exact',
    ({ visible }) => {
      useRecipeStore.getState().startNewRecipe(visible);
      makeSorbetMainExecutable();
      useRecipeStore.setState({ direction_targets_active: false });
      useConstraintStudioStore.getState().resetForTests();
      const before = structuredClone(buildRecipeInput(useRecipeStore.getState()));

      useConstraintStudioStore.getState().createBatchRescalePreview(670);
      const preview = useConstraintStudioStore.getState().preview;
      expect(useConstraintStudioStore.getState().previewIssue).toBeNull();
      expect(preview).not.toBeNull();
      expect(
        preview!.proposedInput.items
          .filter((item) => resolveFunctionalRole(item.ingredient) === 'stabilizer')
          .every((item) => Number.isInteger(item.planned_grams)),
      ).toBe(true);

      const firstProposal = structuredClone(preview!.proposedInput);
      useConstraintStudioStore.getState().createBatchRescalePreview(670);
      expect(useConstraintStudioStore.getState().previewIssue).toBeNull();
      expect(useConstraintStudioStore.getState().preview?.proposedInput).toEqual(firstProposal);

      useConstraintStudioStore.getState().applyPreview();
      expect(useConstraintStudioStore.getState().blocked).toBeNull();
      expect(buildRecipeInput(useRecipeStore.getState()).target_batch_grams).toBe(670);
      expect(stabilizers().every((item) => Number.isInteger(item.planned_grams))).toBe(true);

      useConstraintStudioStore.getState().undoLastApply();
      expect(buildRecipeInput(useRecipeStore.getState())).toEqual(before);
    },
  );
});
