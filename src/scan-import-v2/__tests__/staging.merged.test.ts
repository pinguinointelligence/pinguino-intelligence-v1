/**
 * MERGED-STAGING ACCEPTANCE (owner authorization "SCAN IMPORT ACCEPTED — INTEGRATE", 2026-09-05).
 *
 * Runs only with SCAN_IMPORT_V2_STAGING_MERGED=1 plus SUPABASE_URL, SUPABASE_ANON_KEY, QA_EMAIL,
 * QA_PASSWORD in the environment (never committed). Proves, against the LIVE staging database with the
 * adapters of the merged tree:
 *   A. known product — exact resolution for the three seeded commercial products (signed-in) and the
 *      GUEST read-only exact lookup through resolve_exact_products_by_gtin_v1 (no search fallback);
 *   B. unknown product — the four real-photo identities (Milka, HARIBO, Cabreiroá, Nestea) keep the SAME
 *      durable request on a rescan from a NEW adapter instance, found through the request lookup only
 *      (startDiscovery consults findOwnRequest before any research, so no analysis budget is spent);
 *   C. offline / cache — an online resolution is served again offline from the persistent cache with
 *      provenance 'local_cache', and an uncached code offline is an honest 'offline' outcome.
 * Nothing is written: the importer is an in-memory recorder; no request is submitted; no research runs.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createOfflineCache, createSupabaseV2Ports } from '../adapters/supabaseAdapters';
import { createSupabaseDiscoveryPort } from '../adapters/supabaseDiscoveryAdapter';
import type { ImportPort, RequestContext, ScanImportV2Result } from '../contracts';
import { createMemoryStore } from '../offline/persistentStore';
import { runScanImportV2 } from '../pipeline';
import { scan } from './codeIdentity.test';

const RUN = process.env['SCAN_IMPORT_V2_STAGING_MERGED'] === '1';
const KNOWN = [
  { name: 'Hacendado', ean: '8402001047251' },
  { name: 'Łaciate', ean: '5900820012434' },
  { name: 'Alsace Lait', ean: '3262970109108' },
] as const;
const UNKNOWN_UPCA = '036000291452';
const LABEL_PROOF = 'STAGING_LABEL_PROOF_2026-09-05.json';

function ctx(accountId: string | null, online = true): RequestContext {
  return { accountId, productCountry: 'PL', online, surface: 'TEST', now: Date.now() };
}

describe.skipIf(!RUN)('Scan Import 2.0 — merged staging acceptance', () => {
  it('known / unknown-continuity / offline against live staging', async () => {
    const url = process.env['SUPABASE_URL']!;
    const key = process.env['SUPABASE_ANON_KEY']!;
    const auth = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signIn = await auth.auth.signInWithPassword({
      email: process.env['QA_EMAIL']!,
      password: process.env['QA_PASSWORD']!,
    });
    expect(signIn.error).toBeNull();
    const userId = signIn.data.user!.id;
    const recorder: ImportPort & { calls: string[] } = {
      calls: [],
      async importOrLink(input) {
        this.calls.push(input.product.productId);
        return {
          kind: 'existing_product',
          productId: input.product.productId,
          productCode: input.product.productCode,
          created: false,
        };
      },
    };
    const dir = join(process.cwd(), 'reports', 'scan-import-v2');
    const proof: Record<string, unknown> = {
      stagingUrlHost: new URL(url).host,
      ranAt: new Date().toISOString(),
      qaAccount: process.env['QA_EMAIL'],
      exactAuthority: 'gtin_rpc',
      readOnly: true,
      researchCalls: 0,
    };

    // ---- A. known products, signed-in, dedicated exact authority (no search fallback) ----
    const store = createMemoryStore();
    const cache = createOfflineCache({ store });
    const signedIn = {
      ...createSupabaseV2Ports(auth as never, { exactAuthority: 'gtin_rpc' }),
      importer: recorder,
      external: null,
      offlineCache: cache,
      externalTimeoutMs: 1000,
      discovery: createSupabaseDiscoveryPort(auth as never),
    };
    const known: Record<string, unknown> = {};
    for (const p of KNOWN) {
      const r: ScanImportV2Result = await runScanImportV2(scan(p.ean), ctx(userId), signedIn);
      expect(r.kind, p.name).toBe('resolved_exact');
      if (r.kind !== 'resolved_exact') continue;
      known[p.name] = {
        productId: r.product.productId,
        productCode: r.product.productCode,
        displayName: r.product.displayName,
        brand: r.product.brand,
        strength: r.product.strength,
        entityKind: r.product.entityKind,
        provenance: r.provenance,
        confidence: r.confidence,
        behaviour: r.behaviour,
        evidence: r.product.evidence,
        currentVersionId: r.product.currentVersionId,
      };
      expect(r.provenance).toBe('catalog');
      expect(r.product.strength).toBe('canonical_shared');
      expect(r.behaviour.outcome).toBe('classified');
    }
    proof['A_known_signedIn'] = known;
    // idempotent repeat resolves the same identity, and the link recorder saw one call per product
    const again = await runScanImportV2(scan(KNOWN[0].ean), ctx(userId), signedIn);
    expect(again.kind === 'resolved_exact' && again.product.productId).toBe(
      (known['Hacendado'] as { productId: string }).productId,
    );
    proof['A_repeat_same_identity'] = true;
    proof['A_linkCallsRecordedNotWritten'] = recorder.calls.length;

    // ---- A. GUEST exact lookup through the dedicated RPC only ----
    const guestClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const guestPorts = {
      ...createSupabaseV2Ports(guestClient as never, { exactAuthority: 'gtin_rpc' }),
      importer: recorder,
      external: null,
      offlineCache: createOfflineCache({ store: createMemoryStore() }),
      externalTimeoutMs: 1000,
    };
    const guest: Record<string, unknown> = {};
    for (const p of KNOWN) {
      const r = await runScanImportV2(scan(p.ean), ctx(null), guestPorts);
      expect(r.kind, `guest ${p.name}`).toBe('resolved_exact');
      if (r.kind === 'resolved_exact') {
        expect(r.product.productId).toBe((known[p.name] as { productId: string }).productId);
        expect(r.importSkipped).toBe('guest');
        guest[p.name] = { productId: r.product.productId, strength: r.product.strength };
      }
    }
    const guestUnknown = await runScanImportV2(scan(UNKNOWN_UPCA, 'UPC-A'), ctx(null), guestPorts);
    expect(guestUnknown.kind).toBe('unknown');
    const guestInvalid = await runScanImportV2(scan('4006381333932'), ctx(null), guestPorts);
    expect(guestInvalid.kind).toBe('invalid_code');
    proof['A_guest_rpc'] = {
      known: guest,
      unknownUpcA: guestUnknown.kind,
      invalid: guestInvalid.kind,
    };

    // ---- B. unknown-product continuity: same durable request from a NEW adapter instance, no research ----
    const recorded = JSON.parse(readFileSync(join(dir, LABEL_PROOF), 'utf8')) as {
      candidates: Record<string, { ean: string; step5_request?: { requestId?: string } }>;
    };
    const continuity: Record<string, unknown> = {};
    for (const [name, rec] of Object.entries(recorded.candidates)) {
      const expected = rec.step5_request?.requestId ?? null;
      const freshBrowser = {
        ...signedIn,
        discovery: createSupabaseDiscoveryPort(auth as never),
      };
      const r = await runScanImportV2(scan(rec.ean), ctx(userId), freshBrowser);
      continuity[name] = {
        ean: rec.ean,
        kind: r.kind,
        requestId: r.kind === 'discovery_requested' ? r.requestId : null,
        status: r.kind === 'discovery_requested' ? r.status : null,
        stage: r.kind === 'discovery_requested' ? r.stage : null,
        expectedRequestId: expected,
        sameIdentity: r.kind === 'discovery_requested' && r.requestId === expected,
        canonical: r.kind === 'discovery_requested' ? r.canonical : null,
        engineReady: r.kind === 'discovery_requested' ? r.engineReady : null,
      };
      expect(r.kind, name).toBe('discovery_requested');
      if (r.kind === 'discovery_requested') {
        expect(r.requestId, name).toBe(expected);
        expect(r.canonical).toBe(false);
        expect(r.engineReady).toBe(false);
      }
    }
    proof['B_rescan_same_request'] = continuity;

    // ---- C. offline: cached identity served from the persistent store, uncached is honest 'offline' ----
    const offlineHit = await runScanImportV2(scan(KNOWN[0].ean), ctx(userId, false), signedIn);
    expect(offlineHit.kind).toBe('resolved_exact');
    if (offlineHit.kind === 'resolved_exact') {
      expect(offlineHit.provenance).toBe('local_cache');
      expect(offlineHit.product.productId).toBe(
        (known['Hacendado'] as { productId: string }).productId,
      );
      expect(offlineHit.importSkipped).toBe('offline');
    }
    const offlineMiss = await runScanImportV2(scan('4305615614434'), ctx(userId, false), signedIn);
    expect(offlineMiss.kind).toBe('offline');
    proof['C_offline'] = {
      cachedHit: offlineHit.kind === 'resolved_exact' ? offlineHit.provenance : offlineHit.kind,
      uncachedMiss: offlineMiss.kind,
      storeKeys: (await store.keys('')).length,
    };

    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'STAGING_MERGED_ACCEPTANCE_2026-09-05.json'),
      JSON.stringify(proof, null, 2) + '\n',
    );
  }, 300_000);
});
