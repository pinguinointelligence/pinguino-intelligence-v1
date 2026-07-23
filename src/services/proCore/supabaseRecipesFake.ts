/**
 * TEST SUPPORT ONLY — a hand-rolled in-memory fake SupabaseClient for the migration-0027/0036
 * recipe tables. Imported exclusively by vitest files (never by app code); it contains no vitest
 * imports itself so tsc builds it standalone.
 *
 * It models the DB's hard rules so adapter tests are honest:
 *   • recipe_versions is APPEND-ONLY — UPDATE/DELETE on it errors (mirrors "no grant/policy");
 *   • UNIQUE(recipe_id, version_number) — a duplicate insert errors;
 *   • FK ON DELETE CASCADE from saved_recipes → meta + versions;
 *   • `rpc('create_recipe_with_v1', …)` — when `db.rpcEnabled` it executes the migration-0036
 *     function ATOMICALLY (an injected failure persists NOTHING); when disabled it returns
 *     PGRST202 exactly like PostgREST does for a function missing from the schema cache, which
 *     is what activates the adapter's documented non-transactional fallback.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type Row = Record<string, unknown>;
export type Filter = ['eq', string, unknown] | ['in', string, unknown[]];
export type Op = 'select' | 'insert' | 'update' | 'delete';
export interface Result { data: unknown; error: { code?: string; message: string } | null }

export class FakeDB {
  saved_recipes: Row[] = [];
  saved_recipe_meta: Row[] = [];
  recipe_versions: Row[] = [];
  private seq = 0;
  private tick = 0;
  /** injectable failure: return an error for the first matching (table, op). */
  failOn: { table: string; op: Op } | null = null;
  /** injectable one-shot UNIQUE violation (models a concurrent writer taking the version number). */
  failUniqueOnce: { table: string; op: Op } | null = null;
  /** true = the migration-0036 transactional RPC exists in this "database". */
  rpcEnabled = false;

  now(): string {
    this.tick += 1;
    return `2026-07-12T10:00:${String(this.tick).padStart(2, '0')}.000Z`;
  }
  id(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }
  table(name: string): Row[] {
    const t = (this as unknown as Record<string, Row[]>)[name];
    if (!t) throw new Error(`unknown table ${name}`);
    return t;
  }
}

export class FakeBuilder implements PromiseLike<Result> {
  private op: Op = 'select';
  private payload: Row | Row[] = {};
  private filters: Filter[] = [];
  private orderSpec: { col: string; asc: boolean } | null = null;

  constructor(private readonly db: FakeDB, private readonly tableName: string) {}

  select(cols?: string): this {
    void cols;
    if (this.op !== 'insert' && this.op !== 'update') this.op = 'select';
    return this;
  }
  insert(payload: Row | Row[]): this { this.op = 'insert'; this.payload = payload; return this; }
  update(payload: Row): this { this.op = 'update'; this.payload = payload; return this; }
  delete(): this { this.op = 'delete'; return this; }
  eq(col: string, val: unknown): this { this.filters.push(['eq', col, val]); return this; }
  in(col: string, arr: unknown[]): this { this.filters.push(['in', col, arr]); return this; }
  order(col: string, opts?: { ascending?: boolean }): this { this.orderSpec = { col, asc: opts?.ascending !== false }; return this; }

