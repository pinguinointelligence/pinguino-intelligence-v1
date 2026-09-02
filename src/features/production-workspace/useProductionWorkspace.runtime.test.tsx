// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import {
  attachPracticalRecipeAudit,
  readPracticalRecipeAudit,
} from '@/features/practical-recipe/practicalRecipe';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { recipeCompositionFromState } from '@/features/recipe-composition/recipeCompositionPersistence';
import { buildCanonicalNewRecipeStarter } from '@/features/recipes/newRecipeStarter';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';
import type {
  ProductionRepository,
  ProductionRescueAuthorization,
} from '@/services/proCore/productionRepository';
import { PRODUCTION_RESCUE_AUTHORITY_NAMESPACE } from '@/services/proCore/supabaseProduction';
import type { ProductionRun } from '@/features/pro-core/productionContracts';
import { useProductionSessionStore } from './productionSessionStore';
import {
  buildProductionForecastInput,
  confirmProductionLine,
  createProductionSession,
  setDraftActualGrams,
  type ProductionSession,
} from './productionSession';

const mocks = vi.hoisted(() => ({
  resolveProductionRepository: vi.fn(),
  validateRecipeBehaviorOnServer: vi.fn(),
}));

vi.mock('@/features/pro-core/proCoreProductionRepo', () => ({
  resolveProductionRepository: mocks.resolveProductionRepository,
}));

vi.mock('@/services/productIntelligence', () => ({
  validateRecipeBehaviorOnServer: mocks.validateRecipeBehaviorOnServer,
}));

import { useProductionWorkspace, type ProductionWorkspaceView } from './useProductionWorkspace';

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
};

const canonicalGelatoStarterInput = () => {
  const starter = buildCanonicalNewRecipeStarter({
    visibleProductType: 'gelato',
    servingModeId: 'temp_minus_11',
    formulationStrategy: 'optimal',
    targetBatchGrams: 1_000,
  });
  return {
    items: starter.items,
    mode: 'classic' as const,
    category: starter.category,
    target_temperature_c: starter.targetTemperatureC,
    target_batch_grams: starter.targetBatchGrams,
    machine_capacity_grams: null,
    goals: { formulation_strategy: starter.formulationStrategy },
  };
};

const productionSessionWithDeviation = () => {
  const plannedInput = {
    ...DEFAULT_PRESET,
    items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
    machine_capacity_grams: null,
  };
  const snapshots = productBehaviorTestSnapshots(plannedInput);
  for (const [lineId, snapshot] of Object.entries(snapshots)) {
    snapshots[lineId] = {
      ...snapshot,
      resolutionContext: {
        accountId: 'owner-runtime',
        productProfile: plannedInput.category,
        temperatureC: plannedInput.target_temperature_c,
        mode: 'optimal',
        processScope: 'BASE_FORMULATION',
        requestedRole: 'STANDARD',
        module: 'BASE_RECIPE',
      },
    };
  }
  const plannedComposition = recipeCompositionFromState({
    items: plannedInput.items,
    baseOrder: plannedInput.items.map((item) => item.id),
    productBehaviorSnapshots: snapshots,
  });
  const started = createProductionSession({
    sessionId: 'run-runtime-1',
    ownerUserId: 'owner-runtime',
    source: {
      recipeId: 'recipe-runtime',
      recipeVersionId: 'version-runtime',
      recipeVersionNumber: 1,
      recipeName: 'Runtime QA',
    },
    plannedInput,
    plannedComposition,
    startedAt: '2026-08-19T10:00:00.000Z',
  });
  const first = started.lines[0]!;
  return confirmProductionLine(
    setDraftActualGrams(started, first.lineId, first.plannedGrams + 1),
    first.lineId,
    '2026-08-19T10:01:00.000Z',
  );
};

const authorization = (sessionId: string): ProductionRescueAuthorization => ({
  authorizationId: 'authorization-runtime-1',
  candidateFingerprint: 'a'.repeat(64),
  runId: sessionId,
  stableOptionId: 'keep_original_batch',
  expectedActualRevision: 0,
  expectedRescueRevision: 0,
  authorizedAt: '2026-08-19T10:02:00.000Z',
  expiresAt: '2099-08-19T10:07:00.000Z',
  preview: {
    title: 'Zachowaj pierwotną partię',
    explanation: 'Serwer zweryfikował plan.',
    finalMassG: DEFAULT_PRESET.target_batch_grams,
    scoreDisplay: '10/10',
    instructions: [],
  },
});

