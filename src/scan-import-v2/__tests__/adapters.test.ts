import { describe, expect, it } from 'vitest';
import {
  candidateFromRow,
  createOfflineCache,
  createSupabaseV2Ports,
  type SupabaseLike,
} from '../adapters/supabaseAdapters';
import { runScanImportV2 } from '../pipeline';
import { scan } from './codeIdentity.test';
import { ctx } from './fakes';

const row = (over: Record<string, unknown> = {}) => ({
  id: '50c3d0e1-ca37-4891-a744-a3438d6b226a',
  current_version_id: 'v1',
  entity_kind: 'commercial_product',
  status: 'manual_unverified',
  provenance: 'product_add_request_admin_v1',
  display_name: 'Leche líquida entera Hacendado',
  brand: 'Hacendado',
  mapped_ingredient_id: null,
  markets: ['ES'],
  eans: ['8402001047251'],
  usable_in_base: true,
  main_allowed: false,
  usable_as_topping: false,
  blocked_reason: null,
  public_data: {
    productCode: 'PR-ING-007173',
    productIntelligence: { engineUsable: true, productBehaviorAuthority: {} },
  },
  private_price: null,
  private_currency: null,
  ...over,
});

function stub(
  rowsByQuery: Record<string, unknown[]>,
  extra: Partial<{
    preferred: string | null;
    slots: unknown[];
    upserts: unknown[];
    failWith: string;
  }> = {},
): SupabaseLike & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async rpc(fn, args) {
      calls.push(
        `${fn}:${JSON.stringify(args?.['p_query'] ?? args?.['p_mapper_ingredient_id'] ?? args?.['p_mapper_ingredient_ids'])}`,
      );
      if (extra.failWith) return { data: null, error: { message: extra.failWith } };
      if (fn === 'search_products_v1')
        return { data: rowsByQuery[String(args?.['p_query'])] ?? [], error: null };
      if (fn === 'get_user_preferred_product_for_slot_v1')
        return { data: extra.preferred ?? null, error: null };
      if (fn === 'resolve_country_product_slots_v1')
        return { data: extra.slots ?? [], error: null };
      return { data: null, error: { message: 'unknown rpc' } };
    },
    from() {
      return {
        async upsert(values, options) {
          (extra.upserts ??= []).push({ values, options });
          return { error: null };
        },
      };
    },
  };
}

