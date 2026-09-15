import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  candidateFromGtinRow,
  exactLookupQueries,
  exactResolverVerdict,
  exactRowsWithRetry,
  parseGtinExactRows,
  type ExactLookupIdentity,
  type GtinExactRow,
} from './gtinExactResolver';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const ANALYZE = read('supabase/functions/product-scan-analyze/index.ts');
const ADAPTER = read('src/scan-import-v2/adapters/supabaseAdapters.ts');
const EXACT_RESOLVER = read('src/features/product-scanner/gtinExactResolver.ts');
const DISCOVERY_ADAPTER = read('src/scan-import-v2/adapters/supabaseDiscoveryAdapter.ts');
const SQL = read('supabase/migrations/20260915170000_scanner_1_4_single_exact_authority.sql');
const ATOMIC_SQL = read(
  'supabase/migrations/20260915173000_scanner_1_4_atomic_exact_snapshot.sql',
);

const row = (over: Partial<GtinExactRow> = {}): GtinExactRow => ({
  product_id: 'pr-1',
  product_code: 'PR-ING-007306',
  display_name: 'Cola Zero Zero',
  brand: 'Hacendado',
  matched_gtin: '8402001042928',
  matched_from: 'products',
  product_kind: 'commercial_product',
  entity_kind: 'commercial_product',
  visibility: 'shared',
  ownership: 'public',
  current_version_id: 'version-1',
  verification_status: 'verified',
  product_country: 'ES',
  markets: ['ES'],
  mapper_ingredient_id: null,
  engine_usable: true,
  lifecycle_rejected: false,
  is_active: true,
  merged_into_product_id: null,
  current_version_facts: { productIntelligence: { engineUsable: true } },
  ...over,
});

const identity = (over: Partial<ExactLookupIdentity> = {}): ExactLookupIdentity => ({
  symbology: 'EAN-13',
  canonicalGtin13: '8402001042928',
  lookupKeys: ['8402001042928'],
  rawValue: '8402001042928',
  ...over,
});

