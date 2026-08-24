/**
 * PINGÜINO PRO CORE — ProductionRepository port (Track B: scaling + Production Mode + history).
 *
 * The async interface the real Production surfaces depend on. `inMemoryProductionRepository`
 * adapts the deterministic in-memory reference implementation; a backend adapter (Supabase against
 * migration 0028) implements the same port for staging. Runs are planned from an EXACT immutable
 * recipe-version id; the planned snapshot is immutable; history is owner-scoped.
 */
import type { RecipeVersion } from '@/features/pro-core/recipeContracts';
import type { ScaleOptions, ScaleResult, ScaleTarget } from '@/features/pro-core/recipeScaling';
import type { ProductionCapabilities } from '@/features/pro-core/productionContracts';
import type {
  AmendInput,
  ProductionMeta,
  RecordActualInput,
} from '@/features/pro-core/productionMode';
import type {
  ProductionDeviation,
  ProductionEvent,
  ProductionHistoryPage,
  ProductionHistoryQuery,
  ProductionRescueStableOptionId,
  ProductionRun,
  ProductionStatus,
} from '@/features/pro-core/productionContracts';
import type { InMemoryProduction } from './inMemoryProduction';
import type { ProductionCompletionSnapshot } from '@/features/production-workspace/productionSession';

export interface CreateRunArgs {
  ownerUserId: string;
  version: RecipeVersion;
  target: ScaleTarget;
  capabilities: ProductionCapabilities;
  meta?: Partial<ProductionMeta>;
  by: string;
  scaleOptions?: ScaleOptions;
}

export type RecordActualArgs = Omit<RecordActualInput, 'at' | 'eventId'> & {
  /** CAS basis carried by the operator's hydrated session, never refreshed by the adapter. */
  expectedActualRevision: number;
  expectedRescueRevision: number;
  /** Exact operator intent persisted beside the canonical actual vector. */
  eventContext?: {
    action: 'confirm' | 'record_correction' | 'top_up';
    lineId: string;
    previousActualG: number | null;
  };
};
export interface AuthorizeProductionRescueArgs {
  runId: string;
  stableOptionId: ProductionRescueStableOptionId;
  expectedRescueRevision: number;
  expectedActualRevision: number;
  idempotencyKey: string;
}

export interface ProductionRescuePreviewInstruction {
  lineId: string | null;
  ingredientName: string;
  kind: 'add' | 'reduce_pending_plan';
  grams: number;
  finalTargetGrams: number;
}

/** Display-safe result issued by the trusted Engine runtime. It carries no candidate recipe. */
export interface ProductionRescueAuthorization {
  authorizationId: string;
  /** Opaque trusted binding for the exact server-computed candidate shown in Preview. */
  candidateFingerprint: string;
  runId: string;
  stableOptionId: ProductionRescueStableOptionId;
  expectedActualRevision: number;
  expectedRescueRevision: number;
  authorizedAt: string;
  expiresAt: string;
  preview: {
    title: string;
    explanation: string;
    finalMassG: number;
    scoreDisplay: string;
    instructions: ProductionRescuePreviewInstruction[];
  };
}

export interface ConsumeProductionRescueArgs {
  authorizationId: string;
  expectedActualRevision: number;
  expectedRescueRevision: number;
  idempotencyKey: string;
}
export type AmendArgs = Omit<AmendInput, 'at' | 'eventId'>;

