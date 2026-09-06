import { describe, expect, it } from 'vitest';
import {
  calculateRecipe,
  detectViolations,
  type RecipeDirectionTarget,
  type RecipeInput,
} from '@/engine';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import {
  sorbetMapperIngredient,
  sorbetMultiMainBase,
} from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import {
  applyVerifiedRescueInput,
  buildFinalActualInput,
  completeProductionSession,
  confirmProductionLine,
  confirmProductionTopUpTask,
  createProductionSession,
  pendingProductionTopUpTasks,
  setDraftActualGrams,
  type ProductionSession,
} from './productionSession';
import {
  assessProductionHardSafety,
  assessProductionRescue,
  productionContinuationPath,
  productionRescueTerminalAuthority,
  type ProductionRescueAssessment,
  type ProductionRescueOption,
} from './productionRescue';
import { productionTestComposition } from './productionTestComposition.fixture';

type FastProfileId = 'gelato' | 'sorbet' | 'vegan' | 'protein';

const gelatoInput = (): RecipeInput => ({
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -11,
  target_batch_grams: 1_000,
  machine_capacity_grams: 1_200,
  machine_capacity_source: 'manual',
  goals: { formulation_strategy: 'optimal' },
  items: [
    ['milk', 'PI-ING-000236', 584, 'unlocked'],
    ['cream', 'PI-ING-000180', 98, 'unlocked'],
    ['smp', 'PI-ING-000270', 56, 'unlocked'],
    ['sucrose', 'PI-ING-000514', 59, 'unlocked'],
    ['dextrose', 'PI-ING-000494', 64, 'unlocked'],
    ['tara', 'PI-ING-000492', 3, 'unlocked'],
    ['fructose', 'PI-ING-000496', 5, 'unlocked'],
    ['banana', 'PI-ING-000345', 131, 'main'],
  ].map(([id, mapperId, grams, lockType]) => ({
    id: String(id),
    ingredient: sorbetMapperIngredient(String(mapperId)),
    planned_grams: Number(grams),
    actual_grams: null,
    lock_type: lockType as 'unlocked' | 'main',
  })),
});

const starterInput = (profile: 'vegan' | 'protein'): RecipeInput => {
  const starter = buildCanonicalNewRecipeStarter({
    visibleProductType: profile,
    servingModeId: profile === 'protein' ? 'temp_minus_12' : 'temp_minus_13',
    formulationStrategy: 'optimal',
    targetBatchGrams: 1_000,
  });
  return {
    mode: 'classic',
    category: starter.category,
    target_temperature_c: starter.targetTemperatureC,
    target_batch_grams: starter.targetBatchGrams,
    machine_capacity_grams: 1_200,
    machine_capacity_source: 'manual',
    goals: { formulation_strategy: 'optimal' },
    items: starter.items,
  };
};

const directed = (
  input: RecipeInput,
  sweetness: RecipeDirectionTarget,
  softness: RecipeDirectionTarget,
): RecipeInput => ({
  ...input,
  goals: {
    ...input.goals,
    direction_targets_active: true,
    direction_targets: { sweetness, softness, creaminess: 0, flavor: 0 },
  },
});

const PROFILES: ReadonlyArray<{ id: FastProfileId; input: RecipeInput }> = [
  { id: 'gelato', input: gelatoInput() },
  {
    id: 'sorbet',
    input: {
      ...sorbetMultiMainBase(-11),
      machine_capacity_grams: 1_200,
      machine_capacity_source: 'manual',
    },
  },
  {
    id: 'vegan',
    input: starterInput('vegan'),
  },
  { id: 'protein', input: starterInput('protein') },
];

const sessionFor = (id: string, input: RecipeInput): ProductionSession =>
  createProductionSession({
    sessionId: `fast-${id}`,
    ownerUserId: 'owner',
    source: {
      recipeId: `recipe-${id}`,
      recipeVersionId: `version-${id}`,
      recipeVersionNumber: 1,
      recipeName: `Fast ${id}`,
    },
    plannedInput: input,
    plannedComposition: productionTestComposition(input),
    startedAt: '2026-09-05T12:00:00.000Z',
  });

const confirm = (
  session: ProductionSession,
  values: ReadonlyArray<readonly [lineId: string, grams: number]>,
): ProductionSession =>
  values.reduce(
    (current, [lineId, grams], index) =>
      confirmProductionLine(
        setDraftActualGrams(current, lineId, grams),
        lineId,
        `2026-09-05T12:${String(index + 1).padStart(2, '0')}:00.000Z`,
      ),
    session,
  );

