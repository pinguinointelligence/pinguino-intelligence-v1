/**
 * PINGÜINO PRO CORE — Supabase CostsRepository adapter (Track C, migration 0029).
 *
 * The backend implementation of the CostsRepository port. It mirrors the Supabase service style of
 * `src/services/recipes.ts` / `src/services/acceptedCorrections.ts`: every query is RLS-scoped to the
 * signed-in owner (the DB policies enforce `auth.uid() = owner_user_id`), inserts stamp
 * `owner_user_id`/`created_by` with the current auth user id, and any DB error is thrown so the
 * caller shows an HONEST failure — never a false "saved".
 *
 * IMMUTABILITY. Cost entries are the owner's editable price list (full CRUD). Cost snapshots are
 * append-only: this adapter has NO method that UPDATEs or DELETEs a snapshot — `buildSnapshot`
 * always INSERTs a NEW row. The `recipe_cost_snapshots` table backs this up: it exposes only SELECT
 * and INSERT policies (no UPDATE/DELETE), so a historical snapshot can never be re-priced when
 * ingredient prices change later.
 *
 * The SupabaseClient is injected (constructor/factory param) so a fake client unit-tests this
 * adapter with no live IO. The pure costing domain (`resolveIngredientCosts` / `buildRecipeCostSnapshot`)
 * is reused unchanged, so resolution + snapshot math is identical to the in-memory reference.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { buildRecipeCostSnapshot, resolveIngredientCosts, type ResolveOptions } from '@/features/pro-core/costing';
import type {
  CostBasis,
  CostEntry,
  CostResolution,
  CostSnapshotLine,
  PurchaseUnit,
  RecipeCostSnapshot,
} from '@/features/pro-core/costContracts';
import type { CostsRepository } from './costsRepository';
import type { BuildSnapshotArgs, NewCostEntry } from './inMemoryCosts';

const ENTRIES = 'ingredient_cost_entries';
const SNAPSHOTS = 'recipe_cost_snapshots';

/** Injected dependencies. `client` is the RLS-scoped browser client; `now` is a clock seam. */
export interface SupabaseCostsDeps {
  client: SupabaseClient;
  /** Clock for a snapshot's `resolved_at` (defaults to wall clock). Injected for deterministic tests. */
  now?: () => string;
}

/* ── DB row shapes (Postgres `numeric` may arrive as a string from PostgREST, so allow both) ── */

interface EntryRow {
  id: string;
  owner_user_id: string;
  ingredient_id: string;
  ingredient_name: string;
  supplier: string | null;
  purchase_quantity: number | string;
  purchase_unit: string;
  density_g_per_ml: number | string | null;
  unit_weight_g: number | string | null;
  units_per_package: number | string | null;
  price: number | string;
  currency: string;
  price_includes_tax: boolean;
  tax_rate_percent: number | string | null;
  effective_from: string;
  expires_at: string | null;
  note: string | null;
  created_by: string;
  created_at: string;
}

interface SnapshotRow {
  id: string;
  owner_user_id: string;
  recipe_id: string;
  recipe_version_id: string;
  production_run_id: string | null;
  currency: string;
  basis: string;
  lines: CostSnapshotLine[];
  total_cost: number | string | null;
  cost_per_kg: number | string | null;
  complete: boolean;
  missing_ingredient_ids: string[];
  engine_version: string;
  config_version: string;
  resolved_at: string;
  created_by: string;
  created_at: string;
}

const numOrNull = (v: number | string | null | undefined): number | null => (v == null ? null : Number(v));

