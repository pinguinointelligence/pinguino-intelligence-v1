/**
 * Supabase ProductionRepository adapter — driven by an in-memory FAKE Supabase client (node-env, no
 * jsdom, no live DB). The fake implements just enough of the PostgREST chained builder to exercise
 * the four production tables. It proves the port contract AND the schema-0028 invariants:
 *   • a run references an EXACT immutable recipe_version_id;
 *   • the planned snapshot is written once and never mutated;
 *   • actuals + events are append-only (events never rewritten; plan untouched);
 *   • owner isolation; and HONEST FAILURE (a DB error surfaces as a throw, never a false "saved").
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import { buildRecipeVersion } from '@/features/pro-core/recipeVersioning';
import type { RecipeVersion } from '@/features/pro-core/recipeContracts';
import type { RecipeCompositionMetadata } from '@/features/recipe-composition/recipeCompositionPersistence';
import { productionCapabilitiesFor } from '@/features/pro-core/proCoreCapabilities';
import {
  isProductionRescueAuthorizationRefreshError,
  supabaseProductionRepository,
} from './supabaseProduction';

/* ── a tiny fake PostgREST client (only what the adapter calls) ───────────────── */

type Row = Record<string, unknown>;
interface Filter {
  op: 'eq' | 'gte' | 'lte' | 'in';
  col: string;
  val: unknown;
}

class FakeStore {
  tables: Record<string, Row[]> = {
    production_runs: [],
    production_run_planned_items: [],
    production_run_actuals: [],
    production_run_events: [],
  };
  /** Table→op names that should return an error, to prove honest failure. */
  fail = new Set<string>();
  /** Count of UPDATE ops per table — proves append-only tables are never updated. */
  updates: Record<string, number> = {};
  rpcClock = 0;
  functionCalls: Array<{ name: string; body: Row }> = [];
  rpcCalls: Array<{ name: string; args: Row }> = [];
  rescueAuthorizations: Record<string, Row> = {};
  rescueAuthorizationResponsePatch: Row = {};
  rpcErrorMessages: Record<string, string> = {};
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

class FakeBuilder implements PromiseLike<{
  data: unknown;
  error: { message: string } | null;
  count?: number;
}> {
  private op: 'select' | 'insert' | 'upsert' | 'update' = 'select';
  private payload: unknown = null;
  private onConflict: string | null = null;
  private filters: Filter[] = [];
  private single = false;

  constructor(
    private store: FakeStore,
    private table: string,
  ) {}

  select(cols?: string): this {
    void cols;
    this.op = 'select';
    return this;
  }
  insert(payload: Row | Row[]): this {
    this.op = 'insert';
    this.payload = payload;
    return this;
  }
  upsert(payload: Row, opts?: { onConflict?: string }): this {
    this.op = 'upsert';
    this.payload = payload;
    this.onConflict = opts?.onConflict ?? null;
    return this;
  }
  update(patch: Row): this {
    this.op = 'update';
    this.payload = patch;
    return this;
  }
  eq(col: string, val: unknown): this {
    this.filters.push({ op: 'eq', col, val });
    return this;
  }
  gte(col: string, val: unknown): this {
    this.filters.push({ op: 'gte', col, val });
    return this;
  }
  lte(col: string, val: unknown): this {
    this.filters.push({ op: 'lte', col, val });
    return this;
  }
  in(col: string, val: unknown[]): this {
    this.filters.push({ op: 'in', col, val });
    return this;
  }
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }> {
    this.single = true;
    return this.resolve();
  }
  then<TR = unknown, TE = never>(
    onFulfilled?:
      | ((v: {
          data: unknown;
          error: { message: string } | null;
          count?: number;
        }) => TR | PromiseLike<TR>)
      | null,
    onRejected?: ((r: unknown) => TE | PromiseLike<TE>) | null,
  ): Promise<TR | TE> {
    return this.resolve().then(onFulfilled, onRejected);
  }

  private matches(row: Row): boolean {
    return this.filters.every((f) => {
      const v = row[f.col];
      if (f.op === 'eq') return v === f.val;
      if (f.op === 'gte') return (v as string) >= (f.val as string);
      if (f.op === 'lte') return (v as string) <= (f.val as string);
      if (f.op === 'in') return (f.val as unknown[]).includes(v);
      return false;
    });
  }

  private async resolve(): Promise<{
    data: unknown;
    error: { message: string } | null;
    count?: number;
  }> {
    const rows = this.store.tables[this.table]!;
    if (this.store.fail.has(`${this.table}:${this.op}`)) {
      return { data: null, error: { message: `boom ${this.table}` } };
    }
    if (this.op === 'insert') {
      const toAdd = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      rows.push(...toAdd.map(clone));
      return { data: null, error: null };
    }
    if (this.op === 'upsert') {
      const p = clone(this.payload as Row);
      const key = this.onConflict!;
      const idx = rows.findIndex((r) => r[key] === p[key]);
      if (idx >= 0) rows[idx] = p;
      else rows.push(p);
      return { data: null, error: null };
    }
    if (this.op === 'update') {
      this.store.updates[this.table] = (this.store.updates[this.table] ?? 0) + 1;
      for (const r of rows) if (this.matches(r)) Object.assign(r, clone(this.payload as Row));
      return { data: null, error: null };
    }
    // select
    const matched = rows.filter((r) => this.matches(r)).map(clone);
    if (this.single) return { data: matched[0] ?? null, error: null };
    return { data: matched, error: null, count: matched.length };
  }
}

