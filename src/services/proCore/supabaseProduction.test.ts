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
import { productionCapabilitiesFor } from '@/features/pro-core/proCoreCapabilities';
import { supabaseProductionRepository } from './supabaseProduction';

/* ── a tiny fake PostgREST client (only what the adapter calls) ───────────────── */

type Row = Record<string, unknown>;
interface Filter { op: 'eq' | 'gte' | 'lte' | 'in'; col: string; val: unknown }

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
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

class FakeBuilder implements PromiseLike<{ data: unknown; error: { message: string } | null; count?: number }> {
  private op: 'select' | 'insert' | 'upsert' | 'update' = 'select';
  private payload: unknown = null;
  private onConflict: string | null = null;
  private filters: Filter[] = [];
  private single = false;

  constructor(private store: FakeStore, private table: string) {}

  select(cols?: string): this { void cols; this.op = 'select'; return this; }
  insert(payload: Row | Row[]): this { this.op = 'insert'; this.payload = payload; return this; }
  upsert(payload: Row, opts?: { onConflict?: string }): this {
    this.op = 'upsert'; this.payload = payload; this.onConflict = opts?.onConflict ?? null; return this;
  }
  update(patch: Row): this { this.op = 'update'; this.payload = patch; return this; }
  eq(col: string, val: unknown): this { this.filters.push({ op: 'eq', col, val }); return this; }
  gte(col: string, val: unknown): this { this.filters.push({ op: 'gte', col, val }); return this; }
  lte(col: string, val: unknown): this { this.filters.push({ op: 'lte', col, val }); return this; }
  in(col: string, val: unknown[]): this { this.filters.push({ op: 'in', col, val }); return this; }
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }> {
    this.single = true; return this.resolve();
  }
  then<TR = unknown, TE = never>(
    onFulfilled?: ((v: { data: unknown; error: { message: string } | null; count?: number }) => TR | PromiseLike<TR>) | null,
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

  private async resolve(): Promise<{ data: unknown; error: { message: string } | null; count?: number }> {
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
      if (idx >= 0) rows[idx] = p; else rows.push(p);
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
  } as unknown as Parameters<typeof supabaseProductionRepository>[0];
}

/* ── fixtures ─────────────────────────────────────────────────────────────────── */

const TRACE = { engineVersion: 'e1', configVersion: 'c1' };
const U1 = '11111111-1111-1111-1111-111111111111';
const U2 = '22222222-2222-2222-2222-222222222222';
const PRO = productionCapabilitiesFor('pro');
const HOME = productionCapabilitiesFor('home');
const DEMO = productionCapabilitiesFor('demo');

const item = (id: string, name: string, grams: number) => ({ id, ingredient: { name }, planned_grams: grams });
const input = (batch: number, items: ReturnType<typeof item>[]): RecipeInput =>
  ({ items, mode: 'classic', category: 'milk_gelato', target_temperature_c: -11, target_batch_grams: batch, machine_capacity_grams: null }) as unknown as RecipeInput;
const makeVersion = (versionId: string, versionNumber = 1, batch = 1000): RecipeVersion =>
  buildRecipeVersion(
    { recipeId: 'r-1', ownerUserId: U1, versionNumber, recipeInput: input(batch, [item('milk', 'Milk', 600), item('sugar', 'Sugar', 400)]), trace: TRACE, source: 'manual', createdBy: U1, createdAt: '2026-07-12T10:00:00.000Z' },
    versionId,
  );

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
  beforeEach(() => { store = new FakeStore(); });

  it('binds the run to the exact recipe_version_id and freezes the scaled snapshot', async () => {
    const repo = repoFor(store);
    makeVersion('ver-2', 2); // a newer version exists, but we plan from v1
    const run = await repo.createRun({ ownerUserId: U1, version: makeVersion('ver-1', 1), target: { kind: 'weight_g', grams: 5000 }, capabilities: PRO, by: U1 });

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

  it('refuses Production Mode for Demo and Home, and writes nothing', async () => {
    const repo = repoFor(store);
    const args = (caps: typeof PRO) => ({ ownerUserId: U1, version: makeVersion('ver-1'), target: { kind: 'weight_g' as const, grams: 1000 }, capabilities: caps, by: U1 });
    await expect(repo.createRun(args(DEMO))).rejects.toThrow(/does not include Production Mode/i);
    await expect(repo.createRun(args(HOME))).rejects.toThrow(/does not include Production Mode/i);
    expect(store.tables.production_runs).toHaveLength(0);
  });

  it('refuses a volume run without a density (honest needs_more_information)', async () => {
    const repo = repoFor(store);
    await expect(
      repo.createRun({ ownerUserId: U1, version: makeVersion('ver-1'), target: { kind: 'volume_ml', ml: 5000 }, capabilities: PRO, by: U1 }),
    ).rejects.toThrow(/density/i);
    expect(store.tables.production_runs).toHaveLength(0);
  });

  it('throws (never a false save) when not signed in', async () => {
    const repo = repoFor(store, null);
    await expect(
      repo.createRun({ ownerUserId: U1, version: makeVersion('ver-1'), target: { kind: 'weight_g', grams: 1000 }, capabilities: PRO, by: U1 }),
    ).rejects.toThrow(/signed in/i);
    expect(store.tables.production_runs).toHaveLength(0);
  });
});

