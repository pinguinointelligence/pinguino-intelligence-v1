/**
 * PC-02 — changing the batch must not manufacture an authority-invalid
 * stabilizer system.
 *
 * `resizeRecipeBatch` scales every flexible line by one proportional factor.
 * The owner-approved Sorbet stabilizer system is not an ordinary line: it is
 * capped at a PERCENTAGE of the batch that rounds INWARD to whole grams
 * (`SORBET_STABILIZER_SYSTEM_POLICY`, `gramSemantics: 'whole_grams'`). A
 * proportional factor produces fractional grams, and because the ceiling floors
 * while the mass does not, shrinking the batch also lands ABOVE the new
 * ceiling — a legal 5 g system at 1000 g becomes 3.35 g against a 3 g ceiling
 * at 670 g, the Ninja CREAMi Deluxe capacity.
 *
 * Every fixture here is built through the customer's own doors — the starter,
 * `addIngredient`, a gram edit — never by constructing a `RecipeInput`. The
 * originally recorded PC-02 exemplar (34 g of stabilizer) was assembled that
 * way and is not reachable: `addIngredient` clamps it. This file only asserts
 * states a customer can actually reach.
 *
 * The band is never written down here as a number: it is read from the
 * authority, so the percentage stays the only rule.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { findDemoIngredient } from '@/data/demoIngredients';
import type { EngineIngredient } from '@/engine';
import {
  NINJA_CREAMI_DELUXE_NC502EU,
  deriveMachineSetup,
} from '@/features/machine-catalog';
import {
  assessSorbetStabilizerSystem,
  evaluateRecipeConstraintAuthority,
  sorbetStabilizerSystemItems,
  sorbetStabilizerWholeGramBand,
} from '@/features/recipe-constraints';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from './recipeStore';

/** A second real stabilizer, standing in for the VITACEL CITRUS FIBER of the
 *  PC-02 forensic: the demo library ships exactly one stabilizer, and the
 *  defect only shows itself when the system has more than one component. */
const SECOND_STABILIZER: EngineIngredient = {
  ...findDemoIngredient('tara_gum')!,
  id: 'pc02_second_stabilizer',
  canonical_ingredient_id: 'pc02_second_stabilizer',
  name: 'CITRUS FIBER · Stabilizer',
};

const state = () => useRecipeStore.getState();
const input = () => buildRecipeInput(state());
const stabilizers = () => sorbetStabilizerSystemItems(state().items);
const stabilizerGrams = () => stabilizers().map((item) => item.planned_grams);
const stabilizerTotal = () => stabilizerGrams().reduce((sum, grams) => sum + grams, 0);
const sum = () => state().items.reduce((total, item) => total + item.planned_grams, 0);

const ownerPolicyIssues = () =>
  evaluateRecipeConstraintAuthority({
    recipe: input(),
    snapshots: {},
    module: 'OPTIMAL',
    requireProductBehavior: false,
  }).issues.filter((issue) => issue.source === 'owner_policy');

/**
 * A legal 1000 g Sorbet carrying a two-component stabilizer system at exactly
 * the ceiling — reached only through product doors. The starter opens with
 * TARA GUM 4 g; dropping it to 2 g leaves room for a 3 g second component,
 * which `addIngredient`'s own clamp then allows.
 */
const legalThousandGramSorbet = () => {
  useRecipeStore.getState().startNewRecipe('sorbet');
  const tara = state().items.find((item) => item.ingredient.id === 'tara_gum');
  useRecipeStore.getState().setPlannedGrams(tara!.id, 2);
  const added = useRecipeStore.getState().addIngredient(SECOND_STABILIZER, 3);
  expect(added.status).toBe('added');
  // Make the draft sum exactly one batch, the way a customer balancing the
  // water line would.
  const water = state().items.find((item) => item.ingredient.id === 'water');
  useRecipeStore
    .getState()
    .setPlannedGrams(water!.id, water!.planned_grams + (1000 - sum()));
};