describe('Supabase adapters (stub client) — one RPC row feeds catalogue, behaviour and price', () => {
  it('maps the real staging row shape to an exact candidate with evidence, and resolves end to end', async () => {
    const client = stub({ '8402001047251': [row()] });
    const p = createSupabaseV2Ports(client, { exactAuthority: 'search_rpc' });
    const r = await runScanImportV2(scan('8402001047251'), ctx({ accountId: 'user-1' }), {
      ...p,
      external: null,
      offlineCache: createOfflineCache(),
      externalTimeoutMs: 50,
    });
    expect(r).toMatchObject({
      kind: 'resolved_exact',
      product: {
        productId: '50c3d0e1-ca37-4891-a744-a3438d6b226a',
        productCode: 'PR-ING-007173',
        country: 'ES',
        strength: 'canonical_shared',
      },
      behaviour: { outcome: 'classified' },
      price: { state: 'missing' },
      import: { kind: 'existing_product', created: false },
    });
    expect(client.calls.filter((c) => c.startsWith('search_products_v1'))).toEqual([
      'search_products_v1:"8402001047251"',
    ]);
  });
  it('an RPC row matched by name/alias but not by EAN is not an identity', () => {
    expect(
      candidateFromRow(row({ eans: ['1111111111116'] }) as never, ['8402001047251']),
    ).toBeNull();
  });
  it('UPC-A tries both keys on the same path and keeps the matching catalogue EAN', async () => {
    const client = stub({
      '0036000291452': [row({ id: 'us', eans: ['0036000291452'], markets: ['US'] })],
    });
    const p = createSupabaseV2Ports(client, { exactAuthority: 'search_rpc' });
    const r = await runScanImportV2(scan('036000291452', 'UPC-A'), ctx(), {
      ...p,
      external: null,
      offlineCache: createOfflineCache(),
      externalTimeoutMs: 50,
    });
    expect(r).toMatchObject({
      kind: 'resolved_exact',
      product: { productId: 'us', ean: '0036000291452' },
      identity: { symbology: 'UPC-A' },
    });
    expect(client.calls.filter((c) => c.startsWith('search'))).toEqual([
      'search_products_v1:"036000291452"',
      'search_products_v1:"0036000291452"',
    ]);
  });
  it('guest has no exact path — explicit, never a silent empty resolution', async () => {
    const client = stub({ '8402001047251': [row()] });
    const p = createSupabaseV2Ports(client, { exactAuthority: 'search_rpc' });
    const r = await runScanImportV2(scan('8402001047251'), ctx({ accountId: null }), {
      ...p,
      external: null,
      offlineCache: createOfflineCache(),
      externalTimeoutMs: 50,
    });
    expect(r.kind).toBe('unknown');
    expect(client.calls).toEqual([]);
  });
  it('network failure on the RPC is failed:connection; other RPC errors are lookup_failed', async () => {
    const p1 = createSupabaseV2Ports(stub({}, { failWith: 'TypeError: fetch failed' }), {
      exactAuthority: 'search_rpc',
    });
    expect(
      await runScanImportV2(scan('8402001047251'), ctx(), {
        ...p1,
        external: null,
        offlineCache: createOfflineCache(),
        externalTimeoutMs: 50,
      }),
    ).toMatchObject({ kind: 'failed', code: 'connection' });
    const p2 = createSupabaseV2Ports(stub({}, { failWith: 'permission denied for function' }), {
      exactAuthority: 'search_rpc',
    });
    expect(
      await runScanImportV2(scan('8402001047251'), ctx(), {
        ...p2,
        external: null,
        offlineCache: createOfflineCache(),
        externalTimeoutMs: 50,
      }),
    ).toMatchObject({ kind: 'failed', code: 'lookup_failed' });
  });
  it('behaviour: lifecycleRejected → blocked; no product intelligence → review; price from the private overlay', async () => {
    const base = { external: null, offlineCache: createOfflineCache(), externalTimeoutMs: 50 };
    const blocked = createSupabaseV2Ports(
      stub({
        '8402001047251': [row({ public_data: { productCode: 'X', lifecycleRejected: true } })],
      }),
      { exactAuthority: 'search_rpc' },
    );
    expect(
      await runScanImportV2(scan('8402001047251'), ctx(), { ...blocked, ...base }),
    ).toMatchObject({ kind: 'needs_confirmation', reason: 'behaviour_blocked' });
    const review = createSupabaseV2Ports(
      stub({ '8402001047251': [row({ public_data: { productCode: 'X' } })] }),
      { exactAuthority: 'search_rpc' },
    );
    expect(
      await runScanImportV2(scan('8402001047251'), ctx(), { ...review, ...base }),
    ).toMatchObject({ kind: 'needs_confirmation', reason: 'behaviour_review' });
    const priced = createSupabaseV2Ports(
      stub({ '8402001047251': [row({ private_price: 4.2, private_currency: 'PLN' })] }),
      { exactAuthority: 'search_rpc' },
    );
    expect(
      await runScanImportV2(scan('8402001047251'), ctx(), { ...priced, ...base }),
    ).toMatchObject({
      kind: 'resolved_exact',
      price: { state: 'known', pricePerKg: 4.2, currency: 'PLN', source: 'private' },
    });
  });
  it('EAN twins at equal strength: preferred pointer, then same-country primary default, else ambiguous', async () => {
    const twins = [
      row({ id: 'A', markets: ['PL'], mapped_ingredient_id: 'PI-ING-000236' }),
      row({ id: 'B', markets: ['PL'], mapped_ingredient_id: 'PI-ING-000236' }),
    ];
    const base = { external: null, offlineCache: createOfflineCache(), externalTimeoutMs: 50 };
    const pref = createSupabaseV2Ports(stub({ '8402001047251': twins }, { preferred: 'B' }), {
      exactAuthority: 'search_rpc',
    });
    expect(await runScanImportV2(scan('8402001047251'), ctx(), { ...pref, ...base })).toMatchObject(
      { kind: 'resolved_exact', product: { productId: 'B' }, provenance: 'user_preferred' },
    );
    const country = createSupabaseV2Ports(
      stub(
        { '8402001047251': twins },
        {
          preferred: null,
          slots: [
            {
              id: 'A',
              resolution_source: 'COUNTRY_PRIMARY_DEFAULT',
              resolution_country: 'PL',
              display_name: 'A',
              eans: ['8402001047251'],
              entity_kind: 'commercial_product',
            },
          ],
        },
      ),
      { exactAuthority: 'search_rpc' },
    );
    expect(
      await runScanImportV2(scan('8402001047251'), ctx({ productCountry: 'PL' }), {
        ...country,
        ...base,
      }),
    ).toMatchObject({
      kind: 'resolved_exact',
      product: { productId: 'A' },
      provenance: 'country_default',
    });
    const foreign = createSupabaseV2Ports(
      stub(
        { '8402001047251': twins },
        {
          preferred: null,
          slots: [
            {
              id: 'A',
              resolution_source: 'COUNTRY_PRIMARY_DEFAULT',
              resolution_country: 'ES',
              display_name: 'A',
              eans: ['8402001047251'],
              entity_kind: 'commercial_product',
            },
          ],
        },
      ),
      { exactAuthority: 'search_rpc' },
    );
    expect(
      await runScanImportV2(scan('8402001047251'), ctx({ productCountry: 'PL' }), {
        ...foreign,
        ...base,
      }),
    ).toMatchObject({ kind: 'ambiguous' });
  });
  it('link import is idempotent by (user, product) and never creates a product', async () => {
    const extra: { upserts: unknown[] } = { upserts: [] };
    const client = stub({ '8402001047251': [row()] }, extra);
    const p = createSupabaseV2Ports(client, { exactAuthority: 'search_rpc' });
    const base = { external: null, offlineCache: createOfflineCache(), externalTimeoutMs: 50 };
    await runScanImportV2(scan('8402001047251'), ctx(), { ...p, ...base });
    await runScanImportV2(scan('8402001047251'), ctx(), { ...p, ...base });
    expect(extra.upserts).toHaveLength(2);
    expect(extra.upserts[0]).toMatchObject({
      values: {
        user_id: 'user-1',
        product_id: '50c3d0e1-ca37-4891-a744-a3438d6b226a',
        favorite: true,
      },
      options: { onConflict: 'user_id,product_id' },
    });
  });
  it('offline cache: entries expire by TTL and remember the version pointer', async () => {
    let t = 0;
    const cache = createOfflineCache({ now: () => t, ttlMs: 100 });
    const client = stub({ '8402001047251': [row()] });
    const p = createSupabaseV2Ports(client, { exactAuthority: 'search_rpc' });
    await runScanImportV2(scan('8402001047251'), ctx(), {
      ...p,
      external: null,
      offlineCache: cache,
      externalTimeoutMs: 50,
    });
    expect(cache.size()).toBe(1);
    t = 50;
    expect(
      await runScanImportV2(scan('8402001047251'), ctx({ online: false }), {
        ...p,
        external: null,
        offlineCache: cache,
        externalTimeoutMs: 50,
      }),
    ).toMatchObject({
      kind: 'resolved_exact',
      provenance: 'local_cache',
      product: { currentVersionId: 'v1' },
    });
    t = 500;
    expect(
      await runScanImportV2(scan('8402001047251'), ctx({ online: false }), {
        ...p,
        external: null,
        offlineCache: cache,
        externalTimeoutMs: 50,
      }),
    ).toMatchObject({ kind: 'offline' });
  });
});

