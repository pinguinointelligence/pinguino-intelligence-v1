import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectViolations, evaluateAdditiveRecoveryNeighborhood, type RecipeInput } from '@/engine';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import { parseCsv } from '@/lib/csv';
import {
  confirmProductionLine,
  createProductionSession,
  setDraftActualGrams,
} from './productionSession';
import { assessProductionRescue } from './productionRescue';

const input: RecipeInput = {
  items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
  mode: 'classic',
  category: DEFAULT_PRESET.category,
  target_temperature_c: DEFAULT_PRESET.target_temperature_c,
  target_batch_grams: DEFAULT_PRESET.target_batch_grams,
  machine_capacity_grams: null,
};

const make = () =>
  createProductionSession({
    sessionId: 'run-rescue',
    ownerUserId: 'owner',
    source: {
      recipeId: 'recipe',
      recipeVersionId: 'version',
      recipeVersionNumber: 1,
      recipeName: 'Milk base',
    },
    plannedInput: input,
    startedAt: '2026-08-09T10:00:00.000Z',
  });

const ownerScenario = (formulationStrategy: 'optimal' | 'eco' = 'optimal'): RecipeInput => {
  const starter = buildCanonicalNewRecipeStarter({
    visibleProductType: 'gelato',
    servingModeId: 'temp_minus_11',
    formulationStrategy,
    targetBatchGrams: 1_000,
  });
  const grams = [480, 318, 48, 105, 46, 3] as const;
  return {
    items: starter.items.map((item, index) => ({
      ...item,
      id: ['milk', 'cream', 'smp', 'sucrose', 'dextrose', 'tara'][index]!,
      planned_grams: grams[index]!,
      actual_grams: null,
    })),
    mode: 'classic',
    category: starter.category,
    target_temperature_c: starter.targetTemperatureC,
    target_batch_grams: 1_000,
    machine_capacity_grams: null,
    goals: { formulation_strategy: starter.formulationStrategy },
  };
};

const makeOwnerScenario = (formulationStrategy: 'optimal' | 'eco' = 'optimal') =>
  createProductionSession({
    sessionId: 'run-owner-scenario',
    ownerUserId: 'owner',
    source: {
      recipeId: 'recipe',
      recipeVersionId: 'version',
      recipeVersionNumber: 1,
      recipeName: 'Owner milk base',
    },
    plannedInput: ownerScenario(formulationStrategy),
    startedAt: '2026-08-25T10:00:00.000Z',
  });

