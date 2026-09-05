import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { ProductionRescueOptionUnavailableError } from '@/services/proCore/supabaseProduction';
import {
  confirmProductionLine,
  createProductionSession,
  setDraftActualGrams,
} from './productionSession';
import {
  browserProductionRescueDecision,
  durableActual,
  durableProductionRecoveryRelation,
  shouldHydrateDurableProductionRecovery,
  durableRescueRequiresReconciliation,
  productionRescueAuthorizationInvalidation,
  rescueOptionUnavailableMessage,
  productionSourceForRecipe,
  reusableRescueAuthorizeKey,
} from './useProductionWorkspace';

describe('production source integrity', () => {
  it('uses the immutable version id only while the current vector is still saved', () => {
    expect(
      productionSourceForRecipe(
        {
          savedRecipeId: 'recipe-1',
          savedRecipeName: 'Pistacja',
          currentVersionId: '5d5eae9c-0a8e-41d8-95ba-7a4d265461a2',
          currentVersionNumber: 3,
        },
        true,
      ),
    ).toEqual({
      recipeId: 'recipe-1',
      recipeVersionId: '5d5eae9c-0a8e-41d8-95ba-7a4d265461a2',
      recipeVersionNumber: 3,
      recipeName: 'Pistacja',
    });

    expect(
      productionSourceForRecipe(
        {
          savedRecipeId: 'recipe-1',
          savedRecipeName: 'Pistacja',
          currentVersionId: '5d5eae9c-0a8e-41d8-95ba-7a4d265461a2',
          currentVersionNumber: 3,
        },
        false,
      ),
    ).toEqual({
      recipeId: 'recipe-1',
      recipeVersionId: null,
      recipeVersionNumber: null,
      recipeName: 'Pistacja',
    });
  });
});

describe('durable Production actual projection', () => {
  it('persists only confirmed physical values and never promotes a pending draft', () => {
    const plannedInput = {
      ...DEFAULT_PRESET,
      items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
      machine_capacity_grams: null,
    };
    const started = createProductionSession({
      sessionId: 'run-1',
      ownerUserId: 'owner-1',
      source: {
        recipeId: 'recipe-1',
        recipeVersionId: 'version-1',
        recipeVersionNumber: 1,
        recipeName: 'QA',
      },
      plannedInput,
      startedAt: '2026-08-19T00:00:00.000Z',
    });
    const first = started.lines[0]!;
    const confirmed = confirmProductionLine(started, first.lineId, '2026-08-19T00:01:00.000Z');
    const actual = durableActual(confirmed, 'owner-1');

    expect(actual.by).toBe('owner-1');
    expect(actual.items?.find((item) => item.id === first.lineId)?.actualGrams).toBe(
      first.plannedGrams,
    );
    expect(
      actual.items
        ?.filter((item) => item.id !== first.lineId)
        .every((item) => item.actualGrams === null),
    ).toBe(true);
    expect(actual.actualTotalMixG).toBeNull();
    expect(actual.items?.find((item) => item.id === first.lineId)).toMatchObject({
      confirmedAt: '2026-08-19T00:01:00.000Z',
      confirmationOrder: 1,
    });
  });

  it('preserves an already-confirmed physical floor while its rescue top-up control is open', () => {
    const plannedInput = {
      ...DEFAULT_PRESET,
      items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
      machine_capacity_grams: null,
    };
    const started = createProductionSession({
      sessionId: 'run-rescue-top-up',
      ownerUserId: 'owner-1',
      source: {
        recipeId: 'recipe-1',
        recipeVersionId: 'version-1',
        recipeVersionNumber: 1,
        recipeName: 'QA rescue top-up',
      },
      plannedInput,
      startedAt: '2026-08-19T00:00:00.000Z',
    });
    const line = started.lines[0]!;
    const confirmed = confirmProductionLine(started, line.lineId, '2026-08-19T00:01:00.000Z');
    const pendingTopUp = {
      ...confirmed,
      lines: confirmed.lines.map((item) =>
        item.lineId === line.lineId
          ? {
              ...item,
              targetGrams: item.physicalAddedGrams + 5,
              draftActualGrams: item.physicalAddedGrams + 5,
              confirmed: false,
            }
          : item,
      ),
    };

    expect(
      durableActual(pendingTopUp, 'owner-1').items?.find((item) => item.id === line.lineId),
    ).toMatchObject({
      actualGrams: line.plannedGrams,
      confirmedAt: '2026-08-19T00:01:00.000Z',
      confirmationOrder: 1,
    });
  });

  it('reconciles every newer durable Rescue, including the second accepted snapshot', () => {
    const remote = {
      rescue: {
        recipeInput: {} as never,
        productComposition: {} as never,
        acceptedBy: 'owner-1',
        acceptedAt: '2026-08-19T00:03:00.000Z',
        revision: 2,
      },
    };
    expect(
      durableRescueRequiresReconciliation(remote, {
        durableRescueRevision: 1,
      }),
    ).toBe(true);
    expect(
      durableRescueRequiresReconciliation(remote, {
        durableRescueRevision: 2,
      }),
    ).toBe(false);
  });

  it('fails closed for a missing durable run and uses server revisions instead of client clocks', () => {
    const local = { durableRescueRevision: 2, durableActualRevision: 4 };
    expect(durableProductionRecoveryRelation(local, null)).toBe('missing_remote');
    expect(
      durableProductionRecoveryRelation(local, {
        rescue: null,
        actual: {
          items: [],
          actualTotalMixG: null,
          actualYieldG: null,
          wasteG: null,
          substitutions: [],
          operatorNotes: null,
          deviationReason: null,
          recordedBy: 'owner-1',
          recordedAt: '2000-01-01T00:00:00.000Z',
          revision: 5,
        },
      }),
    ).toBe('new_actual');
  });

  it('rehydrates matching durable revisions so stale local correction drafts are reconciled', () => {
    expect(shouldHydrateDurableProductionRecovery('same')).toBe(true);
    expect(shouldHydrateDurableProductionRecovery('new_actual')).toBe(true);
    expect(shouldHydrateDurableProductionRecovery('new_rescue')).toBe(true);
    expect(shouldHydrateDurableProductionRecovery('missing_remote')).toBe(false);
  });
});

