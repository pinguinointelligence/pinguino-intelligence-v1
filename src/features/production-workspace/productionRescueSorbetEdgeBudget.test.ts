import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import {
  PRE_FINAL_2089_COMPOSITION_VERSION,
  SORBET_MAIN_IDS,
  recipeInputForHistoricalVersion,
  sorbetAuthoritySnapshots,
  sorbetMapperIngredient,
  sorbetMultiMainBase,
} from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';
import {
  confirmProductionLine,
  createProductionSession,
  setDraftActualGrams,
} from './productionSession';
import { assessProductionRescue, productionRescueTerminalAuthority } from './productionRescue';
import { productionTestComposition } from './productionTestComposition.fixture';

const servedMangoSorbet = () => {
  const canonical = sorbetMultiMainBase(-11);
  const currentShape = {
    ...canonical,
    machine_capacity_grams: null,
    machine_capacity_source: null,
    items: [
      ...canonical.items.filter((item) => item.lock_type !== 'main'),
      {
        id: 'main-mango',
        ingredient: sorbetMapperIngredient(SORBET_MAIN_IDS.mango),
        planned_grams: 600,
        actual_grams: null,
        lock_type: 'main' as const,
      },
    ],
  };
  const input = recipeInputForHistoricalVersion(
    PRE_FINAL_2089_COMPOSITION_VERSION,
    currentShape,
  );
  const composition = productionTestComposition(input);
  composition.behaviorSnapshots = sorbetAuthoritySnapshots(input);
  let session = createProductionSession({
    sessionId: 'served-sorbet-early-plus-five',
    ownerUserId: 'owner',
    source: {
      recipeId: 'recipe-sorbet',
      recipeVersionId: 'version-sorbet',
      recipeVersionNumber: 1,
      recipeName: 'P0 Fresh Sorbet PB QA',
    },
    plannedInput: input,
    plannedComposition: composition,
    startedAt: '2026-09-05T12:00:00.000Z',
  });
  const water = input.items.find((item) => item.id.endsWith('water'))!;
  session = confirmProductionLine(
    setDraftActualGrams(session, water.id, water.planned_grams + 5),
    water.id,
    '2026-09-05T12:01:00.000Z',
  );
  return { input, session };
};

describe('Production Rescue — served Sorbet Edge budget regression', () => {
  it('certifies the smallest larger whole-stabilizer batch for early WATER +5', () => {
    const { input, session } = servedMangoSorbet();
    const started = performance.now();
    const assessment = assessProductionRescue(session);
    const elapsedMs = performance.now() - started;
    const enlarge = assessment.options.find((option) => option.id === 'enlarge_batch');

    expect(input.target_batch_grams).toBe(1_000);
    expect(input.machine_capacity_grams).toBeNull();
    expect(input.machine_capacity_source).toBeNull();
    expect(enlarge?.finalMassG).toBe(1_000.5);
    expect(enlarge?.candidateInput.items.map((item) => [item.id, item.planned_grams])).toEqual([
      ['new-recipe-1-water', 287.2],
      ['new-recipe-2-sucrose', 54.1],
      ['new-recipe-3-dextrose', 55.9],
      ['new-recipe-4-inulin', 0],
      ['new-recipe-5-tara_gum', 3],
      ['main-mango', 600.3],
    ]);
    expect(
      enlarge?.candidateInput.items.find((item) => item.id.endsWith('tara_gum'))?.planned_grams,
    ).toBe(3);
    expect(
      enlarge && productionRescueTerminalAuthority(enlarge.candidateInput, session).valid,
    ).toBe(true);
    expect(elapsedMs).toBeLessThan(1_000);
  });
});
