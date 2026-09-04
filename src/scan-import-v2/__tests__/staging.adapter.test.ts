/**
 * REAL STAGING READ PROOF — runs only with SCAN_IMPORT_V2_STAGING=1 plus SUPABASE_URL, SUPABASE_ANON_KEY,
 * QA_EMAIL, QA_PASSWORD in the environment (never committed). Read-only: the importer is an in-memory
 * recorder; nothing is written to staging. Writes a proof file under reports/scan-import-v2/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createOfflineCache, createSupabaseV2Ports } from '../adapters/supabaseAdapters';
import type { ImportPort, ScanImportV2Result } from '../contracts';
import { runScanImportV2 } from '../pipeline';
import { scan } from './codeIdentity.test';

const RUN = process.env['SCAN_IMPORT_V2_STAGING'] === '1';
const REAL = [
  { name: 'Hacendado', ean: '8402001047251' },
  { name: 'Łaciate', ean: '5900820012434' },
  { name: 'Alsace Lait', ean: '3262970109108' },
] as const;

describe.skipIf(!RUN)('Scan Import 2.0 against STAGING (read-only)', () => {
  it('resolves the three real products, reports an unknown code honestly, and shows the guest scope', async () => {
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
    const real = createSupabaseV2Ports(auth as never);
    const ports = {
      ...real,
      importer: recorder,
      external: null,
      offlineCache: createOfflineCache(),
      externalTimeoutMs: 1000,
    };
    const results: Record<string, unknown> = {};
    for (const p of REAL) {
      const r: ScanImportV2Result = await runScanImportV2(
        scan(p.ean),
        { accountId: userId, productCountry: 'PL', online: true, surface: 'TEST', now: Date.now() },
        ports,
      );
      results[p.name] =
        r.kind === 'resolved_exact'
          ? {
              found: true,
              kind: r.kind,
              productId: r.product.productId,
              productCode: r.product.productCode,
              displayName: r.product.displayName,
              brand: r.product.brand,
              strength: r.product.strength,
              entityKind: r.product.entityKind,
              country: r.product.country,
              mapperSlotId: r.product.mapperSlotId,
              behaviour: r.behaviour.outcome,
              price: r.price.state,
              evidence: r.product.evidence,
              provenance: r.provenance,
              confidence: r.confidence,
              currentVersionId: r.product.currentVersionId,
            }
          : { found: r.kind !== 'unknown', kind: r.kind, detail: r };
      expect(r.kind, p.name).toBe('resolved_exact');
    }
    const unknown = await runScanImportV2(
      scan('4305615614434'),
      { accountId: userId, productCountry: 'PL', online: true, surface: 'TEST', now: Date.now() },
      ports,
    );
    expect(unknown.kind).toBe('unknown');
    const again = await runScanImportV2(
      scan('8402001047251'),
      { accountId: userId, productCountry: 'PL', online: true, surface: 'TEST', now: Date.now() },
      ports,
    );
    expect(again.kind === 'resolved_exact' && again.product.productId).toBe(
      (results['Hacendado'] as { productId: string }).productId,
    );
    const guestClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const guest = await runScanImportV2(
      scan('8402001047251'),
      { accountId: null, productCountry: 'PL', online: true, surface: 'TEST', now: Date.now() },
      {
        ...createSupabaseV2Ports(guestClient as never),
        importer: recorder,
        external: null,
        offlineCache: createOfflineCache(),
        externalTimeoutMs: 1000,
      },
    );
    expect(guest.kind).toBe('unknown');
    const proof = {
      stagingUrlHost: new URL(url).host,
      ranAt: new Date().toISOString(),
      qaAccount: process.env['QA_EMAIL'],
      readOnly: true,
      linkCallsRecordedNotWritten: recorder.calls.length,
      results,
      unknownCode: { ean: '4305615614434', kind: unknown.kind },
      guest: { kind: guest.kind },
    };
    const dir = join(process.cwd(), 'reports', 'scan-import-v2');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'STAGING_READ_PROOF_2026-09-04.json'),
      JSON.stringify(proof, null, 2) + '\n',
    );
  }, 60_000);
});