const vector = (input: RecipeInput) =>
  input.items.map((item) => [item.id, canonicalIngredientId(item.ingredient), item.planned_grams]);

const correctionFor = (assessment: ProductionRescueAssessment): ProductionRescueOption | null =>
  assessment.options.find((option) => option.id !== 'leave_as_is') ?? null;

interface ProfileEvidence {
  input: RecipeInput;
  baselineSession: ProductionSession;
  exactSession: ProductionSession;
  underSession: ProductionSession;
  underAssessment: ProductionRescueAssessment;
  restore: ProductionRescueOption;
  appliedUnder: ProductionSession;
  completedUnder: ProductionSession;
  overEarlySession: ProductionSession;
  overEarlyAssessment: ProductionRescueAssessment;
  lateAssessment: ProductionRescueAssessment;
  twoDeviationAssessment: ProductionRescueAssessment;
  stabilizerAssessment: ProductionRescueAssessment;
  mainAssessment: ProductionRescueAssessment;
  addOnlyRestore: ProductionRescueOption;
  capacityAssessment: ProductionRescueAssessment;
}

const evidenceCache = new Map<FastProfileId, ProfileEvidence>();

const buildEvidence = ({
  id,
  input,
}: {
  id: FastProfileId;
  input: RecipeInput;
}): ProfileEvidence => {
  const cached = evidenceCache.get(id);
  if (cached) return cached;
  const byLargest = [...input.items].sort(
    (left, right) => right.planned_grams - left.planned_grams,
  );
  const deviationLine = byLargest.find((item) => item.planned_grams > 10)!;
  const secondDeviationLine = byLargest.find((item) => item.id !== deviationLine.id)!;
  const exactSession = confirm(
    sessionFor(`${id}-exact`, input),
    input.items.map((item) => [item.id, item.planned_grams] as const),
  );

  const underSession = confirm(sessionFor(`${id}-under`, input), [
    [deviationLine.id, deviationLine.planned_grams - 1],
  ]);
  const underAssessment = assessProductionRescue(underSession);
  const restore = underAssessment.options.find((option) => option.id === 'restore_original_recipe');
  if (!restore) throw new Error(`${id}: exact underweight restore missing`);
  let appliedUnder = applyVerifiedRescueInput(underSession, restore.candidateInput, 1);
  for (const task of pendingProductionTopUpTasks(appliedUnder)) {
    appliedUnder = confirmProductionTopUpTask(
      appliedUnder,
      task.taskId,
      '2026-09-05T13:00:00.000Z',
    );
  }
  appliedUnder = confirm(
    appliedUnder,
    appliedUnder.lines
      .filter((line) => !line.confirmed)
      .map((line) => [line.lineId, line.targetGrams] as const),
  );
  const underFinalInput = buildFinalActualInput(appliedUnder);
  const completedUnder = completeProductionSession(
    appliedUnder,
    calculateRecipe(underFinalInput),
    '2026-09-05T14:00:00.000Z',
    'owner',
  );

  const overEarlySession = confirm(sessionFor(`${id}-over-early`, input), [
    [deviationLine.id, deviationLine.planned_grams + 0.1],
  ]);
  const overEarlyAssessment = assessProductionRescue(overEarlySession);

  const pendingLine = byLargest.find(
    (item) => item.id !== deviationLine.id && item.lock_type !== 'main',
  )!;
  const lateSession = confirm(
    sessionFor(`${id}-late`, input),
    input.items
      .filter((item) => item.id !== pendingLine.id)
      .map(
        (item) =>
          [
            item.id,
            item.id === deviationLine.id ? item.planned_grams + 0.1 : item.planned_grams,
          ] as const,
      ),
  );
  const lateAssessment = assessProductionRescue(lateSession);

  const twoDeviationAssessment = assessProductionRescue(
    confirm(sessionFor(`${id}-two-under`, input), [
      [deviationLine.id, deviationLine.planned_grams - 1],
      [secondDeviationLine.id, secondDeviationLine.planned_grams - 1],
    ]),
  );

  const stabilizer = input.items.find(
    (item) =>
      item.ingredient.category === 'stabilizer' || item.ingredient.flags?.is_stabilizer === true,
  );
  if (!stabilizer) throw new Error(`${id}: canonical stabilizer line missing`);
  const stabilizerAssessment = assessProductionRescue(
    confirm(sessionFor(`${id}-stabilizer`, input), [
      [stabilizer.id, stabilizer.planned_grams + 0.1],
    ]),
  );

  const existingMain = input.items.find((item) => item.lock_type === 'main');
  const mainInput: RecipeInput = existingMain
    ? input
    : {
        ...input,
        items: input.items.map((item) =>
          item.id === deviationLine.id ? { ...item, lock_type: 'main' as const } : item,
        ),
      };
  const mainLine = mainInput.items.find((item) => item.lock_type === 'main')!;
  const mainAssessment = assessProductionRescue(
    confirm(sessionFor(`${id}-main`, mainInput), [[mainLine.id, mainLine.planned_grams + 5]]),
  );

  const fullyOverInput = {
    ...input,
    machine_capacity_grams: 1_200,
    machine_capacity_source: 'manual' as const,
  };
  const fullyOverSession = confirm(
    sessionFor(`${id}-add-only`, fullyOverInput),
    fullyOverInput.items.map(
      (item) =>
        [
          item.id,
          item.id === deviationLine.id ? item.planned_grams + 5 : item.planned_grams,
        ] as const,
    ),
  );
  const addOnlyRestore = assessProductionRescue(fullyOverSession).options.find(
    (option) => option.id === 'restore_original_recipe',
  );
  if (!addOnlyRestore) throw new Error(`${id}: add-only restore missing`);

  const capacityInput = {
    ...input,
    machine_capacity_grams: input.target_batch_grams,
    machine_capacity_source: 'manual' as const,
  };
  const capacitySession = confirm(
    sessionFor(`${id}-capacity`, capacityInput),
    capacityInput.items.map(
      (item) =>
        [
          item.id,
          item.id === deviationLine.id ? item.planned_grams + 5 : item.planned_grams,
        ] as const,
    ),
  );
  const capacityAssessment = assessProductionRescue(capacitySession);

  const evidence: ProfileEvidence = {
    input,
    baselineSession: sessionFor(`${id}-baseline`, input),
    exactSession,
    underSession,
    underAssessment,
    restore,
    appliedUnder,
    completedUnder,
    overEarlySession,
    overEarlyAssessment,
    lateAssessment,
    twoDeviationAssessment,
    stabilizerAssessment,
    mainAssessment,
    addOnlyRestore,
    capacityAssessment,
  };
  evidenceCache.set(id, evidence);
  return evidence;
};

