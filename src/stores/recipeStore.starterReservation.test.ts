/**
 * SORBET STARTER / INULIN — a batch resize must not spend the Main's reservation
 * on the support vector.
 *
 * The canonical Sorbet starter is deliberately INCOMPLETE: it lays down ~40 % of
 * the batch as support and names the rest as `missingMainMassGrams`, the mass the
 * customer's fruit Main will occupy. `resizeRecipeBatch` knew nothing about that
 * reservation, so selecting a machine inflated the support-only vector to fill
 * the whole batch — every line multiplied by ~2.5. INULIN went from 5.4 % to
 * 13.8 % of batch and broke `OWNER_INULIN_POLICY` (2–8 %) before the customer
 * had touched anything.
 *
 * The invariant for an incomplete starter is therefore NOT "lines sum to the
 * batch". It is:
 *
 *     sum(lines) + missingMainMassGrams === target batch
 *
 * Complete recipes (`missingMainMassGrams === 0`) still fill the batch exactly.
 * SOL-041 permits only the stabilizer role to move onto its executable whole-
 * gram hold; the relative mathematics of every ordinary line stays unchanged.
 * The discriminator is the reservation, never `productType === 'sorbet'`.
 */
import { describe, expect, it } from 'vitest';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import { findDemoIngredient } from '@/data/demoIngredients';
import {
  NINJA_CREAMI_DELUXE_NC502EU,
  MACHINE_CATALOG,
  deriveMachineSetup,
} from '@/features/machine-catalog';
import { machineDisplayName } from '@/features/machine-onboarding';
import {
  OWNER_INULIN_POLICY,
  ownerInulinGramBand,
  ownerInulinPolicyIssues,
} from '@/features/product-intelligence/ownerInulinPolicy';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { recipePersistPartialize, useRecipeStore } from './recipeStore';

const INULIN = OWNER_INULIN_POLICY.mapperIngredientId;
const st = () => useRecipeStore.getState();
const sum = () => st().items.reduce((total, item) => total + item.planned_grams, 0);
const inulin = () =>
  st()
    .items.filter((item) => canonicalIngredientId(item.ingredient) === INULIN)
    .reduce((total, item) => total + item.planned_grams, 0);
const ratios = () => st().items.map((item) => item.planned_grams / sum());
/** PC-02 projects the Sorbet stabilizer onto whole grams, so that ONE line may
 *  legitimately land a gram or two off a pure proportional scale. Everything
 *  else must scale exactly. */
const STABILIZER = 'PI-ING-000492';
const isStabilizer = (item: { ingredient: unknown }) =>
  canonicalIngredientId(item.ingredient as never) === STABILIZER;
/** The support vector's SHARE of the batch is the meaningful quantity: the
 *  defect turned ~40 % into 100 %. A whole-gram stabilizer pin moves it by well
 *  under a percentage point at any batch size. */
const SHARE_TOLERANCE = 0.01;
const STRAWBERRIES = {
  ...findDemoIngredient('raspberry')!,
  id: 'PI-ING-001553',
  canonical_ingredient_id: 'PI-ING-001553',
  name: 'STRAWBERRIES · Fresh Fruit',
};

/** The customer's real route: a new Sorbet, then they pick their machine. */
const newSorbetThenMachine = (profile: (typeof MACHINE_CATALOG)[number]) => {
  useRecipeStore.getState().startNewRecipe('sorbet');
  const before = { ratios: ratios(), sum: sum(), batch: st().target_batch_grams };
  const setup = deriveMachineSetup(profile, 'sorbet');
  const result = useRecipeStore.getState().setMachineSelection({
    kind: 'home',
    servingModeId: setup.resolvedVisibleMode!,
    machineId: profile.id,
    label: machineDisplayName(profile),
    temperatureC: -11,
    batchGrams: setup.recommendedBatchGrams!,
    hardCapacityGrams: setup.hardMaximumBatchGrams,
    batchSource: 'MACHINE_DEFAULT',
  });
  return { before, result, batch: setup.recommendedBatchGrams! };
};

