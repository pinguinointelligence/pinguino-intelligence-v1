/**
 * OWNER QA 2026-08-31 — Crown MAX must be path-independent.
 *
 * Served regression (saved recipe `CROWN-391`, 670 g Gelato / Ninja CREAMi
 * Deluxe / OPTIMAL / STRAWBERRIES): the Crown objective returned whatever Main
 * grams it happened to start from, because an empty descending sweep echoed its
 * own input and relabelled the incoming grams as the accepted maximum.
 *
 * The recipe is built through the canonical store doors, never hand-assembled.
 */
import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import { NINJA_CREAMI_DELUXE_NC502EU, deriveMachineSetup } from '@/features/machine-catalog';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';
import {
  sorbetMapperIngredient,
  SORBET_MAIN_IDS,
} from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { maximizeMainFlavourObjective } from '@/features/constraint-studio/applyPipeline';
import { mainEnvelopeSearchCeilingGrams } from '@/features/product-intelligence/mainEnvelope';
import { resolveMainCapability } from '@/features/product-intelligence/mainCapability';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';

const SOLVER_TIMEOUT_MS = 600_000;
const st = () => useRecipeStore.getState();
const lineSum = () => st().items.reduce((total, item) => total + item.planned_grams, 0);
const BATCH = 670;
const HARD_FRONTIER_G = (BATCH * 45) / 100; // main-berry-fresh-dairy v2

/** Served composition, built through the store then Crowned. */
const buildServedCase = (mainGrams: number, options: { starveCarrier?: boolean } = {}) => {
  const setup = deriveMachineSetup(NINJA_CREAMI_DELUXE_NC502EU, 'gelato');
  st().startNewRecipe('gelato');
  st().setMachineSelection({
    kind: 'home',
    servingModeId: setup.resolvedVisibleMode!,
    machineId: NINJA_CREAMI_DELUXE_NC502EU.id,
    label: 'Ninja CREAMi Deluxe',
    temperatureC: -11,
    batchGrams: BATCH,
    capacityGrams: BATCH,
    batchSource: 'MACHINE_DEFAULT',
  });
  st().addIngredient(sorbetMapperIngredient(SORBET_MAIN_IDS.strawberry), mainGrams);
  const find = (fragment: string) =>
    st().items.find((item) => item.ingredient.name.toUpperCase().includes(fragment));
  const main = find('STRAWBERR')!;
  const milk = find('MILK 3.5')!;

  const probe: RecipeInput = {
    ...buildRecipeInput(st()),
    items: st().items.map((item) =>
      item.id === main.id ? { ...item, lock_type: 'main' as const } : item,
    ),
  };
  const snaps = productBehaviorTestSnapshots(probe, []);
  // The published `main-berry-fresh-dairy` v2 envelope, fully calibrated so the
  // Main is NOT user-held and the envelope genuinely applies.
  snaps[main.id] = {
    ...snaps[main.id]!,
    familyId: 'fruit',
    subfamilyId: 'berry',
    formId: 'fresh',
    mainCapability: 'MAIN_CAPABLE',
    behaviorRole: 'MAIN_PROFILE_SPECIFIC',
    mainClassification: 'MAIN_PROFILE_SPECIFIC',
    mainPolicyId: 'main-berry-fresh-dairy',
    mainPolicyVersion: '2',
    mainCalibrationLevel: 'EXACT_PRODUCT',
    ecoFloorPercent: 25,
    optimalCeilingPercent: 35,
    hardLimitPercent: 45,
    multiMainHardLimitPercent: 45,
    mainEquivalentFactor: 1,
    mainBasis: 'FRUIT_EQUIVALENT',
    requiresLiquidDairyCarrier: true,
    liquidDairyCarrierFloorPercent: 30,
    approvedLiquidDairyCarrier: false,
  } as ProductBehaviorSnapshot;
  // Only MILK 3.5% is an approved liquid dairy carrier in the Mapper.
  for (const key of Object.keys(snaps)) {
    if (key === main.id) continue;
    snaps[key] = {
      ...snaps[key]!,
      approvedLiquidDairyCarrier: options.starveCarrier === true ? false : key === milk.id,
    } as ProductBehaviorSnapshot;
  }
  for (const item of st().items) {
    if (snaps[item.id]) st().setProductBehaviorSnapshot(item.id, snaps[item.id]!);
  }
  st().setMainIngredient(main.id);
  // Close the batch from the largest support line so the draft is on-batch.
  const donor = st()
    .items.filter((item) => item.lock_type !== 'main')
    .sort((a, b) => b.planned_grams - a.planned_grams)[0]!;
  st().setPlannedGrams(donor.id, Math.max(0, donor.planned_grams + (BATCH - lineSum())));
  return { input: buildRecipeInput(st()), snaps, mainLineId: main.id };
};

const STARTING_GRAMS = [1, 100, 168, 214, 234, 300, 450] as const;

