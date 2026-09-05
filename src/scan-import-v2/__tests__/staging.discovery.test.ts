/**
 * REAL STAGING DISCOVERY PROOF — SCAN_IMPORT_V2_STAGING_DISCOVERY=1 plus SUPABASE_URL, SUPABASE_ANON_KEY,
 * QA_EMAIL, QA_PASSWORD. Exercises the unknown-product flow through the EXISTING staging authorities for a
 * genuinely unknown code: scan-session research (one bounded exact-source lookup), finalize without a
 * profile (must refuse honestly — no product created), and, only with SCAN_IMPORT_V2_STAGING_WRITE=1, the
 * durable product-request candidate. Writes a proof file (no keys).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createOfflineCache, createSupabaseV2Ports } from '../adapters/supabaseAdapters';
import { createSupabaseDiscoveryPort } from '../adapters/supabaseDiscoveryAdapter';
import { continueDiscovery } from '../discovery/discovery';
import type { ImportPort, ScanImportV2Result } from '../contracts';
import { runScanImportV2 } from '../pipeline';
import { scan } from './codeIdentity.test';

const RUN = process.env['SCAN_IMPORT_V2_STAGING_DISCOVERY'] === '1';
const WRITE = process.env['SCAN_IMPORT_V2_STAGING_WRITE'] === '1';
const UNKNOWN = '4305615614434';

describe.skipIf(!RUN)('Scan Import 2.0 unknown-product flow against STAGING', () => {
  it('starts discovery for a genuinely unknown code through the real scan-session authority and refuses to create a product without a profile', async () => {
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
    const recorder: ImportPort & { calls: unknown[] } = {
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
    const discovery = createSupabaseDiscoveryPort(auth as never);
    const ports = {
      ...createSupabaseV2Ports(auth as never, { exactAuthority: 'search_rpc' }),
      importer: recorder,
      external: null,
      offlineCache: createOfflineCache(),
      externalTimeoutMs: 20_000,
      discovery,
    };
    const c = {
      accountId: userId,
      productCountry: 'PL',
      online: true,
      surface: 'TEST' as const,
      now: Date.now(),
    };
    const started: ScanImportV2Result = await runScanImportV2(scan(UNKNOWN), c, ports);
    const proof: Record<string, unknown> = {
      ranAt: new Date().toISOString(),
      qaAccount: process.env['QA_EMAIL'],
      gtin: UNKNOWN,
      started: { kind: started.kind },
    };
    expect(['discovered_pending', 'discovery_requested']).toContain(started.kind);
    if (started.kind === 'discovered_pending') {
      proof['started'] = {
        kind: started.kind,
        stage: started.stage,
        next: started.next,
        evidenceError: started.evidenceError,
        note: started.note,
        sessionId: started.sessionId,
        identity: started.ledger.identity,
        factSources: started.ledger.sourcesUsed,
        factCount: started.ledger.facts.length,
        conflicts: started.ledger.conflicts.length,
        missingCritical: started.ledger.missingCritical,
      };
      const session = {
        sessionId: started.sessionId,
        identity: started.identity,
        result: null,
        overlayState: null,
        missingCritical: started.ledger.missingCritical,
        usage: { visionCalls: 0, webCalls: 0 },
      };
      const fin = await continueDiscovery(
        session,
        { type: 'finalize', input: { customerFamily: 'other', privateOverlay: {} } },
        c,
        discovery,
      );
      proof['finalizeWithoutProfile'] = {
        kind: fin.kind,
        note: fin.kind === 'discovered_pending' ? fin.note : null,
      };
      expect(['discovered_pending', 'needs_confirmation', 'failed']).toContain(fin.kind);
      expect(fin.kind).not.toBe('discovered_exact');
      if (WRITE) {
        const req = await continueDiscovery(session, { type: 'request' }, c, discovery);
        proof['request'] =
          req.kind === 'discovery_requested'
            ? { kind: req.kind, requestId: req.requestId, status: req.status, stage: req.stage }
            : { kind: req.kind };
        const again = await runScanImportV2(scan(UNKNOWN), { ...c, now: Date.now() }, ports);
        proof['rescanAfterRequest'] = {
          kind: again.kind,
          requestId: again.kind === 'discovery_requested' ? again.requestId : null,
        };
        expect(again.kind).toBe('discovery_requested');
      }
    }
    expect(recorder.calls).toHaveLength(0);
    const dir = join(process.cwd(), 'reports', 'scan-import-v2');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'STAGING_DISCOVERY_PROOF_2026-09-05.json'),
      JSON.stringify(proof, null, 2) + '\n',
    );
  }, 120_000);
});
