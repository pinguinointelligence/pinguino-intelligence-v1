/**
 * OWNER-LOCKED — an incomplete starter's Main reservation is part of the batch.
 *
 * Purely additive; it weakens no existing contract.
 *
 * The canonical Sorbet starter is DELIBERATELY incomplete: it lays down ~40 % of
 * the batch as support and names the rest `missingMainMassGrams`, the mass the
 * customer's fruit Main will occupy. `resizeRecipeBatch` knew nothing about that
 * reservation, so it treated the scaffold as a complete recipe and filled the
 * batch with support ingredients — every line multiplied by ~2.5. INULIN went
 * from the starter's 5.4 % to 13.8 % and broke `OWNER_INULIN_POLICY` (2–8 %) on
 * all ten canonical Home machines, before the customer had touched anything.
 *
 * The starter template was never wrong: it is legal at every product × mode ×
 * batch. The excess was purely 5.5 % ÷ 0.4.
 *
 * What is locked is the INVARIANT, not a gram figure:
 *
 *     sum(lines) + starterReservedMainGrams === target batch
 *
 * and the fact that the discriminator is the RESERVATION — never
 * `productType === 'sorbet'`. Sorbet is merely the only profile with an
 * incomplete starter today.
 */
import { describe, expect, it } from 'vitest';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import {
  MACHINE_CATALOG,
  NINJA_CREAMI_DELUXE_NC502EU,
  deriveMachineSetup,
} from '@/features/machine-catalog';
import { machineDisplayName } from '@/features/machine-onboarding';
import {
  OWNER_INULIN_POLICY,
  ownerInulinGramBand,
  ownerInulinPolicyIssues,
} from '@/features/product-intelligence/ownerInulinPolicy';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { recipePersistPartialize, useRecipeStore } from '@/stores/recipeStore';

const st = () => useRecipeStore.getState();
const lineSum = () => st().items.reduce((total, item) => total + item.planned_grams, 0);
const inulin = () =>
  st()
    .items.filter(
      (item) => canonicalIngredientId(item.ingredient) === OWNER_INULIN_POLICY.mapperIngredientId,
    )
    .reduce((total, item) => total + item.planned_grams, 0);

const selectHome = (profile: (typeof MACHINE_CATALOG)[number], product: 'sorbet' | 'gelato') => {
  const setup = deriveMachineSetup(profile, product);
  if (setup.resolvedVisibleMode === null || setup.recommendedBatchGrams === null) return null;
  useRecipeStore.getState().setMachineSelection({
    kind: 'home',
    servingModeId: setup.resolvedVisibleMode,
    machineId: profile.id,
    label: machineDisplayName(profile),
    temperatureC: -11,
    batchGrams: setup.recommendedBatchGrams,
    capacityGrams: setup.recommendedBatchGrams,
    batchSource: 'MACHINE_DEFAULT',
  });
  return setup.recommendedBatchGrams;
};

describe('OWNER-LOCKED — a batch resize moves the Main reservation, never spends it', () => {
  it('1. the accounted-batch invariant holds on every canonical Home machine', () => {
    for (const profile of MACHINE_CATALOG) {
      useRecipeStore.getState().startNewRecipe('sorbet');
      const supportShare = lineSum() / st().target_batch_grams; // ~0.4
      const batch = selectHome(profile, 'sorbet');
      if (batch === null) continue;

      // THE invariant. Not "lines sum to the batch".
      expect(lineSum() + st().starterReservedMainGrams).toBeCloseTo(batch, 6);
      expect(st().starterReservedMainGrams).toBeGreaterThan(0);
      // The support vector keeps its share; it is not inflated to fill the batch.
      expect(Math.abs(lineSum() / batch - supportShare)).toBeLessThanOrEqual(0.01);
    }
  });

  it('2. INULIN stays inside the DERIVED owner band, never a literal figure', () => {
    for (const profile of MACHINE_CATALOG) {
      useRecipeStore.getState().startNewRecipe('sorbet');
      const batch = selectHome(profile, 'sorbet');
      if (batch === null) continue;
      const band = ownerInulinGramBand(batch);
      expect(band.maxGrams).toBeCloseTo((batch * OWNER_INULIN_POLICY.maxPercent) / 100, 9);
      expect(inulin()).toBeGreaterThanOrEqual(band.minGrams);
      expect(inulin()).toBeLessThanOrEqual(band.maxGrams);
      expect(ownerInulinPolicyIssues(buildRecipeInput(st()))).toEqual([]);
    }
  });

  it('3. the discriminator is the reservation, not the product type', () => {
    // A COMPLETE starter reserves nothing and still fills its batch exactly.
    for (const product of ['gelato', 'vegan', 'protein'] as const) {
      useRecipeStore.getState().startNewRecipe(product);
      expect(st().starterReservedMainGrams).toBe(0);
      const setup = deriveMachineSetup(NINJA_CREAMI_DELUXE_NC502EU, product);
      if (setup.resolvedVisibleMode === null || setup.recommendedBatchGrams === null) continue;
      useRecipeStore.getState().setMachineSelection({
        kind: 'home',
        servingModeId: setup.resolvedVisibleMode,
        machineId: NINJA_CREAMI_DELUXE_NC502EU.id,
        label: 'Ninja CREAMi Deluxe',
        temperatureC: -11,
        batchGrams: setup.recommendedBatchGrams,
        capacityGrams: setup.recommendedBatchGrams,
        batchSource: 'MACHINE_DEFAULT',
      });
      expect(lineSum()).toBeCloseTo(setup.recommendedBatchGrams, 6);
      expect(st().starterReservedMainGrams).toBe(0);
      expect(ownerInulinPolicyIssues(buildRecipeInput(st()))).toEqual([]);
    }
  });

  it('4. the reservation is persisted, so a reload cannot resurrect the inflation', () => {
    /* It is draft MATERIAL, not provenance. Left out of the persisted slice the
       repair passed every local suite and still lapsed on refresh: served QA
       measured INULIN 4.93 % → 12.4 % at the first amount edit after a reload. */
    useRecipeStore.getState().startNewRecipe('sorbet');
    const batch = selectHome(NINJA_CREAMI_DELUXE_NC502EU, 'sorbet')!;
    const persisted = recipePersistPartialize(st()) as unknown as Record<string, unknown>;
    expect(persisted.starterReservedMainGrams).toBe(st().starterReservedMainGrams);

    useRecipeStore.setState({
      items: persisted.items as never,
      target_batch_grams: persisted.target_batch_grams as number,
      starterReservedMainGrams: persisted.starterReservedMainGrams as number,
    });
    useRecipeStore.getState().setBatchGrams(500);

    expect(lineSum() + st().starterReservedMainGrams).toBeCloseTo(500, 6);
    const band = ownerInulinGramBand(500);
    expect(inulin()).toBeGreaterThanOrEqual(band.minGrams);
    expect(inulin()).toBeLessThanOrEqual(band.maxGrams);
    void batch;
  });

  it('5. a reservation is honoured only while it is still TRUE of the draft', () => {
    // A stale figure can never revive: once the lines no longer leave room for
    // it, ordinary fill-the-batch semantics resume with nothing to clear.
    useRecipeStore.getState().startNewRecipe('sorbet');
    selectHome(NINJA_CREAMI_DELUXE_NC502EU, 'sorbet');
    useRecipeStore.setState({ starterReservedMainGrams: 999_999 });
    useRecipeStore.getState().setBatchGrams(1_000);
    expect(lineSum()).toBeCloseTo(1_000, 6);
    expect(st().starterReservedMainGrams).toBe(0);
  });
});
