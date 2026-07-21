/**
 * PINGÜINO PRO CORE — Supabase ProductionRepository adapter (Track B backend port, migration 0028).
 *
 * The durable adapter behind the `ProductionRepository` port. It composes the SAME pure domains as
 * the in-memory reference (`recipeScaling` + `productionMode`) over four RLS-scoped tables:
 *
 *   • public.production_runs             — mutable metadata + status + frozen reproducibility trace
 *   • public.production_run_planned_items — the IMMUTABLE frozen plan (insert + select only)
 *   • public.production_run_actuals      — recorded actuals (upsertable; NEVER replaces the plan)
 *   • public.production_run_events       — APPEND-ONLY history (lifecycle + post-completion amends)
 *
 * Guarantees mirrored from the schema + domain:
 *   • A run references an EXACT immutable `recipe_version_id` (the version passed in, never latest).
 *   • The planned snapshot is written once at createRun and never UPDATE/DELETE-d afterwards.
 *   • Actuals are recorded separately (upsert on run_id) and never touch the planned rows.
 *   • Events are only ever INSERTed — a "restore"/amendment is a NEW event, never a rewrite.
 *   • Every read/write is scoped to the signed-in auth user (auth.uid()); INSERTs set owner_user_id
 *     + created_by/recorded_by to that same id. RLS enforces this in the DB; the adapter also
 *     filters by owner explicitly so isolation holds even under a fake client.
 *   • HONEST FAILURE: any Supabase error is thrown as a typed Error — never a false "saved".
 *
 * The SupabaseClient is injected (factory param) so a fake client unit-tests it with no live DB.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type { RecipeVersion } from '@/features/pro-core/recipeContracts';
import {
  scaleRecipeVersion,
  type ScaleOptions,
  type ScaleResult,
  type ScaleTarget,
} from '@/features/pro-core/recipeScaling';
import {
  amendRun,
  buildProductionRun,
  computeDeviation,
  queryProductionRuns,
  recordActual as recordActualPure,
  transitionRun,
  updateMeta as updateMetaPure,
  type ProductionMeta,
} from '@/features/pro-core/productionMode';
import type {
  ActualIngredient,
  PlannedIngredient,
  ProductionActual,
  ProductionDeviation,
  ProductionEvent,
  ProductionEventType,
  ProductionHistoryPage,
  ProductionHistoryQuery,
  ProductionRun,
  ProductionStatus,
  SubstitutionRecord,
} from '@/features/pro-core/productionContracts';
import type {
  AmendArgs,
  CreateRunArgs,
  ProductionRepository,
  RecordActualArgs,
} from './productionRepository';

const RUNS = 'production_runs';
const PLANNED = 'production_run_planned_items';
const ACTUALS = 'production_run_actuals';
const EVENTS = 'production_run_events';

/** Tunable seams (defaults are production-safe; tests inject deterministic ones). */
export interface SupabaseProductionOptions {
  now?: () => string;
  newId?: () => string;
}

/* ── raw row shapes (exactly the migration-0028 columns) ─────────────────────── */

interface RunRow {
  id: string;
  owner_user_id: string;
  recipe_id: string;
  recipe_version_id: string;
  recipe_version_number: number;
  status: string;
  planned_batch_g: number | string;
  product_profile: string | null;
  temperature_c: number | string | null;
  engine_version: string;
  config_version: string;
  mapper_dataset_version: string | null;
  planned_date: string | null;
  machine: string | null;
  location: string | null;
  batch_reference: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
}

interface PlannedRow {
  run_id: string;
  line_id: string;
  name: string;
  planned_grams: number | string;
  display_grams: number | string;
  position: number;
}

interface ActualRow {
  run_id: string;
  actual_items: ActualIngredient[] | null;
  substitutions: SubstitutionRecord[] | null;
  actual_total_mix_g: number | string | null;
  actual_yield_g: number | string | null;
  waste_g: number | string | null;
  operator_notes: string | null;
  deviation_reason: string | null;
  recorded_by: string;
  recorded_at: string;
}