function fakeClient(store: FakeStore, userId: string | null) {
  return {
    auth: {
      getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: null }),
    },
    from: (table: string) => new FakeBuilder(store, table),
    functions: {
      invoke: async (name: string, options: { body: Row }) => {
        if (!userId) return { data: null, error: { message: 'authentication required' } };
        store.functionCalls.push({ name, body: clone(options.body) });
        if (store.fail.has(`function:${name}`)) {
          return { data: null, error: { message: `boom ${name}` } };
        }
        const authorizationId = `authorization-${store.functionCalls.length}`;
        store.rescueAuthorizations[authorizationId] = clone(options.body);
        return {
          data: {
            authorizationId,
            candidateFingerprint: `fingerprint-${store.functionCalls.length}`,
            runId: options.body.runId,
            stableOptionId: options.body.stableOptionId,
            expectedActualRevision: options.body.expectedActualRevision,
            expectedRescueRevision: options.body.expectedRescueRevision,
            authorizedAt: '2026-08-19T10:00:00.000Z',
            expiresAt: '2026-08-19T10:05:00.000Z',
            preview: {
              title: 'Powiększ partię',
              explanation: 'Autoryzowana korekta partii.',
              finalMassG: 1010,
              scoreDisplay: '94%',
              instructions: [
                {
                  lineId: null,
                  ingredientName: 'Rescue',
                  kind: 'add',
                  grams: 10,
                  finalTargetGrams: 10,
                },
              ],
            },
            ...store.rescueAuthorizationResponsePatch,
          },
          error: null,
        };
      },
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (!userId) return { data: null, error: { message: 'authentication required' } };
      store.rpcCalls.push({ name, args: clone(args) });
      const rpcFailure = store.fail.has(`rpc:${name}`);
      if (rpcFailure) return { data: null, error: { message: `boom ${name}` } };
      if (store.rpcErrorMessages[name]) {
        return { data: null, error: { message: store.rpcErrorMessages[name] } };
      }

      const next = clone(store.tables);
      const at = new Date(Date.UTC(2026, 6, 12, 12, 0, store.rpcClock++)).toISOString();
      const fail = (table: string, op: string) => store.fail.has(`${table}:${op}`);
      const error = (table: string) => ({ data: null, error: { message: `boom ${table}` } });

      if (name === 'production_start_run_v1') {
        const existing = next.production_runs!.find(
          (row) =>
            row.owner_user_id === userId &&
            row.recipe_version_id === args.p_recipe_version_id &&
            row.planned_batch_g === args.p_planned_batch_g &&
            row.status === 'in_progress',
        );
        if (existing) return { data: existing.id, error: null };
        if (fail('production_runs', 'insert')) return error('production_runs');
        if (fail('production_run_planned_items', 'insert'))
          return error('production_run_planned_items');
        if (fail('production_run_events', 'insert')) return error('production_run_events');
        const meta = (args.p_meta ?? {}) as Row;
        const items = args.p_planned_items as Row[];
        const versionId = args.p_recipe_version_id as string;
        const runId = args.p_run_id as string;
        next.production_runs!.push({
          id: runId,
          owner_user_id: userId,
          recipe_id: 'r-1',
          recipe_version_id: versionId,
          recipe_version_number: versionId === 'ver-2' ? 2 : 1,
          status: 'in_progress',
          planned_batch_g: args.p_planned_batch_g as number,
          product_profile: null,
          temperature_c: -11,
          engine_version: 'e1',
          config_version: 'c1',
          mapper_dataset_version: null,
          planned_date: meta.planned_date ?? null,
          machine: meta.machine ?? null,
          location: meta.location ?? null,
          batch_reference: meta.batch_reference ?? null,
          notes: meta.notes ?? null,
          created_by: userId,
          created_at: at,
          updated_at: at,
          completed_at: null,
          cancelled_at: null,
          rescue_recipe_input: null,
          rescue_product_composition: null,
          rescue_accepted_by: null,
          rescue_accepted_at: null,
          rescue_revision: 0,
          actual_revision: 0,
        });
        next.production_run_planned_items!.push(
          ...items.map((item) => ({
            run_id: runId,
            owner_user_id: userId,
            line_id: item.line_id,
            name: item.name,
            planned_grams: item.planned_grams,
            display_grams: item.display_grams,
            position: item.position,
            process_scope: item.process_scope,
            canonical_ingredient_id: item.canonical_ingredient_id,
            scope_position: item.scope_position,
          })),
        );
        for (const [id, eventType] of [
          [args.p_created_event_id, 'created'],
          [args.p_planned_event_id, 'planned'],
          [args.p_started_event_id, 'started'],
        ])
          next.production_run_events!.push({
            id,
            run_id: runId,
            owner_user_id: userId,
            event_type: eventType,
            detail: null,
            amendment: null,
            created_by: userId,
            created_at: at,
          });
      } else if (name === 'production_create_run_v1') {
        if (fail('production_runs', 'insert')) return error('production_runs');
        if (fail('production_run_planned_items', 'insert'))
          return error('production_run_planned_items');
        if (fail('production_run_events', 'insert')) return error('production_run_events');
        const meta = (args.p_meta ?? {}) as Row;
        const items = args.p_planned_items as Row[];
        const versionId = args.p_recipe_version_id as string;
        const runId = args.p_run_id as string;
        const versionNumber = versionId === 'ver-2' ? 2 : 1;
        next.production_runs!.push({
          id: runId,
          owner_user_id: userId,
          recipe_id: 'r-1',
          recipe_version_id: versionId,
          recipe_version_number: versionNumber,
          status: 'draft',
          planned_batch_g: args.p_planned_batch_g as number,
          product_profile: null,
          temperature_c: -11,
          engine_version: 'e1',
          config_version: 'c1',
          mapper_dataset_version: null,
          planned_date: meta.planned_date ?? null,
          machine: meta.machine ?? null,
          location: meta.location ?? null,
          batch_reference: meta.batch_reference ?? null,
          notes: meta.notes ?? null,
          created_by: userId,
          created_at: at,
          updated_at: at,
          completed_at: null,
          cancelled_at: null,
          rescue_recipe_input: null,
          rescue_product_composition: null,
          rescue_accepted_by: null,
          rescue_accepted_at: null,
          rescue_revision: 0,
          actual_revision: 0,
        });
        next.production_run_planned_items!.push(
          ...items.map((item) => ({
            run_id: runId,
            owner_user_id: userId,
            line_id: item.line_id,
            name: item.name,
            planned_grams: item.planned_grams,
            display_grams: item.display_grams,
            position: item.position,
            process_scope: item.process_scope,
            canonical_ingredient_id: item.canonical_ingredient_id,
            scope_position: item.scope_position,
          })),
        );
        next.production_run_events!.push({
          id: args.p_event_id,
          run_id: runId,
          owner_user_id: userId,
          event_type: 'created',
          detail: null,
          amendment: null,
          created_by: userId,
          created_at: at,
        });
      } else if (name === 'production_transition_run_v1') {
        if (fail('production_runs', 'update')) return error('production_runs');
        if (fail('production_run_events', 'insert')) return error('production_run_events');
        const run = next.production_runs!.find(
          (row) => row.id === args.p_run_id && row.owner_user_id === userId,
        );
        if (!run) return { data: null, error: { message: 'owned production run required' } };
        const to = args.p_to_status as string;
        if (to === 'completed') {
          const actual = next.production_run_actuals!.find((row) => row.run_id === args.p_run_id);
          const expected = next.production_run_planned_items!.filter(
            (row) => row.run_id === args.p_run_id,
          ).length;
          const items = (actual?.actual_items ?? []) as Row[];
          if (
            items.length !== expected ||
            items.some(
              (item) =>
                item.actualGrams === null ||
                !item.confirmedAt ||
                !Number.isInteger(item.confirmationOrder) ||
                Number(item.confirmationOrder) <= 0,
            ) ||
            actual?.actual_total_mix_g === null ||
            actual?.actual_total_mix_g === undefined
          )
            return {
              data: null,
              error: { message: 'complete actual vector and coherent Base total required' },
            };
        }
        run.status = to;
        run.updated_at = at;
        run.completed_at = to === 'completed' ? at : null;
        run.cancelled_at = to === 'cancelled' ? at : null;
        store.updates.production_runs = (store.updates.production_runs ?? 0) + 1;
        next.production_run_events!.push({
          id: args.p_event_id,
          run_id: args.p_run_id,
          owner_user_id: userId,
          event_type: to === 'in_progress' ? 'started' : to,
          detail: null,
          amendment: null,
          created_by: userId,
          created_at: at,
        });
      } else if (name === 'production_update_meta_v1') {
        if (fail('production_runs', 'update')) return error('production_runs');
        const run = next.production_runs!.find(
          (row) => row.id === args.p_run_id && row.owner_user_id === userId,
        );
        if (!run) return { data: null, error: { message: 'owned production run required' } };
        Object.assign(run, {
          planned_date: args.p_planned_date,
          machine: args.p_machine,
          location: args.p_location,
          batch_reference: args.p_batch_reference,
          notes: args.p_notes,
          updated_at: at,
        });
        store.updates.production_runs = (store.updates.production_runs ?? 0) + 1;
      } else if (name === 'production_record_actual_v1') {
        if (fail('production_run_actuals', 'upsert')) return error('production_run_actuals');
        if (fail('production_runs', 'update')) return error('production_runs');
        if (fail('production_run_events', 'insert')) return error('production_run_events');
        const run = next.production_runs!.find(
          (row) => row.id === args.p_run_id && row.owner_user_id === userId,
        );
        if (!run || run.status !== 'in_progress') {
          return { data: null, error: { message: 'owned in-progress production run required' } };
        }
        if (
          args.p_expected_actual_revision == null ||
          args.p_expected_rescue_revision == null ||
          Number(run.actual_revision ?? 0) !== Number(args.p_expected_actual_revision) ||
          Number(run.rescue_revision ?? 0) !== Number(args.p_expected_rescue_revision)
        ) {
          return { data: null, error: { message: 'production actual revision conflict' } };
        }
        const planned = next.production_run_planned_items!;
        const rescueInput = run.rescue_recipe_input as RecipeInput | null;
        const expectedIds = new Set([
          ...planned.filter((line) => line.run_id === args.p_run_id).map((line) => line.line_id),
          ...(rescueInput?.items.map((item) => item.id) ?? []),
        ]);
        if ((args.p_actual_items as Row[]).length !== expectedIds.size) {
          return {
            data: null,
            error: {
              message: 'actual vector must contain every frozen and rescue line exactly once',
            },
          };
        }
        const actualItems = (args.p_actual_items as Row[]).map((item) => ({
          id: item.id,
          name:
            planned.find((line) => line.run_id === args.p_run_id && line.line_id === item.id)
              ?.name ?? rescueInput?.items.find((line) => line.id === item.id)?.ingredient.name,
          actualGrams: item.actualGrams,
          confirmedAt: item.confirmedAt,
          confirmationOrder: item.confirmationOrder,
        }));
        const confirmedOrders = actualItems
          .filter((item) => item.actualGrams !== null && item.confirmationOrder != null)
          .map((item) => item.confirmationOrder);
        if (new Set(confirmedOrders).size !== confirmedOrders.length) {
          return {
            data: null,
            error: { message: 'confirmed actual lines require unique operator chronology' },
          };
        }
        const actual = {
          run_id: args.p_run_id,
          owner_user_id: userId,
          actual_items: actualItems,
          substitutions: args.p_substitutions,
          actual_total_mix_g: args.p_actual_total_mix_g,
          actual_yield_g: args.p_actual_yield_g,
          waste_g: args.p_waste_g,
          operator_notes: args.p_operator_notes,
          deviation_reason: args.p_deviation_reason,
          recorded_by: userId,
          recorded_at: at,
        };
        const index = next.production_run_actuals!.findIndex((row) => row.run_id === args.p_run_id);
        if (index >= 0) next.production_run_actuals![index] = actual;
        else next.production_run_actuals!.push(actual);
        run.updated_at = at;
        run.actual_revision = Number(run.actual_revision ?? 0) + 1;
        store.updates.production_runs = (store.updates.production_runs ?? 0) + 1;
        next.production_run_events!.push({
          id: args.p_event_id,
          run_id: args.p_run_id,
          owner_user_id: userId,
          event_type: 'actual_recorded',
          detail: null,
          amendment: {
            actualItems,
            actualTotalMixG: args.p_actual_total_mix_g,
            recordedAt: at,
            revision: run.actual_revision,
          },
          created_by: userId,
          created_at: at,
        });
      } else if (name === 'production_consume_rescue_authorization_v1') {
        const authorization = store.rescueAuthorizations[String(args.p_authorization_id)];
        const runId = authorization?.runId as string | undefined;
        const run = next.production_runs!.find(
          (row) => row.id === runId && row.owner_user_id === userId,
        );
        if (!run || run.status !== 'in_progress') {
          return { data: null, error: { message: 'owned in-progress production run required' } };
        }
        if (
          Number(run.rescue_revision ?? 0) !== Number(args.p_expected_rescue_revision) ||
          Number(run.actual_revision ?? 0) !== Number(args.p_expected_actual_revision)
        ) {
          return { data: null, error: { message: 'authorization_basis_mismatch' } };
        }
        const plannedItems = next.production_run_planned_items!
          .filter((row) => row.run_id === runId)
          .map((row) => ({
            id: row.line_id,
            ingredient: { name: row.name },
            planned_grams: row.planned_grams,
            actual_grams: null,
          }));
        run.rescue_recipe_input = input(
          Number(run.planned_batch_g),
          plannedItems.map((line) => item(String(line.id), String(line.ingredient.name), Number(line.planned_grams))),
        );
        run.rescue_product_composition = {
          schemaVersion: 1,
          baseScope: 'BASE_FORMULATION',
          baseOrder: plannedItems.map((item) => item.id),
          toppings: [],
          migrationAmbiguities: [],
        };
        run.rescue_accepted_by = userId;
        run.rescue_accepted_at = at;
        run.rescue_revision = Number(run.rescue_revision ?? 0) + 1;
        run.updated_at = at;
        next.production_run_events!.push({
          id: `rescue-event-${store.rpcClock}`,
          run_id: runId,
          owner_user_id: userId,
          event_type: 'rescue_applied',
          detail: 'Trusted authorization consumed',
          amendment: { authorizationId: args.p_authorization_id },
          created_by: userId,
          created_at: at,
        });
        store.tables = next;
        return { data: runId, error: null };
      } else if (name === 'production_apply_rescue_v1') {
        if (fail('production_runs', 'update')) return error('production_runs');
        if (fail('production_run_events', 'insert')) return error('production_run_events');
        const run = next.production_runs!.find(
          (row) => row.id === args.p_run_id && row.owner_user_id === userId,
        );
        if (!run || run.status !== 'in_progress') {
          return { data: null, error: { message: 'owned in-progress production run required' } };
        }
        if (
          args.p_expected_rescue_revision == null ||
          args.p_expected_actual_revision == null ||
          Number(run.rescue_revision ?? 0) !== Number(args.p_expected_rescue_revision) ||
          Number(run.actual_revision ?? 0) !== Number(args.p_expected_actual_revision)
        ) {
          return { data: null, error: { message: 'production rescue revision conflict' } };
        }
        run.rescue_recipe_input = args.p_recipe_input;
        run.rescue_product_composition = args.p_product_composition;
        run.rescue_accepted_by = userId;
        run.rescue_accepted_at = at;
        run.rescue_revision = Number(run.rescue_revision ?? 0) + 1;
        run.updated_at = at;
        next.production_run_events!.push({
          id: args.p_event_id,
          run_id: args.p_run_id,
          owner_user_id: userId,
          event_type: 'rescue_applied',
          detail: 'Server-validated BATCH_RESCUE candidate accepted',
          amendment: {
            recipeInput: args.p_recipe_input,
            productComposition: args.p_product_composition,
            acceptedAt: at,
            revision: run.rescue_revision,
          },
          created_by: userId,
          created_at: at,
        });
      } else if (name === 'production_complete_run_v1') {
        if (fail('production_run_actuals', 'upsert')) return error('production_run_actuals');
        if (fail('production_runs', 'update')) return error('production_runs');
        if (fail('production_run_events', 'insert')) return error('production_run_events');
        const run = next.production_runs!.find(
          (row) => row.id === args.p_run_id && row.owner_user_id === userId,
        );
        if (!run || run.status !== 'in_progress') {
          return { data: null, error: { message: 'owned in-progress production run required' } };
        }
        if (
          args.p_expected_actual_revision == null ||
          args.p_expected_rescue_revision == null ||
          Number(run.actual_revision ?? 0) !== Number(args.p_expected_actual_revision) ||
          Number(run.rescue_revision ?? 0) !== Number(args.p_expected_rescue_revision)
        ) {
          return { data: null, error: { message: 'production actual revision conflict' } };
        }
        const planned = next.production_run_planned_items!.filter(
          (line) => line.run_id === args.p_run_id,
        );
        const rescueInput = run.rescue_recipe_input as RecipeInput | null;
        const expectedIds = new Set([
          ...planned.map((line) => line.line_id),
          ...(rescueInput?.items.map((item) => item.id) ?? []),
        ]);
        const requested = args.p_actual_items as Row[];
        if (
          requested.length !== expectedIds.size ||
          new Set(requested.map((item) => item.confirmationOrder)).size !== requested.length ||
          requested.some(
            (item) =>
              item.actualGrams === null ||
              !expectedIds.has(item.id) ||
              !item.confirmedAt ||
              !Number.isInteger(item.confirmationOrder) ||
              Number(item.confirmationOrder) <= 0,
          ) ||
          args.p_actual_total_mix_g === null
        )
          return {
            data: null,
            error: { message: 'complete actual vector and coherent Base total required' },
          };
        const actual = {
          run_id: args.p_run_id,
          owner_user_id: userId,
          actual_items: requested.map((item) => ({
            id: item.id,
            name:
              planned.find((line) => line.line_id === item.id)?.name ??
              rescueInput?.items.find((line) => line.id === item.id)?.ingredient.name,
            actualGrams: item.actualGrams,
            confirmedAt: item.confirmedAt,
            confirmationOrder: item.confirmationOrder,
          })),
          substitutions: args.p_substitutions,
          actual_total_mix_g: args.p_actual_total_mix_g,
          actual_yield_g: args.p_actual_yield_g,
          waste_g: args.p_waste_g,
          operator_notes: args.p_operator_notes,
          deviation_reason: args.p_deviation_reason,
          recorded_by: userId,
          recorded_at: at,
        };
        const actualIndex = next.production_run_actuals!.findIndex(
          (row) => row.run_id === args.p_run_id,
        );
        if (actualIndex >= 0) next.production_run_actuals![actualIndex] = actual;
        else next.production_run_actuals!.push(actual);
        run.status = 'completed';
        run.completed_at = at;
        run.updated_at = at;
        run.actual_revision = Number(run.actual_revision ?? 0) + 1;
        next.production_run_events!.push(
          {
            id: args.p_actual_event_id,
            run_id: args.p_run_id,
            owner_user_id: userId,
            event_type: 'actual_recorded',
            detail: null,
            amendment: {
              actualItems: actual.actual_items,
              actualTotalMixG: args.p_actual_total_mix_g,
              recordedAt: at,
              revision: run.actual_revision,
            },
            created_by: userId,
            created_at: at,
          },
          {
            id: args.p_completed_event_id,
            run_id: args.p_run_id,
            owner_user_id: userId,
            event_type: 'completed',
            detail: null,
            amendment: null,
            created_by: userId,
            created_at: at,
          },
        );
      } else if (name === 'production_append_amendment_v1') {
        if (fail('production_run_events', 'insert')) return error('production_run_events');
        const run = next.production_runs!.find(
          (row) => row.id === args.p_run_id && row.owner_user_id === userId,
        );
        if (!run || run.status !== 'completed') {
          return { data: null, error: { message: 'owned completed production run required' } };
        }
        next.production_run_events!.push({
          id: args.p_event_id,
          run_id: args.p_run_id,
          owner_user_id: userId,
          event_type: 'amended',
          detail: args.p_detail,
          amendment: args.p_amendment,
          created_by: userId,
          created_at: at,
        });
      } else {
        return { data: null, error: { message: `unknown rpc ${name}` } };
      }

      store.tables = next;
      return { data: args.p_run_id ?? null, error: null };
    },
  } as unknown as Parameters<typeof supabaseProductionRepository>[0];
}