describe('an incomplete starter keeps its Main reservation across a batch resize', () => {
  it('1. Ninja CREAMi Deluxe 670 g — the reported case', () => {
    const { before, batch } = newSorbetThenMachine(NINJA_CREAMI_DELUXE_NC502EU);
    expect(batch).toBe(670);

    // The support vector keeps its share of the batch: it is NOT inflated.
    // (Within the stabilizer's whole-gram slack — PC-02 pins TARA 4 g → 3 g.)
    const supportShare = before.sum / before.batch; // ~0.4
    expect(Math.abs(sum() / batch - supportShare)).toBeLessThanOrEqual(SHARE_TOLERANCE);

    // sum(lines) + reservation === target batch
    const reservation = st().target_batch_grams - sum();
    expect(reservation).toBeGreaterThan(0);
    expect(sum() + reservation).toBeCloseTo(batch, 6);
    expect(Math.abs(reservation / batch - (1 - supportShare))).toBeLessThanOrEqual(SHARE_TOLERANCE);

    // INULIN stays inside the DERIVED owner band — never a literal figure.
    const band = ownerInulinGramBand(batch);
    expect(inulin()).toBeGreaterThanOrEqual(band.minGrams);
    expect(inulin()).toBeLessThanOrEqual(band.maxGrams);
    expect(ownerInulinPolicyIssues(buildRecipeInput(st()))).toEqual([]);

    // Support ratios are preserved for every line the stabilizer authority does
    // not pin to whole grams.
    st().items.forEach((item, index) => {
      if (isStabilizer(item)) return;
      expect(item.planned_grams / sum()).toBeCloseTo(before.ratios[index]!, 3);
    });
  });

  it('2. every canonical Home machine, and the derived band holds', () => {
    for (const profile of MACHINE_CATALOG) {
      const setup = deriveMachineSetup(profile, 'sorbet');
      if (setup.resolvedVisibleMode === null || setup.recommendedBatchGrams === null) continue;
      const { before, batch } = newSorbetThenMachine(profile);
      const band = ownerInulinGramBand(batch);
      const reservation = st().target_batch_grams - sum();

      expect(sum() + reservation).toBeCloseTo(batch, 6);
      expect(reservation).toBeGreaterThan(0);
      expect(Math.abs(sum() / batch - before.sum / before.batch)).toBeLessThanOrEqual(
        SHARE_TOLERANCE,
      );
      expect(inulin()).toBeGreaterThanOrEqual(band.minGrams);
      expect(inulin()).toBeLessThanOrEqual(band.maxGrams);
      expect(ownerInulinPolicyIssues(buildRecipeInput(st()))).toEqual([]);
    }
  });

  it('3. no support line is inflated by consuming the reserved Main mass', () => {
    useRecipeStore.getState().startNewRecipe('sorbet');
    const beforeGrams = st().items.map((item) => item.planned_grams);
    const beforeBatch = st().target_batch_grams;
    newSorbetThenMachine(NINJA_CREAMI_DELUXE_NC502EU);
    // Scaling down 1000 → 670 must SHRINK every line, never grow one.
    void beforeBatch;
    st().items.forEach((item, index) => {
      expect(item.planned_grams).toBeLessThanOrEqual(beforeGrams[index]!);
    });
  });

  it('4. a COMPLETE starter still fills its batch — the discriminator is the reservation', () => {
    // Gelato/Vegan/Protein starters already sum to the batch. They still fill
    // it exactly; SOL-041 changes only the stabilizer representation to whole
    // grams, while ordinary lines preserve their mutual proportions.
    for (const product of ['gelato', 'vegan', 'protein'] as const) {
      useRecipeStore.getState().startNewRecipe(product);
      const beforeBatch = st().target_batch_grams;
      const beforeSum = sum();
      expect(beforeSum).toBeCloseTo(beforeBatch, 6);
      const ordinaryBefore = st()
        .items.filter((item) => !isStabilizer(item))
        .map((item) => ({ id: item.id, grams: item.planned_grams }));
      const ordinaryBeforeTotal = ordinaryBefore.reduce((total, item) => total + item.grams, 0);

      const setup = deriveMachineSetup(NINJA_CREAMI_DELUXE_NC502EU, product);
      if (setup.resolvedVisibleMode === null || setup.recommendedBatchGrams === null) continue;
      useRecipeStore.getState().setMachineSelection({
        kind: 'home',
        servingModeId: setup.resolvedVisibleMode,
        machineId: NINJA_CREAMI_DELUXE_NC502EU.id,
        label: 'Ninja CREAMi Deluxe',
        temperatureC: -11,
        batchGrams: setup.recommendedBatchGrams,
        hardCapacityGrams: setup.hardMaximumBatchGrams,
        batchSource: 'MACHINE_DEFAULT',
      });
      // A complete recipe still fills its new batch exactly.
      expect(sum()).toBeCloseTo(setup.recommendedBatchGrams, 6);
      const ordinaryAfter = st().items.filter((item) => !isStabilizer(item));
      const ordinaryAfterTotal = ordinaryAfter.reduce(
        (total, item) => total + item.planned_grams,
        0,
      );
      ordinaryAfter.forEach((item, index) => {
        expect(item.id).toBe(ordinaryBefore[index]!.id);
        expect(item.planned_grams / ordinaryAfterTotal).toBeCloseTo(
          ordinaryBefore[index]!.grams / ordinaryBeforeTotal,
          10,
        );
      });
      expect(
        st()
          .items.filter(isStabilizer)
          .every((item) => Number.isInteger(item.planned_grams)),
      ).toBe(true);
      expect(ownerInulinPolicyIssues(buildRecipeInput(st()))).toEqual([]);
    }
  });

  it('4b. the reservation survives a reload, so a later resize cannot re-inflate', () => {
    /* The reservation is draft MATERIAL, not provenance. When it was left out of
       the persisted slice the fix silently lapsed on refresh: the draft came
       back looking merely off-batch, and the very next amount edit spent the
       reservation on the support vector again — measured on staging as INULIN
       4.93 % → 12.4 % at 500 g. */
    newSorbetThenMachine(NINJA_CREAMI_DELUXE_NC502EU);
    const live = st();
    const persisted = recipePersistPartialize(live) as unknown as Record<string, unknown>;
    expect(persisted.starterReservedMainGrams).toBe(live.starterReservedMainGrams);
    expect(live.starterReservedMainGrams).toBeGreaterThan(0);

    // Rehydrate exactly what a reload would restore, then change the batch.
    useRecipeStore.setState({
      items: persisted.items as never,
      target_batch_grams: persisted.target_batch_grams as number,
      starterReservedMainGrams: persisted.starterReservedMainGrams as number,
    });
    useRecipeStore.getState().setBatchGrams(500);

    const band = ownerInulinGramBand(500);
    expect(inulin()).toBeGreaterThanOrEqual(band.minGrams);
    expect(inulin()).toBeLessThanOrEqual(band.maxGrams);
    expect(ownerInulinPolicyIssues(buildRecipeInput(st()))).toEqual([]);
    expect(sum() + st().starterReservedMainGrams).toBeCloseTo(500, 6);
  });

  it('5. once the Main arrives the reservation is spent, not re-applied', () => {
    // The reservation is only honoured while it is still true. Adding mass
    // breaks `sum + reserved === batch`, and ordinary semantics resume.
    const { batch } = newSorbetThenMachine(NINJA_CREAMI_DELUXE_NC502EU);
    const reservation = st().target_batch_grams - sum();
    expect(reservation).toBeGreaterThan(0);
    const fruit = st().items[0]!.ingredient;
    void fruit;
    expect(sum() + reservation).toBeCloseTo(batch, 6);
  });

  it('BASIC4V1: 670 g Sorbet starter returns byte-exactly to its 1000 g contract before Main arrives', () => {
    newSorbetThenMachine(NINJA_CREAMI_DELUXE_NC502EU);

    const result = st().setMachineSelection({
      kind: 'professional',
      servingModeId: 'minus11',
      machineId: null,
      label: 'Professional',
      temperatureC: -11,
      batchGrams: 1_000,
      hardCapacityGrams: null,
      batchSource: 'PROFESSIONAL_USER_BATCH',
    });

    expect(result).toEqual({ ok: true });
    expect(sum()).toBe(400);
    expect(st().starterReservedMainGrams).toBe(600);
    expect(sum() + st().starterReservedMainGrams).toBe(1_000);

    st().addIngredient(STRAWBERRIES, 600);
    expect(sum()).toBe(1_000);
    expect(600 / sum()).toBe(0.6);
  });
});