const CORE_ASSERTIONS: ReadonlyArray<{
  name: string;
  assert: (evidence: ProfileEvidence) => void;
}> = [
  {
    name: '01 exact saved plan is hard-safe and terminal-valid',
    assert: ({ input, baselineSession }) => {
      expect(assessProductionHardSafety(input, calculateRecipe(input)).safe).toBe(true);
      expect(productionRescueTerminalAuthority(input, baselineSession).valid).toBe(true);
    },
  },
  {
    name: '02 exact weighing needs no Rescue',
    assert: ({ exactSession }) =>
      expect(assessProductionRescue(exactSession).state).toBe('not_needed'),
  },
  {
    name: '03 early underweight activates Rescue',
    assert: ({ underAssessment }) => expect(underAssessment.state).toBe('options'),
  },
  {
    name: '04 early underweight exposes exact-original restore',
    assert: ({ restore, input }) => expect(restore.finalMassG).toBe(input.target_batch_grams),
  },
  {
    name: '05 exact-original restore reproduces every saved target',
    assert: ({ restore, input }) => expect(vector(restore.candidateInput)).toEqual(vector(input)),
  },
  {
    name: '06 underweight top-up stays on the same canonical line',
    assert: ({ restore }) => {
      expect(restore.instructions).toHaveLength(1);
      expect(restore.instructions[0]).toMatchObject({ kind: 'add', grams: 1 });
    },
  },
  {
    name: '07 restore never duplicates a canonical ingredient',
    assert: ({ restore }) => {
      const canonical = restore.candidateInput.items.map((item) =>
        canonicalIngredientId(item.ingredient),
      );
      expect(new Set(canonical).size).toBe(canonical.length);
    },
  },
  {
    name: '08 small early overweight receives a live continuation',
    assert: ({ overEarlyAssessment }) => {
      expect(productionContinuationPath(overEarlyAssessment)).not.toBe('recovery_required');
    },
  },
  {
    name: '09 remaining-plan correction is selectable by stable id',
    assert: ({ overEarlyAssessment }) => expect(correctionFor(overEarlyAssessment)).not.toBeNull(),
  },
  {
    name: '10 early deviation retains several unconfirmed ingredients',
    assert: ({ overEarlySession }) => {
      expect(overEarlySession.lines.filter((line) => !line.confirmed).length).toBeGreaterThan(1);
    },
  },
  {
    name: '11 one remaining ingredient does not create a generic dead-end',
    assert: ({ lateAssessment }) => {
      expect(productionContinuationPath(lateAssessment)).not.toBe('recovery_required');
    },
  },
  {
    name: '12 two simultaneous underweights restore the saved plan',
    assert: ({ twoDeviationAssessment, input }) => {
      const restore = twoDeviationAssessment.options.find(
        (option) => option.id === 'restore_original_recipe',
      );
      expect(restore?.finalMassG).toBe(input.target_batch_grams);
      expect(restore?.instructions).toHaveLength(2);
    },
  },
  {
    name: '13 stabilizer tenth-gram deviation retains a safe path',
    assert: ({ stabilizerAssessment }) => {
      expect(productionContinuationPath(stabilizerAssessment)).not.toBe('recovery_required');
    },
  },
  {
    name: '14 Main overweight is evaluated by terminal authority',
    assert: ({ mainAssessment }) => {
      expect(correctionFor(mainAssessment)?.verifiedByEngine).toBe(true);
    },
  },
  {
    name: '15 all-confirmed overweight uses add-only recovery when capacity allows',
    assert: ({ addOnlyRestore, input }) => {
      expect(addOnlyRestore.finalMassG).toBeGreaterThan(input.target_batch_grams);
      expect(addOnlyRestore.instructions.length).toBeGreaterThan(0);
      expect(addOnlyRestore.instructions.every((instruction) => instruction.kind === 'add')).toBe(
        true,
      );
    },
  },
  {
    name: '16 hard capacity refusal reports exact physical and limit masses',
    assert: ({ capacityAssessment, input }) => {
      expect(capacityAssessment.state).toBe('impossible');
      expect(capacityAssessment.diagnostics.physicalConfirmedG).toBe(input.target_batch_grams + 5);
      expect(capacityAssessment.diagnostics.machineCapacityG).toBe(input.target_batch_grams);
    },
  },
  {
    name: '17 applying correction persists a new Rescue revision',
    assert: ({ appliedUnder }) => expect(appliedUnder.durableRescueRevision).toBe(1),
  },
  {
    name: '18 corrected weighing can continue through every remaining row',
    assert: ({ appliedUnder }) => {
      expect(appliedUnder.lines.every((line) => line.confirmed)).toBe(true);
      expect(pendingProductionTopUpTasks(appliedUnder)).toEqual([]);
    },
  },
  {
    name: '19 corrected final vector remains Engine and terminal valid',
    assert: ({ appliedUnder }) => {
      const input = buildFinalActualInput(appliedUnder);
      expect(detectViolations(calculateRecipe(input))).toEqual([]);
      expect(productionRescueTerminalAuthority(input, appliedUnder).valid).toBe(true);
    },
  },
  {
    name: '20 corrected run completes and survives structured reload data',
    assert: ({ completedUnder }) => {
      const reloaded = structuredClone(completedUnder);
      expect(reloaded.status).toBe('completed');
      expect(reloaded.completionSnapshot).not.toBeNull();
      expect(reloaded.durableRescueRevision).toBe(1);
    },
  },
];