/* ── fixtures ─────────────────────────────────────────────────────────────────── */

const TRACE = { engineVersion: 'e1', configVersion: 'c1' };
const U1 = '11111111-1111-1111-1111-111111111111';
const U2 = '22222222-2222-2222-2222-222222222222';
const PRO = productionCapabilitiesFor('pro');
const HOME = productionCapabilitiesFor('home');
const DEMO = productionCapabilitiesFor('demo');

const item = (id: string, name: string, grams: number) => ({
  id,
  ingredient: { name },
  planned_grams: grams,
});
const input = (batch: number, items: ReturnType<typeof item>[]): RecipeInput =>
  ({
    items,
    mode: 'classic',
    category: 'milk_gelato',
    target_temperature_c: -11,
    target_batch_grams: batch,
    machine_capacity_grams: null,
  }) as unknown as RecipeInput;
const makeVersion = (versionId: string, versionNumber = 1, batch = 1000): RecipeVersion =>
  buildRecipeVersion(
    {
      recipeId: 'r-1',
      ownerUserId: U1,
      versionNumber,
      recipeInput: input(batch, [item('milk', 'Milk', 600), item('sugar', 'Sugar', 400)]),
      trace: TRACE,
      source: 'manual',
      createdBy: U1,
      createdAt: '2026-07-12T10:00:00.000Z',
    },
    versionId,
  );
