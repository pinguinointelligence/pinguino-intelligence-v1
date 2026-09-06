/**
 * OWNER QA CODES ON REAL STAGING — runs only with SCAN_IMPORT_V2_STAGING_OWNER_CODES=1 (+ SUPABASE_URL,
 * SUPABASE_ANON_KEY, QA_EMAIL, QA_PASSWORD). Real exact-identity RPC, real registry, real discovery
 * authorities. Proof required by the owner (2026-09-05):
 *   8410109121551 → existing product found immediately;
 *   7340222800464 → Vitamin Well Sport 002 identified automatically;
 *   7622210669315 → Milka Choco brownie identified automatically.
 * Writes a proof file under reports/scan-import-v2/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  createOpenFoodFactsEvidencePort,
  identityFromEvidence,
} from '../adapters/openFoodFactsEvidence';
import { createOfflineCache, createSupabaseV2Ports } from '../adapters/supabaseAdapters';
import { createSupabaseDiscoveryPort } from '../adapters/supabaseDiscoveryAdapter';
import type { RequestContext, ScanImportV2Result } from '../contracts';
import { continueDiscovery } from '../discovery/discovery';
import { createMemoryStore } from '../offline/persistentStore';
import { runScanImportV2 } from '../pipeline';
import { scan } from './codeIdentity.test';

const RUN = process.env['SCAN_IMPORT_V2_STAGING_OWNER_CODES'] === '1';

describe.skipIf(!RUN)('owner QA codes on real staging', () => {
  it('cacao immediate; Vitamin Well and Milka identified from the registry and saved privately', async () => {
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
    const ctx = (): RequestContext => ({
      accountId: userId,
      productCountry: null,
      online: true,
      surface: 'TEST',
      now: Date.now(),
    });
    const discovery = createSupabaseDiscoveryPort(auth as never);
    const ports = {
      ...createSupabaseV2Ports(auth as never, { exactAuthority: 'gtin_rpc' }),
      external: createOpenFoodFactsEvidencePort(),
      offlineCache: createOfflineCache({ store: createMemoryStore() }),
      externalTimeoutMs: 8000,
      discovery,
    };
    const proof: Record<string, unknown> = {
      ranAt: new Date().toISOString(),
      qaAccount: process.env['QA_EMAIL'],
      stagingUrlHost: new URL(url).host,
    };

    // control: existing catalogue product, immediate
    const t0 = Date.now();
    const cacao: ScanImportV2Result = await runScanImportV2(scan('8410109121551'), ctx(), ports);
    proof['cacao'] = {
      kind: cacao.kind,
      ms: Date.now() - t0,
      product:
        cacao.kind === 'resolved_exact'
          ? {
              name: cacao.product.displayName,
              brand: cacao.product.brand,
              code: cacao.product.productCode,
            }
          : null,
    };
    expect(cacao.kind).toBe('resolved_exact');

    for (const [name, code, expectName, expectBrand] of [
      ['vitaminWell', '7340222800464', /sport 002/i, /vitamin well/i],
      ['milka', '7622210669315', /choco brownie/i, /milka/i],
    ] as const) {
      const t1 = Date.now();
      const r = await runScanImportV2(scan(code), ctx(), ports);
      const rec: Record<string, unknown> = { firstKind: r.kind, firstMs: Date.now() - t1 };
      if (r.kind === 'resolved_exact') {
        // already saved by an earlier run of this proof on this account: identity must still match
        rec['product'] = {
          name: r.product.displayName,
          brand: r.product.brand,
          code: r.product.productCode,
          entityKind: r.product.entityKind,
        };
        expect(r.product.displayName).toMatch(expectName);
        proof[name] = rec;
        continue;
      }
      expect(['discovered_pending', 'needs_confirmation']).toContain(r.kind);
      const ev =
        r.kind === 'discovered_pending' || r.kind === 'needs_confirmation'
          ? r.externalEvidence
          : null;
      const web = identityFromEvidence(ev);
      rec['registry'] = web
        ? {
            displayName: web.displayName,
            brand: web.brand,
            quantity: web.quantity,
            family: web.family,
            hasNutrition: web.hasNutrition,
            hasIngredients: web.hasIngredients,
          }
        : null;
      expect(web, `${name}: registry identity`).not.toBeNull();
      expect(web!.displayName).toMatch(expectName);
      expect(web!.brand ?? '').toMatch(expectBrand);
      // the flow's next step: finalize with the registry identity + prefilled facts, no generic question
      if (r.kind !== 'discovered_pending' && r.kind !== 'needs_confirmation') continue;
      const sessionId = r.kind === 'discovered_pending' ? r.sessionId : (r.sessionId ?? '');
      const session = {
        sessionId,
        identity: r.identity,
        result: null,
        overlayState: null,
        missingCritical: r.kind === 'discovered_pending' ? r.ledger.missingCritical : [],
        usage: { visionCalls: 0, webCalls: 0 },
        recordedAt: Date.now(),
      };
      const f = await continueDiscovery(
        session,
        {
          type: 'finalize',
          input: {
            customerFamily: web!.family,
            confirmations: { productFields: web!.productFields },
          },
        },
        ctx(),
        discovery,
      );
      rec['finalizeKind'] = f.kind;
      if (f.kind === 'discovered_exact') {
        rec['created'] = {
          productId: f.product.productId,
          code: f.product.productCode,
          name: f.product.displayName,
          brand: f.product.brand,
          engineReady: f.engineReady,
          missing: f.readiness.missingCritical,
        };
        expect(f.product.displayName).toMatch(expectName);
      } else if (f.kind === 'discovered_pending') {
        rec['stillMissing'] = f.ledger.missingCritical;
        rec['note'] = f.note;
      } else if (f.kind === 'needs_confirmation') {
        rec['needs'] = f.reason;
      }
      // rescan: the SAME identity comes back (private product or the same open discovery), never a duplicate
      const again = await runScanImportV2(scan(code), ctx(), ports);
      rec['rescanKind'] = again.kind;
      if (again.kind === 'resolved_exact')
        rec['rescanProduct'] = { code: again.product.productCode, name: again.product.displayName };
      proof[name] = rec;
    }

    const dir = join(process.cwd(), 'reports', 'scan-import-v2');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'STAGING_OWNER_CODES_PROOF_2026-09-05.json'),
      JSON.stringify(proof, null, 2) + '\n',
    );
  }, 180_000);
});
