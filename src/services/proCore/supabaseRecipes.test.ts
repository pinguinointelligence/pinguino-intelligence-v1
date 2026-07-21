/**
 * Supabase RecipesRepository adapter — fake-client unit tests (vitest node-env, no jsdom).
 *
 * A hand-rolled in-memory fake SupabaseClient models the three migration-0027 tables and their
 * hard rules: recipe_versions is APPEND-ONLY (the fake rejects UPDATE/DELETE on it, mirroring the
 * DB's "no update/delete grant or policy"), and a signed-in user id gates every write. The tests
 * prove: a save persists across all three tables; a new version is a NEW immutable recipe_versions
 * row (prior rows byte-for-byte untouched); a restore appends a NEW latest version with history
 * intact; owner isolation on reads; and that any Supabase error surfaces as a thrown error
 * (never a false "saved").
 */
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RecipeInput } from '@/engine';
import type { RecipeCapabilities } from '@/features/pro-core/recipeContracts';
import { supabaseRecipesRepository } from './supabaseRecipes';

const TRACE = { engineVersion: 'e1', configVersion: 'c1' };
const PRO: RecipeCapabilities = { canSaveRecipe: true, canViewRecipeVersions: true, canRestoreRecipeVersion: true, maxSavedRecipes: null, canViewExactGrams: true };
const HOME: RecipeCapabilities = { ...PRO, maxSavedRecipes: 1 };
const DEMO: RecipeCapabilities = { canSaveRecipe: false, canViewRecipeVersions: false, canRestoreRecipeVersion: false, maxSavedRecipes: 0, canViewExactGrams: false };

const item = (id: string, name: string, grams: number) => ({ id, ingredient: { name }, planned_grams: grams });
const input = (batch: number, items: ReturnType<typeof item>[]): RecipeInput =>
  ({ items, mode: 'gelato', category: 'gelato', target_temperature_c: -11, target_batch_grams: batch, machine_capacity_grams: null }) as unknown as RecipeInput;

/* ── a tiny in-memory fake of the Supabase query builder ── */

type Row = Record<string, unknown>;
type Filter = ['eq', string, unknown] | ['in', string, unknown[]];
type Op = 'select' | 'insert' | 'update' | 'delete';
interface Result { data: unknown; error: { message: string } | null }

class FakeDB {
  saved_recipes: Row[] = [];
  saved_recipe_meta: Row[] = [];
  recipe_versions: Row[] = [];
  private seq = 0;
  private tick = 0;
  /** injectable failure: return an error for the first matching (table, op). */
  failOn: { table: string; op: Op } | null = null;
  /** injectable one-shot UNIQUE violation (models a concurrent writer taking the version number). */
  failUniqueOnce: { table: string; op: Op } | null = null;

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

class FakeBuilder implements PromiseLike<Result> {
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
      return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } as { code: string; message: string } };
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

function makeClient(db: FakeDB, userId: string | null): SupabaseClient {
  return {
    auth: {
      getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: null }),
    },
    from: (table: string) => new FakeBuilder(db, table),
  } as unknown as SupabaseClient;
}

/* ── tests ── */