interface EventRow {
  id: string;
  run_id: string;
  event_type: string;
  detail: string | null;
  amendment: Record<string, string | number | boolean | null> | null;
  created_by: string;
  created_at: string;
}

/* ── numeric coercion (PostgREST may return `numeric` as a string) ───────────── */

const num = (v: number | string): number => (typeof v === 'string' ? Number(v) : v);
const numOrNull = (v: number | string | null): number | null => (v == null ? null : num(v));

/* ── pure row → domain mappers ───────────────────────────────────────────────── */

function mapPlanned(rows: PlannedRow[]): PlannedIngredient[] {
  return [...rows]
    .sort((a, b) => a.position - b.position)
    .map((r) => ({
      id: r.line_id,
      name: r.name,
      plannedGrams: num(r.planned_grams),
      displayGrams: num(r.display_grams),
    }));
}

function mapActual(row: ActualRow | null): ProductionActual | null {
  if (!row) return null;
  return {
    items: row.actual_items ?? [],
    actualTotalMixG: numOrNull(row.actual_total_mix_g),
    actualYieldG: numOrNull(row.actual_yield_g),
    wasteG: numOrNull(row.waste_g),
    substitutions: row.substitutions ?? [],
    operatorNotes: row.operator_notes,
    deviationReason: row.deviation_reason,
    recordedBy: row.recorded_by,
    recordedAt: row.recorded_at,
  };
}

function mapEvents(rows: EventRow[]): ProductionEvent[] {
  return [...rows]
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
    .map((r) => ({
      eventId: r.id,
      type: r.event_type as ProductionEventType,
      at: r.created_at,
      by: r.created_by,
      detail: r.detail,
      amendment: r.amendment,
    }));
}

function assembleRun(run: RunRow, planned: PlannedRow[], actual: ActualRow | null, events: EventRow[]): ProductionRun {
  return {
    runId: run.id,
    ownerUserId: run.owner_user_id,
    recipeId: run.recipe_id,
    recipeVersionId: run.recipe_version_id,
    recipeVersionNumber: run.recipe_version_number,
    status: run.status as ProductionStatus,
    plannedBatchG: num(run.planned_batch_g),
    plannedItems: mapPlanned(planned),
    productProfile: run.product_profile,
    temperatureC: numOrNull(run.temperature_c),
    engineVersion: run.engine_version,
    configVersion: run.config_version,
    mapperDatasetVersion: run.mapper_dataset_version,
    plannedDate: run.planned_date,
    machine: run.machine,
    location: run.location,
    batchReference: run.batch_reference,
    notes: run.notes,
    createdBy: run.created_by,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    actual: mapActual(actual),
    completedAt: run.completed_at,
    cancelledAt: run.cancelled_at,
    events: mapEvents(events),
  };
}

/** Adapter-level failure — a DB error the caller must surface (never a silent success). */
export class ProductionPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductionPersistenceError';
  }
}

/**
 * Build the Supabase-backed ProductionRepository. `client` is injected so a fake client can drive
 * the adapter in a node-env unit test.
 */
/**
 * Default backend factory for the selector: the Supabase repository when the client is configured,
 * else undefined (selector uses in-memory in DEV or reports unavailable — never a silent fallback).
 */
export function supabaseProductionBackendFactory(): (() => ProductionRepository) | undefined {
  const client = supabase;
  if (!client) return undefined;
  return () => supabaseProductionRepository(client);
}