function mapEntryRow(row: EntryRow): CostEntry {
  return {
    entryId: row.id,
    ownerUserId: row.owner_user_id,
    ingredientId: row.ingredient_id,
    ingredientName: row.ingredient_name,
    supplier: row.supplier ?? null,
    purchaseQuantity: Number(row.purchase_quantity),
    purchaseUnit: row.purchase_unit as PurchaseUnit,
    densityGPerMl: numOrNull(row.density_g_per_ml),
    unitWeightG: numOrNull(row.unit_weight_g),
    unitsPerPackage: numOrNull(row.units_per_package),
    price: Number(row.price),
    currency: row.currency,
    priceIncludesTax: Boolean(row.price_includes_tax),
    taxRatePercent: numOrNull(row.tax_rate_percent),
    effectiveFrom: row.effective_from,
    expiresAt: row.expires_at ?? null,
    note: row.note ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function mapSnapshotRow(row: SnapshotRow): RecipeCostSnapshot {
  return {
    snapshotId: row.id,
    recipeId: row.recipe_id,
    recipeVersionId: row.recipe_version_id,
    productionRunId: row.production_run_id ?? null,
    currency: row.currency,
    basis: row.basis as CostBasis,
    lines: (row.lines ?? []) as CostSnapshotLine[],
    totalCost: numOrNull(row.total_cost),
    costPerKg: numOrNull(row.cost_per_kg),
    complete: Boolean(row.complete),
    missingIngredientIds: (row.missing_ingredient_ids ?? []) as string[],
    engineVersion: row.engine_version,
    configVersion: row.config_version,
    resolvedAt: row.resolved_at,
    createdBy: row.created_by,
  };
}

/** Validate a new/updated entry exactly like the in-memory reference (fail fast, never a bad insert). */
function assertValidQuantity(q: number): void {
  if (!(q > 0)) throw new Error('Purchase quantity must be greater than zero.');
}
function assertValidPrice(p: number): void {
  if (!(p >= 0)) throw new Error('Price cannot be negative.');
}
function assertValidCurrency(c: string): void {
  if (!/^[A-Z]{3}$/.test(c)) throw new Error('Currency must be a 3-letter ISO code.');
}

/** Build the Supabase CostsRepository adapter over an injected, RLS-scoped client. */
/**
 * Default backend factory for the selector: the Supabase repository when the client is configured,
 * else undefined (selector uses in-memory in DEV or reports unavailable — never a silent fallback).
 */
export function supabaseCostsBackendFactory(): (() => CostsRepository) | undefined {
  const client = supabase;
  if (!client) return undefined;
  return () => supabaseCostsRepository({ client });
}

export function supabaseCostsRepository(deps: SupabaseCostsDeps): CostsRepository {
  const { client } = deps;
  const now = deps.now ?? (() => new Date().toISOString());

  /** The signed-in user id — the owner every insert is stamped with (RLS: auth.uid() = owner_user_id). */
  async function currentUserId(): Promise<string> {
    const { data, error } = await client.auth.getUser();
    if (error) throw new Error(error.message);
    const id = data?.user?.id;
    if (!id) throw new Error('You must be signed in to manage costs.');
    return id;
  }

  async function listEntries(ownerUserId: string, ingredientId?: string): Promise<CostEntry[]> {
    let q = client.from(ENTRIES).select('*').eq('owner_user_id', ownerUserId);
    if (ingredientId !== undefined) q = q.eq('ingredient_id', ingredientId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ((data ?? []) as EntryRow[]).map(mapEntryRow);
  }

  async function resolveCosts(
    ownerUserId: string,
    ingredientIds: readonly string[],
    options: ResolveOptions & { asOf: string },
  ): Promise<CostResolution[]> {
    const entries = await listEntries(ownerUserId);
    return resolveIngredientCosts(entries, ingredientIds, options);
  }

  async function addEntry(entry: NewCostEntry): Promise<CostEntry> {
    assertValidQuantity(entry.purchaseQuantity);
    assertValidPrice(entry.price);
    assertValidCurrency(entry.currency);
    const userId = await currentUserId();
    const insert = {
      owner_user_id: userId,
      ingredient_id: entry.ingredientId,
      ingredient_name: entry.ingredientName,
      supplier: entry.supplier,
      purchase_quantity: entry.purchaseQuantity,
      purchase_unit: entry.purchaseUnit,
      density_g_per_ml: entry.densityGPerMl,
      unit_weight_g: entry.unitWeightG,
      units_per_package: entry.unitsPerPackage,
      price: entry.price,
      currency: entry.currency,
      price_includes_tax: entry.priceIncludesTax,
      tax_rate_percent: entry.taxRatePercent,
      effective_from: entry.effectiveFrom,
      expires_at: entry.expiresAt,
      note: entry.note,
      created_by: userId,
    };
    const { data, error } = await client.from(ENTRIES).insert(insert).select().single();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Cost entry insert returned no row.');
    return mapEntryRow(data as EntryRow);
  }

  async function updateEntry(entryId: string, patch: Partial<NewCostEntry>): Promise<CostEntry> {
    if (patch.purchaseQuantity !== undefined) assertValidQuantity(patch.purchaseQuantity);
    if (patch.price !== undefined) assertValidPrice(patch.price);
    if (patch.currency !== undefined) assertValidCurrency(patch.currency);
    // Map only mutable domain fields → columns; identity (owner/created_by) is never patched.
    const upd: Record<string, unknown> = {};
    if (patch.ingredientId !== undefined) upd.ingredient_id = patch.ingredientId;
    if (patch.ingredientName !== undefined) upd.ingredient_name = patch.ingredientName;
    if (patch.supplier !== undefined) upd.supplier = patch.supplier;
    if (patch.purchaseQuantity !== undefined) upd.purchase_quantity = patch.purchaseQuantity;
    if (patch.purchaseUnit !== undefined) upd.purchase_unit = patch.purchaseUnit;
    if (patch.densityGPerMl !== undefined) upd.density_g_per_ml = patch.densityGPerMl;
    if (patch.unitWeightG !== undefined) upd.unit_weight_g = patch.unitWeightG;
    if (patch.unitsPerPackage !== undefined) upd.units_per_package = patch.unitsPerPackage;
    if (patch.price !== undefined) upd.price = patch.price;
    if (patch.currency !== undefined) upd.currency = patch.currency;
    if (patch.priceIncludesTax !== undefined) upd.price_includes_tax = patch.priceIncludesTax;
    if (patch.taxRatePercent !== undefined) upd.tax_rate_percent = patch.taxRatePercent;
    if (patch.effectiveFrom !== undefined) upd.effective_from = patch.effectiveFrom;
    if (patch.expiresAt !== undefined) upd.expires_at = patch.expiresAt;
    if (patch.note !== undefined) upd.note = patch.note;
    const { data, error } = await client.from(ENTRIES).update(upd).eq('id', entryId).select().maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(`Cost entry ${entryId} was not found or is not owned by you.`);
    return mapEntryRow(data as EntryRow);
  }

  async function deleteEntry(entryId: string): Promise<void> {
    const { error } = await client.from(ENTRIES).delete().eq('id', entryId);
    if (error) throw new Error(error.message);
  }

  /**
   * Resolve the owner's CURRENT costs and freeze an immutable snapshot as a NEW row. Never updates an
   * existing snapshot — a later price change simply produces another append-only snapshot.
   */
  async function buildSnapshot(args: BuildSnapshotArgs): Promise<RecipeCostSnapshot> {
    const userId = await currentUserId();
    const resolutions = await resolveCosts(
      args.ownerUserId,
      args.lines.map((l) => l.ingredientId),
      { targetCurrency: args.currency, basis: args.basis, asOf: args.asOf },
    );
    // Reuse the pure domain to compute the frozen line/total math (id is DB-assigned, so pass a placeholder).
    const computed = buildRecipeCostSnapshot({
      snapshotId: 'pending',
      recipeId: args.recipeId,
      recipeVersionId: args.recipeVersionId,
      productionRunId: args.productionRunId ?? null,
      currency: args.currency,
      basis: args.basis,
      lines: args.lines,
      resolutions,
      engineVersion: args.engineVersion,
      configVersion: args.configVersion,
      resolvedAt: now(),
      createdBy: args.by,
    });
    const insert = {
      owner_user_id: userId,
      recipe_id: args.recipeId,
      recipe_version_id: args.recipeVersionId,
      production_run_id: args.productionRunId ?? null,
      currency: computed.currency,
      basis: computed.basis,
      lines: computed.lines,
      total_cost: computed.totalCost,
      cost_per_kg: computed.costPerKg,
      complete: computed.complete,
      missing_ingredient_ids: computed.missingIngredientIds,
      engine_version: computed.engineVersion,
      config_version: computed.configVersion,
      resolved_at: computed.resolvedAt,
      created_by: userId,
    };
    const { data, error } = await client.from(SNAPSHOTS).insert(insert).select().single();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Cost snapshot insert returned no row.');
    return mapSnapshotRow(data as SnapshotRow);
  }

  async function getSnapshot(snapshotId: string, ownerUserId?: string): Promise<RecipeCostSnapshot | null> {
    let q = client.from(SNAPSHOTS).select('*').eq('id', snapshotId);
    if (ownerUserId !== undefined) q = q.eq('owner_user_id', ownerUserId);
    const { data, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapSnapshotRow(data as SnapshotRow) : null;
  }

  async function listSnapshots(
    ownerUserId: string,
    filter: { recipeId?: string; recipeVersionId?: string } = {},
  ): Promise<RecipeCostSnapshot[]> {
    let q = client.from(SNAPSHOTS).select('*').eq('owner_user_id', ownerUserId);
    if (filter.recipeId) q = q.eq('recipe_id', filter.recipeId);
    if (filter.recipeVersionId) q = q.eq('recipe_version_id', filter.recipeVersionId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ((data ?? []) as SnapshotRow[]).map(mapSnapshotRow);
  }

  return {
    addEntry,
    updateEntry,
    deleteEntry,
    listEntries,
    resolveCosts,
    buildSnapshot,
    getSnapshot,
    listSnapshots,
  };
}
