import { describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import { DEFAULT_PRESET } from '@/data/demoPresets';
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
    const sucrose = run.lines.find((candidate) => candidate.name.toLowerCase().includes('sucrose'))!;
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
    const sucrose = run.lines.find((candidate) => candidate.name.toLowerCase().includes('sucrose'))!;
    expect(sucrose.plannedGrams).toBe(130);
    const confirmed = confirmProductionLine(
      setDraftActualGrams(run, sucrose.lineId, 180),
      sucrose.lineId,
      '2026-08-09T10:01:00.000Z',
    );
    const assessment = assessProductionRescue(confirmed);
    const enlarge = assessment.options.find((option) => option.id === 'enlarge_batch');

    expect(enlarge).toBeDefined();
    const rescuedSucrose = enlarge!.candidateInput.items.find((item) => item.id === sucrose.lineId)!;
    expect(rescuedSucrose.actual_grams ?? rescuedSucrose.planned_grams).toBe(180);
    expect(enlarge!.finalMassG).toBeCloseTo(1277.8, 0);
    expect(enlarge!.scoreDisplay).toBe('10/10');
    const creamInstructions = enlarge!.instructions.filter((instruction) =>
      instruction.ingredientName.toLowerCase().includes('cream'),
    );
    expect(creamInstructions).toHaveLength(1);
    expect(creamInstructions[0]!.grams).toBeCloseTo(227.8, 0);
    const canonicalIds = enlarge!.candidateInput.items.map((item) =>
      canonicalIngredientId(item.ingredient),
    );
    expect(new Set(canonicalIds).size).toBe(canonicalIds.length);
  });

  it('returns an honest impossible state instead of inventing grams when no candidate verifies', () => {
    let run = make();
    for (const line of run.lines) {
      const grams = line.name.toLowerCase().includes('sucrose')
        ? line.plannedGrams + 500
        : line.plannedGrams;
      run = setDraftActualGrams(run, line.lineId, grams);
      run = confirmProductionLine(run, line.lineId, `2026-08-09T10:${line.confirmationOrder ?? '10'}:00.000Z`);
    }
    const assessment = assessProductionRescue(run);
    if (assessment.state === 'impossible') {
      expect(assessment.options).toEqual([]);
      expect(assessment.reason).toMatch(/Brak zweryfikowanej korekty/);
    } else {
      expect(assessment.options.every((option) => option.verifiedByEngine)).toBe(true);
    }
  });
});