const [mapperHeader = [], ...mapperRecords] = parseCsv(
  readFileSync(resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'), 'utf8'),
);
const mapperIndex = new Map(mapperHeader.map((name, position) => [name, position]));
const mapperRecordsById = new Map(
  mapperRecords.map((record) => [record[mapperIndex.get('ingredient_id')!]!, record]),
);
const mapperTriStateFields = new Set(['vegan', 'dairy_free', 'gluten_free', 'contains_alcohol']);
const mapperNumericFields = new Set(
  mapperHeader.filter((field) =>
    /_percent$|_value$|_factor$|brix|kcal|cost_per_kg|shelf_life_days|stabilizer_activity/.test(
      field,
    ),
  ),
);

/**
 * Read the immutable Mapper source of truth instead of approximating the owner
 * recipe with demo ingredients. PI-ING-000270 is skimmed-milk powder, not milk.
 */
const verifiedMapperIngredient = (ingredientId: string) => {
  const record = mapperRecordsById.get(ingredientId);
  if (!record) throw new Error(`Missing immutable Mapper row ${ingredientId}`);
  const row = Object.fromEntries(
    mapperHeader.map((field, position) => {
      const raw = record[position]?.trim() ?? '';
      if (mapperTriStateFields.has(field)) return [field, raw.toLocaleLowerCase('en')];
      if (mapperNumericFields.has(field)) return [field, raw === '' ? null : Number(raw)];
      if (
        field === 'approved_for_base' ||
        field === 'approved_for_engines' ||
        field === 'is_active'
      ) {
        return [field, raw.toLocaleLowerCase('en') === 'true'];
      }
      if (field === 'verification_date' || field === 'last_reviewed_at') {
        return [field, raw || null];
      }
      return [field, raw];
    }),
  ) as unknown as IngredientRow;
  return ingredientRowToEngineIngredient(row);
};

const exactOwnerEightLineInput = (): RecipeInput => {
  const rows = [
    ['milk', 'PI-ING-000236', 584],
    ['cream', 'PI-ING-000180', 98],
    ['skimmed_milk_powder', 'PI-ING-000270', 56],
    ['sucrose', 'PI-ING-000514', 59],
    ['dextrose', 'PI-ING-000494', 64],
    ['tara', 'PI-ING-000492', 3],
    ['fructose', 'PI-ING-000496', 5],
    ['banana', 'PI-ING-000345', 131],
  ] as const;
  return {
    items: rows.map(([id, ingredientId, grams]) => ({
      id,
      ingredient: verifiedMapperIngredient(ingredientId),
      planned_grams: grams,
      actual_grams: null,
      lock_type: id === 'banana' ? ('main' as const) : ('unlocked' as const),
    })),
    mode: 'classic',
    category: 'milk_gelato',
    target_temperature_c: -11,
    target_batch_grams: 1_000,
    machine_capacity_grams: null,
    goals: { formulation_strategy: 'optimal' },
  };
};

const makeExactOwnerEightLineSession = () =>
  createProductionSession({
    sessionId: 'run-owner-eight-line-plus-2-5',
    ownerUserId: 'owner',
    source: {
      recipeId: 'recipe-owner-eight-line',
      recipeVersionId: 'version-owner-eight-line',
      recipeVersionNumber: 1,
      recipeName: 'Owner banana gelato',
    },
    plannedInput: exactOwnerEightLineInput(),
    startedAt: '2026-08-25T12:00:00.000Z',
  });

const exactOwnerSessionAtCheckpoint = (confirmedCount: 1 | 3 | 6, smpOverageG: number) => {
  let run = makeExactOwnerEightLineSession();
  const confirmations =
    confirmedCount === 1
      ? ([['skimmed_milk_powder', 56 + smpOverageG]] as const)
      : ([
          ['milk', 584],
          ['cream', 98],
          ['skimmed_milk_powder', 56 + smpOverageG],
          ...(confirmedCount === 6
            ? ([
                ['sucrose', 59],
                ['dextrose', 64],
                ['tara', 3],
              ] as const)
            : []),
        ] as const);
  confirmations.forEach(([lineId, grams], index) => {
    run = confirmProductionLine(
      setDraftActualGrams(run, lineId, grams),
      lineId,
      `2026-08-25T13:${String(index + 1).padStart(2, '0')}:00.000Z`,
    );
  });
  return run;
};

describe('production rescue orchestration', () => {
  it('permanently reproduces the owner 3/8 confirmed skimmed-milk +2.5 g incident against the completed forecast', () => {
    let run = makeExactOwnerEightLineSession();
    for (const [lineId, grams, minute] of [
      ['milk', 584, '01'],
      ['cream', 98, '02'],
      ['skimmed_milk_powder', 58.5, '03'],
    ] as const) {
      run = confirmProductionLine(
        setDraftActualGrams(run, lineId, grams),
        lineId,
        `2026-08-25T12:${minute}:00.000Z`,
      );
    }

    expect(run.lines.filter((line) => line.confirmed)).toHaveLength(3);
    expect(run.lines.reduce((sum, line) => sum + line.physicalAddedGrams, 0)).toBe(740.5);
    const assessment = assessProductionRescue(run);
    expect(
      assessment.forecastInput.items.reduce(
        (sum, item) => sum + (item.actual_grams ?? item.planned_grams),
        0,
      ),
    ).toBe(1002.5);
    expect(assessment.state).toBe('options');
    expect(assessment.options.length).toBeGreaterThan(0);
    expect(
      detectViolations(assessment.forecastResult).map((violation) => violation.reason),
    ).toEqual(['protein_in_solids_high', 'lactose_high']);
    const minimum = assessment.options.find((option) => option.id === 'enlarge_batch');
    expect(minimum).toMatchObject({ finalMassG: 1007, scoreDisplay: '10/10' });
    expect(minimum?.instructions).toEqual([
      expect.objectContaining({ lineId: 'sucrose', grams: 4.5, finalTargetGrams: 63.5 }),
    ]);
    const restore = assessment.options.find((option) => option.id === 'restore_original_recipe');
    expect(restore).toMatchObject({ finalMassG: 1045, scoreDisplay: '10/10' });
    expect(restore?.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ lineId: 'milk', grams: 26, finalTargetGrams: 610 }),
        expect.objectContaining({ lineId: 'cream', grams: 4, finalTargetGrams: 102 }),
        expect.objectContaining({
          lineId: 'skimmed_milk_powder',
          grams: 0.5,
          finalTargetGrams: 59,
        }),
      ]),
    );
    expect(assessment.options.some((option) => option.id === 'leave_as_is')).toBe(false);
    expect(assessment.strategyTrace.enlarge_batch).toMatchObject({
      generatedSafeCandidateCount: expect.any(Number),
      acceptedCandidateCount: expect.any(Number),
      finalCandidateGrams: expect.arrayContaining([1007]),
    });
  });

  it('records the +1 / +2.5 / +5 / +10 g skimmed-milk neighborhood at 1/8, 3/8 and 6/8 confirmations', () => {
    const matrix = ([1, 3, 6] as const).flatMap((confirmedCount) =>
      [1, 2.5, 5, 10].map((overageG) => {
        const assessment = assessProductionRescue(
          exactOwnerSessionAtCheckpoint(confirmedCount, overageG),
        );
        return {
          confirmedCount,
          overageG,
          preserve: (assessment.strategyTrace.keep_original_batch?.acceptedCandidateCount ?? 0) > 0,
          enlarge: (assessment.strategyTrace.enlarge_batch?.acceptedCandidateCount ?? 0) > 0,
          restore:
            (assessment.strategyTrace.restore_original_recipe?.acceptedCandidateCount ?? 0) > 0,
          unchanged: assessment.options.some((option) => option.id === 'leave_as_is'),
          hardReasons: detectViolations(assessment.forecastResult).map(
            (violation) => violation.reason,
          ),
          candidateCount: assessment.strategyTrace.enlarge_batch?.acceptedCandidateCount ?? 0,
          finalCandidateGrams: assessment.strategyTrace.enlarge_batch?.finalCandidateGrams ?? [],
        };
      }),
    );
    expect(matrix).toHaveLength(12);
    const expectedByOverage = {
      1: {
        preserve: false,
        enlarge: true,
        restore: true,
        unchanged: true,
        hardReasons: [],
        candidateCount: 12,
        minimumFinalG: 1001.1,
      },
      2.5: {
        preserve: false,
        enlarge: true,
        restore: true,
        unchanged: false,
        hardReasons: ['protein_in_solids_high', 'lactose_high'],
        candidateCount: 2,
        minimumFinalG: 1007,
      },
      5: {
        preserve: false,
        enlarge: true,
        restore: true,
        unchanged: false,
        hardReasons: ['protein_in_solids_high', 'lactose_high'],
        candidateCount: 2,
        minimumFinalG: 1054.8,
      },
      10: {
        preserve: false,
        enlarge: true,
        restore: true,
        unchanged: false,
        hardReasons: ['protein_in_solids_high', 'lactose_high', 'lactose_sandiness_risk_high'],
        candidateCount: 2,
        minimumFinalG: 1140.2,
      },
    } as const;
    for (const row of matrix) {
      const expected = expectedByOverage[row.overageG as keyof typeof expectedByOverage];
      expect({
        preserve: row.preserve,
        enlarge: row.enlarge,
        restore: row.restore,
        unchanged: row.unchanged,
        hardReasons: row.hardReasons,
        candidateCount: row.candidateCount,
        minimumFinalG: Math.min(...row.finalCandidateGrams),
      }).toEqual(expected);
    }

    const exactThreeOfEight = exactOwnerSessionAtCheckpoint(3, 2.5);
    const diagnostic = evaluateAdditiveRecoveryNeighborhood(
      assessProductionRescue(exactThreeOfEight).forecastInput,
      [1, 2.5, 5, 10],
    ).filter((row) => row.lineId === 'dextrose');
    expect(diagnostic.map((row) => [row.additionG, row.hardSafe])).toEqual([
      [1, false],
      [2.5, false],
      [5, false],
      [10, false],
    ]);
  });

  it('keeps the accepted +1 g Dextrose unchanged branch available', () => {
    const directed = exactOwnerEightLineInput();
    directed.goals = {
      ...directed.goals,
      direction_targets_active: true,
      direction_targets: { sweetness: -2, softness: -2, creaminess: 0, flavor: 0 },
    };
    let run = createProductionSession({
      sessionId: 'run-owner-dextrose-plus-one-control',
      ownerUserId: 'owner',
      source: {
        recipeId: 'recipe-owner-dextrose-control',
        recipeVersionId: 'version-owner-dextrose-control',
        recipeVersionNumber: 1,
        recipeName: 'Owner Dextrose control',
      },
      plannedInput: directed,
      startedAt: '2026-08-25T14:00:00.000Z',
    });
    for (const [lineId, grams, minute] of [
      ['milk', 584, '01'],
      ['cream', 98, '02'],
      ['skimmed_milk_powder', 56, '03'],
      ['sucrose', 59, '04'],
      ['dextrose', 65, '05'],
    ] as const) {
      run = confirmProductionLine(
        setDraftActualGrams(run, lineId, grams),
        lineId,
        `2026-08-25T14:${minute}:00.000Z`,
      );
    }
    const assessment = assessProductionRescue(run);
    expect(assessment.forecastScoreDisplay).toBe('8/10');
    expect(assessment.options.find((option) => option.id === 'leave_as_is')).toBeDefined();
  });

  it('does not propose rescue for exact production', () => {
    const run = make();
    const confirmed = confirmProductionLine(run, run.lines[0]!.lineId, '2026-08-09T10:01:00.000Z');
    expect(assessProductionRescue(confirmed).state).toBe('not_needed');
  });

  it('offers leave-as-is only when the final forecast remains natively safe', () => {
    const run = make();
    const line = run.lines[0]!;
    const confirmed = confirmProductionLine(
      setDraftActualGrams(run, line.lineId, line.plannedGrams + 2),
      line.lineId,
      '2026-08-09T10:01:00.000Z',
    );
    const assessment = assessProductionRescue(confirmed);
    const leave = assessment.options.find((option) => option.id === 'leave_as_is');
    if (leave) {
      expect(leave.verifiedByEngine).toBe(true);
      expect(leave.scoreDisplay).toBe('10/10');
    } else {
      expect(assessment.state).toMatch(/options|impossible/);
    }
  });

  it('never exposes a candidate that reduces confirmed physical material', () => {
    const run = make();
    const line = run.lines.find((candidate) => candidate.name.toLowerCase().includes('sucrose'))!;
    const confirmed = confirmProductionLine(
      setDraftActualGrams(run, line.lineId, line.plannedGrams + 120),
      line.lineId,
      '2026-08-09T10:01:00.000Z',
    );
    const assessment = assessProductionRescue(confirmed);
    for (const option of assessment.options) {
      const candidateLine = option.candidateInput.items.find((item) => item.id === line.lineId)!;
      expect(candidateLine.actual_grams ?? candidateLine.planned_grams).toBeGreaterThanOrEqual(
        line.plannedGrams + 120,
      );
      expect(option.instructions.every((instruction) => instruction.grams > 0)).toBe(true);
      if (option.id === 'enlarge_batch') {
        expect(option.instructions.every((instruction) => instruction.kind === 'add')).toBe(true);
      }
    }
  });

  it('folds solver top-ups into the existing canonical line instead of duplicating it', () => {
    const run = make();
    const sucrose = run.lines.find((candidate) =>
      candidate.name.toLowerCase().includes('sucrose'),
    )!;
    const confirmed = confirmProductionLine(
      setDraftActualGrams(run, sucrose.lineId, sucrose.plannedGrams + 50),
      sucrose.lineId,
      '2026-08-09T10:01:00.000Z',
    );
    const assessment = assessProductionRescue(confirmed);
    const enlarge = assessment.options.find((option) => option.id === 'enlarge_batch');

    expect(enlarge).toBeDefined();
    const canonicalIds = enlarge!.candidateInput.items.map((item) =>
      canonicalIngredientId(item.ingredient),
    );
    expect(new Set(canonicalIds).size).toBe(canonicalIds.length);
    expect(enlarge!.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lineId: expect.any(String),
          ingredientName: expect.stringContaining('Cream'),
          kind: 'add',
        }),
      ]),
    );
  });

  it('replaces the former 1278 g rescue with the smallest Engine-proven safe addition', () => {
    const run = make();
    const sucrose = run.lines.find((candidate) =>
      candidate.name.toLowerCase().includes('sucrose'),
    )!;
    expect(sucrose.plannedGrams).toBe(130);
    const confirmed = confirmProductionLine(
      setDraftActualGrams(run, sucrose.lineId, 180),
      sucrose.lineId,
      '2026-08-09T10:01:00.000Z',
    );
    const assessment = assessProductionRescue(confirmed);
    const enlarge = assessment.options.find((option) => option.id === 'enlarge_batch');

    expect(enlarge).toBeDefined();
    const rescuedSucrose = enlarge!.candidateInput.items.find(
      (item) => item.id === sucrose.lineId,
    )!;
    expect(rescuedSucrose.actual_grams ?? rescuedSucrose.planned_grams).toBe(180);
    expect(enlarge!.finalMassG).toBe(1236.2);
    expect(enlarge!.finalMassG).toBeLessThan(1278);
    expect(
      enlarge!.candidateInput.items.every(
        (item) => Math.abs(item.planned_grams * 10 - Math.round(item.planned_grams * 10)) <= 1e-8,
      ),
    ).toBe(true);
    expect(enlarge!.candidateInput.items.every((item) => item.actual_grams === null)).toBe(true);
    expect(enlarge!.practicalAudit.modelVersion).toBe('production-tenth-gram-v1');
    expect(enlarge!.practicalAudit.hardGatePassed).toBe(true);
    expect(enlarge!.scoreDisplay).toBe('10/10');
    const creamInstructions = enlarge!.instructions.filter((instruction) =>
      instruction.ingredientName.toLowerCase().includes('cream'),
    );
    expect(creamInstructions).toHaveLength(1);
    expect(creamInstructions[0]!.grams).toBeCloseTo(186.2, 8);
    const exactCream = enlarge!.exactCandidateInput.items.find((item) =>
      item.ingredient.name.toLowerCase().includes('cream'),
    )!;
    const beforeCream = assessment.forecastInput.items.find((item) =>
      item.ingredient.name.toLowerCase().includes('cream'),
    )!;
    expect(
      (exactCream.actual_grams ?? exactCream.planned_grams) -
        (beforeCream.actual_grams ?? beforeCream.planned_grams),
    ).toBeCloseTo(186.2, 8);
    const canonicalIds = enlarge!.candidateInput.items.map((item) =>
      canonicalIngredientId(item.ingredient),
    );
    expect(new Set(canonicalIds).size).toBe(canonicalIds.length);
  });

  it('evaluates the owner Cream 320 g + Dextrose 59.5 g case with confirmed amounts as lower bounds', () => {
    let run = makeOwnerScenario();
    run = confirmProductionLine(
      setDraftActualGrams(run, 'cream', 320),
      'cream',
      '2026-08-25T10:01:00.000Z',
    );
    run = confirmProductionLine(
      setDraftActualGrams(run, 'dextrose', 59.5),
      'dextrose',
      '2026-08-25T10:02:00.000Z',
    );

    const assessment = assessProductionRescue(run);
    const enlarge = assessment.options.find((option) => option.id === 'enlarge_batch');
    expect(enlarge).toBeDefined();
    expect(enlarge!.candidateInput.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'cream', planned_grams: expect.any(Number) }),
        expect.objectContaining({ id: 'dextrose', planned_grams: expect.any(Number) }),
      ]),
    );
    expect(
      enlarge!.candidateInput.items.find((item) => item.id === 'cream')!.planned_grams,
    ).toBeGreaterThanOrEqual(320);
    expect(
      enlarge!.candidateInput.items.find((item) => item.id === 'dextrose')!.planned_grams,
    ).toBeGreaterThanOrEqual(59.5);
    expect(enlarge!.instructions).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'add' })]),
    );
  });

  it('keeps the served ECO owner recipe hard-safe after a 2 g Cream overage', () => {
    let run = makeOwnerScenario('eco');
    run = confirmProductionLine(run, 'milk', '2026-08-25T10:01:00.000Z');
    run = confirmProductionLine(
      setDraftActualGrams(run, 'cream', 320),
      'cream',
      '2026-08-25T10:02:00.000Z',
    );

    const assessment = assessProductionRescue(run);
    expect(assessment.options.map((option) => option.id)).toEqual(['leave_as_is']);
    expect(assessment.options[0]?.verifiedByEngine).toBe(true);
    expect(assessment.options[0]?.scoreDisplay).toBe('10/10');
  });

  it('can add more to an already-confirmed ingredient without subtracting its physical amount', () => {
    let run = make();
    const cream = run.lines.find((line) => line.name.toLowerCase().includes('cream'))!;
    const sucrose = run.lines.find((line) => line.name.toLowerCase().includes('sucrose'))!;
    run = confirmProductionLine(run, cream.lineId, '2026-08-25T10:01:00.000Z');
    run = confirmProductionLine(
      setDraftActualGrams(run, sucrose.lineId, sucrose.plannedGrams + 50),
      sucrose.lineId,
      '2026-08-25T10:02:00.000Z',
    );

    const enlarge = assessProductionRescue(run).options.find(
      (option) => option.id === 'enlarge_batch',
    );
    expect(enlarge).toBeDefined();
    const creamAddition = enlarge!.instructions.find(
      (instruction) => instruction.lineId === cream.lineId && instruction.kind === 'add',
    );
    expect(creamAddition?.grams).toBeGreaterThan(0);
    expect(creamAddition?.finalTargetGrams).toBeGreaterThan(cream.physicalAddedGrams);
  });

  it('treats an explicitly confirmed zero as a real deviation and never as false success', () => {
    const run = makeOwnerScenario();
    const entered = setDraftActualGrams(run, 'dextrose', 0);
    expect(entered.lines.find((line) => line.lineId === 'dextrose')).toMatchObject({
      draftActualEdited: true,
      physicalAddedGrams: 0,
      confirmed: false,
    });

    const confirmed = confirmProductionLine(entered, 'dextrose', '2026-08-25T10:01:00.000Z');
    expect(confirmed.lines.find((line) => line.lineId === 'dextrose')).toMatchObject({
      draftActualEdited: false,
      physicalAddedGrams: 0,
      confirmed: true,
    });
    const assessment = assessProductionRescue(confirmed);
    expect(assessment.hasConfirmedDeviation).toBe(true);
    expect(assessment.state).not.toBe('not_needed');
    expect(assessment.options.every((option) => option.verifiedByEngine)).toBe(true);
  });

  it('returns an honest impossible state instead of inventing grams when no candidate verifies', () => {
    let run = make();
    for (const line of run.lines) {
      const grams = line.name.toLowerCase().includes('sucrose')
        ? line.plannedGrams + 500
        : line.plannedGrams;
      run = setDraftActualGrams(run, line.lineId, grams);
      run = confirmProductionLine(
        run,
        line.lineId,
        `2026-08-09T10:${line.confirmationOrder ?? '10'}:00.000Z`,
      );
    }
    const assessment = assessProductionRescue(run);
    if (assessment.state === 'impossible') {
      expect(assessment.options).toEqual([]);
      expect(assessment.reason).toMatch(/Brak bezpiecznej korekty/);
    } else {
      expect(assessment.options.every((option) => option.verifiedByEngine)).toBe(true);
    }
  });
});
