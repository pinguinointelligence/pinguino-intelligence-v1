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
import type { AmendInput, ProductionMeta, RecordActualInput } from '@/features/pro-core/productionMode';
import type {
  ProductionDeviation,
  ProductionEvent,
  ProductionHistoryPage,
  ProductionHistoryQuery,
  ProductionRun,
  ProductionStatus,
} from '@/features/pro-core/productionContracts';
import type { InMemoryProduction } from './inMemoryProduction';

export interface CreateRunArgs {
  ownerUserId: string;
  version: RecipeVersion;
  target: ScaleTarget;
  capabilities: ProductionCapabilities;
  meta?: Partial<ProductionMeta>;
  by: string;
  scaleOptions?: ScaleOptions;
}

export type RecordActualArgs = Omit<RecordActualInput, 'at' | 'eventId'>;
export type AmendArgs = Omit<AmendInput, 'at' | 'eventId'>;

export interface ProductionRepository {
  scale(version: RecipeVersion, target: ScaleTarget, options?: ScaleOptions): Promise<ScaleResult>;
  createRun(args: CreateRunArgs): Promise<ProductionRun>;
  transition(runId: string, to: ProductionStatus, by: string): Promise<ProductionRun>;
  updateMeta(runId: string, patch: Partial<ProductionMeta>): Promise<ProductionRun>;
  recordActual(runId: string, input: RecordActualArgs): Promise<ProductionRun>;
  amend(runId: string, input: AmendArgs): Promise<ProductionRun>;
  getRun(runId: string, ownerUserId?: string): Promise<ProductionRun | null>;
  listRuns(ownerUserId: string, query?: ProductionHistoryQuery): Promise<ProductionHistoryPage>;
  getDeviation(runId: string, ownerUserId?: string): Promise<ProductionDeviation | null>;
  getEvents(runId: string, ownerUserId?: string): Promise<readonly ProductionEvent[]>;
}

/** Adapt the in-memory reference implementation to the async ProductionRepository port. */
export function inMemoryProductionRepository(svc: InMemoryProduction): ProductionRepository {
  return {
    scale: async (version, target, options) => svc.scale(version, target, options),
    createRun: async (args) => svc.createRun(args),
    transition: async (runId, to, by) => svc.transition(runId, to, by),
    updateMeta: async (runId, patch) => svc.updateMeta(runId, patch),
    recordActual: async (runId, input) => svc.recordActual(runId, input),
    amend: async (runId, input) => svc.amend(runId, input),
    getRun: async (runId, ownerUserId) => svc.getRun(runId, ownerUserId),
    listRuns: async (ownerUserId, query) => svc.listRuns(ownerUserId, query),
    getDeviation: async (runId, ownerUserId) => svc.getDeviation(runId, ownerUserId),
    getEvents: async (runId, ownerUserId) => svc.getEvents(runId, ownerUserId),
  };
}