describe('PC-02 — batch rescale keeps the Sorbet stabilizer system canonical', () => {
  beforeEach(() => {
    legalThousandGramSorbet();
  });

  it('0. the starting point is a genuinely legal 1000 g system at the ceiling', () => {
    expect(state().target_batch_grams).toBe(1000);
    expect(sum()).toBeCloseTo(1000, 6);
    expect(stabilizerGrams()).toEqual([2, 3]);
    expect(stabilizerTotal()).toBe(sorbetStabilizerWholeGramBand(1000).maxGrams);
    expect(assessSorbetStabilizerSystem(input()).issues).toEqual([]);
    expect(ownerPolicyIssues()).toEqual([]);
  });

  /** The four owner-named batches. 670 g is the Ninja CREAMi Deluxe capacity —
   *  a real supported HOME machine, and the reason this is customer-reachable. */
  for (const target of [670, 500, 250, 2000]) {
    it(`1. 1000 g → ${target} g stays whole-grammed, inside the band and authority-valid`, () => {
      const band = sorbetStabilizerWholeGramBand(target);
      expect(useRecipeStore.getState().setBatchGrams(target)).toEqual({ ok: true });

      expect(state().target_batch_grams).toBe(target);
      expect(sum()).toBeCloseTo(target, 6);
      for (const grams of stabilizerGrams()) {
        expect(Number.isInteger(grams)).toBe(true);
        expect(grams).toBeGreaterThanOrEqual(0);
      }
      expect(stabilizerTotal()).toBeLessThanOrEqual(band.maxGrams);
      expect(stabilizerTotal()).toBeGreaterThanOrEqual(Math.min(band.minGrams, band.maxGrams));
      expect(assessSorbetStabilizerSystem(input()).issues).toEqual([]);
      expect(ownerPolicyIssues()).toEqual([]);
    });
  }

  it('2. scaling UP is not clamped away — 2 g + 3 g becomes 4 g + 6 g at 2000 g', () => {
    // The whole system doubles because the ceiling doubles too. Pulling it to
    // the preferred total here would be destructive, not corrective.
    useRecipeStore.getState().setBatchGrams(2000);
    expect(stabilizerGrams()).toEqual([4, 6]);
    expect(stabilizerTotal()).toBe(sorbetStabilizerWholeGramBand(2000).maxGrams);
  });

  it('3. the proportional relationship survives as closely as whole grams allow', () => {
    // 2:3 at 670 g must land 1 g + 2 g — not all three grams dumped on one
    // component, and not a component invented or dropped without cause.
    useRecipeStore.getState().setBatchGrams(670);
    expect(stabilizerGrams()).toEqual([1, 2]);
    expect(stabilizers()).toHaveLength(2);
  });

  it('4. a single-component system behaves the same way', () => {
    useRecipeStore.getState().startNewRecipe('sorbet');
    const tara = state().items.find((item) => item.ingredient.id === 'tara_gum');
    useRecipeStore.getState().setPlannedGrams(tara!.id, 4);
    const water = state().items.find((item) => item.ingredient.id === 'water');
    useRecipeStore.getState().setPlannedGrams(water!.id, water!.planned_grams + (1000 - sum()));
    expect(stabilizerGrams()).toEqual([4]);

    useRecipeStore.getState().setBatchGrams(670);
    expect(stabilizerGrams()).toEqual([Math.round(4 * 0.67)]);
    expect(Number.isInteger(stabilizerTotal())).toBe(true);
    expect(stabilizerTotal()).toBeLessThanOrEqual(sorbetStabilizerWholeGramBand(670).maxGrams);
    expect(assessSorbetStabilizerSystem(input()).issues).toEqual([]);
  });

  it('5. a Sorbet with no stabilizer line is untouched', () => {
    useRecipeStore.getState().startNewRecipe('sorbet');
    const tara = state().items.find((item) => item.ingredient.id === 'tara_gum');
    useRecipeStore.getState().removeItem(tara!.id);
    expect(stabilizers()).toEqual([]);
    const before = state().items.map((item) => item.planned_grams);
    const previousBatch = state().target_batch_grams;

    useRecipeStore.getState().setBatchGrams(670);
    const factor = 670 / before.reduce((total, grams) => total + grams, 0);
    void previousBatch;
    state().items.forEach((item, index) => {
      expect(item.planned_grams).toBeCloseTo(before[index]! * factor, 6);
    });
  });

  it('6. non-Sorbet batch rescaling is unchanged', () => {
    useRecipeStore.getState().startNewRecipe('gelato');
    const before = state().items.map((item) => ({ id: item.id, grams: item.planned_grams }));
    const currentSum = before.reduce((total, item) => total + item.grams, 0);

    useRecipeStore.getState().setBatchGrams(670);
    const factor = 670 / currentSum;
    state().items.forEach((item, index) => {
      expect(item.id).toBe(before[index]!.id);
      expect(item.planned_grams).toBeCloseTo(before[index]!.grams * factor, 6);
    });
    expect(sum()).toBeCloseTo(670, 6);
  });

  it('7. add-time stabilizer clamping is unchanged', () => {
    useRecipeStore.getState().startNewRecipe('sorbet');
    // Starter opens with TARA GUM 4 g; only 1 g of the 1000 g ceiling is left.
    const result = useRecipeStore.getState().addIngredient(SECOND_STABILIZER, 30);
    expect(result.status).toBe('added');
    expect(stabilizerTotal()).toBe(sorbetStabilizerWholeGramBand(1000).maxGrams);
    expect(stabilizerGrams()).toEqual([4, 1]);
  });

  it('8. direct gram-edit clamping is unchanged', () => {
    const second = state().items.find((item) => item.ingredient.id === SECOND_STABILIZER.id);
    useRecipeStore.getState().setPlannedGrams(second!.id, 30);
    // 2 g already committed, so the request is clamped to the remaining 3 g.
    expect(state().items.find((item) => item.id === second!.id)!.planned_grams).toBe(3);
    expect(assessSorbetStabilizerSystem(input()).issues).toEqual([]);
  });

  it('9. the band stays derived from the percentage — no literal 5 g rule', () => {
    // If a rescale ever hard-codes the 1000 g figure, these disagree.
    for (const [batch, maxGrams] of [
      [250, 1],
      [500, 2],
      [670, 3],
      [1000, 5],
      [1430, 7],
      [1900, 9],
      [2000, 10],
    ] as const) {
      expect(sorbetStabilizerWholeGramBand(batch).maxGrams).toBe(maxGrams);
      useRecipeStore.getState().setBatchGrams(batch);
      expect(stabilizerTotal()).toBeLessThanOrEqual(maxGrams);
      expect(assessSorbetStabilizerSystem(input()).issues).toEqual([]);
    }
  });

  it('9b. a component reaches 0 g only when the ceiling leaves no room for it', () => {
    // At 250 g the whole system may weigh 1 g, so two components cannot both
    // carry mass. That is the policy's own arithmetic, not a new behaviour:
    // add-time clamping already produces a 0 g stabilizer line when the
    // ceiling is full, so this state is reachable today by other means.
    useRecipeStore.getState().setBatchGrams(250);
    expect(stabilizerGrams()).toEqual([0, 1]);
    expect(stabilizers()).toHaveLength(2);

    useRecipeStore.getState().startNewRecipe('sorbet');
    const tara = state().items.find((item) => item.ingredient.id === 'tara_gum');
    useRecipeStore.getState().setPlannedGrams(tara!.id, 5);
    useRecipeStore.getState().addIngredient(SECOND_STABILIZER, 2);
    expect(stabilizerGrams()).toEqual([5, 0]);
  });

  it('11. CHOOSING the Ninja CREAMi Deluxe is a batch change and is projected too', () => {
    /* The owner-named real-world route: 670 g is not usually typed, it is the
       capacity a supported HOME machine imposes when the customer selects it.
       `setMachineSelection` resizes the batch itself, so the projection has to
       reach it — otherwise the headline case stays broken while the manual
       Partia edit looks fixed. */
    const setup = deriveMachineSetup(NINJA_CREAMI_DELUXE_NC502EU, state().visibleProductType);
    expect(setup.recommendedBatchGrams).toBe(670);
    expect(
      useRecipeStore.getState().setMachineSelection({
        kind: 'home',
        servingModeId: setup.resolvedVisibleMode!,
        machineId: NINJA_CREAMI_DELUXE_NC502EU.id,
        label: 'Ninja CREAMi Deluxe',
        temperatureC: -11,
        batchGrams: setup.recommendedBatchGrams!,
        capacityGrams: setup.recommendedBatchGrams!,
        batchSource: 'MACHINE_DEFAULT',
      }),
    ).toEqual({ ok: true });

    expect(state().target_batch_grams).toBe(670);
    expect(sum()).toBeCloseTo(670, 6);
    expect(stabilizerGrams()).toEqual([1, 2]);
    expect(assessSorbetStabilizerSystem(input()).issues).toEqual([]);
    expect(ownerPolicyIssues()).toEqual([]);
  });

  it('12. a machine selection that does not change the batch changes nothing', () => {
    const before = state().items.map((item) => item.planned_grams);
    useRecipeStore.getState().setMachineSelection({
      kind: 'professional',
      servingModeId: 'fresh',
      machineId: null,
      label: 'Maszyna profesjonalna',
      temperatureC: -11,
    });
    expect(state().items.map((item) => item.planned_grams)).toEqual(before);
    expect(state().target_batch_grams).toBe(1000);
  });

  it('10. a full rescale round trip never leaves an owner-policy issue behind', () => {
    for (const target of [670, 250, 2000, 1000, 500, 1430]) {
      useRecipeStore.getState().setBatchGrams(target);
      expect(ownerPolicyIssues()).toEqual([]);
      expect(sum()).toBeCloseTo(target, 6);
    }
  });
});
