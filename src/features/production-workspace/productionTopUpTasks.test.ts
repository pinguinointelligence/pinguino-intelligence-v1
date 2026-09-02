import { describe, expect, it } from 'vitest';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import type { RecipeInput } from '@/engine';
import type { ProductionRun } from '@/features/pro-core/productionContracts';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import {
  applyVerifiedRescueInput,
  buildProductionForecastInput,
  confirmProductionLine,
  confirmProductionTopUpTask,
  createProductionSession,
  hydrateProductionSessionFromRun,
  pendingProductionTopUpTasks,
  productionProgress,
  setProductionTopUpDraftGrams,
} from './productionSession';

function recipe(): RecipeInput {
  return {
    ...DEFAULT_PRESET,
    items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
    machine_capacity_grams: null,
  };
}

function started() {
  const plannedInput = recipe();
  return createProductionSession({
    sessionId: 'top-up-run',
    ownerUserId: 'owner-1',
    source: {
      recipeId: 'recipe-1',
      recipeVersionId: 'version-1',
      recipeVersionNumber: 1,
      recipeName: 'Top-up regression',
    },
    plannedInput,
    plannedComposition: {
      schemaVersion: 1,
      baseScope: 'BASE_FORMULATION',
      baseOrder: plannedInput.items.map((item) => item.id),
      toppings: [],
      behaviorSnapshots: productBehaviorTestSnapshots(plannedInput),
      migrationAmbiguities: [],
    },
    startedAt: '2026-08-25T08:00:00.000Z',
  });
}

function confirmFirst(count = 1) {
  let session = started();
  for (let index = 0; index < count; index += 1) {
    session = confirmProductionLine(
      session,
      session.lines[index]!.lineId,
      `2026-08-25T08:0${index + 1}:00.000Z`,
    );
  }
  return session;
}

function authorizeTopUps(
  session: ReturnType<typeof started>,
  additions: ReadonlyArray<{ lineId: string; deltaG: number }>,
  revision: number,
) {
  const candidate = buildProductionForecastInput(session);
  for (const addition of additions) {
    const index = candidate.items.findIndex((item) => item.id === addition.lineId);
    const item = candidate.items[index]!;
    const sourceLine = session.lines.find((line) => line.lineId === addition.lineId)!;
    candidate.items[index] = {
      ...item,
      actual_grams: null,
      planned_grams: sourceLine.physicalAddedGrams + addition.deltaG,
    };
  }
  candidate.target_batch_grams = candidate.items.reduce((sum, item) => sum + item.planned_grams, 0);
  return applyVerifiedRescueInput(session, candidate, revision);
}

function durableRun(
  local: ReturnType<typeof started>,
  rescued: ReturnType<typeof started>,
): ProductionRun {
  return {
    runId: local.sessionId,
    ownerUserId: local.ownerUserId!,
    recipeId: local.source.recipeId!,
    recipeVersionId: local.source.recipeVersionId!,
    recipeVersionNumber: local.source.recipeVersionNumber!,
    status: 'in_progress',
    plannedBatchG: local.plannedInput.target_batch_grams,
    plannedItems: local.lines.map((line, index) => ({
      id: line.lineId,
      name: line.name,
      canonicalIngredientId: line.canonicalIngredientId,
      processScope: 'BASE_FORMULATION',
      scopePosition: index,
      plannedGrams: line.plannedGrams,
      displayGrams: line.plannedGrams,
    })),
    productProfile: local.plannedInput.category,
    temperatureC: local.plannedInput.target_temperature_c,
    engineVersion: 'test',
    configVersion: 'test',
    mapperDatasetVersion: null,
    plannedDate: null,
    machine: null,
    location: null,
    batchReference: null,
    notes: null,
    createdBy: local.ownerUserId!,
    createdAt: local.startedAt,
    updatedAt: '2026-08-25T08:05:00.000Z',
    actual: {
      items: local.lines.map((line) => ({
        id: line.lineId,
        name: line.name,
        actualGrams: line.physicalAddedGrams || null,
        confirmedAt: line.confirmedAt,
        confirmationOrder: line.confirmationOrder,
      })),
      actualTotalMixG: null,
      actualYieldG: null,
      wasteG: null,
      substitutions: [],
      operatorNotes: null,
      deviationReason: null,
      recordedBy: local.ownerUserId!,
      recordedAt: '2026-08-25T08:02:00.000Z',
      revision: 2,
    },
    rescue: {
      recipeInput: buildProductionForecastInput(rescued),
      productComposition: rescued.plannedComposition,
      acceptedBy: local.ownerUserId!,
      acceptedAt: '2026-08-25T08:04:00.000Z',
      revision: rescued.durableRescueRevision,
    },
    completedAt: null,
    cancelledAt: null,
    events: [],
  };
}