const gtinRow = (over: Record<string, unknown> = {}) => ({
  product_id: '50c3d0e1-ca37-4891-a744-a3438d6b226a',
  product_code: 'PR-ING-007173',
  display_name: 'Leche líquida entera Hacendado',
  brand: 'Hacendado',
  matched_gtin: '8402001047251',
  matched_from: 'products',
  product_kind: 'commercial_product',
  entity_kind: 'commercial_product',
  visibility: 'shared',
  ownership: 'public',
  current_version_id: '44d44d53-dea8-4daa-af69-bd1583ab7e9a',
  verification_status: 'manual_unverified',
  product_country: 'ES',
  markets: ['ES'],
  mapper_ingredient_id: null,
  engine_usable: true,
  lifecycle_rejected: false,
  ...over,
});

function gtinStub(
  rowsByRole: { anon: unknown[]; user: unknown[] },
  role: 'anon' | 'user',
  upserts: unknown[] = [],
): SupabaseLike & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async rpc(fn, args) {
      calls.push(`${fn}:${String(args?.['p_gtin'] ?? args?.['p_query'] ?? '')}`);
      if (fn === 'resolve_exact_products_by_gtin_v1')
        return { data: role === 'anon' ? rowsByRole.anon : rowsByRole.user, error: null };
      if (fn === 'search_products_v1') return { data: [], error: null };
      return { data: null, error: { message: 'unknown rpc' } };
    },
    from() {
      return {
        async upsert(values, options) {
          upserts.push({ values, options });
          return { error: null };
        },
      };
    },
  };
}