describe('Crown MAX path independence', () => {
  it('resolves a calibrated, non-user-held Crown for the served case', () => {
    const { snaps, mainLineId } = buildServedCase(214);
    const capability = resolveMainCapability({
      snapshot: snaps[mainLineId],
      snapshotRequired: true,
    });
    expect(capability.state).toBe('MAIN_CAPABLE');
    expect(capability.userHeld).toBe(false);
  });

  it('derives the same hard frontier from every starting Main', () => {
    const frontiers = STARTING_GRAMS.map((grams) => {
      const { input, snaps } = buildServedCase(grams);
      return mainEnvelopeSearchCeilingGrams({ recipe: input, snapshots: snaps });
    });
    expect(new Set(frontiers)).toEqual(new Set([HARD_FRONTIER_G]));
  });

  it(
    'returns the same Crown maximum whatever grams Crown started from',
    () => {
      const outcomes = STARTING_GRAMS.map((grams) => {
        const { input, snaps, mainLineId } = buildServedCase(grams);
        const result = maximizeMainFlavourObjective(input, input, { byLineId: {} }, {
          productBehaviorSnapshots: snaps,
        });
        const main = result.input.items.find((item) => item.id === mainLineId)!.planned_grams;
        const proof = result.proof;
        return {
          startedAt: grams,
          main: Math.round(main),
          refusal: proof?.crownRefusal?.blockingRule ?? null,
          frontier: proof?.searchUpperBoundGrams ?? null,
          accepted: proof?.exactAcceptedMainGrams ?? null,
        };
      });
      const detail = JSON.stringify(outcomes, null, 1);

      // A. identical Crown result, or identical typed refusal, for every start.
      const signatures = new Set(
        outcomes.map((o) => (o.refusal !== null ? `refusal:${o.refusal}` : `main:${o.main}`)),
      );
      expect(signatures.size, detail).toBe(1);

      for (const outcome of outcomes) {
        // B. an ACCEPTED Crown maximum is never above the derived safety frontier.
        if (outcome.refusal === null) {
          expect(outcome.main, detail).toBeLessThanOrEqual(Math.ceil(HARD_FRONTIER_G));
        }
        // D. the reported frontier is the derived frontier, never the start.
        if (outcome.frontier !== null) {
          expect(outcome.frontier, detail).toBeLessThanOrEqual(Math.ceil(HARD_FRONTIER_G));
          expect(outcome.frontier, detail).toBeGreaterThan(0);
        }
        // E. a refusal never echoes the incoming grams as an accepted maximum.
        if (outcome.refusal !== null) {
          expect(outcome.frontier, detail).not.toBe(outcome.startedAt);
        }
      }
    },
    SOLVER_TIMEOUT_MS,
  );

  it(
    'refuses identically from every start when no candidate is admissible',
    () => {
      // No approved liquid dairy carrier anywhere, so every candidate in
      // [floor, frontier] fails `liquid_dairy_carrier_below_floor`. Before the
      // fix this empty sweep echoed its own input and relabelled the incoming
      // grams as the accepted maximum, so the "maximum" was the starting grams:
      // 1 → 1, 168 → 168, 214 → 214, 300 → 300, 450 → 450.
      const outcomes = STARTING_GRAMS.map((grams) => {
        const { input, snaps, mainLineId } = buildServedCase(grams, { starveCarrier: true });
        const result = maximizeMainFlavourObjective(input, input, { byLineId: {} }, {
          productBehaviorSnapshots: snaps,
        });
        const proof = result.proof;
        return {
          startedAt: grams,
          main: Math.round(result.input.items.find((i) => i.id === mainLineId)!.planned_grams),
          refusal: proof?.crownRefusal?.blockingRule ?? null,
          frontier: proof?.searchUpperBoundGrams ?? null,
          accepted: proof?.exactAcceptedMainGrams ?? null,
          status: proof?.status ?? null,
        };
      });
      const detail = JSON.stringify(outcomes, null, 1);

      // E. every start yields the SAME typed refusal, carrying the real rule.
      for (const outcome of outcomes) {
        expect(outcome.refusal, detail).not.toBeNull();
      }
      expect(new Set(outcomes.map((o) => o.refusal)).size, detail).toBe(1);

      // D. the reported frontier is the derived frontier, identical from every
      // start, and never widened to cover the incoming grams.
      const frontiers = new Set(outcomes.map((o) => o.frontier));
      expect(frontiers.size, detail).toBe(1);
      for (const outcome of outcomes) {
        expect(outcome.frontier, detail).toBeLessThanOrEqual(Math.ceil(HARD_FRONTIER_G));
        expect(outcome.frontier, detail).not.toBe(outcome.startedAt);
      }
    },
    SOLVER_TIMEOUT_MS,
  );

  it(
    'never inflates the reported frontier to a start above the safety limit',
    () => {
      const { input, snaps } = buildServedCase(450);
      const proof = maximizeMainFlavourObjective(input, input, { byLineId: {} }, {
        productBehaviorSnapshots: snaps,
      }).proof;
      // 450 g is 67.2% — far above the 45% hard limit. The proof must report the
      // derived frontier, never widen itself to cover the incoming grams.
      expect(proof?.searchUpperBoundGrams ?? 0).toBeLessThanOrEqual(Math.ceil(HARD_FRONTIER_G));
    },
    SOLVER_TIMEOUT_MS,
  );
});
