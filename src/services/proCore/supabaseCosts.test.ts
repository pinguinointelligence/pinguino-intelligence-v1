/**
 * Supabase CostsRepository adapter — fake-client unit tests (vitest node-env, no jsdom, no live IO).
 *
 * A minimal in-process fake SupabaseClient records inserts/updates/deletes and replays PostgREST
 * chaining (`.from().select().eq()`, `.insert().select().single()`, `.update().eq().select().maybeSingle()`,
 * `.delete().eq()`, `.auth.getUser()`). It deliberately returns Postgres `numeric` columns as STRINGS
 * (as PostgREST does) so the adapter's numeric coercion is exercised end-to-end.
 *
 * Headline proof: a cost snapshot stays immutable after ingredient prices later change — the adapter
 * only ever INSERTs snapshots (append-only) and never UPDATEs/DELETEs one, so a historical snapshot
 * is never re-priced.
 */
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NewCostEntry } from './inMemoryCosts';
import { supabaseCostsRepository } from './supabaseCosts';

type Row = Record<string, unknown>;
interface Store {
  entries: Row[];
  snapshots: Row[];
  seq: number;
  fail: string | null;
}
interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}

const NUMERIC: Record<'entries' | 'snapshots', readonly string[]> = {
  entries: ['purchase_quantity', 'density_g_per_ml', 'unit_weight_g', 'units_per_package', 'price', 'tax_rate_percent'],
  snapshots: ['total_cost', 'cost_per_kg'],
};

/** Deep-clone a stored row and stringify numeric columns, emulating PostgREST's numeric-as-string. */
function readback(table: 'entries' | 'snapshots', row: Row): Row {
  const clone = JSON.parse(JSON.stringify(row)) as Row;
  for (const col of NUMERIC[table]) {
    if (clone[col] != null) clone[col] = String(clone[col]);
  }
  return clone;
}

class FakeQuery {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: Row | null = null;
  private readonly filters: Array<[string, unknown]> = [];

  constructor(
    private readonly store: Store,
    private readonly table: 'entries' | 'snapshots',
  ) {}

  select(): this {
    return this;
  }
  insert(payload: Row): this {
    this.op = 'insert';
    this.payload = payload;
    return this;
  }
  update(payload: Row): this {
    this.op = 'update';
    this.payload = payload;
    return this;
  }
  delete(): this {
    this.op = 'delete';
    return this;
  }
  eq(col: string, val: unknown): this {
    this.filters.push([col, val]);
    return this;
  }
  single(): Promise<QueryResult> {
    return this.run('single');
  }
  maybeSingle(): Promise<QueryResult> {
    return this.run('maybe');
  }
  then(onFulfilled: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown): Promise<unknown> {
    return this.run('list').then(onFulfilled, onRejected);
  }

  private async run(mode: 'single' | 'maybe' | 'list'): Promise<QueryResult> {
    if (this.store.fail) return { data: null, error: { message: this.store.fail } };
    const rows = this.store[this.table];
    const matches = (r: Row): boolean => this.filters.every(([c, v]) => r[c] === v);

    if (this.op === 'insert') {
      const id = `${this.table}-${(this.store.seq += 1)}`;
      const stored: Row = { ...this.payload, id, created_at: '2026-07-12T10:00:00.000Z' };
      rows.push(stored);
      return { data: readback(this.table, stored), error: null };
    }
    if (this.op === 'update') {
      const found = rows.filter(matches);
      for (const r of found) Object.assign(r, this.payload);
      const first = found[0];
      return { data: first ? readback(this.table, first) : null, error: null };
    }
    if (this.op === 'delete') {
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        const r = rows[i];
        if (r && matches(r)) rows.splice(i, 1);
      }
      return { data: null, error: null };
    }
    const selected = rows.filter(matches).map((r) => readback(this.table, r));
    if (mode === 'list') return { data: selected, error: null };
    return { data: selected[0] ?? null, error: null };
  }
}

function makeStore(): Store {
  return { entries: [], snapshots: [], seq: 0, fail: null };
}