const durableRescuedRun = (session: ProductionSession): ProductionRun => ({
  runId: session.sessionId,
  ownerUserId: session.ownerUserId!,
  recipeId: session.source.recipeId!,
  recipeVersionId: session.source.recipeVersionId!,
  recipeVersionNumber: session.source.recipeVersionNumber!,
  status: 'in_progress',
  plannedBatchG: session.plannedInput.target_batch_grams,
  plannedItems: session.lines.map((line, index) => ({
    id: line.lineId,
    name: line.name,
    canonicalIngredientId: line.canonicalIngredientId,
    processScope: 'BASE_FORMULATION',
    scopePosition: index,
    plannedGrams: line.plannedGrams,
    displayGrams: line.plannedGrams,
  })),
  productProfile: session.plannedInput.category,
  temperatureC: session.plannedInput.target_temperature_c,
  engineVersion: 'runtime-test',
  configVersion: 'runtime-test',
  mapperDatasetVersion: null,
  plannedDate: null,
  machine: null,
  location: null,
  batchReference: null,
  notes: null,
  createdBy: session.ownerUserId!,
  createdAt: session.startedAt,
  updatedAt: '2026-08-19T10:03:00.000Z',
  actual: {
    items: session.lines.map((line) => ({
      id: line.lineId,
      name: line.name,
      actualGrams: line.confirmed ? line.physicalAddedGrams : null,
      confirmedAt: line.confirmedAt,
      confirmationOrder: line.confirmationOrder,
    })),
    actualTotalMixG: null,
    actualYieldG: null,
    wasteG: null,
    substitutions: [],
    operatorNotes: null,
    deviationReason: null,
    recordedBy: session.ownerUserId!,
    recordedAt: '2026-08-19T10:01:00.000Z',
    revision: session.durableActualRevision,
  },
  rescue: {
    recipeInput: buildProductionForecastInput(session),
    productComposition: session.plannedComposition,
    acceptedBy: session.ownerUserId!,
    acceptedAt: '2026-08-19T10:03:00.000Z',
    revision: session.durableRescueRevision + 1,
  },
  completedAt: null,
  cancelledAt: null,
  events: [
    {
      eventId: 'started-runtime-1',
      type: 'started',
      at: session.startedAt,
      by: session.ownerUserId!,
      detail: null,
      amendment: null,
    },
  ],
});

