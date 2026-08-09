import { describe, expect, it } from 'vitest';
import { calculateRecipe, type RecipeInput } from '@/engine';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import {
  applyVerifiedRescueInput,
  buildFinalActualInput,
  buildProductionForecastInput,
  completeProductionSession,
  confirmProductionLine,
  correctRecordedPhysicalGrams,
  createProductionSession,
  productionProgress,
  productionStepForGrams,
  reopenProductionRecord,
  setDraftActualGrams,
} from './productionSession';

function recipe(): RecipeInput {
  return {
    items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
    mode: 'classic',
    category: DEFAULT_PRESET.category,
    target_temperature_c: DEFAULT_PRESET.target_temperature_c,
    target_batch_grams: DEFAULT_PRESET.target_batch_grams,
    machine_capacity_grams: null,
    goals: { flavor_intensity: 'balanced', cost_priority: 'balanced' },
  };
}

function session() {
  return createProductionSession({
    sessionId: 'run-1',
    ownerUserId: 'owner-1',
    source: {
      recipeId: 'recipe-1',
      recipeVersionId: 'version-1',
      recipeVersionNumber: 1,
      recipeName: 'Milk base',
    },
    plannedInput: recipe(),
    startedAt: '2026-08-09T10:00:00.000Z',
  });
}

