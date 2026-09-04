import { describe, expect, it } from 'vitest';
import {
  createOfflineCache,
  createSupabaseV2Ports,
  type SupabaseLike,
} from '../adapters/supabaseAdapters';
import {
  createMemoryStore,
  createWebStorageStore,
  type WebStorageLike,
} from '../offline/persistentStore';
import { runScanImportV2 } from '../pipeline';
import { scan } from './codeIdentity.test';
import { ctx } from './fakes';

function fakeStorage(): WebStorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}
const gtinRow = (over: Record<string, unknown> = {}) => ({
  product_id: 'P-HAC',
  product_code: 'PR-ING-007173',
  display_name: 'Leche líquida entera Hacendado',
  brand: 'Hacendado',
  matched_gtin: '8402001047251',
  matched_from: 'products',
  product_kind: 'commercial_product',
  entity_kind: 'commercial_product',
  visibility: 'shared',
  ownership: 'public',
  current_version_id: 'v1',
  verification_status: 'manual_unverified',
  product_country: 'ES',
  markets: ['ES'],
  mapper_ingredient_id: null,
  engine_usable: true,
  lifecycle_rejected: false,
  ...over,
});
function client(rows: unknown[], upserts: unknown[] = []): SupabaseLike {
  return {
    async rpc(fn) {
      return { data: fn === 'resolve_exact_products_by_gtin_v1' ? rows : [], error: null };
    },
    from() {
      return {
        async upsert(v, o) {
          upserts.push({ v, o });
          return { error: null };
        },
      };
    },
  };
}
const base = (cache: ReturnType<typeof createOfflineCache>) => ({
  external: null,
  offlineCache: cache,
  externalTimeoutMs: 50,
});