export interface ProductionRepository {
  scale(version: RecipeVersion, target: ScaleTarget, options?: ScaleOptions): Promise<ScaleResult>;
  createRun(args: CreateRunArgs): Promise<ProductionRun>;
  /** Atomic draft → planned → in_progress start for the served Production workspace. */
  startRun(args: CreateRunArgs): Promise<ProductionRun>;
  transition(runId: string, to: ProductionStatus, by: string): Promise<ProductionRun>;
  updateMeta(runId: string, patch: Partial<ProductionMeta>): Promise<ProductionRun>;
  recordActual(runId: string, input: RecordActualArgs): Promise<ProductionRun>;
  /** Ask the trusted Engine runtime for a display-safe, revision-bound Rescue Preview. */
  authorizeRescue(input: AuthorizeProductionRescueArgs): Promise<ProductionRescueAuthorization>;
  /** Consume one trusted authorization. No candidate recipe or grams are accepted from the browser. */
  consumeRescue(input: ConsumeProductionRescueArgs): Promise<ProductionRun>;
  /**
   * OWNER RULE §2 — record the operator's single "OK" for this run's heat
   * reminder. It changes no gram; verified positive information must be
   * acknowledged before Start and then remains confirmed for this run.
   */
  acknowledgeHeatInformation(runId: string): Promise<ProductionRun>;
  /** Persist the operator's one confirmation for the run's frozen carbonated products. */
  acknowledgeDegassing(runId: string): Promise<ProductionRun>;
  /** Atomically records the final actual vector, closes the run and freezes its ACTUAL snapshot. */
  completeRun(
    runId: string,
    input: RecordActualArgs,
    snapshot: ProductionCompletionSnapshot,
  ): Promise<ProductionRun>;
  amend(runId: string, input: AmendArgs): Promise<ProductionRun>;
  getRun(runId: string, ownerUserId?: string): Promise<ProductionRun | null>;
  listRuns(ownerUserId: string, query?: ProductionHistoryQuery): Promise<ProductionHistoryPage>;
  getDeviation(runId: string, ownerUserId?: string): Promise<ProductionDeviation | null>;
  getEvents(runId: string, ownerUserId?: string): Promise<readonly ProductionEvent[]>;
}

/** Adapt the in-memory reference implementation to the async ProductionRepository port. */
export function inMemoryProductionRepository(svc: InMemoryProduction): ProductionRepository {
  const current = (runId: string) => {
    const run = svc.getRun(runId);
    if (!run) throw new Error(`unknown production run ${runId}`);
    return run;
  };
  const assertActualBasis = (
    runId: string,
    expectedActualRevision: number,
    expectedRescueRevision: number,
  ) => {
    const run = current(runId);
    if (
      (run.actual?.revision ?? 0) !== expectedActualRevision ||
      (run.rescue?.revision ?? 0) !== expectedRescueRevision
    ) {
      throw new Error('production actual revision conflict; reload required');
    }
  };
  return {
    scale: async (version, target, options) => svc.scale(version, target, options),
    createRun: async (args) => svc.createRun(args),
    startRun: async (args) => {
      const draft = svc.createRun(args);
      const planned = svc.transition(draft.runId, 'planned', args.by);
      return svc.transition(planned.runId, 'in_progress', args.by);
    },
    transition: async (runId, to, by) => svc.transition(runId, to, by),
    updateMeta: async (runId, patch) => svc.updateMeta(runId, patch),
    recordActual: async (runId, input) => {
      assertActualBasis(runId, input.expectedActualRevision, input.expectedRescueRevision);
      return svc.recordActual(runId, input);
    },
    authorizeRescue: async () => {
      throw new Error('Trusted Production Rescue authorization is unavailable in local memory.');
    },
    consumeRescue: async () => {
      throw new Error('Trusted Production Rescue consumption is unavailable in local memory.');
    },
    acknowledgeHeatInformation: async (runId) => svc.acknowledgeHeatInformation(runId),
    acknowledgeDegassing: async (runId) => svc.acknowledgeDegassing(runId),
    completeRun: async (runId, input) => {
      assertActualBasis(runId, input.expectedActualRevision, input.expectedRescueRevision);
      const recorded = svc.recordActual(runId, input);
      return svc.transition(recorded.runId, 'completed', input.by);
    },
    amend: async (runId, input) => svc.amend(runId, input),
    getRun: async (runId, ownerUserId) => svc.getRun(runId, ownerUserId),
    listRuns: async (ownerUserId, query) => svc.listRuns(ownerUserId, query),
    getDeviation: async (runId, ownerUserId) => svc.getDeviation(runId, ownerUserId),
    getEvents: async (runId, ownerUserId) => svc.getEvents(runId, ownerUserId),
  };
}