describe('Scanner 1.4 — one exact GELLATTI authority', () => {
  it('SCN-1.4-01 public/shared PR is an exact product and preserves current version', () => {
    const candidate = candidateFromGtinRow(row());
    expect(candidate).toMatchObject({
      productId: 'pr-1',
      productCode: 'PR-ING-007306',
      strength: 'canonical_shared',
      currentVersionId: 'version-1',
    });
    expect(exactResolverVerdict(candidate ? [candidate] : [])).toMatchObject({
      kind: 'EXACT_PRODUCT',
    });
  });

  it('SCN-1.4-02 own private PM is exact for its caller-scoped RPC result', () => {
    const candidate = candidateFromGtinRow(
      row({
        product_id: 'pm-1',
        product_code: 'PM-ING-007301',
        product_kind: 'customer_provisional',
        entity_kind: 'customer_provisional',
        visibility: 'account_private',
        ownership: 'own',
      }),
    );
    expect(candidate).toMatchObject({ productId: 'pm-1', strength: 'provisional_linked' });
    expect(exactResolverVerdict(candidate ? [candidate] : [])).toMatchObject({
      kind: 'EXACT_PRODUCT',
    });
  });

  it('SCN-1.4-03 hides another user private PM at the response boundary', () => {
    expect(
      candidateFromGtinRow(
        row({
          product_kind: 'customer_provisional',
          entity_kind: 'customer_provisional',
          visibility: 'account_private',
          ownership: 'public',
        }),
      ),
    ).toBeNull();
  });

  it('SCN-1.4-04 returns NO_EXACT_PRODUCT for current no-match rows', () => {
    expect(exactResolverVerdict([])).toEqual({ kind: 'NO_EXACT_PRODUCT' });
  });

  it('SCN-1.4-05 EAN-13 uses only its canonical exact query', () => {
    expect(exactLookupQueries(identity())).toEqual([{ gtin: '8402001042928', symbology: null }]);
  });

  it('SCN-1.4-06 EAN-8 canonical alias uses the raw EAN-8 query only as fallback', () => {
    expect(
      exactLookupQueries(
        identity({
          symbology: 'EAN-8',
          canonicalGtin13: '0000094152210',
          lookupKeys: ['94152210', '0000094152210'],
          rawValue: '94152210',
        }),
      ),
    ).toEqual([
      { gtin: '0000094152210', symbology: null },
      { gtin: '94152210', symbology: 'EAN-8' },
    ]);
    expect(SQL).toMatch(/left\(p_gtin, 5\) = '00000'[\s\S]*substr\(p_gtin, 6\)/);
  });

  it('SCN-1.4-07 UPC-A canonical alias contract is explicit', () => {
    expect(
      exactLookupQueries(
        identity({
          symbology: 'UPC-A',
          canonicalGtin13: '0036000291452',
          lookupKeys: ['036000291452', '0036000291452'],
          rawValue: '036000291452',
        }),
      ),
    ).toEqual([
      { gtin: '0036000291452', symbology: null },
      { gtin: '036000291452', symbology: 'UPC-A' },
    ]);
  });

  it('SCN-1.4-08 UPC-E canonical alias contract uses expanded UPC-A', () => {
    expect(
      exactLookupQueries(
        identity({
          symbology: 'UPC-E',
          canonicalGtin13: '0042100005264',
          lookupKeys: ['01234565', '042100005264', '0042100005264'],
          rawValue: '01234565',
        }),
      ),
    ).toEqual([
      { gtin: '0042100005264', symbology: null },
      { gtin: '042100005264', symbology: 'UPC-E' },
    ]);
  });

  it('SCN-1.4-09 Mapper EAN is not a user-facing product exact result', () => {
    expect(
      candidateFromGtinRow(
        row({
          product_kind: 'mapper_reference',
          entity_kind: 'pi_base',
          visibility: 'internal',
          ownership: 'public',
          matched_gtin: '7613033694134',
        }),
      ),
    ).toBeNull();
    expect(SQL).not.toMatch(/(?:insert|update|delete|from)\s+public\.mapper_basement/i);
  });

  it('SCN-1.4-10 preserves deterministic shared-over-private collision precedence', () => {
    const shared = candidateFromGtinRow(row({ product_id: 'shared' }));
    const privateProduct = candidateFromGtinRow(
      row({
        product_id: 'private',
        product_kind: 'customer_provisional',
        entity_kind: 'customer_provisional',
        visibility: 'account_private',
        ownership: 'own',
      }),
    );
    expect(exactResolverVerdict([privateProduct!, shared!])).toMatchObject({
      kind: 'EXACT_PRODUCT',
      product: { productId: 'shared' },
    });
  });

  it('SCN-1.4-11 exposes duplicate equal-authority collision instead of first-row-wins', () => {
    const a = candidateFromGtinRow(row({ product_id: 'shared-a' }));
    const b = candidateFromGtinRow(row({ product_id: 'shared-b' }));
    expect(exactResolverVerdict([a!, b!])).toMatchObject({
      kind: 'EXACT_CONFLICT',
      candidates: [{ productId: 'shared-a' }, { productId: 'shared-b' }],
    });
    expect(SQL).not.toMatch(/limit\s+20/i);
  });

  it('SCN-1.4-12 exact lookup is observational and has no in-lookup self-heal or direct catalog identity read', () => {
    const exactFunction = ANALYZE.slice(
      ANALYZE.indexOf('async function exactProductForBarcode'),
      ANALYZE.indexOf(
        '/**\n * RE-EVALUATE',
        ANALYZE.indexOf('async function exactProductForBarcode'),
      ),
    );
    expect(exactFunction).not.toContain('canonicalize_ean_identity_v1');
    expect(exactFunction).not.toContain("from('products')");
    expect(exactFunction).not.toContain("from('product_variants')");
    expect(exactFunction).not.toContain('.insert(');
    expect(exactFunction).not.toContain('.update(');
    expect(ANALYZE).toContain('exactRowsWithRetry');
  });

  it('SCN-1.4-13 exact verdict precedes persistence and every later paid/research seam', () => {
    const verdict = ANALYZE.indexOf('const exact = exactLookup.kind');
    const insert = ANALYZE.indexOf(".from('product_scan_sessions').insert");
    const reserve = ANALYZE.indexOf('reserve_product_scan_ean_lookup_v1');
    const off = ANALYZE.indexOf('DIRECT GTIN LOOKUP');
    const research = ANALYZE.indexOf('intimport-enrich');
    expect(verdict).toBeGreaterThan(-1);
    expect(verdict).toBeLessThan(insert);
    expect(verdict).toBeLessThan(reserve);
    expect(verdict).toBeLessThan(off);
    expect(verdict).toBeLessThan(research);
  });

  it('SCN-1.4-14 exact conflict stops before session persistence and fallback', () => {
    expect(ANALYZE).toContain("kind: 'EXACT_CONFLICT'");
    expect(ANALYZE).toContain("error: 'exact_product_conflict'");
    expect(ANALYZE).toContain("error: 'exact_resolver_unavailable'");
  });

  it('SCN-1.4-15 no exact reaches later fallback only after NO_EXACT_PRODUCT', () => {
    expect(ANALYZE).toContain("if (exactLookup.kind === 'EXACT_CONFLICT')");
    expect(ANALYZE).toContain("const exact = exactLookup.kind === 'EXACT_PRODUCT'");
    expect(ANALYZE).toContain("if (mode === 'ean_lookup')");
    expect(ANALYZE).toContain('DIRECT GTIN LOOKUP');
  });

  it('SCN-1.4-16 browser adapter and analyze consume the same query helper and RPC', () => {
    expect(ADAPTER).toContain('exactLookupQueries(identity)');
    expect(ANALYZE).toContain('exactLookupQueries(identity)');
    expect(ANALYZE).toContain('exactRowsWithRetry');
    expect(EXACT_RESOLVER).toContain("client.rpc('resolve_exact_products_by_gtin_v1'");
  });

  it('SCN-1.4-17 SQL excludes inactive, merged, superseded and non-published products', () => {
    expect(SQL).toContain('p.is_active');
    expect(SQL).toContain('p.merged_into_product_id is null');
    expect(SQL).toContain('p.current_version_id');
    expect(SQL).toContain('product_publication_identity_eligible_v1(pv.facts)');
  });

  it('SCN-1.4-18 SQL exact matching remains equality-only and retains current-version authority', () => {
    expect(SQL).toContain('p.ean_code_normalized = any(v_keys)');
    expect(SQL).toContain('v.ean = any(v_keys)');
    expect(SQL).not.toMatch(/\b(?:like|ilike)\b/i);
    expect(SQL).toContain('p.current_version_id');
  });

  it('SCN-1.4-19 stale runs remain guarded by the existing ScanRunAuthority', () => {
    expect(DISCOVERY_ADAPTER).toContain('assertScanRunCurrent(ctx)');
  });

  it('SCN-1.4-20 product-created-later state cannot become historical exact evidence', () => {
    // The exact authority consumes only the current RPC row/version; it has no created-at or
    // session-history input with which to retroactively rewrite an earlier scan.
    const first = candidateFromGtinRow(row({ current_version_id: 'version-at-scan' }));
    expect(first).toMatchObject({ currentVersionId: 'version-at-scan' });
    expect(exactResolverVerdict(first ? [first] : [])).toMatchObject({ kind: 'EXACT_PRODUCT' });
  });

  it('SCN-1.4-21 malformed or null RPC data is ERROR, never NO_EXACT_PRODUCT', () => {
    expect(() => parseGtinExactRows(null)).toThrow(/MALFORMED_RESPONSE/);
    expect(() => parseGtinExactRows([{ product_id: 'missing-contract-fields' }])).toThrow(
      /MALFORMED_RESPONSE/,
    );
    expect(exactResolverVerdict([])).toEqual({ kind: 'NO_EXACT_PRODUCT' });
  });

  it('SCN-1.4-22 retries one transient exact lookup and never retries authorization failure', async () => {
    const rowResult = row();
    let attempts = 0;
    const transient = {
      rpc: vi.fn(async () => {
        attempts += 1;
        return attempts === 1
          ? { data: null, error: { message: 'timeout' } }
          : { data: [rowResult], error: null };
      }),
    };
    await expect(
      exactRowsWithRetry(transient, { gtin: rowResult.matched_gtin, symbology: null }),
    ).resolves.toHaveLength(1);
    expect(transient.rpc).toHaveBeenCalledTimes(2);

    const forbidden = { rpc: vi.fn(async () => ({ data: null, error: { message: 'permission denied' } })) };
    await expect(
      exactRowsWithRetry(forbidden, { gtin: rowResult.matched_gtin, symbology: null }),
    ).rejects.toThrow(/permission denied/);
    expect(forbidden.rpc).toHaveBeenCalledTimes(1);

    const thrownForbidden = {
      rpc: vi.fn(async () => {
        throw new Error('RLS permission denied');
      }),
    };
    await expect(
      exactRowsWithRetry(thrownForbidden, { gtin: rowResult.matched_gtin, symbology: null }),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE', retryable: false });
    expect(thrownForbidden.rpc).toHaveBeenCalledTimes(1);
  });

  it('SCN-1.4-23 exact state is explicit: unavailable and not-applicable cannot unlock fallback', () => {
    expect(ANALYZE).toContain("kind: 'ERROR'");
    expect(ANALYZE).toContain("kind: 'NOT_APPLICABLE'");
    expect(ANALYZE).toContain("if (exactLookup.kind === 'ERROR')");
    expect(ANALYZE).toContain("exactLookup.kind === 'NO_EXACT_PRODUCT'");
    expect(EXACT_RESOLVER).toContain('parseGtinExactRows');
    expect(ANALYZE).toContain('exactRowsWithRetry');
  });

  it('SCN-1.4-24 exact product facts and identity come from the same RPC snapshot', () => {
    expect(ANALYZE).toContain('current_version_facts');
    expect(ANALYZE).not.toContain("from('product_versions')");
    expect(ATOMIC_SQL).toContain('current_version_facts jsonb');
    expect(ATOMIC_SQL).toContain(
      'join public.product_versions pv on pv.id=p.current_version_id and pv.product_id=p.id',
    );
    expect(ATOMIC_SQL).toContain('pv.facts');
    expect(ATOMIC_SQL).toContain('p.is_active');
    expect(ATOMIC_SQL).toContain('p.merged_into_product_id is null');
  });

  it('SCN-1.4-25 session read/write errors remain errors and cannot create a false no-match path', () => {
    expect(ANALYZE).toContain("error: 'scan_session_read_failed'");
    expect(ANALYZE).toContain("error: 'scan_session_update_failed'");
    expect(ANALYZE).toContain("error: 'scan_asset_metadata_failed'");
  });

  it('SCN-1.4-26 offline positive cache is a local hint, never an authoritative exact verdict', () => {
    const pipeline = read('src/scan-import-v2/pipeline.ts');
    expect(pipeline).toContain("kind: 'offline'");
    expect(pipeline).toContain('knownLocally: true');
    expect(pipeline).not.toContain("provenance: 'local_cache'");
  });

  it('SCN-1.4-27 no negative exact verdict is persisted in the offline cache', () => {
    const pipeline = read('src/scan-import-v2/pipeline.ts');
    expect(pipeline).toContain('await ports.offlineCache.invalidate');
    expect(pipeline).not.toMatch(/resolution\.kind === 'none'[\s\S]{0,500}offlineCache\.put/);
  });

  it('SCN-1.4-28 exact response exposes the same canonical identity and lifecycle facts', () => {
    for (const field of [
      'canonicalGtin',
      'productCode',
      'currentVersionId',
      'ownership',
      'visibility',
      'isActive',
      'mergedIntoProductId',
    ])
      expect(ANALYZE).toContain(field);
  });
});