const AUTH_USER = 'user-1';

function makeClient(store: Store, opts: { authError?: string } = {}): SupabaseClient {
  const client = {
    auth: {
      getUser: async () =>
        opts.authError
          ? { data: { user: null }, error: { message: opts.authError } }
          : { data: { user: { id: AUTH_USER } }, error: null },
    },
    from: (relation: string) => new FakeQuery(store, relation === 'ingredient_cost_entries' ? 'entries' : 'snapshots'),
  };
  return client as unknown as SupabaseClient;
}

const FIXED_NOW = '2026-07-12T10:00:00.000Z';

const baseEntry = (over: Partial<NewCostEntry> = {}): NewCostEntry => ({
  ownerUserId: 'ignored-owner', // adapter stamps owner from auth, not from this field
  ingredientId: 'milk',
  ingredientName: 'Milk',
  supplier: 'Dairy Co',
  purchaseQuantity: 2,
  purchaseUnit: 'kg',
  densityGPerMl: null,
  unitWeightG: null,
  unitsPerPackage: null,
  price: 10,
  currency: 'EUR',
  priceIncludesTax: false,
  taxRatePercent: null,
  effectiveFrom: '2026-01-01',
  expiresAt: null,
  note: null,
  createdBy: 'ignored-creator',
  ...over,
});

const lines = [
  { ingredientId: 'milk', ingredientName: 'Milk', grams: 600 },
  { ingredientId: 'sugar', ingredientName: 'Sugar', grams: 400 },
];

describe('supabaseCostsRepository — entries', () => {
  it('stamps owner/created_by from auth, coerces numeric strings, lists owner-scoped', async () => {
    const store = makeStore();
    const repo = supabaseCostsRepository({ client: makeClient(store), now: () => FIXED_NOW });

    const e = await repo.addEntry(baseEntry());
    expect(e.entryId).toMatch(/^entries-/);
    expect(e.ownerUserId).toBe(AUTH_USER); // NOT the 'ignored-owner' in the input
    expect(e.createdBy).toBe(AUTH_USER);
    expect(e.price).toBe(10); // coerced from the PostgREST string '10'
    expect(typeof e.price).toBe('number');
    expect(e.purchaseQuantity).toBe(2);

    await repo.addEntry(baseEntry({ ingredientId: 'sugar', price: 2 }));
    expect(await repo.listEntries(AUTH_USER)).toHaveLength(2);
    expect(await repo.listEntries(AUTH_USER, 'sugar')).toHaveLength(1);
    expect(await repo.listEntries('someone-else')).toHaveLength(0); // owner-scoped
  });

  it('validates before inserting; a rejected entry writes nothing', async () => {
    const store = makeStore();
    const repo = supabaseCostsRepository({ client: makeClient(store), now: () => FIXED_NOW });
    await expect(repo.addEntry(baseEntry({ purchaseQuantity: 0 }))).rejects.toThrow(/greater than zero/i);
    await expect(repo.addEntry(baseEntry({ price: -1 }))).rejects.toThrow(/negative/i);
    await expect(repo.addEntry(baseEntry({ currency: 'eur' }))).rejects.toThrow(/ISO/i);
    expect(store.entries).toHaveLength(0);
  });

  it('updateEntry patches only provided columns and returns the updated entry', async () => {
    const store = makeStore();
    const repo = supabaseCostsRepository({ client: makeClient(store), now: () => FIXED_NOW });
    const e = await repo.addEntry(baseEntry({ price: 10 }));
    const updated = await repo.updateEntry(e.entryId, { price: 12, note: 'new supplier price' });
    expect(updated.price).toBe(12);
    expect(updated.note).toBe('new supplier price');
    expect(updated.ingredientId).toBe('milk'); // untouched
    expect(updated.ownerUserId).toBe(AUTH_USER); // identity never patched
  });

  it('updateEntry on an unknown/foreign id fails honestly', async () => {
    const store = makeStore();
    const repo = supabaseCostsRepository({ client: makeClient(store), now: () => FIXED_NOW });
    await expect(repo.updateEntry('entries-999', { price: 1 })).rejects.toThrow(/not found or is not owned/i);
  });

  it('deleteEntry removes the owner row', async () => {
    const store = makeStore();
    const repo = supabaseCostsRepository({ client: makeClient(store), now: () => FIXED_NOW });
    const e = await repo.addEntry(baseEntry());
    await repo.deleteEntry(e.entryId);
    expect(await repo.listEntries(AUTH_USER)).toHaveLength(0);
  });

  it('carries the resolving entry id through resolveCosts (provenance)', async () => {
    const store = makeStore();
    const repo = supabaseCostsRepository({ client: makeClient(store), now: () => FIXED_NOW });
    const e = await repo.addEntry(baseEntry({ ingredientId: 'milk', price: 10 }));
    const [res] = await repo.resolveCosts(AUTH_USER, ['milk'], { targetCurrency: 'EUR', basis: 'net', asOf: '2026-03-01' });
    expect(res).toMatchObject({ state: 'known', costPerKg: 5, entryId: e.entryId });
  });
});