export function supabaseProductionRepository(
  client: SupabaseClient,
  options: SupabaseProductionOptions = {},
): ProductionRepository {
  const now = options.now ?? (() => new Date().toISOString());
  const newId = options.newId ?? (() => globalThis.crypto.randomUUID());

  /** The signed-in auth user id — the RLS owner scope. Throws honestly when not signed in. */
  async function uid(): Promise<string> {
    const { data, error } = await client.auth.getUser();
    if (error) throw new ProductionPersistenceError(error.message);
    const id = data?.user?.id;
    if (!id) throw new ProductionPersistenceError('You must be signed in to use Production Mode.');
    return id;
  }

  /** Load + assemble a single owner-scoped run (null when absent / not owned). */
  async function loadRun(owner: string, runId: string): Promise<ProductionRun | null> {
    const runRes = await client
      .from(RUNS)
      .select('*')
      .eq('owner_user_id', owner)
      .eq('id', runId)
      .maybeSingle();
    if (runRes.error) throw new ProductionPersistenceError(runRes.error.message);
    const run = runRes.data as RunRow | null;
    if (!run) return null;

    const [plannedRes, actualRes, eventRes] = await Promise.all([
      client.from(PLANNED).select('*').eq('owner_user_id', owner).eq('run_id', runId),
      client.from(ACTUALS).select('*').eq('owner_user_id', owner).eq('run_id', runId).maybeSingle(),
      client.from(EVENTS).select('*').eq('owner_user_id', owner).eq('run_id', runId),
    ]);
    if (plannedRes.error) throw new ProductionPersistenceError(plannedRes.error.message);
    if (actualRes.error) throw new ProductionPersistenceError(actualRes.error.message);
    if (eventRes.error) throw new ProductionPersistenceError(eventRes.error.message);

    return assembleRun(
      run,
      (plannedRes.data ?? []) as PlannedRow[],
      (actualRes.data ?? null) as ActualRow | null,
      (eventRes.data ?? []) as EventRow[],
    );
  }

  /** loadRun or throw the same "unknown run" error the in-memory `require` throws. */
  async function requireRun(owner: string, runId: string): Promise<ProductionRun> {
    const run = await loadRun(owner, runId);
    if (!run) throw new ProductionPersistenceError(`unknown production run ${runId}`);
    return run;
  }

  /** Append one lifecycle/amendment event (INSERT only — the history never rewrites). */
  async function insertEvent(owner: string, runId: string, ev: ProductionEvent): Promise<void> {
    const { error } = await client.from(EVENTS).insert({
      id: ev.eventId,
      run_id: runId,
      owner_user_id: owner,
      event_type: ev.type,
      detail: ev.detail,
      amendment: ev.amendment,
      created_by: owner,
      created_at: ev.at,
    });
    if (error) throw new ProductionPersistenceError(error.message);
  }

  return {
    /* pure preview — no IO */
    scale: async (version: RecipeVersion, target: ScaleTarget, opts?: ScaleOptions): Promise<ScaleResult> =>
      scaleRecipeVersion(version, target, opts),

    async createRun(args: CreateRunArgs): Promise<ProductionRun> {
      // Pro-only gate — refuse BEFORE any write (mirrors the in-memory adapter).
      if (!args.capabilities.canUseProductionMode) {
        throw new ProductionPersistenceError('This plan does not include Production Mode.');
      }
      const owner = await uid();
      const scaled = scaleRecipeVersion(args.version, args.target, args.scaleOptions);
      if (!scaled.ok) throw new ProductionPersistenceError(scaled.message);

      // Build the domain run (status draft) from the EXACT immutable version, then persist it.
      const run = buildProductionRun({
        ownerUserId: owner,
        scaled,
        meta: args.meta,
        by: owner,
        createdAt: now(),
        runId: newId(),
        eventId: newId(),
      });

      const runInsert = await client.from(RUNS).insert({
        id: run.runId,
        owner_user_id: owner,
        recipe_id: run.recipeId,
        recipe_version_id: run.recipeVersionId, // EXACT immutable version — never "latest"
        recipe_version_number: run.recipeVersionNumber,
        status: run.status,
        planned_batch_g: run.plannedBatchG,
        product_profile: run.productProfile,
        temperature_c: run.temperatureC,
        engine_version: run.engineVersion,
        config_version: run.configVersion,
        mapper_dataset_version: run.mapperDatasetVersion,
        planned_date: run.plannedDate,
        machine: run.machine,
        location: run.location,
        batch_reference: run.batchReference,
        notes: run.notes,
        created_by: owner,
        created_at: run.createdAt,
        updated_at: run.updatedAt,
      });
      if (runInsert.error) throw new ProductionPersistenceError(runInsert.error.message);

      // Freeze the planned snapshot — write-once; these rows are never updated/deleted later.
      if (run.plannedItems.length > 0) {
        const plannedInsert = await client.from(PLANNED).insert(
          run.plannedItems.map((p, i) => ({
            run_id: run.runId,
            owner_user_id: owner,
            line_id: p.id,
            name: p.name,
            planned_grams: p.plannedGrams,
            display_grams: p.displayGrams,
            position: i,
          })),
        );
        if (plannedInsert.error) throw new ProductionPersistenceError(plannedInsert.error.message);
      }

      await insertEvent(owner, run.runId, run.events[0]!);
      return requireRun(owner, run.runId);
    },

    async transition(runId: string, to: ProductionStatus, by: string): Promise<ProductionRun> {
      const owner = await uid();
      const current = await requireRun(owner, runId);
      const next = transitionRun(current, to, by, now(), newId()); // throws on illegal transition

      const { error } = await client
        .from(RUNS)
        .update({
          status: next.status,
          completed_at: next.completedAt,
          cancelled_at: next.cancelledAt,
          updated_at: next.updatedAt,
        })
        .eq('owner_user_id', owner)
        .eq('id', runId);
      if (error) throw new ProductionPersistenceError(error.message);

      await insertEvent(owner, runId, next.events[next.events.length - 1]!);
      return requireRun(owner, runId);
    },

    async updateMeta(runId: string, patch: Partial<ProductionMeta>): Promise<ProductionRun> {
      const owner = await uid();
      const current = await requireRun(owner, runId);
      const next = updateMetaPure(current, patch, now()); // throws once terminal

      const { error } = await client
        .from(RUNS)
        .update({
          planned_date: next.plannedDate,
          machine: next.machine,
          location: next.location,
          batch_reference: next.batchReference,
          notes: next.notes,
          updated_at: next.updatedAt,
        })
        .eq('owner_user_id', owner)
        .eq('id', runId);
      if (error) throw new ProductionPersistenceError(error.message);

      return requireRun(owner, runId);
    },

    async recordActual(runId: string, input: RecordActualArgs): Promise<ProductionRun> {
      const owner = await uid();
      const current = await requireRun(owner, runId);
      const at = now();
      const next = recordActualPure(current, { ...input, at, eventId: newId() }); // throws unless in_progress
      const actual = next.actual!;

      // Upsert the working actual — separate table, keyed by run_id; the plan rows are untouched.
      const upsert = await client.from(ACTUALS).upsert(
        {
          run_id: runId,
          owner_user_id: owner,
          actual_items: actual.items,
          substitutions: actual.substitutions,
          actual_total_mix_g: actual.actualTotalMixG,
          actual_yield_g: actual.actualYieldG,
          waste_g: actual.wasteG,
          operator_notes: actual.operatorNotes,
          deviation_reason: actual.deviationReason,
          recorded_by: owner,
          recorded_at: actual.recordedAt,
        },
        { onConflict: 'run_id' },
      );
      if (upsert.error) throw new ProductionPersistenceError(upsert.error.message);

      const touch = await client
        .from(RUNS)
        .update({ updated_at: next.updatedAt })
        .eq('owner_user_id', owner)
        .eq('id', runId);
      if (touch.error) throw new ProductionPersistenceError(touch.error.message);

      await insertEvent(owner, runId, next.events[next.events.length - 1]!);
      return requireRun(owner, runId);
    },

    async amend(runId: string, input: AmendArgs): Promise<ProductionRun> {
      const owner = await uid();
      const current = await requireRun(owner, runId);
      const next = amendRun(current, { ...input, at: now(), eventId: newId() }); // throws unless completed

      // Amendment is APPEND-ONLY — only a new event, plus an updated_at touch. Plan/actual frozen.
      await insertEvent(owner, runId, next.events[next.events.length - 1]!);
      const touch = await client
        .from(RUNS)
        .update({ updated_at: next.updatedAt })
        .eq('owner_user_id', owner)
        .eq('id', runId);
      if (touch.error) throw new ProductionPersistenceError(touch.error.message);

      return requireRun(owner, runId);
    },

    async getRun(runId: string, ownerUserId?: string): Promise<ProductionRun | null> {
      const owner = await uid();
      if (ownerUserId !== undefined && ownerUserId !== owner) return null;
      return loadRun(owner, runId);
    },

    async listRuns(ownerUserId: string, query: ProductionHistoryQuery = {}): Promise<ProductionHistoryPage> {
      const owner = await uid();
      // Owner isolation: only the signed-in user's own history is ever returned.
      if (ownerUserId !== owner) return { total: 0, offset: query.offset ?? 0, limit: query.limit ?? null, items: [] };

      let q = client.from(RUNS).select('*').eq('owner_user_id', owner);
      if (query.recipeId) q = q.eq('recipe_id', query.recipeId);
      if (query.recipeVersionId) q = q.eq('recipe_version_id', query.recipeVersionId);
      if (query.status) q = q.eq('status', query.status);
      if (query.from) q = q.gte('created_at', query.from);
      if (query.to) q = q.lte('created_at', query.to);
      const runsRes = await q;
      if (runsRes.error) throw new ProductionPersistenceError(runsRes.error.message);
      const runRows = (runsRes.data ?? []) as RunRow[];

      // Deterministic sort + pagination via the SAME pure policy as the in-memory adapter, so the
      // ordering / tie-break / date-range semantics are identical. Assemble only the page.
      const shells = runRows.map((r) => assembleRun(r, [], null, []));
      const page = queryProductionRuns(shells, owner, query);
      const pageIds = page.items.map((r) => r.runId);
      if (pageIds.length === 0) return page;

      const [plannedRes, actualRes, eventRes] = await Promise.all([
        client.from(PLANNED).select('*').eq('owner_user_id', owner).in('run_id', pageIds),
        client.from(ACTUALS).select('*').eq('owner_user_id', owner).in('run_id', pageIds),
        client.from(EVENTS).select('*').eq('owner_user_id', owner).in('run_id', pageIds),
      ]);
      if (plannedRes.error) throw new ProductionPersistenceError(plannedRes.error.message);
      if (actualRes.error) throw new ProductionPersistenceError(actualRes.error.message);
      if (eventRes.error) throw new ProductionPersistenceError(eventRes.error.message);

      const plannedByRun = groupBy((plannedRes.data ?? []) as PlannedRow[], (r) => r.run_id);
      const eventsByRun = groupBy((eventRes.data ?? []) as EventRow[], (r) => r.run_id);
      const actualByRun = new Map(((actualRes.data ?? []) as ActualRow[]).map((a) => [a.run_id, a]));
      const byId = new Map(runRows.map((r) => [r.id, r]));

      const items = page.items.map((shell) =>
        assembleRun(
          byId.get(shell.runId)!,
          plannedByRun.get(shell.runId) ?? [],
          actualByRun.get(shell.runId) ?? null,
          eventsByRun.get(shell.runId) ?? [],
        ),
      );
      return { ...page, items };
    },

    async getDeviation(runId: string, ownerUserId?: string): Promise<ProductionDeviation | null> {
      const run = await this.getRun(runId, ownerUserId);
      return run ? computeDeviation(run) : null;
    },

    async getEvents(runId: string, ownerUserId?: string): Promise<readonly ProductionEvent[]> {
      const run = await this.getRun(runId, ownerUserId);
      return run?.events ?? [];
    },
  };
}

function groupBy<T, K>(rows: T[], key: (r: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = out.get(k);
    if (list) list.push(r);
    else out.set(k, [r]);
  }
  return out;
}
