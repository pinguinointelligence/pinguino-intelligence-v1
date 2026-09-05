import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import { rescaleBatchToTarget } from '@/features/recipe-constraints';
import {
  applyVerifiedRescueInput,
  buildFinalActualInput,
  completeProductionSession,
  buildProductionForecastInput,
  type ProductionSession,
} from './productionSession';
import {
  assessProductionRescue,
  productionContinuationPath,
  productionRescueTerminalAuthority,
} from './productionRescue';
import {
  confirmOwnerRescueLines as confirm,
  makeOwnerRescueSession as makeOwnerSession,
  OWNER_RESCUE_RECIPE as OWNER_RECIPE,
} from './productionOwnerRescue.fixture';

const diagnostic = (session: ProductionSession): string => {
  const assessment = assessProductionRescue(session);
  return JSON.stringify({
    state: assessment.state,
    hardSafety: assessment.hardSafety,
    reason: assessment.reason,
    continuation: productionContinuationPath(assessment),
    options: assessment.options.map((option) => ({
      id: option.id,
      finalMassG: option.finalMassG,
      instructions: option.instructions,
    })),
    trace: assessment.strategyTrace,
    forecastViolations: detectViolations(assessment.forecastResult),
  });
};

describe('Owner 670 g Production Rescue served-flow authority', () => {
  it('starts from an Engine-safe 670 g saved plan', () => {
    const result = calculateRecipe(OWNER_RECIPE);

    expect(detectViolations(result)).toEqual([]);
    expect(result.total_batch_g).toBe(670);
  });

  it('the canonical constrained optimizer can rebalance Case 2 pending rows at 670 g', () => {
    const session = confirm(makeOwnerSession(), [
      ['milk', 201],
      ['cream', 125],
      ['skimmed_milk', 50],
      ['sucrose', 31],
      ['dextrose', 77],
      ['tara', 2.2],
    ]);
    const forecast = buildProductionForecastInput(session);
    const confirmedById = new Map(
      session.lines.filter((line) => line.confirmed).map((line) => [line.lineId, line]),
    );
    const planningInput: RecipeInput = {
      ...forecast,
      items: forecast.items.map((item) => ({
        ...item,
        planned_grams: item.actual_grams ?? item.planned_grams,
        actual_grams: null,
        lock_type:
          item.lock_type === 'already_added' || !confirmedById.has(item.id)
            ? 'unlocked'
            : item.lock_type,
      })),
    };
    const constraints = {
      byLineId: Object.fromEntries(
        planningInput.items.flatMap((item) => {
          const line = confirmedById.get(item.id);
          return line
            ? [[item.id, { mode: 'locked' as const, grams: line.physicalAddedGrams }]]
            : [];
        }),
      ),
    };
    const result = rescaleBatchToTarget(planningInput, constraints, 670);

    expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.input.items.reduce((sum, item) => sum + item.planned_grams, 0)).toBe(670);
  });

  it('Case 1 keeps the 670 g failure diagnostic but finds the smallest larger batch', () => {
    const session = confirm(makeOwnerSession(), [
      ['milk', 201],
      ['cream', 125],
      ['skimmed_milk', 55],
    ]);
    const assessment = assessProductionRescue(session);
    const correction = assessment.options.find((option) => option.id === 'keep_original_batch');
    const enlargement = assessment.options.find((option) => option.id === 'enlarge_batch');

    expect(correction, diagnostic(session)).toBeUndefined();
    expect(assessment.diagnostics.fixedTargetRebalance).toMatchObject({
      attempted: true,
      candidateMassG: 670,
      capacityExceeded: false,
    });
    expect(assessment.diagnostics.fixedTargetRebalance?.violationDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metric: 'lactose', direction: 'high', max: 6 }),
      ]),
    );
    expect(assessment.diagnostics.irreducibleConfirmedViolations).toHaveLength(1);
    expect(assessment.diagnostics.irreducibleConfirmedViolations[0]).toMatchObject({
      metric: 'lactose',
      direction: 'high',
      max: 6,
      basis: 'confirmed_physical_floor_at_target',
    });
    expect(assessment.diagnostics.irreducibleConfirmedViolations[0]!.value).toBeCloseTo(
      6.1935820896,
      9,
    );
    expect(assessment.diagnostics).toMatchObject({
      originalTargetG: 670,
      machineCapacityG: null,
      machineCapacitySource: null,
    });
    expect(enlargement, diagnostic(session)).toBeDefined();
    // 691.6167 g is the first single-limit lower bound. The full canonical
    // recipe remains outside another hard range there; 711.2 g is the first
    // executable 0.1 g vector that passes every authority.
    expect(enlargement?.finalMassG).toBe(711.2);
    expect(enlargement?.instructions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ lineId: 'strawberries' }),
        expect.objectContaining({ lineId: 'watermelon' }),
      ]),
    );
    expect(productionContinuationPath(assessment)).toBe('authorized_correction');
  });

  it('Case 2 offers a 670 g correction after tara is +0.2 g with two rows remaining', () => {
    let session = confirm(makeOwnerSession(), [
      ['milk', 201],
      ['cream', 125],
      ['skimmed_milk', 50],
      ['sucrose', 31],
      ['dextrose', 77],
      ['tara', 2.2],
    ]);
    const assessment = assessProductionRescue(session);
    const correction = assessment.options.find((option) => option.id === 'keep_original_batch');

    expect(correction, diagnostic(session)).toBeDefined();
    expect(correction?.finalMassG).toBe(670);
    expect(productionContinuationPath(assessment)).toBe('authorized_correction');
    expect(correction?.instructions).toEqual([
      expect.objectContaining({
        lineId: 'strawberries',
        kind: 'reduce_pending_plan',
        finalTargetGrams: 91.9,
      }),
      expect.objectContaining({
        lineId: 'watermelon',
        kind: 'reduce_pending_plan',
        finalTargetGrams: 91.9,
      }),
    ]);

    session = applyVerifiedRescueInput(session, correction!.candidateInput, 1);
    expect(
      session.lines.filter((line) => line.confirmed).map((line) => line.physicalAddedGrams),
    ).toEqual([201, 125, 50, 31, 77, 2.2]);
    expect(
      session.lines
        .filter((line) => !line.confirmed)
        .map((line) => [line.lineId, line.targetGrams]),
    ).toEqual([
      ['strawberries', 91.9],
      ['watermelon', 91.9],
    ]);
    session = confirm(session, [
      ['strawberries', 91.9],
      ['watermelon', 91.9],
    ]);
    const finalInput = buildFinalActualInput(session);
    const finalResult = calculateRecipe(finalInput);
    expect(detectViolations(finalResult)).toEqual([]);
    expect(productionRescueTerminalAuthority(finalInput, session).valid).toBe(true);
    const completed = completeProductionSession(
      session,
      finalResult,
      '2026-09-05T11:00:00.000Z',
      'owner',
    );
    expect(completed.status).toBe('completed');
    expect(completed.completionSnapshot?.actualFinalMassG).toBe(670);
  });

  it('Case 3 searches above the immutable 676 g vessel when 670 g has no capacity authority', () => {
    const session = confirm(makeOwnerSession(), [
      ['milk', 201],
      ['cream', 125],
      ['skimmed_milk', 50],
      ['sucrose', 31],
      ['dextrose', 77],
      ['tara', 2],
      ['strawberries', 92],
      ['watermelon', 98],
    ]);
    const assessment = assessProductionRescue(session);

    const enlargement = assessment.options.find((option) => option.id === 'enlarge_batch');

    expect(assessment.state, diagnostic(session)).toBe('options');
    expect(assessment.hardSafety.capacityExceeded).toBe(false);
    expect(assessment.diagnostics).toMatchObject({
      physicalConfirmedG: 676,
      forecastMassG: 676,
      originalTargetG: 670,
      machineCapacityG: null,
      machineCapacitySource: null,
    });
    expect(enlargement, diagnostic(session)).toBeDefined();
    expect(enlargement?.finalMassG).toBe(678.2);
    expect(productionContinuationPath(assessment)).toBe('authorized_correction');
  });

  it('keeps a genuine sourced 670 g machine capacity as a hard refusal', () => {
    const sourceSession = makeOwnerSession();
    const session = confirm(
      {
        ...sourceSession,
        plannedInput: {
          ...sourceSession.plannedInput,
          machine_capacity_source: 'machine',
        },
      },
      [
        ['milk', 201],
        ['cream', 125],
        ['skimmed_milk', 50],
        ['sucrose', 31],
        ['dextrose', 77],
        ['tara', 2],
        ['strawberries', 92],
        ['watermelon', 98],
      ],
    );
    const assessment = assessProductionRescue(session);

    expect(assessment.state, diagnostic(session)).toBe('impossible');
    expect(assessment.hardSafety.capacityExceeded).toBe(true);
    expect(assessment.diagnostics).toMatchObject({
      machineCapacityG: 670,
      machineCapacitySource: 'machine',
    });
    expect(productionContinuationPath(assessment)).toBe('recovery_required');
  });

  it('respects explicit unavailability and finds another existing ingredient', () => {
    const sourceSession = makeOwnerSession();
    const sucroseId = sourceSession.plannedInput.items.find((item) => item.id === 'sucrose')!
      .ingredient.id;
    const session = confirm(
      {
        ...sourceSession,
        plannedInput: {
          ...sourceSession.plannedInput,
          goals: {
            ...sourceSession.plannedInput.goals,
            excluded_ingredient_ids: [sucroseId],
          },
        },
      },
      [
        ['milk', 201],
        ['cream', 125],
        ['skimmed_milk', 50],
        ['sucrose', 31],
        ['dextrose', 77],
        ['tara', 2],
        ['strawberries', 92],
        ['watermelon', 98],
      ],
    );
    const enlargement = assessProductionRescue(session).options.find(
      (option) => option.id === 'enlarge_batch',
    );

    expect(enlargement, diagnostic(session)).toBeDefined();
    expect(enlargement?.instructions.some((instruction) => instruction.lineId === 'sucrose')).toBe(
      false,
    );
  });

  it('returns a true refusal when every possible additional ingredient is explicitly unavailable', () => {
    const sourceSession = makeOwnerSession();
    const session = confirm(
      {
        ...sourceSession,
        plannedInput: {
          ...sourceSession.plannedInput,
          goals: {
            ...sourceSession.plannedInput.goals,
            excluded_ingredient_ids: sourceSession.plannedInput.items.map(
              (item) => item.ingredient.id,
            ),
          },
        },
      },
      [
        ['milk', 201],
        ['cream', 125],
        ['skimmed_milk', 50],
        ['sucrose', 31],
        ['dextrose', 77],
        ['tara', 2],
        ['strawberries', 92],
        ['watermelon', 98],
      ],
    );
    const assessment = assessProductionRescue(session);

    expect(assessment.state, diagnostic(session)).toBe('impossible');
    expect(assessment.hardSafety.capacityExceeded).toBe(false);
    expect(productionContinuationPath(assessment)).toBe('recovery_required');
  });
});