describe('supabaseCostsRepository — snapshots are append-only & immutable', () => {
  const build = (repo: ReturnType<typeof supabaseCostsRepository>, asOf: string) =>
    repo.buildSnapshot({
      ownerUserId: AUTH_USER,
      recipeId: 'r',
      recipeVersionId: 'v1',
      lines,
      currency: 'EUR',
      basis: 'net',
      asOf,
      engineVersion: 'e1',
      configVersion: 'c1',
      by: AUTH_USER,
    });

  it('freezes historical cost — a LATER price change produces a NEW snapshot, old one never re-priced', async () => {
    const store = makeStore();
    const repo = supabaseCostsRepository({ client: makeClient(store), now: () => FIXED_NOW });
    await repo.addEntry(baseEntry({ ingredientId: 'milk', price: 10, effectiveFrom: '2026-01-01' })); // 5/kg
    await repo.addEntry(baseEntry({ ingredientId: 'sugar', price: 2, effectiveFrom: '2026-01-01' })); // 1/kg

    const first = await build(repo, '2026-03-01');
    expect(first.complete).toBe(true);
    expect(first.totalCost).toBeCloseTo(3.4, 10); // 600g@5 + 400g@1
    const firstJson = JSON.stringify(first);

    // milk price rises later — a whole new price entry
    await repo.addEntry(baseEntry({ ingredientId: 'milk', price: 20, effectiveFrom: '2026-06-01' })); // 10/kg
    const second = await build(repo, '2026-07-01');
    expect(second.totalCost).toBeCloseTo(6.4, 10); // 600g@10 + 400g@1
    expect(second.snapshotId).not.toBe(first.snapshotId);

    // append-only at the storage level: two distinct snapshot rows, first row untouched
    expect(store.snapshots).toHaveLength(2);
    expect(String(store.snapshots[0]?.total_cost)).toBe('3.4');
    expect(store.snapshots[0]?.id).toBe(first.snapshotId);

    // the historical snapshot, re-read, is byte-identical (never re-priced)
    const reread = await repo.getSnapshot(first.snapshotId, AUTH_USER);
    expect(JSON.stringify(reread)).toBe(firstJson);
    expect(reread?.totalCost).toBeCloseTo(3.4, 10);
  });

  it('editing an ingredient price never mutates an already-built snapshot', async () => {
    const store = makeStore();
    const repo = supabaseCostsRepository({ client: makeClient(store), now: () => FIXED_NOW });
    const milk = await repo.addEntry(baseEntry({ ingredientId: 'milk', price: 10, effectiveFrom: '2026-01-01' }));
    await repo.addEntry(baseEntry({ ingredientId: 'sugar', price: 2, effectiveFrom: '2026-01-01' }));
    const snap = await build(repo, '2026-03-01');
    const before = JSON.stringify(snap);

    // mutate the price list entry in place (entries ARE editable)
    await repo.updateEntry(milk.entryId, { price: 999 });

    // the frozen snapshot is unchanged
    const reread = await repo.getSnapshot(snap.snapshotId, AUTH_USER);
    expect(JSON.stringify(reread)).toBe(before);
    expect(reread?.totalCost).toBeCloseTo(3.4, 10);
  });

  it('is incomplete & honest when a cost is unknown', async () => {
    const store = makeStore();
    const repo = supabaseCostsRepository({ client: makeClient(store), now: () => FIXED_NOW });
    await repo.addEntry(baseEntry({ ingredientId: 'milk', price: 10 })); // sugar has no entry
    const snap = await build(repo, '2026-03-01');
    expect(snap.complete).toBe(false);
    expect(snap.totalCost).toBeNull();
    expect(snap.missingIngredientIds).toEqual(['sugar']);
  });

  it('E3: buildSnapshot prices a canonical line through its product-id ALIAS (keying fix)', async () => {
    const store = makeStore();
    const repo = supabaseCostsRepository({ client: makeClient(store), now: () => FIXED_NOW });
    // the user priced the PRODUCT they bought; the recipe line carries the canonical basement id
    await repo.addEntry(baseEntry({ ingredientId: 'PR-ING-000010', ingredientName: 'Nata', price: 8 })); // 4/kg
    const snap = await repo.buildSnapshot({
      ownerUserId: AUTH_USER, recipeId: 'r', recipeVersionId: 'v1',
      lines: [
        { ingredientId: 'PI-ING-000180', ingredientName: 'Nata (canonical)', grams: 500, aliasIds: ['PR-ING-000010'] },
        { ingredientId: 'PI-ING-000123', ingredientName: 'Inulina', grams: 100 }, // formulation-added, unpriced
      ],
      currency: 'EUR', basis: 'net', asOf: '2026-03-01', engineVersion: 'e1', configVersion: 'c1', by: AUTH_USER,
    });
    // alias resolved the canonical line; the unpriced PI-added line degrades to an explicit gap
    expect(snap.lines[0]).toMatchObject({ ingredientId: 'PI-ING-000180', costPerKg: 4, state: 'known' });
    expect(snap.complete).toBe(false);
    expect(snap.missingIngredientIds).toEqual(['PI-ING-000123']);
  });

  it('owner isolation on snapshots (getSnapshot + listSnapshots)', async () => {
    const store = makeStore();
    const repo = supabaseCostsRepository({ client: makeClient(store), now: () => FIXED_NOW });
    await repo.addEntry(baseEntry({ ingredientId: 'milk', price: 10 }));
    await repo.addEntry(baseEntry({ ingredientId: 'sugar', price: 2 }));
    const mine = await build(repo, '2026-03-01');
    expect(await repo.getSnapshot(mine.snapshotId, 'other-user')).toBeNull();
    expect(await repo.getSnapshot(mine.snapshotId, AUTH_USER)).not.toBeNull();
    expect(await repo.listSnapshots(AUTH_USER)).toHaveLength(1);
    expect(await repo.listSnapshots(AUTH_USER, { recipeId: 'nope' })).toHaveLength(0);
    expect(await repo.listSnapshots('other-user')).toHaveLength(0);
  });
});

describe('supabaseCostsRepository — honest failure', () => {
  it('surfaces a DB error as a thrown error (never a false success)', async () => {
    const store = makeStore();
    store.fail = 'db unavailable';
    const repo = supabaseCostsRepository({ client: makeClient(store), now: () => FIXED_NOW });
    await expect(repo.addEntry(baseEntry())).rejects.toThrow(/db unavailable/);
    await expect(repo.listEntries(AUTH_USER)).rejects.toThrow(/db unavailable/);
  });

  it('refuses to write when there is no signed-in user', async () => {
    const store = makeStore();
    const repo = supabaseCostsRepository({ client: makeClient(store, { authError: 'no session' }), now: () => FIXED_NOW });
    await expect(repo.addEntry(baseEntry())).rejects.toThrow(/no session/);
  });
});