describe('authorized Production top-up tasks', () => {
  it('materializes one confirmed-line addition as a pending task without reopening the recipe line', () => {
    const confirmed = confirmFirst();
    const line = confirmed.lines[0]!;
    const rescued = authorizeTopUps(confirmed, [{ lineId: line.lineId, deltaG: 2.5 }], 1);

    expect(rescued.lines[0]).toMatchObject({
      lineId: line.lineId,
      confirmed: true,
      physicalAddedGrams: line.physicalAddedGrams,
    });
    expect(pendingProductionTopUpTasks(rescued)).toEqual([
      expect.objectContaining({
        sourceRecipeLineId: line.lineId,
        sourceIngredientId: line.canonicalIngredientId,
        authorizedDeltaG: 2.5,
        draftDeltaG: 2.5,
        cumulativeTargetG: line.physicalAddedGrams + 2.5,
        revisionId: 1,
        status: 'pending',
      }),
    ]);
  });

  it('keeps two confirmed-ingredient top-ups independently pending', () => {
    const confirmed = confirmFirst(2);
    const rescued = authorizeTopUps(
      confirmed,
      [
        { lineId: confirmed.lines[0]!.lineId, deltaG: 0.8 },
        { lineId: confirmed.lines[1]!.lineId, deltaG: 0.5 },
      ],
      1,
    );

    expect(pendingProductionTopUpTasks(rescued)).toHaveLength(2);
    expect(new Set(pendingProductionTopUpTasks(rescued).map((task) => task.taskId)).size).toBe(2);
  });

  it('does not create a duplicate RecipeIngredient for an existing PI-ING', () => {
    const confirmed = confirmFirst();
    const line = confirmed.lines[0]!;
    const rescued = authorizeTopUps(confirmed, [{ lineId: line.lineId, deltaG: 1.2 }], 1);

    expect(rescued.plannedInput.items).toHaveLength(confirmed.plannedInput.items.length);
    expect(rescued.rescueAddedItems).toHaveLength(0);
    expect(rescued.lines.filter((candidate) => candidate.lineId === line.lineId)).toHaveLength(1);
  });

  it('completes only the explicitly confirmed task and updates vessel mass exactly once', () => {
    const confirmed = confirmFirst(2);
    const rescued = authorizeTopUps(
      confirmed,
      [
        { lineId: confirmed.lines[0]!.lineId, deltaG: 0.8 },
        { lineId: confirmed.lines[1]!.lineId, deltaG: 0.5 },
      ],
      1,
    );
    const [first, second] = pendingProductionTopUpTasks(rescued);
    const beforeMass = productionProgress(rescued).confirmedMassG;
    const after = confirmProductionTopUpTask(rescued, first!.taskId, '2026-08-25T08:06:00.000Z');

    expect(after.topUpTasks.find((task) => task.taskId === first!.taskId)?.status).toBe(
      'completed',
    );
    expect(pendingProductionTopUpTasks(after).map((task) => task.taskId)).toEqual([second!.taskId]);
    expect(productionProgress(after).confirmedMassG).toBeCloseTo(
      beforeMass + first!.authorizedDeltaG,
      6,
    );
  });

  it('rehydrates pending tasks from durable Rescue and actual revisions after reload', () => {
    const confirmed = confirmFirst(2);
    const rescued = authorizeTopUps(
      confirmed,
      [
        { lineId: confirmed.lines[0]!.lineId, deltaG: 0.8 },
        { lineId: confirmed.lines[1]!.lineId, deltaG: 0.5 },
      ],
      3,
    );
    const hydrated = hydrateProductionSessionFromRun(
      durableRun(confirmed, rescued),
      confirmed.source,
      confirmed.plannedInput,
      confirmed.plannedComposition,
    );

    expect(pendingProductionTopUpTasks(hydrated)[0]!.authorizedDeltaG).toBeCloseTo(0.8, 6);
    expect(pendingProductionTopUpTasks(hydrated)[1]!.authorizedDeltaG).toBeCloseTo(0.5, 6);
    expect(pendingProductionTopUpTasks(hydrated).every((task) => task.revisionId === 3)).toBe(true);
  });

  it('does not discard authorized tasks when the operator clock is ahead of the server clock', () => {
    const confirmed = confirmFirst(2);
    const rescued = authorizeTopUps(
      confirmed,
      [
        { lineId: confirmed.lines[0]!.lineId, deltaG: 0.8 },
        { lineId: confirmed.lines[1]!.lineId, deltaG: 0.5 },
      ],
      3,
    );
    const durable = durableRun(confirmed, rescued);
    durable.rescue = {
      ...durable.rescue!,
      // Confirmation chronology is recorded by the operator's browser while
      // Rescue acceptance is stamped by the server. Their clocks may differ.
      acceptedAt: '2026-08-25T08:00:30.000Z',
    };

    const hydrated = hydrateProductionSessionFromRun(
      durable,
      confirmed.source,
      confirmed.plannedInput,
      confirmed.plannedComposition,
    );

    expect(pendingProductionTopUpTasks(hydrated).map((task) => task.sourceRecipeLineId)).toEqual([
      confirmed.lines[0]!.lineId,
      confirmed.lines[1]!.lineId,
    ]);
  });

  it('invalidates durable tasks when a later server event records a new off-target execution', () => {
    const confirmed = confirmFirst(2);
    const rescued = authorizeTopUps(
      confirmed,
      [
        { lineId: confirmed.lines[0]!.lineId, deltaG: 0.8 },
        { lineId: confirmed.lines[1]!.lineId, deltaG: 0.5 },
      ],
      3,
    );
    const durable = durableRun(confirmed, rescued);
    durable.actual = { ...durable.actual!, revision: 3 };
    durable.events = [
      {
        eventId: 'decision-3',
        type: 'deviation_decision_accepted',
        at: '2026-08-25T08:04:00.000Z',
        by: durable.ownerUserId,
        detail: null,
        amendment: {
          stableOptionId: 'restore_original_recipe',
          sourceActualRevision: 2,
          rescueRevision: 3,
          finalMassG: rescued.lines.reduce((sum, line) => sum + line.targetGrams, 0),
          scoreDisplay: '10',
        },
      },
      {
        eventId: 'later-actual',
        type: 'ingredient_actual_confirmed',
        at: '2026-08-25T08:05:00.000Z',
        by: durable.ownerUserId,
        detail: confirmed.lines[0]!.name,
        amendment: {
          lineId: confirmed.lines[0]!.lineId,
          actualGrams: confirmed.lines[0]!.physicalAddedGrams,
          action: 'confirm',
        },
      },
    ];

    const hydrated = hydrateProductionSessionFromRun(
      durable,
      confirmed.source,
      confirmed.plannedInput,
      confirmed.plannedComposition,
    );

    expect(pendingProductionTopUpTasks(hydrated)).toEqual([]);
  });

  it('invalidates pending tasks after a new deviation and replaces them from the next revision', () => {
    const confirmed = confirmFirst(2);
    const line = confirmed.lines[0]!;
    const first = authorizeTopUps(confirmed, [{ lineId: line.lineId, deltaG: 0.8 }], 1);
    const third = first.lines[2]!;
    const deviated = confirmProductionLine(
      {
        ...first,
        lines: first.lines.map((candidate) =>
          candidate.lineId === third.lineId
            ? { ...candidate, draftActualGrams: candidate.targetGrams + 1 }
            : candidate,
        ),
      },
      third.lineId,
      '2026-08-25T08:07:00.000Z',
    );

    expect(deviated.topUpTasks.find((task) => task.revisionId === 1)?.status).toBe('invalidated');
    expect(pendingProductionTopUpTasks(deviated)).toHaveLength(0);

    const second = authorizeTopUps(deviated, [{ lineId: line.lineId, deltaG: 1.2 }], 2);

    expect(second.topUpTasks.find((task) => task.revisionId === 1)?.status).toBe('invalidated');
    expect(pendingProductionTopUpTasks(second)).toHaveLength(1);
    expect(pendingProductionTopUpTasks(second)[0]).toMatchObject({ revisionId: 2 });
    expect(pendingProductionTopUpTasks(second)[0]!.authorizedDeltaG).toBeCloseTo(1.2, 6);
  });

  it('allows the same PI-ING to receive a second task in a later revision', () => {
    const confirmed = confirmFirst();
    const line = confirmed.lines[0]!;
    const first = authorizeTopUps(confirmed, [{ lineId: line.lineId, deltaG: 0.8 }], 1);
    const firstTask = pendingProductionTopUpTasks(first)[0]!;
    const completed = confirmProductionTopUpTask(
      first,
      firstTask.taskId,
      '2026-08-25T08:06:00.000Z',
    );
    const second = authorizeTopUps(completed, [{ lineId: line.lineId, deltaG: 1.2 }], 2);
    const secondTask = pendingProductionTopUpTasks(second)[0]!;

    expect(secondTask.sourceIngredientId).toBe(firstTask.sourceIngredientId);
    expect(secondTask.taskId).not.toBe(firstTask.taskId);
    expect(secondTask.authorizedDeltaG).toBeCloseTo(1.2, 6);
  });

  it('keeps the editable value as a delta and applies that exact delta on confirmation', () => {
    const confirmed = confirmFirst();
    const line = confirmed.lines[0]!;
    const rescued = authorizeTopUps(confirmed, [{ lineId: line.lineId, deltaG: 0.8 }], 1);
    const task = pendingProductionTopUpTasks(rescued)[0]!;
    const edited = setProductionTopUpDraftGrams(rescued, task.taskId, 0.7);
    const completed = confirmProductionTopUpTask(edited, task.taskId, '2026-08-25T08:06:00.000Z');

    expect(edited.topUpTasks[0]!.draftDeltaG).toBe(0.7);
    expect(completed.lines[0]!.physicalAddedGrams).toBeCloseTo(line.physicalAddedGrams + 0.7, 6);
    expect(completed.plannedInput.items[0]!.planned_grams).toBe(line.plannedGrams);
  });
});