describe('supabaseProduction — lifecycle appends events; the plan stays immutable', () => {
  let store: FakeStore;
  beforeEach(() => { store = new FakeStore(); });

  const start = async () => {
    const repo = repoFor(store);
    const run = await repo.createRun({ ownerUserId: U1, version: makeVersion('ver-1'), target: { kind: 'weight_g', grams: 5000 }, capabilities: PRO, by: U1 });
    return { repo, run };
  };

  it('walks draft → planned → in_progress → completed, appending one event each', async () => {
    const { repo, run } = await start();
    const plannedSnapshot = clone(store.tables.production_run_planned_items);

    expect((await repo.transition(run.runId, 'planned', U1)).status).toBe('planned');
    expect((await repo.transition(run.runId, 'in_progress', U1)).status).toBe('in_progress');
    const done = await repo.transition(run.runId, 'completed', U1);
    expect(done.status).toBe('completed');
    expect(done.completedAt).not.toBeNull();
    expect(done.events.map((e) => e.type)).toEqual(['created', 'planned', 'started', 'completed']);

    // IMMUTABLE frozen plan: the planned_items rows were never updated/deleted/re-inserted.
    expect(store.tables.production_run_planned_items).toEqual(plannedSnapshot);
    expect(store.updates.production_run_planned_items ?? 0).toBe(0);
    expect(store.updates.production_run_events ?? 0).toBe(0); // events append-only
    expect(store.tables.production_run_events).toHaveLength(4);
  });

  it('rejects an illegal transition deterministically and writes no event', async () => {
    const { repo, run } = await start();
    await expect(repo.transition(run.runId, 'completed', U1)).rejects.toThrow(/Illegal production transition/i);
    expect(store.tables.production_run_events).toHaveLength(1); // only 'created'
  });
});

