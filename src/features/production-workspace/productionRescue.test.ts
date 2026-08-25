import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
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

describe('production rescue orchestration', () => {
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

  it('reproduces the accepted 130 g → 180 g sucrose rescue without rewriting physical history', () => {
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
    expect(enlarge!.finalMassG).toBe(1278);
    expect(
      enlarge!.candidateInput.items.every((item) => Number.isInteger(item.planned_grams)),
    ).toBe(true);
    expect(enlarge!.candidateInput.items.every((item) => item.actual_grams === null)).toBe(true);
    expect(enlarge!.practicalAudit.executableResult).not.toBe(enlarge!.practicalAudit.exactResult);
    expect(enlarge!.practicalAudit.hardGatePassed).toBe(true);
    expect(enlarge!.scoreDisplay).toBe('10/10');
    const creamInstructions = enlarge!.instructions.filter((instruction) =>
      instruction.ingredientName.toLowerCase().includes('cream'),
    );
    expect(creamInstructions).toHaveLength(1);
    expect(creamInstructions[0]!.grams).toBe(228);
    const exactCream = enlarge!.exactCandidateInput.items.find((item) =>
      item.ingredient.name.toLowerCase().includes('cream'),
    )!;
    const beforeCream = assessment.forecastInput.items.find((item) =>
      item.ingredient.name.toLowerCase().includes('cream'),
    )!;
    expect(
      (exactCream.actual_grams ?? exactCream.planned_grams) -
        (beforeCream.actual_grams ?? beforeCream.planned_grams),
    ).toBeCloseTo(227.75342952471976, 8);
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
      expect.arrayContaining([expect.objectContaining({ lineId: 'dextrose', kind: 'add' })]),
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
