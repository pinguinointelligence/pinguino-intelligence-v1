/**
 * In-memory costs adapter — deterministic reference implementation of Track C. Stores the owner's
 * cost entries + immutable cost snapshots with an injected clock + id generator. No IO, no live DB.
 *
 * Cost entries are the owner's personal price list (owner-scoped CRUD). A snapshot is built by
 * resolving the current per-kg costs and freezing them; it is IMMUTABLE — a later price change
 * yields a NEW snapshot and never mutates an old one. Authorization is by internal user id.
 */
import {
  buildRecipeCostSnapshot,
  resolveIngredientCosts,
  type ResolveOptions,
  type SnapshotLineInput,
} from '@/features/pro-core/costing';
import type { CostBasis, CostEntry, CostResolution, RecipeCostSnapshot } from '@/features/pro-core/costContracts';

export type NewCostEntry = Omit<CostEntry, 'entryId' | 'createdAt'>;

export interface BuildSnapshotArgs {
  ownerUserId: string;
  recipeId: string;
  recipeVersionId: string;
  productionRunId?: string | null;
  lines: SnapshotLineInput[];
  currency: string;
  basis: CostBasis;
  asOf: string;
  engineVersion: string;
  configVersion: string;
  by: string;
}

let seq = 0;

export class InMemoryCosts {
  private readonly entries = new Map<string, CostEntry>();
  private readonly snapshots = new Map<string, RecipeCostSnapshot>();

  constructor(
    private readonly now: () => string,
    private readonly nextId: () => string = () => `id-${(seq += 1)}`,
  ) {}

  addEntry(entry: NewCostEntry): CostEntry {
    if (!(entry.purchaseQuantity > 0)) throw new Error('Purchase quantity must be greater than zero.');
    if (!(entry.price >= 0)) throw new Error('Price cannot be negative.');
    if (!/^[A-Z]{3}$/.test(entry.currency)) throw new Error('Currency must be a 3-letter ISO code.');
    const stored: CostEntry = { ...entry, entryId: this.nextId(), createdAt: this.now() };
    this.entries.set(stored.entryId, stored);
    return stored;
  }

  updateEntry(entryId: string, patch: Partial<NewCostEntry>): CostEntry {
    const existing = this.entries.get(entryId);
    if (!existing) throw new Error(`unknown cost entry ${entryId}`);
    const next = { ...existing, ...patch };
    this.entries.set(entryId, next);
    return next;
  }

  deleteEntry(entryId: string): void {
    this.entries.delete(entryId);
  }

  listEntries(ownerUserId: string, ingredientId?: string): CostEntry[] {
    return [...this.entries.values()].filter(
      (e) => e.ownerUserId === ownerUserId && (ingredientId === undefined || e.ingredientId === ingredientId),
    );
  }

  resolveCosts(ownerUserId: string, ingredientIds: readonly string[], options: ResolveOptions & { asOf: string }): CostResolution[] {
    return resolveIngredientCosts(this.listEntries(ownerUserId), ingredientIds, options);
  }

  /** Resolve current costs and freeze an immutable snapshot. */
  buildSnapshot(args: BuildSnapshotArgs): RecipeCostSnapshot {
    const resolutions = this.resolveCosts(
      args.ownerUserId,
      args.lines.map((l) => l.ingredientId),
      { targetCurrency: args.currency, basis: args.basis, asOf: args.asOf },
    );
    const snapshot = buildRecipeCostSnapshot({
      snapshotId: this.nextId(),
      recipeId: args.recipeId,
      recipeVersionId: args.recipeVersionId,
      productionRunId: args.productionRunId ?? null,
      currency: args.currency,
      basis: args.basis,
      lines: args.lines,
      resolutions,
      engineVersion: args.engineVersion,
      configVersion: args.configVersion,
      resolvedAt: this.now(),
      createdBy: args.by,
    });
    // owner scoping: remember which owner the snapshot belongs to via a parallel map key
    this.snapshots.set(snapshot.snapshotId, snapshot);
    this.owners.set(snapshot.snapshotId, args.ownerUserId);
    return snapshot;
  }

  private readonly owners = new Map<string, string>();

  getSnapshot(snapshotId: string, ownerUserId?: string): RecipeCostSnapshot | null {
    const snap = this.snapshots.get(snapshotId) ?? null;
    if (!snap) return null;
    if (ownerUserId !== undefined && this.owners.get(snapshotId) !== ownerUserId) return null;
    return snap;
  }

  listSnapshots(ownerUserId: string, filter: { recipeId?: string; recipeVersionId?: string } = {}): RecipeCostSnapshot[] {
    return [...this.snapshots.values()].filter((s) => {
      if (this.owners.get(s.snapshotId) !== ownerUserId) return false;
      if (filter.recipeId && s.recipeId !== filter.recipeId) return false;
      if (filter.recipeVersionId && s.recipeVersionId !== filter.recipeVersionId) return false;
      return true;
    });
  }
}