describe('supabaseProduction — actuals are recorded separately, never replacing the plan', () => {
  let store: FakeStore;
  beforeEach(() => { store = new FakeStore(); });

  const inProgress = async () => {
    const repo = repoFor(store);
    const run = await repo.createRun({ ownerUserId: U1, version: makeVersion('ver-1'), target: { kind: 'weight_g', grams: 5000 }, capabilities: PRO, by: U1 });
    await repo.transition(run.runId, 'planned', U1);
    await repo.transition(run.runId, 'in_progress', U1);
    return { repo, run };
  };

  it('refuses actuals before in_progress', async () => {
    const repo = repoFor(store);
    const run = await repo.createRun({ ownerUserId: U1, version: makeVersion('ver-1'), target: { kind: 'weight_g', grams: 5000 }, capabilities: PRO, by: U1 });
    await expect(repo.recordActual(run.runId, { by: U1, items: [] })).rejects.toThrow(/in progress/i);
    expect(store.tables.production_run_actuals).toHaveLength(0);
  });

  it('records actuals + computes deviation without touching the frozen plan', async () => {
    const { repo, run } = await inProgress();
    const plannedSnapshot = clone(store.tables.production_run_planned_items);

    await repo.recordActual(run.runId, {
      by: U1,
      items: [{ id: 'milk', name: 'Milk', actualGrams: 3010 }, { id: 'sugar', name: 'Sugar', actualGrams: 1990 }],
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
    await repo.recordActual(run.runId, { by: U1, items: [{ id: 'milk', name: 'Milk', actualGrams: 9999 }] });
    expect(store.tables.production_run_actuals).toHaveLength(1);
    expect(store.tables.production_run_planned_items).toEqual(plannedSnapshot);
    const reread = (await repo.getRun(run.runId))!;
    expect(reread.plannedItems.map((p) => p.plannedGrams)).toEqual([3000, 2000]);
  });
});

describe('supabaseProduction — post-completion amendments are append-only', () => {
  let store: FakeStore;
  beforeEach(() => { store = new FakeStore(); });

  const complete = async () => {
    const repo = repoFor(store);
    const run = await repo.createRun({ ownerUserId: U1, version: makeVersion('ver-1'), target: { kind: 'weight_g', grams: 5000 }, capabilities: PRO, by: U1 });
    await repo.transition(run.runId, 'planned', U1);
    await repo.transition(run.runId, 'in_progress', U1);
    await repo.recordActual(run.runId, { by: U1, items: [{ id: 'milk', name: 'Milk', actualGrams: 3000 }] });
    await repo.transition(run.runId, 'completed', U1);
    return { repo, run };
  };

  it('amends a completed run by adding an event only (plan + actual frozen)', async () => {
    const { repo, run } = await complete();
    const plannedSnapshot = clone(store.tables.production_run_planned_items);
    const actualSnapshot = clone(store.tables.production_run_actuals);
    const eventsBefore = store.tables.production_run_events!.length;

    const amended = await repo.amend(run.runId, { by: U1, detail: 'Corrected batch label', amendment: { batch_reference: 'B-77' } });
    expect(amended.events.at(-1)).toMatchObject({ type: 'amended', detail: 'Corrected batch label' });
    expect(amended.events.length).toBe(eventsBefore + 1);

    // append-only + immutable: history grew by exactly one; plan + actual untouched
    expect(store.tables.production_run_events).toHaveLength(eventsBefore + 1);
    expect(store.updates.production_run_events ?? 0).toBe(0);
    expect(store.tables.production_run_planned_items).toEqual(plannedSnapshot);
    expect(store.tables.production_run_actuals).toEqual(actualSnapshot);
  });

  it('refuses an amendment before completion', async () => {
    const repo = repoFor(store);
    const run = await repo.createRun({ ownerUserId: U1, version: makeVersion('ver-1'), target: { kind: 'weight_g', grams: 5000 }, capabilities: PRO, by: U1 });
    await expect(repo.amend(run.runId, { by: U1, detail: 'too early' })).rejects.toThrow(/only for completed runs/i);
  });
});

describe('supabaseProduction — owner-scoped history + honest failure', () => {
  let store: FakeStore;
  beforeEach(() => { store = new FakeStore(); });

  it('filters by version + paginates, and never returns another owner\'s run', async () => {
    const repo1 = repoFor(store, U1);
    const r1 = await repo1.createRun({ ownerUserId: U1, version: makeVersion('ver-1', 1), target: { kind: 'weight_g', grams: 1000 }, capabilities: PRO, by: U1 });
    const r2 = await repo1.createRun({ ownerUserId: U1, version: makeVersion('ver-2', 2), target: { kind: 'weight_g', grams: 1000 }, capabilities: PRO, by: U1 });
    const r3 = await repo1.createRun({ ownerUserId: U1, version: makeVersion('ver-1', 1), target: { kind: 'weight_g', grams: 1000 }, capabilities: PRO, by: U1 });

    // a second owner plans a run (distinct id namespace — different session)
    const repo2 = supabaseProductionRepository(fakeClient(store, U2), seams('u2'));
    await repo2.createRun({ ownerUserId: U2, version: makeVersion('ver-9', 1), target: { kind: 'weight_g', grams: 1000 }, capabilities: PRO, by: U2 });

    // owner isolation
    expect((await repo1.listRuns(U1)).total).toBe(3);
    expect((await repo2.listRuns(U2)).total).toBe(1);
    expect(await repo2.getRun(r1.runId)).toBeNull();
    expect(await repo1.getRun(r1.runId, U2)).toBeNull();
    expect(await repo1.getRun(r1.runId, U1)).not.toBeNull();

    // newest-first default
    expect((await repo1.listRuns(U1)).items.map((r) => r.runId)).toEqual([r3.runId, r2.runId, r1.runId]);
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
      repo.createRun({ ownerUserId: U1, version: makeVersion('ver-1'), target: { kind: 'weight_g', grams: 1000 }, capabilities: PRO, by: U1 }),
    ).rejects.toThrow(/boom production_runs/i);
  });

  it('surfaces a read error on getRun', async () => {
    const repo = repoFor(store);
    await repo.createRun({ ownerUserId: U1, version: makeVersion('ver-1'), target: { kind: 'weight_g', grams: 1000 }, capabilities: PRO, by: U1 });
    store.fail.add('production_runs:select');
    await expect(repo.listRuns(U1)).rejects.toThrow(/boom production_runs/i);
  });
});