describe('Production Rescue fast four-profile matrix', () => {
  it.each(
    PROFILES.flatMap((profile) => CORE_ASSERTIONS.map((contract) => ({ profile, contract }))),
  )('$profile.id $contract.name', ({ profile, contract }) =>
    contract.assert(buildEvidence(profile)),
  );

  it.each(
    PROFILES.flatMap(({ id, input }) =>
      [
        ['sweetness-lower', -1, 0],
        ['sweetness-higher', 1, 0],
        ['hardness-harder', 0, -1],
        ['hardness-softer', 0, 1],
        ['combined', 1, 1],
      ].map(([variant, sweetness, softness]) => ({
        id,
        variant,
        input: directed(
          input,
          sweetness as RecipeDirectionTarget,
          softness as RecipeDirectionTarget,
        ),
      })),
    ),
  )('$id $variant restores an early underweight with the selected directions', ({ id, input }) => {
    const changed = [...input.items].sort(
      (left, right) => right.planned_grams - left.planned_grams,
    )[0]!;
    const session = confirm(sessionFor(`${id}-slider`, input), [
      [changed.id, changed.planned_grams - 1],
    ]);
    const restore = assessProductionRescue(session).options.find(
      (option) => option.id === 'restore_original_recipe',
    );
    expect(restore?.finalMassG).toBe(input.target_batch_grams);
    expect(vector(restore!.candidateInput)).toEqual(vector(input));
    expect(productionRescueTerminalAuthority(restore!.candidateInput, session).valid).toBe(true);
  });
});