const makeVersionWithToppings = (): RecipeVersion => {
  const productComposition: RecipeCompositionMetadata = {
    schemaVersion: 1,
    baseScope: 'BASE_FORMULATION',
    baseOrder: ['sugar', 'milk'],
    toppings: [
      {
        id: 'top-milk',
        ingredient: {
          id: 'PI-ING-MILK',
          canonical_ingredient_id: 'PI-ING-MILK',
          name: 'Milk topping',
        } as unknown as RecipeCompositionMetadata['toppings'][number]['ingredient'],
        planned_grams: 70,
        actual_grams: null,
        process_scope: 'POST_PROCESS_ADDON',
        addon_sort_order: 0,
      },
      {
        id: 'top-sauce',
        ingredient: {
          id: 'PI-ING-SAUCE',
          canonical_ingredient_id: 'PI-ING-SAUCE',
          name: 'Strawberry sauce',
        } as unknown as RecipeCompositionMetadata['toppings'][number]['ingredient'],
        planned_grams: 60,
        actual_grams: null,
        process_scope: 'POST_PROCESS_ADDON',
        addon_sort_order: 1,
      },
    ],
    migrationAmbiguities: [],
  };
  return buildRecipeVersion(
    {
      recipeId: 'r-1',
      ownerUserId: U1,
      versionNumber: 1,
      recipeInput: input(1000, [item('milk', 'Milk', 600), item('sugar', 'Sugar', 400)]),
      productComposition,
      trace: TRACE,
      source: 'manual',
      createdBy: U1,
      createdAt: '2026-07-12T10:00:00.000Z',
    },
    'ver-topping',
  );
};