describe('production session physical-reality contract', () => {
  it('defaults every editable actual to plan without marking material as added', () => {
    const run = session();
    expect(run.lines.every((line) => line.draftActualGrams === line.plannedGrams)).toBe(true);
    expect(run.lines.every((line) => line.physicalAddedGrams === 0 && !line.confirmed)).toBe(true);
    expect(run.plannedInput.items.every((line) => line.actual_grams === null)).toBe(true);
  });

  it('does not score an unconfirmed edit, then forecasts from confirmed actual + pending plan', () => {
    const run = session();
    const line = run.lines[0]!;
    const edited = setDraftActualGrams(run, line.lineId, line.plannedGrams + 2);
    expect(buildProductionForecastInput(edited).items[0]!.planned_grams).toBe(line.plannedGrams);
    expect(buildProductionForecastInput(edited).items[0]!.actual_grams).toBeNull();

    const confirmed = confirmProductionLine(edited, line.lineId, '2026-08-09T10:01:00.000Z');
    const forecast = buildProductionForecastInput(confirmed);
    expect(forecast.items[0]!.actual_grams).toBe(line.plannedGrams + 2);
    expect(forecast.items[1]!.actual_grams).toBeNull();
    expect(calculateRecipe(forecast).total_batch_g).toBeCloseTo(1002, 8);
  });

  it('keeps the planned recipe immutable while exact, +2 g and -2 g actuals are recorded', () => {
    const run = session();
    const [a, b, c] = run.lines;
    let next = confirmProductionLine(run, a!.lineId, '2026-08-09T10:01:00.000Z');
    next = setDraftActualGrams(next, b!.lineId, b!.plannedGrams + 2);
    next = confirmProductionLine(next, b!.lineId, '2026-08-09T10:02:00.000Z');
    next = setDraftActualGrams(next, c!.lineId, c!.plannedGrams - 2);
    next = confirmProductionLine(next, c!.lineId, '2026-08-09T10:03:00.000Z');

    expect(next.plannedInput.items.map((item) => item.planned_grams)).toEqual(
      run.plannedInput.items.map((item) => item.planned_grams),
    );
    expect(next.lines.slice(0, 3).map((line) => line.physicalAddedGrams)).toEqual([
      a!.plannedGrams,
      b!.plannedGrams + 2,
      c!.plannedGrams - 2,
    ]);
  });

  it('never lets an accepted rescue reduce already-confirmed material', () => {
    const run = session();
    const line = run.lines[0]!;
    const confirmed = confirmProductionLine(
      setDraftActualGrams(run, line.lineId, line.plannedGrams + 12),
      line.lineId,
      '2026-08-09T10:01:00.000Z',
    );
    const illegal = buildProductionForecastInput(confirmed);
    illegal.items[0] = { ...illegal.items[0]!, actual_grams: null, planned_grams: line.plannedGrams };
    expect(() => applyVerifiedRescueInput(confirmed, illegal)).toThrow(/reduce physically added/);
  });

  it('turns a verified top-up into a pending confirmation while retaining the physical floor', () => {
    const run = session();
    const line = run.lines[0]!;
    const confirmed = confirmProductionLine(run, line.lineId, '2026-08-09T10:01:00.000Z');
    const target = buildProductionForecastInput(confirmed);
    target.items[0] = {
      ...target.items[0]!,
      actual_grams: null,
      planned_grams: line.plannedGrams + 3,
    };
    const rescued = applyVerifiedRescueInput(confirmed, target);
    expect(rescued.lines[0]).toMatchObject({
      physicalAddedGrams: line.plannedGrams,
      targetGrams: line.plannedGrams + 3,
      draftActualGrams: line.plannedGrams + 3,
      confirmed: false,
    });
    expect(productionProgress(rescued)).toMatchObject({
      confirmedCount: 0,
      confirmedMassG: line.plannedGrams,
    });
    expect(() => setDraftActualGrams(rescued, line.lineId, line.plannedGrams - 1)).toThrow(
      /cannot remove physically added/,
    );
  });

  it('requires an explicit record-correction path for a human entry mistake', () => {
    const run = session();
    const line = run.lines[0]!;
    const confirmed = confirmProductionLine(run, line.lineId, '2026-08-09T10:01:00.000Z');
    expect(() => setDraftActualGrams(confirmed, line.lineId, line.plannedGrams - 1)).toThrow(
      /record correction/,
    );
    const reopened = reopenProductionRecord(confirmed, line.lineId);
    const corrected = correctRecordedPhysicalGrams(reopened, line.lineId, line.plannedGrams - 1);
    expect(corrected.lines[0]).toMatchObject({
      physicalAddedGrams: line.plannedGrams - 1,
      draftActualGrams: line.plannedGrams - 1,
      recordCorrectionCount: 1,
      confirmed: false,
    });
  });

  it('freezes a final actual snapshot and never mutates the source plan', () => {
    let run = session();
    for (const [index, line] of run.lines.entries()) {
      if (index === 0) run = setDraftActualGrams(run, line.lineId, line.plannedGrams + 2);
      run = confirmProductionLine(run, line.lineId, `2026-08-09T10:0${index + 1}:00.000Z`);
    }
    const finalInput = buildFinalActualInput(run);
    const finalResult = calculateRecipe(finalInput);
    const completed = completeProductionSession(
      run,
      finalResult,
      '2026-08-09T11:00:00.000Z',
      'owner-1',
    );
    expect(completed.status).toBe('completed');
    expect(completed.completionSnapshot?.actualFinalMassG).toBeCloseTo(1002, 8);
    expect(completed.completionSnapshot?.plannedInput.target_batch_grams).toBe(1000);
    expect(completed.completionSnapshot?.finalActualInput.target_batch_grams).toBeCloseTo(1002, 8);
    expect(completed.completionSnapshot?.confirmedOrder).toHaveLength(run.lines.length);
    expect(productionProgress(run).coherent).toBe(true);
  });

  it('uses precision-preserving context steps without rounding the stored value', () => {
    expect(productionStepForGrams(4.25)).toBe(0.1);
    expect(productionStepForGrams(42.125)).toBe(0.5);
    expect(productionStepForGrams(420.125)).toBe(1);
    const run = session();
    const line = run.lines[0]!;
    expect(setDraftActualGrams(run, line.lineId, 671.123_456).lines[0]!.draftActualGrams).toBe(
      671.123_456,
    );
  });
});