describe('trusted Production Rescue authorization basis', () => {
  const authorization = {
    expectedActualRevision: 3,
    expectedRescueRevision: 2,
    expiresAt: '2026-08-19T10:05:00.000Z',
  };
  const basis = {
    durableActualRevision: 3,
    durableRescueRevision: 2,
  };

  it('keeps Apply available only before expiry on the exact hydrated revisions', () => {
    expect(
      productionRescueAuthorizationInvalidation(
        authorization,
        basis,
        Date.parse('2026-08-19T10:04:59.999Z'),
      ),
    ).toBeNull();
    expect(
      productionRescueAuthorizationInvalidation(
        authorization,
        basis,
        Date.parse('2026-08-19T10:05:00.000Z'),
      ),
    ).toBe('expired');
  });

  it('invalidates a Preview when either durable revision has changed', () => {
    expect(
      productionRescueAuthorizationInvalidation(authorization, {
        ...basis,
        durableActualRevision: 4,
      }),
    ).toBe('revision_mismatch');
    expect(
      productionRescueAuthorizationInvalidation(authorization, {
        ...basis,
        durableRescueRevision: 3,
      }),
    ).toBe('revision_mismatch');
    expect(productionRescueAuthorizationInvalidation(authorization, null)).toBe(
      'revision_mismatch',
    );
  });

  it('explains unavailable choices with the exact original target and hard metrics', () => {
    const hardSafetyError = new ProductionRescueOptionUnavailableError(
      'stable_rescue_option_stale',
      'hard_safety_violations',
      ['lactose_sandiness_risk', 'lactose'],
    );
    expect(rescueOptionUnavailableMessage('keep_original_batch', 1_000, hardSafetyError)).toBe(
      'Niedostępne — potwierdzonych ilości nie można już dopasować do partii 1000 g.',
    );
    expect(rescueOptionUnavailableMessage('leave_as_is', 1_000, hardSafetyError)).toBe(
      'Niedostępne — przekroczone twarde zakresy: Ryzyko piaszczystości, Laktoza.',
    );

    const irreducibleOwnerError = new ProductionRescueOptionUnavailableError(
      'stable_rescue_option_stale',
      'confirmed_physical_floor_above_hard_limit',
      ['lactose'],
      {
        physicalConfirmedG: 381,
        forecastMassG: 675,
        originalTargetG: 670,
        machineCapacityG: 670,
        forecastViolationDetails: [],
        fixedTargetRebalance: {
          candidateMassG: 670,
          violationDetails: [
            { metric: 'lactose', direction: 'high', value: 6.193582, min: 4, max: 6 },
          ],
        },
        irreducibleConfirmedViolations: [
          { metric: 'lactose', direction: 'high', value: 6.193582, min: 4, max: 6 },
        ],
      },
    );
    expect(rescueOptionUnavailableMessage('keep_original_batch', 670, irreducibleOwnerError)).toBe(
      'Niedostępne — przy celu 670 g potwierdzone ilości dają co najmniej Laktoza 6,194% (maks. 6,000%). Bez usuwania produktu korekta wymaga większej partii.',
    );

    const capacityOwnerError = new ProductionRescueOptionUnavailableError(
      'stable_rescue_option_stale',
      'machine_capacity_exceeded',
      [],
      {
        physicalConfirmedG: 676,
        forecastMassG: 676,
        originalTargetG: 670,
        machineCapacityG: 670,
        forecastViolationDetails: [],
        fixedTargetRebalance: null,
        irreducibleConfirmedViolations: [],
      },
    );
    expect(rescueOptionUnavailableMessage('leave_as_is', 670, capacityOwnerError)).toBe(
      'Niedostępne — w naczyniu jest 676 g, a pojemność maszyny wynosi 670 g.',
    );
  });

  it('exposes only stable server decisions and never computes a candidate in the browser hook', () => {
    const plannedInput = {
      ...DEFAULT_PRESET,
      items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
      machine_capacity_grams: null,
    };
    const started = createProductionSession({
      sessionId: 'run-rescue-choice',
      ownerUserId: 'owner-1',
      source: {
        recipeId: 'recipe-1',
        recipeVersionId: 'version-1',
        recipeVersionNumber: 1,
        recipeName: 'QA',
      },
      plannedInput,
      startedAt: '2026-08-19T00:00:00.000Z',
    });
    const first = started.lines[0]!;
    const deviated = confirmProductionLine(
      setDraftActualGrams(started, first.lineId, first.plannedGrams + 5),
      first.lineId,
      '2026-08-19T00:01:00.000Z',
    );
    expect(browserProductionRescueDecision(started).state).toBe('not_needed');
    expect(browserProductionRescueDecision(deviated)).toMatchObject({
      state: 'options',
      options: [
        { id: 'keep_original_batch' },
        { id: 'enlarge_batch' },
        { id: 'restore_original_recipe' },
        { id: 'leave_as_is' },
      ],
    });
    const hookSource = readFileSync(
      new URL('./useProductionWorkspace.ts', import.meta.url),
      'utf8',
    );
    expect(hookSource).not.toContain('assessProductionRescue');
    expect(hookSource).not.toContain('candidateInput');
  });

  it('reuses a lost-response authorize key only for the exact run, option and revisions', () => {
    const state = {
      status: 'error' as const,
      runId: 'run-1',
      stableOptionId: 'enlarge_batch' as const,
      expectedActualRevision: 3,
      expectedRescueRevision: 2,
      authorizeIdempotencyKey: 'authorize-once',
      message: 'lost response',
    };
    const exact = {
      sessionId: 'run-1',
      durableActualRevision: 3,
      durableRescueRevision: 2,
    };
    expect(reusableRescueAuthorizeKey(state, exact, 'enlarge_batch')).toBe('authorize-once');
    expect(
      reusableRescueAuthorizeKey(state, { ...exact, durableActualRevision: 4 }, 'enlarge_batch'),
    ).toBeNull();
    expect(reusableRescueAuthorizeKey(state, exact, 'keep_original_batch')).toBeNull();
  });

  it('does not deadlock server Production validation behind a stale local module flag', () => {
    const hookSource = readFileSync(
      new URL('./useProductionWorkspace.ts', import.meta.url),
      'utf8',
    );
    expect(hookSource).not.toContain('productBehaviorModuleGate(');
    expect(hookSource).toContain('evaluateRecipeConstraintAuthority({');
    expect(hookSource).toContain("module: 'PRODUCTION'");
    expect(hookSource).toContain('validateRecipeBehaviorOnServer({');
    expect(hookSource).toContain('practicalGate.ready && !behaviorServerReady');
  });
});