/** A deterministic clock (increments per call) + id generator for stable event ordering. */
function seams(prefix = 'gen') {
  let t = 0;
  let k = 0;
  return {
    now: () => new Date(Date.UTC(2026, 6, 12, 12, 0, t++)).toISOString(),
    newId: () => `${prefix}-${(k += 1)}`,
  };
}

function repoFor(store: FakeStore, userId: string | null = U1, prefix = 'gen') {
  return supabaseProductionRepository(fakeClient(store, userId), seams(prefix));
}

describe('supabaseProduction — createRun persists the frozen plan from an EXACT version', () => {
  let store: FakeStore;
  beforeEach(() => {
    store = new FakeStore();
  });

  it('binds the run to the exact recipe_version_id and freezes the scaled snapshot', async () => {
    const repo = repoFor(store);
    makeVersion('ver-2', 2); // a newer version exists, but we plan from v1
    const run = await repo.createRun({
      ownerUserId: U1,
      version: makeVersion('ver-1', 1),
      target: { kind: 'weight_g', grams: 5000 },
      capabilities: PRO,
      by: U1,
    });

    expect(run.recipeVersionId).toBe('ver-1');
    expect(run.recipeVersionNumber).toBe(1);
    expect(run.status).toBe('draft');
    expect(run.plannedBatchG).toBe(5000);
    expect(run.plannedItems.map((p) => p.plannedGrams)).toEqual([3000, 2000]);
    expect(run.plannedItems.reduce((s, p) => s + p.displayGrams, 0)).toBe(5000);
    expect(run.events.map((e) => e.type)).toEqual(['created']);
    expect(run.ownerUserId).toBe(U1);

    // persisted across the four tables
    expect(store.tables.production_runs).toHaveLength(1);
    expect(store.tables.production_run_planned_items).toHaveLength(2);
    expect(store.tables.production_run_events).toHaveLength(1);
    expect(store.tables.production_runs![0]!.recipe_version_id).toBe('ver-1');
  });

  it('freezes independently ordered Base and topping rows without changing the Base batch meaning', async () => {
    const repo = repoFor(store);
    const run = await repo.createRun({
      ownerUserId: U1,
      version: makeVersionWithToppings(),
      target: { kind: 'weight_g', grams: 2000 },
      capabilities: PRO,
      by: U1,
    });
    expect(run.plannedBatchG).toBe(2000);
    expect(
      run.plannedItems.map((line) => [line.id, line.processScope, line.scopePosition]),
    ).toEqual([
      ['sugar', 'BASE_FORMULATION', 0],
      ['milk', 'BASE_FORMULATION', 1],
      ['top-milk', 'POST_PROCESS_ADDON', 0],
      ['top-sauce', 'POST_PROCESS_ADDON', 1],
    ]);
    expect(
      run.plannedItems
        .filter((line) => line.processScope === 'POST_PROCESS_ADDON')
        .map((line) => line.plannedGrams),
    ).toEqual([140, 120]);
    const persisted = store.tables.production_run_planned_items as Array<Record<string, unknown>>;
    expect(persisted[2]).toMatchObject({
      process_scope: 'POST_PROCESS_ADDON',
      canonical_ingredient_id: 'PI-ING-MILK',
      scope_position: 0,
    });
  });

  it('refuses Production Mode for Demo and Home, and writes nothing', async () => {
    const repo = repoFor(store);
    const args = (caps: typeof PRO) => ({
      ownerUserId: U1,
      version: makeVersion('ver-1'),
      target: { kind: 'weight_g' as const, grams: 1000 },
      capabilities: caps,
      by: U1,
    });
    await expect(repo.createRun(args(DEMO))).rejects.toThrow(/does not include Production Mode/i);
    await expect(repo.createRun(args(HOME))).rejects.toThrow(/does not include Production Mode/i);
    expect(store.tables.production_runs).toHaveLength(0);
  });

  it('refuses a volume run without a density (honest needs_more_information)', async () => {
    const repo = repoFor(store);
    await expect(
      repo.createRun({
        ownerUserId: U1,
        version: makeVersion('ver-1'),
        target: { kind: 'volume_ml', ml: 5000 },
        capabilities: PRO,
        by: U1,
      }),
    ).rejects.toThrow(/density/i);
    expect(store.tables.production_runs).toHaveLength(0);
  });

  it('throws (never a false save) when not signed in', async () => {
    const repo = repoFor(store, null);
    await expect(
      repo.createRun({
        ownerUserId: U1,
        version: makeVersion('ver-1'),
        target: { kind: 'weight_g', grams: 1000 },
        capabilities: PRO,
        by: U1,
      }),
    ).rejects.toThrow(/signed in/i);
    expect(store.tables.production_runs).toHaveLength(0);
  });
});