describe('Production trusted Rescue runtime races', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let view: ProductionWorkspaceView | null;

  function Harness() {
    view = useProductionWorkspace(false);
    return null;
  }

  function EnabledHarness() {
    view = useProductionWorkspace(true);
    return null;
  }

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    view = null;
    useAuthStore.setState({
      status: 'authed',
      user: { id: 'owner-runtime', email: null, displayName: null },
      available: true,
    });
    const productionSession = productionSessionWithDeviation();
    useRecipeStore.getState().loadRecipeInput(productionSession.plannedInput, {
      savedId: productionSession.source.recipeId,
      savedName: productionSession.source.recipeName,
      versionNumber: productionSession.source.recipeVersionNumber,
      versionId: productionSession.source.recipeVersionId,
      versionDate: productionSession.startedAt,
      composition: productionSession.plannedComposition,
    });
    useProductionSessionStore.setState({
      session: productionSession,
      archivedSessions: [],
    });
    /* A saved, unedited, whole-gram version is production-ready (PC-06), so the
       hook now reaches server validation in every test in this file — including
       the Rescue-race tests, whose subject is authorization ordering, not
       readiness. Give the dependency a defined default answer; the two tests
       that care about validation still override it with their own. */
    mocks.validateRecipeBehaviorOnServer.mockResolvedValue({
      ready: true,
      module: 'PRODUCTION',
      staleLineIds: [],
      lines: [],
      processReadiness: { schemaVersion: 1, status: 'READY', blockers: [], advisories: [] },
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    useProductionSessionStore.getState().clear();
    mocks.resolveProductionRepository.mockReset();
    mocks.validateRecipeBehaviorOnServer.mockReset();
  });

  it('automatically evaluates all standard choices and recommends safe unchanged first', async () => {
    const keep = deferred<ProductionRescueAuthorization>();
    const local = useProductionSessionStore.getState().session!;
    const authorizeRescue = vi.fn(
      (input: Parameters<ProductionRepository['authorizeRescue']>[0]) => {
        const result: ProductionRescueAuthorization = {
          ...authorization(local.sessionId),
          authorizationId: `authorization-${input.stableOptionId}`,
          stableOptionId: input.stableOptionId,
          preview: {
            ...authorization(local.sessionId).preview,
            title: input.stableOptionId,
          },
        };
        return input.stableOptionId === 'keep_original_batch'
          ? keep.promise
          : Promise.resolve(result);
      },
    );
    const repository = { authorizeRescue } as unknown as ProductionRepository;
    mocks.resolveProductionRepository.mockReturnValue({
      repository,
      mode: 'backend',
      isLocalDev: false,
      unavailable: false,
    });

    await act(async () => root.render(<EnabledHarness />));
    await act(async () => {
      await vi.waitFor(() => expect(authorizeRescue).toHaveBeenCalledTimes(4));
    });

    expect(authorizeRescue.mock.calls.map(([input]) => input.stableOptionId)).toEqual([
      'keep_original_batch',
      'enlarge_batch',
      'restore_original_recipe',
      'leave_as_is',
    ]);
    expect(
      authorizeRescue.mock.calls.every(([input]) =>
        input.idempotencyKey.startsWith(
          `rescue:${PRODUCTION_RESCUE_AUTHORITY_NAMESPACE}:${local.sessionId}:${local.durableActualRevision}:${local.durableRescueRevision}:`,
        ),
      ),
    ).toBe(true);
    expect(view?.rescueOptionStates.enlarge_batch?.status).toBe('available');
    expect(view?.rescueOptionsCalculating).toBe(true);
    expect(view?.recommendedRescueOptionId).toBeNull();
    expect(view?.selectedRescueOptionId).toBeNull();

    await act(async () => {
      keep.resolve({
        ...authorization(local.sessionId),
        authorizationId: 'authorization-keep_original_batch',
        stableOptionId: 'keep_original_batch',
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(view?.rescueOptionStates.keep_original_batch?.status).toBe('available');
    expect(view?.rescueOptionsCalculating).toBe(false);
    expect(view?.recommendedRescueOptionId).toBe('leave_as_is');
    expect(view?.selectedRescueOptionId).toBe('leave_as_is');
  });

  it('uses fresh authorization idempotency keys when the operator retries expired choices', async () => {
    const local = useProductionSessionStore.getState().session!;
    const authorizeRescue = vi.fn(
      async (input: Parameters<ProductionRepository['authorizeRescue']>[0]) => {
        if (authorizeRescue.mock.calls.length <= 4) throw new Error('authorization expired');
        return {
          ...authorization(local.sessionId),
          authorizationId: `retry-${input.stableOptionId}`,
          stableOptionId: input.stableOptionId,
        };
      },
    );
    mocks.resolveProductionRepository.mockReturnValue({
      repository: { authorizeRescue } as unknown as ProductionRepository,
      mode: 'backend',
      isLocalDev: false,
      unavailable: false,
    });

    await act(async () => root.render(<EnabledHarness />));
    await act(async () => {
      await vi.waitFor(() => expect(authorizeRescue).toHaveBeenCalledTimes(4));
      await vi.waitFor(() =>
        expect(
          Object.values(view!.rescueOptionStates).filter((state) => state?.status === 'error'),
        ).toHaveLength(4),
      );
    });
    const firstKeys = authorizeRescue.mock.calls.map(([input]) => input.idempotencyKey);

    act(() => view!.retryRescueOptions());
    await act(async () => {
      await vi.waitFor(() => expect(authorizeRescue).toHaveBeenCalledTimes(8));
    });
    const retryKeys = authorizeRescue.mock.calls.slice(4).map(([input]) => input.idempotencyKey);
    expect(retryKeys).not.toEqual(firstKeys);
    expect(new Set([...firstKeys, ...retryKeys]).size).toBe(8);
  });

  it('blocks operator edits while authorizing and ignores a late response after invalidation', async () => {
    const pending = deferred<ProductionRescueAuthorization>();
    const repository = {
      authorizeRescue: vi.fn(() => pending.promise),
    } as unknown as ProductionRepository;
    mocks.resolveProductionRepository.mockReturnValue({
      repository,
      mode: 'backend',
      isLocalDev: false,
      unavailable: false,
    });

    await act(async () => root.render(<Harness />));
    expect(view?.rescue.state).toBe('options');
    const first = useProductionSessionStore.getState().session!.lines[0]!;
    const before = first.draftActualGrams;
    let request!: Promise<void>;

    await act(async () => {
      request = view!.requestRescueAuthorization('keep_original_batch');
      await Promise.resolve();
    });
    expect(view?.persistenceBusy).toBe(true);

    act(() => view!.setDraftActual(first.lineId, before + 5));
    expect(
      useProductionSessionStore
        .getState()
        .session!.lines.find((line) => line.lineId === first.lineId)?.draftActualGrams,
    ).toBe(before);

    act(() => view!.dismissRescueAuthorization());
    pending.resolve(authorization('run-runtime-1'));
    await act(async () => request);

    expect(view?.rescueAuthorization.status).toBe('idle');
  });

  it('blocks edits while consuming and merges the latest compatible local draft', async () => {
    const consume = deferred<ProductionRun>();
    const repository = {
      authorizeRescue: vi.fn(async () => authorization('run-runtime-1')),
      consumeRescue: vi.fn(() => consume.promise),
      getRun: vi.fn(async () => durableRescuedRun(useProductionSessionStore.getState().session!)),
    } as unknown as ProductionRepository;
    mocks.resolveProductionRepository.mockReturnValue({
      repository,
      mode: 'backend',
      isLocalDev: false,
      unavailable: false,
    });

    await act(async () => root.render(<Harness />));
    await act(async () => view!.requestRescueAuthorization('keep_original_batch'));
    expect(view?.rescueAuthorization.status).toBe('preview');
    let consumeRequest!: Promise<void>;

    await act(async () => {
      consumeRequest = view!.consumeAuthorizedRescue();
      await Promise.resolve();
    });
    expect(view?.persistenceBusy).toBe(true);

    const current = useProductionSessionStore.getState().session!;
    const pending = current.lines.find((line) => !line.confirmed)!;
    const latestDraft = pending.targetGrams + 2;
    act(() => view!.setDraftActual(pending.lineId, latestDraft));
    expect(
      useProductionSessionStore
        .getState()
        .session!.lines.find((line) => line.lineId === pending.lineId)?.draftActualGrams,
    ).toBe(pending.draftActualGrams);

    act(() => {
      useProductionSessionStore.setState({
        session: setDraftActualGrams(
          useProductionSessionStore.getState().session!,
          pending.lineId,
          latestDraft,
        ),
      });
    });
    const durable = durableRescuedRun(current);
    consume.resolve(durable);
    await act(async () => consumeRequest);

    expect(
      useProductionSessionStore
        .getState()
        .session!.lines.find((line) => line.lineId === pending.lineId)?.draftActualGrams,
    ).toBe(latestDraft);
    expect(view?.rescueAuthorization.status).toBe('idle');
  });

  it('starts from fresh server PRODUCTION authority even when a cached local module flag is stale', async () => {
    const starterInput = canonicalGelatoStarterInput();
    const executable = attachPracticalRecipeAudit(
      starterInput,
      starterInput,
      '2026-08-19T10:00:00.000Z',
    );
    expect(executable.items).toHaveLength(6);
    expect(executable.items.every((item) => item.id.startsWith('new-recipe-'))).toBe(true);
    expect(
      executable.items.every((item) =>
        canonicalIngredientId(item.ingredient).startsWith('PI-ING-'),
      ),
    ).toBe(true);
    const snapshots = productBehaviorTestSnapshots(executable);
    const firstLineId = executable.items[0]!.id;
    snapshots[firstLineId] = {
      ...snapshots[firstLineId]!,
      moduleEligibility: {
        ...snapshots[firstLineId]!.moduleEligibility,
        PRODUCTION: 'blocked',
      },
    };
    useProductionSessionStore.getState().clear();
    useRecipeStore.getState().loadRecipeInput(executable, {
      savedId: 'recipe-production-authority',
      savedName: 'Production authority QA',
      versionNumber: 1,
      versionId: 'version-production-authority',
      versionDate: '2026-08-19T10:00:00.000Z',
    });
    const loadedExecutable = buildRecipeInput(useRecipeStore.getState(), 'planning');
    useRecipeStore.setState({
      productBehaviorSnapshots: snapshots,
      practicalRecipeAudit: readPracticalRecipeAudit(
        attachPracticalRecipeAudit(loadedExecutable, loadedExecutable, '2026-08-19T10:00:00.000Z'),
      ),
      dirty: false,
    });
    const startedRun: ProductionRun = {
      ...durableRescuedRun(productionSessionWithDeviation()),
      runId: 'run-production-authority',
      recipeId: 'recipe-production-authority',
      recipeVersionId: 'version-production-authority',
      recipeVersionNumber: 1,
      plannedBatchG: executable.target_batch_grams,
      plannedItems: executable.items.map((item, index) => ({
        id: item.id,
        name: item.ingredient.name,
        canonicalIngredientId: canonicalIngredientId(item.ingredient),
        processScope: 'BASE_FORMULATION' as const,
        scopePosition: index,
        plannedGrams: item.planned_grams,
        displayGrams: item.planned_grams,
      })),
      productProfile: executable.category,
      temperatureC: executable.target_temperature_c,
      thermalMode: 'HEAT_CAPABLE',
      processReadiness: 'READY',
      processAdvisories: [],
      actual: null,
      rescue: null,
      events: [],
    };
    const repository = {
      listRuns: vi.fn(async () => ({ items: [], nextCursor: null })),
      startRun: vi.fn(async () => startedRun),
    } as unknown as ProductionRepository;
    mocks.resolveProductionRepository.mockReturnValue({
      repository,
      mode: 'backend',
      isLocalDev: false,
      unavailable: false,
    });
    mocks.validateRecipeBehaviorOnServer.mockResolvedValue({
      ready: true,
      module: 'PRODUCTION',
      staleLineIds: [],
      lines: [],
      processReadiness: { schemaVersion: 1, status: 'READY', blockers: [], advisories: [] },
    });

    await act(async () => root.render(<EnabledHarness />));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.validateRecipeBehaviorOnServer).toHaveBeenCalledWith(
      expect.objectContaining({ module: 'PRODUCTION' }),
    );
    expect(view?.prerequisite?.code).not.toBe('product_authority_required');

    await act(async () => view!.startNewSession());

    expect(repository.startRun).toHaveBeenCalledTimes(1);
    const startArgs = vi.mocked(repository.startRun).mock.calls[0]![0];
    expect(
      startArgs.version.recipeInput.items.map((item) => ({
        lineId: item.id,
        canonicalId: canonicalIngredientId(item.ingredient),
      })),
    ).toEqual(
      executable.items.map((item) => ({
        lineId: item.id,
        canonicalId: canonicalIngredientId(item.ingredient),
      })),
    );
    expect(
      Object.values(startArgs.version.productComposition!.behaviorSnapshots ?? {}).map(
        (snapshot) => snapshot?.mapperIngredientId,
      ),
    ).toEqual(executable.items.map((item) => canonicalIngredientId(item.ingredient)));
    expect(view?.sessionStartError).toBeNull();
    expect(useProductionSessionStore.getState().session?.sessionId).toBe(
      'run-production-authority',
    );
  });

  it('shows bounded process advice without a recalculate loop or automatic start', async () => {
    const executable = attachPracticalRecipeAudit(
      DEFAULT_PRESET,
      DEFAULT_PRESET,
      '2026-08-19T10:00:00.000Z',
    );
    const snapshots = productBehaviorTestSnapshots(executable);
    useProductionSessionStore.getState().clear();
    useRecipeStore.getState().loadRecipeInput(executable, {
      savedId: 'recipe-advisory-authority',
      savedName: 'Advisory authority QA',
      versionNumber: 1,
      versionId: 'version-advisory-authority',
      versionDate: '2026-08-19T10:00:00.000Z',
    });
    const loadedExecutable = buildRecipeInput(useRecipeStore.getState(), 'planning');
    useRecipeStore.setState({
      productBehaviorSnapshots: snapshots,
      practicalRecipeAudit: readPracticalRecipeAudit(
        attachPracticalRecipeAudit(loadedExecutable, loadedExecutable, '2026-08-19T10:00:00.000Z'),
      ),
      dirty: false,
    });
    const advisory = {
      code: 'PROCESS_DATA_INSUFFICIENT',
      lineId: executable.items[0]!.id,
      productId: 'approved-product-1',
      mapperIngredientId: 'PI-ING-000236',
      decision: 'UNKNOWN',
      verificationStatus: 'unverified',
    };
    const startedRun: ProductionRun = {
      ...durableRescuedRun(productionSessionWithDeviation()),
      runId: 'run-advisory-authority',
      recipeId: 'recipe-advisory-authority',
      recipeVersionId: 'version-advisory-authority',
      thermalMode: 'COLD_ONLY',
      processReadiness: 'READY_WITH_INFO',
      processAdvisories: [advisory],
      actual: null,
      rescue: null,
    };
    const repository = {
      listRuns: vi.fn(async () => ({ items: [], nextCursor: null })),
      startRun: vi.fn(async (input: Parameters<ProductionRepository['startRun']>[0]) => ({
        ...startedRun,
        thermalMode: input.meta?.thermalMode ?? null,
      })),
    } as unknown as ProductionRepository;
    mocks.resolveProductionRepository.mockReturnValue({
      repository,
      mode: 'backend',
      isLocalDev: false,
      unavailable: false,
    });
    mocks.validateRecipeBehaviorOnServer.mockResolvedValue({
      ready: true,
      module: 'PRODUCTION',
      staleLineIds: [],
      lines: [],
      processReadiness: {
        schemaVersion: 1,
        status: 'READY_WITH_INFO',
        blockers: [],
        advisories: [advisory],
      },
    });

    await act(async () => root.render(<EnabledHarness />));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(repository.startRun).not.toHaveBeenCalled();
    expect(view?.prerequisite).toBeNull();
    expect(view?.processReadiness.status).toBe('READY_WITH_INFO');
    expect(view?.practicalReady).toBe(true);
    // §1 OWNER RULE — no thermal route is ever sent, held or offered.
    expect(mocks.validateRecipeBehaviorOnServer).not.toHaveBeenCalledWith(
      expect.objectContaining({ thermalMode: expect.anything() }),
    );
    expect(view).not.toHaveProperty('setThermalMode');
    expect(view).not.toHaveProperty('thermalMode');

    await act(async () => view!.startNewSession());

    expect(repository.startRun).toHaveBeenCalledTimes(1);
    expect(repository.startRun).not.toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({ thermalMode: expect.anything() }),
      }),
    );
    expect(view?.processReadiness.status).toBe('READY_WITH_INFO');
  });

  it('downgrades a legacy blocked process envelope to information and never holds Start on it', async () => {
    const executable = attachPracticalRecipeAudit(
      DEFAULT_PRESET,
      DEFAULT_PRESET,
      '2026-08-19T10:00:00.000Z',
    );
    const snapshots = productBehaviorTestSnapshots(executable);
    useProductionSessionStore.getState().clear();
    useRecipeStore.getState().loadRecipeInput(executable, {
      savedId: 'recipe-process-blocked',
      savedName: 'Process blocked QA',
      versionNumber: 1,
      versionId: 'version-process-blocked',
      versionDate: '2026-08-19T10:00:00.000Z',
    });
    const loadedExecutable = buildRecipeInput(useRecipeStore.getState(), 'planning');
    useRecipeStore.setState({
      productBehaviorSnapshots: snapshots,
      practicalRecipeAudit: readPracticalRecipeAudit(
        attachPracticalRecipeAudit(loadedExecutable, loadedExecutable, '2026-08-19T10:00:00.000Z'),
      ),
      dirty: false,
    });
    const repository = {
      listRuns: vi.fn(async () => ({ items: [], nextCursor: null })),
      startRun: vi.fn(),
    } as unknown as ProductionRepository;
    mocks.resolveProductionRepository.mockReturnValue({
      repository,
      mode: 'backend',
      isLocalDev: false,
      unavailable: false,
    });
    mocks.validateRecipeBehaviorOnServer.mockResolvedValue({
      ready: true,
      module: 'PRODUCTION',
      staleLineIds: [],
      lines: [],
      processReadiness: {
        schemaVersion: 1,
        status: 'BLOCKED',
        blockers: [
          {
            code: 'PROCESS_ADVISORY_AUTHORITY_MISSING',
            lineId: executable.items[0]!.id,
            productId: 'unregistered-product',
            mapperIngredientId: 'PI-ING-UNREGISTERED',
            decision: 'UNKNOWN',
            verificationStatus: 'unverified',
          },
        ],
        advisories: [],
      },
    });

    await act(async () => root.render(<EnabledHarness />));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(view?.prerequisite).toBeNull();
    // An older server still answering BLOCKED is read as information: the
    // detail survives as an advisory, and the status can never be BLOCKED.
    expect(view?.processReadiness.status).toBe('READY_WITH_INFO');
    expect(view?.processReadiness.blockers).toEqual([]);
    expect(view?.processReadiness.advisories).toEqual([
      expect.objectContaining({ code: 'PROCESS_ADVISORY_AUTHORITY_MISSING' }),
    ]);
  });

  it('preserves and detaches only an orphaned local session before starting the saved immutable version', async () => {
    useProductionSessionStore.getState().clear();
    const loadedInput = buildRecipeInput(useRecipeStore.getState(), 'planning');
    const practicalAudit = readPracticalRecipeAudit(
      attachPracticalRecipeAudit(loadedInput, loadedInput, '2026-08-19T10:00:00.000Z'),
    );
    useRecipeStore
      .getState()
      .markSaved(
        'recipe-saved-after-preview',
        'Saved after Preview and Apply',
        2,
        '2026-08-19T10:04:00.000Z',
        practicalAudit,
        '5d5eae9c-0a8e-41d8-95ba-7a4d265461a2',
      );
    expect(Object.keys(useRecipeStore.getState().productBehaviorSnapshots)).toHaveLength(
      loadedInput.items.length,
    );
    useProductionSessionStore.getState().startNewSession({
      ownerUserId: 'owner-runtime',
      source: {
        recipeId: 'recipe-before-durable-production',
        recipeVersionId: 'version-before-durable-production',
        recipeVersionNumber: 1,
        recipeName: 'Local pre-durable session',
      },
      plannedInput: loadedInput,
      plannedComposition: recipeCompositionFromState(useRecipeStore.getState()),
      now: '2026-08-19T09:00:00.000Z',
      sessionId: 'local-run-without-remote-row',
    });
    const orphaned = useProductionSessionStore.getState().session!;
    const startedRun: ProductionRun = {
      ...durableRescuedRun(orphaned),
      runId: 'durable-run-after-save',
      recipeId: 'recipe-saved-after-preview',
      recipeVersionId: '5d5eae9c-0a8e-41d8-95ba-7a4d265461a2',
      recipeVersionNumber: 2,
      actual: null,
      rescue: null,
      events: [],
    };
    const repository = {
      getRun: vi.fn(async (runId: string) => (runId === startedRun.runId ? startedRun : null)),
      listRuns: vi.fn(async () => ({ items: [], nextCursor: null })),
      startRun: vi.fn(async () => startedRun),
      transition: vi.fn(async () => {
        throw new Error('An orphaned local run must never be mutated remotely.');
      }),
    } as unknown as ProductionRepository;
    mocks.resolveProductionRepository.mockReturnValue({
      repository,
      mode: 'backend',
      isLocalDev: false,
      unavailable: false,
    });
    mocks.validateRecipeBehaviorOnServer.mockResolvedValue({
      ready: true,
      module: 'PRODUCTION',
      staleLineIds: [],
      lines: [],
      processReadiness: { schemaVersion: 1, status: 'READY', blockers: [], advisories: [] },
    });

    await act(async () => root.render(<EnabledHarness />));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(view?.prerequisite).toMatchObject({
      code: 'repository_recovery',
      action: 'archive_stale_session',
      actionLabel: 'Zachowaj i odłącz partię',
    });

    await act(async () => view!.archiveStaleSession());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(repository.transition).not.toHaveBeenCalled();
    expect(useProductionSessionStore.getState().archivedSessions).toContainEqual(orphaned);
    expect(view?.prerequisite).toBeNull();

    await act(async () => view!.startNewSession());

    expect(view?.sessionStartError).toBeNull();
    expect(repository.startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        version: expect.objectContaining({
          versionId: '5d5eae9c-0a8e-41d8-95ba-7a4d265461a2',
          versionNumber: 2,
        }),
      }),
    );
    expect(useProductionSessionStore.getState().session?.sessionId).toBe('durable-run-after-save');
  });

  it('detaches a completed run locally when the saved recipe version changes', async () => {
    const attached = useProductionSessionStore.getState().session!;
    const completed = {
      ...attached,
      status: 'completed',
      completedAt: '2026-08-25T11:00:00.000Z',
      completionSnapshot: {
        actualFinalMassG: attached.plannedInput.target_batch_grams,
        productComposition: attached.plannedComposition,
      },
    } as ProductionSession;
    useProductionSessionStore.setState({ session: completed, archivedSessions: [] });
    useRecipeStore.getState().loadRecipeInput(attached.plannedInput, {
      savedId: attached.source.recipeId,
      savedName: attached.source.recipeName,
      versionNumber: 2,
      versionId: 'version-after-completed-run',
      versionDate: '2026-08-25T11:05:00.000Z',
      composition: attached.plannedComposition,
    });
    const transition = vi.fn();
    const completedRemote = {
      ...durableRescuedRun(attached),
      status: 'completed',
      completedAt: '2026-08-25T11:00:00.000Z',
    } as ProductionRun;
    const repository = {
      getRun: vi.fn(async () => completedRemote),
      transition,
    } as unknown as ProductionRepository;
    mocks.resolveProductionRepository.mockReturnValue({
      repository,
      mode: 'backend',
      isLocalDev: false,
      unavailable: false,
    });

    await act(async () => root.render(<EnabledHarness />));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(view?.session?.source.recipeVersionId).toBe(attached.source.recipeVersionId);
    expect(view?.prerequisite).toMatchObject({
      code: 'stale_source',
      action: 'archive_stale_session',
      actionLabel: 'Zarchiwizuj wcześniejszą partię',
    });

    await act(async () => view!.archiveStaleSession());

    expect(transition).not.toHaveBeenCalled();
    expect(useProductionSessionStore.getState().session).toBeNull();
    expect(useProductionSessionStore.getState().archivedSessions).toContainEqual(completed);
  });

  it('keeps the local session attached when durable recovery fails for a repository error', async () => {
    useProductionSessionStore.getState().clear();
    const loadedInput = buildRecipeInput(useRecipeStore.getState(), 'planning');
    useRecipeStore
      .getState()
      .markSaved(
        'recipe-repository-error',
        'Repository error QA',
        3,
        '2026-08-19T10:05:00.000Z',
        readPracticalRecipeAudit(
          attachPracticalRecipeAudit(loadedInput, loadedInput, '2026-08-19T10:00:00.000Z'),
        ),
        'a0e77f7e-a858-4d5a-ae39-f0dfd60a8cbf',
      );
    useProductionSessionStore.getState().startNewSession({
      ownerUserId: 'owner-runtime',
      source: {
        recipeId: 'recipe-repository-error',
        recipeVersionId: 'a0e77f7e-a858-4d5a-ae39-f0dfd60a8cbf',
        recipeVersionNumber: 3,
        recipeName: 'Repository error QA',
      },
      plannedInput: loadedInput,
      plannedComposition: recipeCompositionFromState(useRecipeStore.getState()),
      now: '2026-08-19T10:05:00.000Z',
      sessionId: 'local-run-during-repository-error',
    });
    const attached = useProductionSessionStore.getState().session!;
    const repository = {
      getRun: vi.fn(async () => {
        throw new Error('network unavailable');
      }),
      transition: vi.fn(),
    } as unknown as ProductionRepository;
    mocks.resolveProductionRepository.mockReturnValue({
      repository,
      mode: 'backend',
      isLocalDev: false,
      unavailable: false,
    });
    mocks.validateRecipeBehaviorOnServer.mockResolvedValue({
      ready: true,
      module: 'PRODUCTION',
      staleLineIds: [],
      lines: [],
      processReadiness: { schemaVersion: 1, status: 'READY', blockers: [], advisories: [] },
    });

    await act(async () => root.render(<EnabledHarness />));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(view?.prerequisite).toMatchObject({
      code: 'repository_recovery',
      action: 'return_to_recipe',
    });
    await act(async () => view!.archiveStaleSession());
    expect(useProductionSessionStore.getState().session).toEqual(attached);
    expect(useProductionSessionStore.getState().archivedSessions).toEqual([]);
    expect(repository.transition).not.toHaveBeenCalled();
  });
});
