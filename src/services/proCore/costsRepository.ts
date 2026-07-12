/**
 * PINGÜINO PRO CORE — CostsRepository port (Track C: cost entries + immutable cost snapshots).
 *
 * The async interface the real Costs surfaces depend on. `inMemoryCostsRepository` adapts the
 * deterministic in-memory reference implementation; a backend adapter (Supabase against migration
 * 0029) implements the same port for staging. Cost entries are the owner's price list; snapshots
 * are immutable (a price change yields a NEW snapshot). Owner-scoped by internal user id.
 */
import type { CostEntry, CostResolution, RecipeCostSnapshot } from '@/features/pro-core/costContracts';
import type { ResolveOptions } from '@/features/pro-core/costing';
import type { BuildSnapshotArgs, NewCostEntry, InMemoryCosts } from './inMemoryCosts';

export interface CostsRepository {
  addEntry(entry: NewCostEntry): Promise<CostEntry>;
  updateEntry(entryId: string, patch: Partial<NewCostEntry>): Promise<CostEntry>;
  deleteEntry(entryId: string): Promise<void>;
  listEntries(ownerUserId: string, ingredientId?: string): Promise<CostEntry[]>;
  resolveCosts(ownerUserId: string, ingredientIds: readonly string[], options: ResolveOptions & { asOf: string }): Promise<CostResolution[]>;
  buildSnapshot(args: BuildSnapshotArgs): Promise<RecipeCostSnapshot>;
  getSnapshot(snapshotId: string, ownerUserId?: string): Promise<RecipeCostSnapshot | null>;
  listSnapshots(ownerUserId: string, filter?: { recipeId?: string; recipeVersionId?: string }): Promise<RecipeCostSnapshot[]>;
}

/** Adapt the in-memory reference implementation to the async CostsRepository port. */
export function inMemoryCostsRepository(svc: InMemoryCosts): CostsRepository {
  return {
    addEntry: async (entry) => svc.addEntry(entry),
    updateEntry: async (entryId, patch) => svc.updateEntry(entryId, patch),
    deleteEntry: async (entryId) => svc.deleteEntry(entryId),
    listEntries: async (ownerUserId, ingredientId) => svc.listEntries(ownerUserId, ingredientId),
    resolveCosts: async (ownerUserId, ingredientIds, options) => svc.resolveCosts(ownerUserId, ingredientIds, options),
    buildSnapshot: async (args) => svc.buildSnapshot(args),
    getSnapshot: async (snapshotId, ownerUserId) => svc.getSnapshot(snapshotId, ownerUserId),
    listSnapshots: async (ownerUserId, filter) => svc.listSnapshots(ownerUserId, filter),
  };
}