describe('Persistent offline cache (Web Storage backend, reload-safe)', () => {
  it('online exact resolution persists; a RELOAD (new cache over the same storage) resolves the same identity offline', async () => {
    const storage = fakeStorage();
    const c1 = createOfflineCache({ store: createWebStorageStore(storage) });
    const online = await runScanImportV2(scan('8402001047251'), ctx(), {
      ...createSupabaseV2Ports(client([gtinRow()])),
      ...base(c1),
    });
    expect(online).toMatchObject({ kind: 'resolved_exact', product: { productId: 'P-HAC' } });
    expect(storage.map.size).toBe(1);
    const c2 = createOfflineCache({ store: createWebStorageStore(storage) }); // app state recreated
    const offline = await runScanImportV2(scan('8402001047251'), ctx({ online: false }), {
      ...createSupabaseV2Ports(client([])),
      ...base(c2),
    });
    expect(offline).toMatchObject({
      kind: 'resolved_exact',
      provenance: 'local_cache',
      product: { productId: 'P-HAC', productCode: 'PR-ING-007173', currentVersionId: 'v1' },
      importSkipped: 'offline',
    });
  });
  it('offline unknown stays OFFLINE, never unknown-as-if-answered', async () => {
    const c = createOfflineCache({ store: createWebStorageStore(fakeStorage()) });
    expect(
      await runScanImportV2(scan('5900820012434'), ctx({ online: false }), {
        ...createSupabaseV2Ports(client([])),
        ...base(c),
      }),
    ).toMatchObject({ kind: 'offline', knownLocally: false });
  });
  it('an expired entry is not trusted (deleted), a schema mismatch is not trusted', async () => {
    let t = 1_000;
    const storage = fakeStorage();
    const c = createOfflineCache({
      store: createWebStorageStore(storage),
      now: () => t,
      ttlMs: 100,
    });
    await runScanImportV2(scan('8402001047251'), ctx(), {
      ...createSupabaseV2Ports(client([gtinRow()])),
      ...base(c),
    });
    t = 2_000;
    expect(
      await runScanImportV2(scan('8402001047251'), ctx({ online: false }), {
        ...createSupabaseV2Ports(client([])),
        ...base(c),
      }),
    ).toMatchObject({ kind: 'offline' });
    expect(storage.map.size).toBe(0);
    storage.setItem(
      'scan-import-v2:v1:user-1:8402001047251',
      JSON.stringify({ schema: 1, entry: {}, resolvedAt: t, versionId: 'v0', accountId: 'user-1' }),
    );
    expect(await c.get('user-1', '8402001047251')).toBeNull();
  });
  it('version mismatch / stale identity: an online resolution with a newer version overwrites; invalidateIfStale drops a stale entry', async () => {
    const storage = fakeStorage();
    const c = createOfflineCache({ store: createWebStorageStore(storage) });
    await runScanImportV2(scan('8402001047251'), ctx(), {
      ...createSupabaseV2Ports(client([gtinRow({ current_version_id: 'v1' })])),
      ...base(c),
    });
    expect(await c.invalidateIfStale('user-1', '8402001047251', 'v1')).toBe(false);
    expect(await c.invalidateIfStale('user-1', '8402001047251', 'v2')).toBe(true);
    expect(await c.get('user-1', '8402001047251')).toBeNull();
    await runScanImportV2(scan('8402001047251'), ctx(), {
      ...createSupabaseV2Ports(client([gtinRow({ current_version_id: 'v2' })])),
      ...base(c),
    });
    expect((await c.get('user-1', '8402001047251'))?.candidate.currentVersionId).toBe('v2');
    expect(await c.size()).toBe(1);
  });
  it("account separation and guest separation: one account's entry is invisible to another account and to guests; no private leak", async () => {
    const storage = fakeStorage();
    const c = createOfflineCache({ store: createWebStorageStore(storage) });
    const privateRow = gtinRow({
      product_id: 'CA-PRIV',
      product_code: 'CA-ING-1',
      entity_kind: 'customer_provisional',
      product_kind: 'customer_provisional',
      visibility: 'internal',
      ownership: 'own',
    });
    await runScanImportV2(scan('8402001047251'), ctx({ accountId: 'user-1' }), {
      ...createSupabaseV2Ports(client([privateRow])),
      ...base(c),
    });
    expect(
      await runScanImportV2(scan('8402001047251'), ctx({ accountId: 'user-2', online: false }), {
        ...createSupabaseV2Ports(client([])),
        ...base(c),
      }),
    ).toMatchObject({ kind: 'offline' });
    expect(
      await runScanImportV2(scan('8402001047251'), ctx({ accountId: null, online: false }), {
        ...createSupabaseV2Ports(client([])),
        ...base(c),
      }),
    ).toMatchObject({ kind: 'offline' });
    expect(
      await runScanImportV2(scan('8402001047251'), ctx({ accountId: 'user-1', online: false }), {
        ...createSupabaseV2Ports(client([])),
        ...base(c),
      }),
    ).toMatchObject({ kind: 'resolved_exact', product: { productId: 'CA-PRIV' } });
    for (const raw of storage.map.values())
      expect(raw).not.toMatch(/privatePrice|favorite|owner_user_id/);
  });
  it('no duplicate identity: repeated online resolutions keep exactly one entry per account and code', async () => {
    const c = createOfflineCache({ store: createMemoryStore() });
    const p = { ...createSupabaseV2Ports(client([gtinRow()])), ...base(c) };
    for (let i = 0; i < 3; i += 1) await runScanImportV2(scan('8402001047251'), ctx(), p);
    expect(await c.size()).toBe(1);
  });
  it('a broken storage backend degrades to no cache, never to an exception', async () => {
    const broken: WebStorageLike = {
      getItem: () => {
        throw new Error('disabled');
      },
      setItem: () => {
        throw new Error('disabled');
      },
      removeItem: () => {
        throw new Error('disabled');
      },
      key: () => null,
      length: 0,
    };
    const c = createOfflineCache({ store: createWebStorageStore(broken) });
    expect(
      await runScanImportV2(scan('8402001047251'), ctx(), {
        ...createSupabaseV2Ports(client([gtinRow()])),
        ...base(c),
      }),
    ).toMatchObject({ kind: 'resolved_exact' });
    expect(
      await runScanImportV2(scan('8402001047251'), ctx({ online: false }), {
        ...createSupabaseV2Ports(client([])),
        ...base(c),
      }),
    ).toMatchObject({ kind: 'offline' });
  });
});