  maybeSingle(): Promise<Result> { return this.run('maybe'); }
  single(): Promise<Result> { return this.run('single'); }
  then<R1 = Result, R2 = never>(
    onfulfilled?: ((value: Result) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return this.run('many').then(onfulfilled, onrejected);
  }

  private matches(row: Row): boolean {
    return this.filters.every((f) =>
      f[0] === 'eq' ? row[f[1]] === f[2] : (f[2] as unknown[]).includes(row[f[1]]),
    );
  }

  private applyDefaults(row: Row): Row {
    const r = { ...row };
    if (this.tableName === 'saved_recipes') {
      r.id ??= this.db.id('sr');
      r.created_at ??= this.db.now();
      r.updated_at ??= r.created_at;
      r.serving_profile ??= null;
    } else if (this.tableName === 'saved_recipe_meta') {
      r.created_at ??= this.db.now();
      r.updated_at ??= r.created_at;
    } else if (this.tableName === 'recipe_versions') {
      r.id ??= this.db.id('rv');
      r.created_at ??= this.db.now();
    }
    return r;
  }

  private async run(shape: 'many' | 'maybe' | 'single'): Promise<Result> {
    const fail = this.db.failOn;
    if (fail && fail.table === this.tableName && fail.op === this.op) {
      this.db.failOn = null;
      return { data: null, error: { message: `injected ${this.op} failure on ${this.tableName}` } };
    }
    const uniq = this.db.failUniqueOnce;
    if (uniq && uniq.table === this.tableName && uniq.op === this.op) {
      this.db.failUniqueOnce = null;
      return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
    }
    const rows = this.db.table(this.tableName);

    if (this.op === 'delete') {
      const removed = rows.filter((r) => this.matches(r));
      const keep = rows.filter((r) => !this.matches(r));
      rows.length = 0;
      rows.push(...keep);
      // Model the FK ON DELETE CASCADE: deleting a saved_recipes row removes its meta + versions.
      if (this.tableName === 'saved_recipes') {
        for (const gone of removed) {
          const rid = gone.id;
          for (const child of ['saved_recipe_meta', 'recipe_versions']) {
            const t = this.db.table(child);
            const kept = t.filter((r) => r.recipe_id !== rid);
            t.length = 0;
            t.push(...kept);
          }
        }
      }
      return this.shaped(removed, shape);
    }

    if (this.op === 'insert') {
      const items = Array.isArray(this.payload) ? this.payload : [this.payload];
      const inserted = items.map((r) => this.applyDefaults(r));
      // recipe_versions is append-only + unique(recipe_id, version_number).
      for (const r of inserted) {
        if (
          this.tableName === 'recipe_versions' &&
          rows.some((e) => e.recipe_id === r.recipe_id && e.version_number === r.version_number)
        ) {
          return { data: null, error: { message: 'duplicate (recipe_id, version_number)' } };
        }
      }
      rows.push(...inserted);
      return this.shaped(inserted, shape);
    }

    if (this.op === 'update') {
      if (this.tableName === 'recipe_versions') {
        return { data: null, error: { message: 'recipe_versions is immutable (no update grant)' } };
      }
      const patch = this.payload as Row;
      const hit = rows.filter((r) => this.matches(r));
      for (const r of hit) Object.assign(r, patch);
      return this.shaped(hit, shape);
    }

    // select
    let out = rows.filter((r) => this.matches(r));
    if (this.orderSpec) {
      const { col, asc } = this.orderSpec;
      out = [...out].sort((a, b) => {
        const av = a[col] as number | string;
        const bv = b[col] as number | string;
        return (av < bv ? -1 : av > bv ? 1 : 0) * (asc ? 1 : -1);
      });
    }
    return this.shaped(out, shape);
  }

  private shaped(rows: Row[], shape: 'many' | 'maybe' | 'single'): Result {
    // return deep copies so callers can never mutate the backing store
    const copy = rows.map((r) => structuredClone(r));
    if (shape === 'many') return { data: copy, error: null };
    if (shape === 'maybe') return { data: copy[0] ?? null, error: null };
    return copy[0]
      ? { data: copy[0], error: null }
      : { data: null, error: { message: 'no rows returned' } };
  }
}

/**
 * The migration-0036 function, executed ATOMICALLY against the fake store: rows are built first
 * and committed only when every step succeeded — an injected failure persists NOTHING, exactly
 * like a rolled-back Postgres transaction.
 */
function runCreateRecipeWithV1(db: FakeDB, userId: string | null, params: Row): Result {
  if (!userId) return { data: null, error: { code: '42501', message: 'You must be signed in to save recipes.' } };
  for (const table of ['saved_recipes', 'saved_recipe_meta', 'recipe_versions']) {
    if (db.failOn && db.failOn.table === table && db.failOn.op === 'insert') {
      db.failOn = null;
      // the whole transaction aborts — nothing was committed
      return { data: null, error: { message: `injected insert failure on ${table}` } };
    }
  }
  const createdAt = db.now();
  const recipe: Row = {
    id: db.id('sr'),
    user_id: userId,
    name: params.p_name,
    description: params.p_description ?? null,
    recipe_input: params.p_recipe_input,
    product_type: params.p_product_profile ?? null,
    serving_profile: null,
    engine_version: params.p_engine_version,
    config_version: params.p_config_version,
    batch_grams: params.p_batch_grams,
    created_at: createdAt,
    updated_at: createdAt,
  };
  const meta: Row = {
    recipe_id: recipe.id,
    owner_user_id: userId,
    workspace_id: null,
    archived: false,
    latest_version_number: 1,
    created_at: createdAt,
    updated_at: createdAt,
  };
  const version: Row = {
    id: db.id('rv'),
    recipe_id: recipe.id,
    owner_user_id: userId,
    version_number: 1,
    recipe_input: params.p_recipe_input,
    total_batch_g: params.p_total_batch_g,
    product_profile: params.p_product_profile ?? null,
    temperature_c: params.p_temperature_c ?? null,
    engine_version: params.p_engine_version,
    config_version: params.p_config_version,
    mapper_dataset_version: params.p_mapper_dataset_version ?? null,
    source: params.p_source ?? 'manual',
    created_by: userId,
    created_at: createdAt,
    restored_from_version: null,
    note: params.p_note ?? null,
  };
  // COMMIT — all three or none.
  db.saved_recipes.push(recipe);
  db.saved_recipe_meta.push(meta);
  db.recipe_versions.push(version);
  return { data: structuredClone({ recipe, meta, version }), error: null };
}

export function makeClient(db: FakeDB, userId: string | null): SupabaseClient {
  return {
    auth: {
      getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: null }),
    },
    from: (table: string) => new FakeBuilder(db, table),
    rpc: async (name: string, params: Row) => {
      if (name !== 'create_recipe_with_v1' || !db.rpcEnabled) {
        // exactly what PostgREST reports for a function absent from the schema cache
        return {
          data: null,
          error: { code: 'PGRST202', message: `Could not find the function public.${name} in the schema cache` },
        };
      }
      return runCreateRecipeWithV1(db, userId, params);
    },
  } as unknown as SupabaseClient;
}