describe('supabaseProduction — lifecycle appends events; the plan stays immutable', () => {
  let store: FakeStore;
  beforeEach(() => {
    store = new FakeStore();
  });

  const start = async () => {
    const repo = repoFor(store);
    const run = await repo.createRun({
      ownerUserId: U1,
      version: makeVersion('ver-1'),
      target: { kind: 'weight_g', grams: 5000 },
      capabilities: PRO,
      by: U1,
    });
    return { repo, run };
  };

  it('walks draft → planned → in_progress → completed, appending one event each', async () => {
    const { repo, run } = await start();
    const plannedSnapshot = clone(store.tables.production_run_planned_items);

    expect((await repo.transition(run.runId, 'planned', U1)).status).toBe('planned');
    expect((await repo.transition(run.runId, 'in_progress', U1)).status).toBe('in_progress');
    await repo.recordActual(run.runId, {
      by: U1,
      expectedActualRevision: 0,
      expectedRescueRevision: 0,
      items: [
        {
          id: 'milk',
          name: 'Milk',
          actualGrams: 3000,
          confirmedAt: '2026-01-01T10:00:00.000Z',
          confirmationOrder: 1,
        },
        {
          id: 'sugar',
          name: 'Sugar',
          actualGrams: 2000,
          confirmedAt: '2026-01-01T10:01:00.000Z',
          confirmationOrder: 2,
        },
      ],
      actualTotalMixG: 5000,
    });
    const done = await repo.transition(run.runId, 'completed', U1);
    expect(done.status).toBe('completed');
    expect(done.completedAt).not.toBeNull();
    expect(done.events.map((e) => e.type)).toEqual([
      'created',
      'planned',
      'started',
      'actual_recorded',
      'completed',
    ]);

    // IMMUTABLE frozen plan: the planned_items rows were never updated/deleted/re-inserted.
    expect(store.tables.production_run_planned_items).toEqual(plannedSnapshot);
    expect(store.updates.production_run_planned_items ?? 0).toBe(0);
    expect(store.updates.production_run_events ?? 0).toBe(0); // events append-only
    expect(store.tables.production_run_events).toHaveLength(5);
  });

  it('rejects an illegal transition deterministically and writes no event', async () => {
    const { repo, run } = await start();
    await expect(repo.transition(run.runId, 'completed', U1)).rejects.toThrow(
      /Illegal production transition/i,
    );
    expect(store.tables.production_run_events).toHaveLength(1); // only 'created'
  });
});

describe('supabaseProduction — atomic served start, Rescue, and completion', () => {
  let store: FakeStore;
  beforeEach(() => {
    store = new FakeStore();
  });

  it('starts directly in_progress with one atomic plan and three lifecycle events', async () => {
    const repo = repoFor(store);
    const run = await repo.startRun({
      ownerUserId: U1,
      version: makeVersion('ver-1'),
      target: { kind: 'weight_g', grams: 1000 },
      capabilities: PRO,
      by: U1,
    });
    expect(run.status).toBe('in_progress');
    expect(run.events.map((event) => event.type)).toEqual(['created', 'planned', 'started']);

    const failedStore = new FakeStore();
    failedStore.fail.add('production_run_events:insert');
    await expect(
      repoFor(failedStore).startRun({
        ownerUserId: U1,
        version: makeVersion('ver-1'),
        target: { kind: 'weight_g', grams: 1000 },
        capabilities: PRO,
        by: U1,
      }),
    ).rejects.toThrow(/production_run_events/);
    expect(failedStore.tables.production_runs).toHaveLength(0);
    expect(failedStore.tables.production_run_planned_items).toHaveLength(0);
  });

  it('returns the existing exact active batch when two starts race for one version', async () => {
    const repo = repoFor(store);
    const args = {
      ownerUserId: U1,
      version: makeVersion('ver-1'),
      target: { kind: 'weight_g' as const, grams: 1000 },
      capabilities: PRO,
      by: U1,
    };
    const first = await repo.startRun(args);
    const second = await repo.startRun(args);
    expect(second.runId).toBe(first.runId);
    expect(store.tables.production_runs).toHaveLength(1);
    expect(store.tables.production_run_planned_items).toHaveLength(2);
  });

  it('authorizes a display-safe Rescue without sending recipe or grams and consumes only the authorization basis', async () => {
    const repo = repoFor(store);
    const run = await repo.startRun({
      ownerUserId: U1,
      version: makeVersion('ver-1'),
      target: { kind: 'weight_g', grams: 1000 },
      capabilities: PRO,
      by: U1,
    });
    const authorization = await repo.authorizeRescue({
      runId: run.runId,
      stableOptionId: 'enlarge_batch',
      expectedRescueRevision: 0,
      expectedActualRevision: 0,
      idempotencyKey: 'authorize-once',
    });
    expect(authorization).toMatchObject({
      authorizationId: 'authorization-1',
      candidateFingerprint: 'fingerprint-1',
      runId: run.runId,
      stableOptionId: 'enlarge_batch',
      preview: { finalMassG: 1010, scoreDisplay: '94%' },
    });
    expect(store.functionCalls).toEqual([
      {
        name: 'production-rescue-authorize',
        body: {
          runId: run.runId,
          stableOptionId: 'enlarge_batch',
          expectedActualRevision: 0,
          expectedRescueRevision: 0,
          idempotencyKey: 'authorize-once',
        },
      },
    ]);
    const requestJson = JSON.stringify(store.functionCalls[0]!.body);
    expect(requestJson).not.toContain('recipeInput');
    expect(requestJson).not.toContain('productComposition');
    expect(requestJson).not.toContain('grams');

    const rescued = await repo.consumeRescue({
      authorizationId: authorization.authorizationId,
      expectedActualRevision: 0,
      expectedRescueRevision: 0,
      idempotencyKey: 'consume-once',
    });
    expect(rescued.rescue?.revision).toBe(1);
    expect(store.rpcCalls.at(-1)).toEqual({
      name: 'production_consume_rescue_authorization_v1',
      args: {
        p_authorization_id: authorization.authorizationId,
        p_expected_actual_revision: 0,
        p_expected_rescue_revision: 0,
        p_idempotency_key: 'consume-once',
      },
    });
    const consumeJson = JSON.stringify(store.rpcCalls.at(-1)!.args);
    expect(consumeJson).not.toContain('recipe');
    expect(consumeJson).not.toContain('composition');
    expect(consumeJson).not.toContain('grams');
  });

  it('fails closed when an authorization response does not match the requested revision basis', async () => {
    const repo = repoFor(store);
    const run = await repo.startRun({
      ownerUserId: U1,
      version: makeVersion('ver-1'),
      target: { kind: 'weight_g', grams: 1000 },
      capabilities: PRO,
      by: U1,
    });
    store.rescueAuthorizationResponsePatch = { expectedActualRevision: 1 };
    await expect(
      repo.authorizeRescue({
        runId: run.runId,
        stableOptionId: 'keep_original_batch',
        expectedActualRevision: 0,
        expectedRescueRevision: 0,
        idempotencyKey: 'fail-closed',
      }),
    ).rejects.toThrow(/does not match the requested run revision/);
    expect((await repo.getRun(run.runId, U1))?.rescue).toBeNull();
  });

  it('classifies served expiry as requiring a fresh Rescue Preview', async () => {
    const repo = repoFor(store);
    const run = await repo.startRun({
      ownerUserId: U1,
      version: makeVersion('ver-1'),
      target: { kind: 'weight_g', grams: 1000 },
      capabilities: PRO,
      by: U1,
    });
    const authorization = await repo.authorizeRescue({
      runId: run.runId,
      stableOptionId: 'enlarge_batch',
      expectedActualRevision: 0,
      expectedRescueRevision: 0,
      idempotencyKey: 'authorize-expiry',
    });
    store.rpcErrorMessages.production_consume_rescue_authorization_v1 =
      'Production Rescue authorization expired';

    try {
      await repo.consumeRescue({
        authorizationId: authorization.authorizationId,
        expectedActualRevision: 0,
        expectedRescueRevision: 0,
        idempotencyKey: 'consume-expiry',
      });
      throw new Error('expected trusted Rescue expiry');
    } catch (error) {
      expect(isProductionRescueAuthorizationRefreshError(error)).toBe(true);
    }
  });

  it('atomically refuses incomplete completion and closes only a coherent full vector', async () => {
    const repo = repoFor(store);
    const run = await repo.startRun({
      ownerUserId: U1,
      version: makeVersion('ver-1'),
      target: { kind: 'weight_g', grams: 1000 },
      capabilities: PRO,
      by: U1,
    });
    await expect(
      repo.completeRun(run.runId, {
        by: U1,
        expectedActualRevision: 0,
        expectedRescueRevision: 0,
        items: [{ id: 'milk', name: 'Milk', actualGrams: 600 }],
        actualTotalMixG: 600,
      }),
    ).rejects.toThrow(/complete actual vector/);
    expect((await repo.getRun(run.runId, U1))?.status).toBe('in_progress');
    expect(store.tables.production_run_actuals).toHaveLength(0);

    await expect(
      repo.completeRun(run.runId, {
        by: U1,
        expectedActualRevision: 0,
        expectedRescueRevision: 0,
        items: [
          {
            id: 'milk',
            name: 'Milk',
            actualGrams: 600,
            confirmedAt: '2026-01-01T10:00:00.000Z',
            confirmationOrder: 1,
          },
          {
            id: 'sugar',
            name: 'Sugar',
            actualGrams: 400,
            confirmedAt: '2026-01-01T10:01:00.000Z',
            confirmationOrder: 1,
          },
        ],
        actualTotalMixG: 1000,
      }),
    ).rejects.toThrow(/complete actual vector/);
    expect(store.tables.production_run_actuals).toHaveLength(0);

    const completed = await repo.completeRun(run.runId, {
      by: U1,
      expectedActualRevision: 0,
      expectedRescueRevision: 0,
      items: [
        {
          id: 'milk',
          name: 'Milk',
          actualGrams: 600,
          confirmedAt: '2026-01-01T10:00:00.000Z',
          confirmationOrder: 1,
        },
        {
          id: 'sugar',
          name: 'Sugar',
          actualGrams: 400,
          confirmedAt: '2026-01-01T10:01:00.000Z',
          confirmationOrder: 2,
        },
      ],
      actualTotalMixG: 1000,
    });
    expect(completed.status).toBe('completed');
    expect(completed.actual).toMatchObject({
      revision: 1,
      items: [
        { id: 'milk', confirmedAt: '2026-01-01T10:00:00.000Z', confirmationOrder: 1 },
        { id: 'sugar', confirmedAt: '2026-01-01T10:01:00.000Z', confirmationOrder: 2 },
      ],
    });
    expect(completed.events.slice(-2).map((event) => event.type)).toEqual([
      'actual_recorded',
      'completed',
    ]);
  });
});

