// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import {
  attachPracticalRecipeAudit,
  readPracticalRecipeAudit,
} from '@/features/practical-recipe/practicalRecipe';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';
import type {
  ProductionRepository,
  ProductionRescueAuthorization,
} from '@/services/proCore/productionRepository';
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

const productionSessionWithDeviation = () => {
  const plannedInput = {
    ...DEFAULT_PRESET,
    items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
    machine_capacity_grams: null,
  };
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
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    useProductionSessionStore.getState().clear();
    mocks.resolveProductionRepository.mockReset();
    mocks.validateRecipeBehaviorOnServer.mockReset();
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

  it('runs server PRODUCTION validation even when a cached local module flag is stale', async () => {
    const executable = attachPracticalRecipeAudit(
      DEFAULT_PRESET,
      DEFAULT_PRESET,
      '2026-08-19T10:00:00.000Z',
    );
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
        attachPracticalRecipeAudit(
          loadedExecutable,
          loadedExecutable,
          '2026-08-19T10:00:00.000Z',
        ),
      ),
      dirty: false,
    });
    const repository = {
      listRuns: vi.fn(async () => ({ items: [], nextCursor: null })),
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
  });
});