describe('supabase RecipesRepository adapter (fake client)', () => {
  const seed = (userId = 'user-1') => {
    const db = new FakeDB();
    const repo = supabaseRecipesRepository(makeClient(db, userId));
    return { db, repo };
  };

  it('createRecipe persists across saved_recipes + saved_recipe_meta + recipe_versions', async () => {
    const { db, repo } = seed();
    const { recipe, version } = await repo.createRecipe({
      ownerUserId: 'user-1', title: 'Vanilla', notes: 'nice',
      recipeInput: input(1000, [item('a', 'Milk', 600), item('b', 'Sugar', 400)]),
      trace: TRACE, by: 'user-1', capabilities: PRO,
    });

    expect(db.saved_recipes).toHaveLength(1);
    expect(db.saved_recipe_meta).toHaveLength(1);
    expect(db.recipe_versions).toHaveLength(1);
    // owner id came from auth.getUser(), not the args
    expect(db.saved_recipes[0]!.user_id).toBe('user-1');
    expect(db.saved_recipe_meta[0]!.owner_user_id).toBe('user-1');
    expect(recipe.recipeId).toBe(db.saved_recipes[0]!.id);
    expect(recipe.title).toBe('Vanilla');
    expect(recipe.temperatureC).toBe(-11);
    expect(version.versionNumber).toBe(1);
    expect(version.totalBatchG).toBe(1000);
    expect(version.source).toBe('manual');
    // round-trips through the port
    expect((await repo.getRecipe(recipe.recipeId))?.title).toBe('Vanilla');
    expect(await repo.getVersions(recipe.recipeId)).toHaveLength(1);
  });

  it('saveNewVersion appends a NEW immutable version; the prior version row is byte-for-byte untouched', async () => {
    const { db, repo } = seed();
    const { recipe } = await repo.createRecipe({
      ownerUserId: 'user-1', title: 'Vanilla',
      recipeInput: input(1000, [item('a', 'Milk', 600), item('b', 'Sugar', 400)]),
      trace: TRACE, by: 'user-1', capabilities: PRO,
    });
    const v1RowSnapshot = JSON.stringify(db.recipe_versions[0]);

    const v2 = await repo.saveNewVersion(
      recipe.recipeId, input(1500, [item('a', 'Milk', 900), item('b', 'Sugar', 600)]), TRACE, 'user-1',
    );

    expect(v2.versionNumber).toBe(2);
    expect(db.recipe_versions).toHaveLength(2);
    // v1 row is still exactly what it was — no in-place edit of history
    expect(JSON.stringify(db.recipe_versions[0])).toBe(v1RowSnapshot);
    // aggregate pointer advanced; saved_recipes mirrors the latest input
    expect(db.saved_recipe_meta[0]!.latest_version_number).toBe(2);
    expect((await repo.getRecipe(recipe.recipeId))?.latestVersionNumber).toBe(2);
    const v1 = await repo.getVersion(recipe.recipeId, 1);
    expect((v1!.recipeInput as unknown as { target_batch_grams: number }).target_batch_grams).toBe(1000);
  });

  it('restore appends a NEW latest version derived from an old snapshot; history is never rewound', async () => {
    const { db, repo } = seed();
    const { recipe } = await repo.createRecipe({
      ownerUserId: 'user-1', title: 'Vanilla',
      recipeInput: input(1000, [item('a', 'Milk', 600)]),
      trace: TRACE, by: 'user-1', capabilities: PRO,
    });
    await repo.saveNewVersion(recipe.recipeId, input(1500, [item('a', 'Milk', 900)]), TRACE, 'user-1');
    const historyBefore = JSON.stringify(db.recipe_versions.slice(0, 2));

    const v3 = await repo.restore(recipe.recipeId, 1, 'user-1', PRO);

    expect(v3.versionNumber).toBe(3);
    expect(v3.source).toBe('restored');
    expect(v3.restoredFromVersion).toBe(1);
    // v3 carries v1's values
    expect((v3.recipeInput as unknown as { target_batch_grams: number }).target_batch_grams).toBe(1000);
    // nothing deleted, and v1/v2 rows are byte-for-byte identical
    expect(db.recipe_versions).toHaveLength(3);
    expect(JSON.stringify(db.recipe_versions.slice(0, 2))).toBe(historyBefore);
    expect(db.saved_recipe_meta[0]!.latest_version_number).toBe(3);
  });

  it('the store refuses any UPDATE on recipe_versions (append-only, matching the DB grants)', async () => {
    const db = new FakeDB();
    db.recipe_versions.push({ id: 'rv-x', recipe_id: 'r', version_number: 1 });
    const client = makeClient(db, 'user-1');
    const res = (await (client
      .from('recipe_versions')
      .update({ version_number: 9 })
      .eq('id', 'rv-x') as unknown as PromiseLike<Result>)) as Result;
    expect(res.error).not.toBeNull();
    expect(db.recipe_versions[0]!.version_number).toBe(1);
  });

  it('a Supabase error surfaces as a thrown error — never a false "saved"', async () => {
    const { db, repo } = seed();
    db.failOn = { table: 'saved_recipes', op: 'insert' };
    await expect(
      repo.createRecipe({
        ownerUserId: 'user-1', title: 'Vanilla', recipeInput: input(1000, [item('a', 'Milk', 1000)]),
        trace: TRACE, by: 'user-1', capabilities: PRO,
      }),
    ).rejects.toThrow(/injected insert failure/);
    // nothing was persisted
    expect(db.saved_recipes).toHaveLength(0);
    expect(db.recipe_versions).toHaveLength(0);
  });

  it('must be signed in — no auth user throws before any write', async () => {
    const db = new FakeDB();
    const repo = supabaseRecipesRepository(makeClient(db, null));
    await expect(
      repo.createRecipe({
        ownerUserId: 'user-1', title: 'X', recipeInput: input(1000, [item('a', 'Milk', 1000)]),
        trace: TRACE, by: 'user-1', capabilities: PRO,
      }),
    ).rejects.toThrow(/signed in/i);
    expect(db.saved_recipes).toHaveLength(0);
  });

  it('capability gate: Demo cannot save; Home is limited to one active recipe (versions still work)', async () => {
    const { repo } = seed();
    await expect(
      repo.createRecipe({ ownerUserId: 'user-1', title: 'D', recipeInput: input(1000, [item('a', 'Milk', 1000)]), trace: TRACE, by: 'user-1', capabilities: DEMO }),
    ).rejects.toThrow(/cannot save/i);

    const { recipe } = await repo.createRecipe({ ownerUserId: 'user-1', title: 'Home', recipeInput: input(1000, [item('a', 'Milk', 1000)]), trace: TRACE, by: 'user-1', capabilities: HOME });
    await expect(
      repo.createRecipe({ ownerUserId: 'user-1', title: 'Second', recipeInput: input(500, [item('a', 'Milk', 500)]), trace: TRACE, by: 'user-1', capabilities: HOME }),
    ).rejects.toThrow(/limit reached/i);
    // but versioning the existing recipe is allowed
    const v2 = await repo.saveNewVersion(recipe.recipeId, input(1100, [item('a', 'Milk', 1100)]), TRACE, 'user-1');
    expect(v2.versionNumber).toBe(2);
  });

  it('restore is refused without the capability (and writes nothing)', async () => {
    const { db, repo } = seed();
    const { recipe } = await repo.createRecipe({ ownerUserId: 'user-1', title: 'V', recipeInput: input(1000, [item('a', 'Milk', 1000)]), trace: TRACE, by: 'user-1', capabilities: PRO });
    await expect(
      repo.restore(recipe.recipeId, 1, 'user-1', { ...PRO, canRestoreRecipeVersion: false }),
    ).rejects.toThrow(/cannot restore/i);
    expect(db.recipe_versions).toHaveLength(1);
  });

  it('rename + archive mutate the aggregate; owner isolation on list', async () => {
    const { repo } = seed();
    const { recipe } = await repo.createRecipe({ ownerUserId: 'user-1', title: 'Vanilla', recipeInput: input(1000, [item('a', 'Milk', 1000)]), trace: TRACE, by: 'user-1', capabilities: PRO });

    const renamed = await repo.renameRecipe(recipe.recipeId, '  Vanilla Base  ');
    expect(renamed.title).toBe('Vanilla Base');
    await expect(repo.renameRecipe(recipe.recipeId, '   ')).rejects.toThrow(/empty/i);

    await repo.archiveRecipe(recipe.recipeId, true);
    expect(await repo.listRecipes('user-1')).toHaveLength(0); // archived hidden by default
    expect(await repo.listRecipes('user-1', { includeArchived: true })).toHaveLength(1);
    expect(await repo.listRecipes('someone-else')).toHaveLength(0); // owner isolation
  });

  it('compare reports ingredient-line diffs between two versions', async () => {
    const { repo } = seed();
    const { recipe } = await repo.createRecipe({ ownerUserId: 'user-1', title: 'V', recipeInput: input(1000, [item('a', 'Milk', 600), item('b', 'Sugar', 400)]), trace: TRACE, by: 'user-1', capabilities: PRO });
    await repo.saveNewVersion(recipe.recipeId, input(1000, [item('a', 'Milk', 650), item('c', 'Cream', 350)]), TRACE, 'user-1');
    const cmp = await repo.compare(recipe.recipeId, 1, 2);
    const change = (k: string) => cmp.lines.find((l) => l.key === k)?.change;
    expect(change('a')).toBe('changed');
    expect(change('b')).toBe('removed');
    expect(change('c')).toBe('added');
  });

  /* ── S2 repair — atomic first save, retry-safe numbering, no orphans/alternation ── */

  it('S2: atomic first save — a FAILED meta insert leaves NO orphan (aggregate compensated away)', async () => {
    const { db, repo } = seed();
    db.failOn = { table: 'saved_recipe_meta', op: 'insert' };
    await expect(
      repo.createRecipe({ ownerUserId: 'user-1', title: 'a1', recipeInput: input(1000, [item('a', 'Milk', 1000)]), trace: TRACE, by: 'user-1', capabilities: PRO }),
    ).rejects.toThrow(/injected insert failure/);
    // no partial recipe remains anywhere
    expect(db.saved_recipes).toHaveLength(0);
    expect(db.saved_recipe_meta).toHaveLength(0);
    expect(db.recipe_versions).toHaveLength(0);
  });

  it('S2: atomic first save — a FAILED v1 insert leaves NO orphan (aggregate + meta compensated away)', async () => {
    const { db, repo } = seed();
    db.failOn = { table: 'recipe_versions', op: 'insert' };
    await expect(
      repo.createRecipe({ ownerUserId: 'user-1', title: 'a1', recipeInput: input(1000, [item('a', 'Milk', 1000)]), trace: TRACE, by: 'user-1', capabilities: PRO }),
    ).rejects.toThrow(/injected insert failure/);
    expect(db.saved_recipes).toHaveLength(0);
    expect(db.saved_recipe_meta).toHaveLength(0);
    expect(db.recipe_versions).toHaveLength(0);
  });

  it('S2: saveNewVersion retries on a concurrent UNIQUE violation → gap-free, duplicate-free numbering', async () => {
    const { db, repo } = seed();
    const { recipe } = await repo.createRecipe({ ownerUserId: 'user-1', title: 'r', recipeInput: input(1000, [item('a', 'Milk', 1000)]), trace: TRACE, by: 'user-1', capabilities: PRO });
    // First version insert loses the race (23505); the adapter recomputes the number and retries.
    db.failUniqueOnce = { table: 'recipe_versions', op: 'insert' };
    const v2 = await repo.saveNewVersion(recipe.recipeId, input(1100, [item('a', 'Milk', 1100)]), TRACE, 'user-1');
    expect(v2.versionNumber).toBe(2);
    expect(db.recipe_versions).toHaveLength(2);
    expect(db.saved_recipe_meta[0]!.latest_version_number).toBe(2);
  });

  it('S2: version numbering is DB-derived and survives a "reload" (a fresh adapter continues at v4, not v1)', async () => {
    const db = new FakeDB();
    const session1 = supabaseRecipesRepository(makeClient(db, 'user-1'));
    const { recipe } = await session1.createRecipe({ ownerUserId: 'user-1', title: 'r', recipeInput: input(1000, [item('a', 'Milk', 1000)]), trace: TRACE, by: 'user-1', capabilities: PRO });
    await session1.saveNewVersion(recipe.recipeId, input(1100, [item('a', 'Milk', 1100)]), TRACE, 'user-1'); // v2
    await session1.saveNewVersion(recipe.recipeId, input(1200, [item('a', 'Milk', 1200)]), TRACE, 'user-1'); // v3

    // A brand-new adapter instance (simulates reload / logout-login) over the SAME database.
    const session2 = supabaseRecipesRepository(makeClient(db, 'user-1'));
    const v4 = await session2.saveNewVersion(recipe.recipeId, input(1300, [item('a', 'Milk', 1300)]), TRACE, 'user-1');
    expect(v4.versionNumber).toBe(4); // continues from the DB, never resets to v1
    expect(db.recipe_versions).toHaveLength(4);
  });

  it('S2: repeated createRecipe never alternates — every save yields a NEW aggregate at v1', async () => {
    const { db, repo } = seed();
    for (const title of ['a1', 'a2', 'a3', 'a4']) {
      const { version } = await repo.createRecipe({ ownerUserId: 'user-1', title, recipeInput: input(1000, [item('a', 'Milk', 1000)]), trace: TRACE, by: 'user-1', capabilities: PRO });
      expect(version.versionNumber).toBe(1);
    }
    expect(db.saved_recipes.map((r) => r.name)).toEqual(['a1', 'a2', 'a3', 'a4']);
    expect(db.saved_recipes).toHaveLength(4);
    expect(db.saved_recipe_meta).toHaveLength(4);
    expect(db.recipe_versions).toHaveLength(4);
  });
});