describe('supabaseProduction — actuals are recorded separately, never replacing the plan', () => {
  let store: FakeStore;
  beforeEach(() => {
    store = new FakeStore();
  });

  const inProgress = async () => {
    const repo = repoFor(store);
    const run = await repo.createRun({
      ownerUserId: U1,
      version: makeVersion('ver-1'),
      target: { kind: 'weight_g', grams: 5000 },
      capabilities: PRO,
      by: U1,
    });
    await repo.transition(run.runId, 'planned', U1);
    await repo.transition(run.runId, 'in_progress', U1);
    return { repo, run };
  };

  it('refuses actuals before in_progress', async () => {
    const repo = repoFor(store);
    const run = await repo.createRun({
      ownerUserId: U1,
      version: makeVersion('ver-1'),
      target: { kind: 'weight_g', grams: 5000 },
      capabilities: PRO,
      by: U1,
    });
    await expect(
      repo.recordActual(run.runId, {
        by: U1,
        expectedActualRevision: 0,
        expectedRescueRevision: 0,
        items: [],
      }),
    ).rejects.toThrow(/in progress/i);
    expect(store.tables.production_run_actuals).toHaveLength(0);
  });

  it('records actuals + computes deviation without touching the frozen plan', async () => {
    const { repo, run } = await inProgress();
    const plannedSnapshot = clone(store.tables.production_run_planned_items);

    await repo.recordActual(run.runId, {
      by: U1,
      expectedActualRevision: 0,
      expectedRescueRevision: 0,
      items: [
        { id: 'milk', name: 'Milk', actualGrams: 3010 },
        { id: 'sugar', name: 'Sugar', actualGrams: 1990 },
      ],
      actualTotalMixG: 5000,
      actualYieldG: 4800,
      wasteG: 200,
      deviationReason: 'scale drift',
    });

    const dev = (await repo.getDeviation(run.runId))!;
    expect(dev.lines.map((l) => l.deltaGrams)).toEqual([10, -10]);
    expect(dev.plannedTotalG).toBe(5000);
    expect(dev.actualYieldG).toBe(4800);
    expect(dev.wasteG).toBe(200);

    // the plan table is byte-for-byte unchanged; actuals live in their own row
    expect(store.tables.production_run_planned_items).toEqual(plannedSnapshot);
    expect(store.tables.production_run_actuals).toHaveLength(1);

    // recording again upserts the working actual (still one row) and never adds a plan row
    await repo.recordActual(run.runId, {
      by: U1,
      expectedActualRevision: 1,
      expectedRescueRevision: 0,
      items: [
        { id: 'milk', name: 'Milk', actualGrams: 9999 },
        { id: 'sugar', name: 'Sugar', actualGrams: null },
      ],
    });
    expect(store.tables.production_run_actuals).toHaveLength(1);
    expect(store.tables.production_run_planned_items).toEqual(plannedSnapshot);
    const reread = (await repo.getRun(run.runId))!;
    expect(reread.plannedItems.map((p) => p.plannedGrams)).toEqual([3000, 2000]);
  });

  it('rejects one stale whole-vector writer instead of losing a concurrent confirmation', async () => {
    const { run } = await inProgress();
    const writerA = repoFor(store, U1, 'writer-a');
    const writerB = repoFor(store, U1, 'writer-b');

    const results = await Promise.allSettled([
      writerA.recordActual(run.runId, {
        by: U1,
        expectedActualRevision: 0,
        expectedRescueRevision: 0,
        items: [
          {
            id: 'milk',
            name: 'Milk',
            actualGrams: 3000,
            confirmedAt: '2026-01-01T10:00:00.000Z',
            confirmationOrder: 1,
          },
          { id: 'sugar', name: 'Sugar', actualGrams: null },
        ],
      }),
      writerB.recordActual(run.runId, {
        by: U1,
        expectedActualRevision: 0,
        expectedRescueRevision: 0,
        items: [
          { id: 'milk', name: 'Milk', actualGrams: null },
          {
            id: 'sugar',
            name: 'Sugar',
            actualGrams: 2000,
            confirmedAt: '2026-01-01T10:01:00.000Z',
            confirmationOrder: 1,
          },
        ],
      }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')?.reason).toMatchObject({
      message: expect.stringMatching(/revision conflict/),
    });
    const durable = await writerA.getRun(run.runId, U1);
    expect(durable?.actual?.revision).toBe(1);
    expect(durable?.actual?.items.filter((line) => line.actualGrams !== null)).toHaveLength(1);
  });
});

describe('supabaseProduction — post-completion amendments are append-only', () => {
  let store: FakeStore;
  beforeEach(() => {
    store = new FakeStore();
  });

  const complete = async () => {
    const repo = repoFor(store);
    const run = await repo.createRun({
      ownerUserId: U1,
      version: makeVersion('ver-1'),
      target: { kind: 'weight_g', grams: 5000 },
      capabilities: PRO,
      by: U1,
    });
    await repo.transition(run.runId, 'planned', U1);
    await repo.transition(run.runId, 'in_progress', U1);
    await repo.completeRun(run.runId, {
      by: U1,
      expectedActualRevision: 0,
      expectedRescueRevision: 0,
      items: [
        {
          id: 'milk',
          name: 'Milk',
          actualGrams: 3000,
          confirmedAt: '2026-01-01T10:00:00.000Z',
          confirmationOrder: 1,
        },
        {
          id: 'sugar',
          name: 'Sugar',
          actualGrams: 2000,
          confirmedAt: '2026-01-01T10:01:00.000Z',
          confirmationOrder: 2,
        },
      ],
      actualTotalMixG: 5000,
    });
    return { repo, run };
  };

  it('amends a completed run by adding an event only (plan + actual frozen)', async () => {
    const { repo, run } = await complete();
    const plannedSnapshot = clone(store.tables.production_run_planned_items);
    const actualSnapshot = clone(store.tables.production_run_actuals);
    const eventsBefore = store.tables.production_run_events!.length;

    const amended = await repo.amend(run.runId, {
      by: U1,
      detail: 'Corrected batch label',
      amendment: { batch_reference: 'B-77' },
    });
    expect(amended.events.at(-1)).toMatchObject({
      type: 'amended',
      detail: 'Corrected batch label',
    });
    expect(amended.events.length).toBe(eventsBefore + 1);

    // append-only + immutable: history grew by exactly one; plan + actual untouched
    expect(store.tables.production_run_events).toHaveLength(eventsBefore + 1);
    expect(store.updates.production_run_events ?? 0).toBe(0);
    expect(store.tables.production_run_planned_items).toEqual(plannedSnapshot);
    expect(store.tables.production_run_actuals).toEqual(actualSnapshot);
  });

  it('refuses an amendment before completion', async () => {
    const repo = repoFor(store);
    const run = await repo.createRun({
      ownerUserId: U1,
      version: makeVersion('ver-1'),
      target: { kind: 'weight_g', grams: 5000 },
      capabilities: PRO,
      by: U1,
    });
    await expect(repo.amend(run.runId, { by: U1, detail: 'too early' })).rejects.toThrow(
      /only for completed runs/i,
    );
  });
});

describe('supabaseProduction — owner-scoped history + honest failure', () => {
  let store: FakeStore;
  beforeEach(() => {
    store = new FakeStore();
  });

  it("filters by version + paginates, and never returns another owner's run", async () => {
    const repo1 = repoFor(store, U1);
    const r1 = await repo1.createRun({
      ownerUserId: U1,
      version: makeVersion('ver-1', 1),
      target: { kind: 'weight_g', grams: 1000 },
      capabilities: PRO,
      by: U1,
    });
    const r2 = await repo1.createRun({
      ownerUserId: U1,
      version: makeVersion('ver-2', 2),
      target: { kind: 'weight_g', grams: 1000 },
      capabilities: PRO,
      by: U1,
    });
    const r3 = await repo1.createRun({
      ownerUserId: U1,
      version: makeVersion('ver-1', 1),
      target: { kind: 'weight_g', grams: 1000 },
      capabilities: PRO,
      by: U1,
    });

    // a second owner plans a run (distinct id namespace — different session)
    const repo2 = supabaseProductionRepository(fakeClient(store, U2), seams('u2'));
    await repo2.createRun({
      ownerUserId: U2,
      version: makeVersion('ver-9', 1),
      target: { kind: 'weight_g', grams: 1000 },
      capabilities: PRO,
      by: U2,
    });

    // owner isolation
    expect((await repo1.listRuns(U1)).total).toBe(3);
    expect((await repo2.listRuns(U2)).total).toBe(1);
    expect(await repo2.getRun(r1.runId)).toBeNull();
    expect(await repo1.getRun(r1.runId, U2)).toBeNull();
    expect(await repo1.getRun(r1.runId, U1)).not.toBeNull();

    // newest-first default
    expect((await repo1.listRuns(U1)).items.map((r) => r.runId)).toEqual([
      r3.runId,
      r2.runId,
      r1.runId,
    ]);
    // by version
    expect((await repo1.listRuns(U1, { recipeVersionId: 'ver-1' })).total).toBe(2);
    // pagination (oldest)
    const page = await repo1.listRuns(U1, { sort: 'oldest', offset: 1, limit: 1 });
    expect(page.total).toBe(3);
    expect(page.items.map((r) => r.runId)).toEqual([r2.runId]);
    // assembled page carries the frozen plan
    expect(page.items[0]!.plannedItems).toHaveLength(2);
  });

  it('surfaces a DB error as a thrown error (never a false "saved")', async () => {
    const repo = repoFor(store);
    store.fail.add('production_runs:insert');
    await expect(
      repo.createRun({
        ownerUserId: U1,
        version: makeVersion('ver-1'),
        target: { kind: 'weight_g', grams: 1000 },
        capabilities: PRO,
        by: U1,
      }),
    ).rejects.toThrow(/boom production_runs/i);
  });

  it('rolls back the entire transactional create when the audit event fails', async () => {
    const repo = repoFor(store);
    store.fail.add('production_run_events:insert');
    await expect(
      repo.createRun({
        ownerUserId: U1,
        version: makeVersion('ver-1'),
        target: { kind: 'weight_g', grams: 1000 },
        capabilities: PRO,
        by: U1,
      }),
    ).rejects.toThrow(/boom production_run_events/i);
    expect(store.tables.production_runs).toHaveLength(0);
    expect(store.tables.production_run_planned_items).toHaveLength(0);
    expect(store.tables.production_run_events).toHaveLength(0);
  });

  it('surfaces a read error on getRun', async () => {
    const repo = repoFor(store);
    await repo.createRun({
      ownerUserId: U1,
      version: makeVersion('ver-1'),
      target: { kind: 'weight_g', grams: 1000 },
      capabilities: PRO,
      by: U1,
    });
    store.fail.add('production_runs:select');
    await expect(repo.listRuns(U1)).rejects.toThrow(/boom production_runs/i);
  });
});