describe('D8 — guest-safe exact resolver adapter (resolve_exact_products_by_gtin_v1)', () => {
  const base = () => ({
    external: null,
    offlineCache: createOfflineCache(),
    externalTimeoutMs: 50,
  });
  it('guest resolves a public canonical product with public fields only and zero writes', async () => {
    const upserts: unknown[] = [];
    const client = gtinStub({ anon: [gtinRow()], user: [gtinRow()] }, 'anon', upserts);
    const r = await runScanImportV2(scan('8402001047251'), ctx({ accountId: null }), {
      ...createSupabaseV2Ports(client),
      ...base(),
    });
    expect(r).toMatchObject({
      kind: 'resolved_exact',
      product: { productCode: 'PR-ING-007173', strength: 'canonical_shared', country: 'ES' },
      provenance: 'catalog',
      import: null,
      importSkipped: 'guest',
      behaviour: { outcome: 'classified' },
      price: { state: 'missing' },
    });
    expect(client.calls).toEqual(['resolve_exact_products_by_gtin_v1:8402001047251']);
    expect(upserts).toHaveLength(0);
    if (r.kind === 'resolved_exact')
      expect(Object.keys(r.product.evidence ?? {})).not.toEqual(
        expect.arrayContaining(['privatePrice', 'favorite', 'ownerId']),
      );
  });
  it('guest unknown → unknown; guest invalid checksum → invalid_code before any RPC', async () => {
    const client = gtinStub({ anon: [], user: [] }, 'anon');
    expect(
      await runScanImportV2(scan('4305615614434'), ctx({ accountId: null }), {
        ...createSupabaseV2Ports(client),
        ...base(),
      }),
    ).toMatchObject({ kind: 'unknown' });
    expect(
      await runScanImportV2(scan('8402001047252'), ctx({ accountId: null }), {
        ...createSupabaseV2Ports(client),
        ...base(),
      }),
    ).toMatchObject({ kind: 'invalid_code', reason: 'checksum' });
    expect(client.calls).toEqual(['resolve_exact_products_by_gtin_v1:4305615614434']);
  });
  it('a private/account-only twin is returned to its owner as own strength and never to a guest', async () => {
    const twin = gtinRow({
      product_id: 'priv',
      product_code: 'CA-ING-000001',
      entity_kind: 'customer_provisional',
      product_kind: 'customer_provisional',
      visibility: 'internal',
      ownership: 'own',
    });
    const rows = { anon: [gtinRow()], user: [gtinRow(), twin] };
    const guest = await runScanImportV2(scan('8402001047251'), ctx({ accountId: null }), {
      ...createSupabaseV2Ports(gtinStub(rows, 'anon')),
      ...base(),
    });
    expect(guest).toMatchObject({
      kind: 'resolved_exact',
      product: { productId: '50c3d0e1-ca37-4891-a744-a3438d6b226a' },
    });
    const owner = await runScanImportV2(scan('8402001047251'), ctx({ accountId: 'u' }), {
      ...createSupabaseV2Ports(gtinStub(rows, 'user')),
      ...base(),
    });
    // canonical shared beats the owner's provisional twin deterministically (strength, not ranking)
    expect(owner).toMatchObject({
      kind: 'resolved_exact',
      product: { productId: '50c3d0e1-ca37-4891-a744-a3438d6b226a', strength: 'canonical_shared' },
    });
  });
  it('two public equal-strength twins → ambiguous (no first-row-wins)', async () => {
    const rows = { anon: [gtinRow({ product_id: 'A' }), gtinRow({ product_id: 'B' })], user: [] };
    const r = await runScanImportV2(scan('8402001047251'), ctx({ accountId: null }), {
      ...createSupabaseV2Ports(gtinStub(rows, 'anon')),
      ...base(),
    });
    expect(r.kind).toBe('ambiguous');
  });
  it('browser and server paths yield the same canonical identity (same authority, same JWT scope)', async () => {
    const rows = { anon: [gtinRow()], user: [gtinRow()] };
    const a = await runScanImportV2(scan('8402001047251'), ctx({ accountId: null }), {
      ...createSupabaseV2Ports(gtinStub(rows, 'anon')),
      ...base(),
    });
    const b = await runScanImportV2(
      scan('8402001047251'),
      ctx({ accountId: 'u', surface: 'PRO' }),
      { ...createSupabaseV2Ports(gtinStub(rows, 'user')), ...base() },
    );
    expect(
      a.kind === 'resolved_exact' &&
        b.kind === 'resolved_exact' &&
        a.product.productId === b.product.productId,
    ).toBe(true);
  });
  it('guest offline: cached known resolves locally; uncached unknown is offline', async () => {
    const cache = createOfflineCache();
    const rows = { anon: [gtinRow()], user: [] };
    await runScanImportV2(scan('8402001047251'), ctx({ accountId: null }), {
      ...createSupabaseV2Ports(gtinStub(rows, 'anon')),
      external: null,
      offlineCache: cache,
      externalTimeoutMs: 50,
    });
    expect(
      await runScanImportV2(scan('8402001047251'), ctx({ accountId: null, online: false }), {
        ...createSupabaseV2Ports(gtinStub(rows, 'anon')),
        external: null,
        offlineCache: cache,
        externalTimeoutMs: 50,
      }),
    ).toMatchObject({ kind: 'resolved_exact', provenance: 'local_cache' });
    expect(
      await runScanImportV2(scan('5900820012434'), ctx({ accountId: null, online: false }), {
        ...createSupabaseV2Ports(gtinStub(rows, 'anon')),
        external: null,
        offlineCache: cache,
        externalTimeoutMs: 50,
      }),
    ).toMatchObject({ kind: 'offline' });
  });
});
