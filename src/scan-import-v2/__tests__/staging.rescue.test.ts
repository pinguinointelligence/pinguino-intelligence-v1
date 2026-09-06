/**
 * SERVED RESCUE GOLDENS ON REAL STAGING — runs only with SCAN_IMPORT_V2_STAGING_OWNER_CODES=1 (+ SUPABASE_URL,
 * SUPABASE_ANON_KEY, QA_EMAIL, QA_PASSWORD, QA_EMAIL_ALT/QA_PASSWORD_ALT). Real research, recognition,
 * Mapper/Rescue, ProductBehavior, readiness and the one-EAN product authority.
 *
 *   R1 Vitamin Well 7340222800464 — an own private not-ready product is re-enriched automatically:
 *      the SAME provisional product becomes engine-usable (version superseded), no duplicate.
 *   R2 Milka 7622210669315 — same, topping-ready.
 *   R3 second account scans the same GTIN: it is linked to the SAME provisional product (distinct customers 2),
 *      never a second exact commercial identity.
 *   R4 same account rescans: exact resolution returns the same product, usable.
 * Writes reports/scan-import-v2/STAGING_RESCUE_PROOF_2026-09-05.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { reenrichOwnProvisional } from '../../features/scan-flow/reenrichment';
import { createOpenFoodFactsEvidencePort } from '../adapters/openFoodFactsEvidence';
import { createOfflineCache, createSupabaseV2Ports } from '../adapters/supabaseAdapters';
import { createSupabaseDiscoveryPort } from '../adapters/supabaseDiscoveryAdapter';
import type { ExactCandidate, RequestContext, ScanImportV2Result } from '../contracts';
import type { DiscoveryPort } from '../discovery/contracts';
import { identifyCode } from '../codeIdentity';
import { createMemoryStore } from '../offline/persistentStore';
import { runScanImportV2 } from '../pipeline';
import { scan } from './codeIdentity.test';

const RUN = process.env['SCAN_IMPORT_V2_STAGING_OWNER_CODES'] === '1';
type Ports = Parameters<typeof runScanImportV2>[2];
interface Account {
  email: string;
  ctx: () => RequestContext;
  ports: Ports;
  discovery: DiscoveryPort;
}
const proof: Record<string, unknown> = { ranAt: new Date().toISOString() };
let main: Account;

async function signedIn(email: string, password: string): Promise<Account | null> {
  const url = process.env['SUPABASE_URL']!;
  const key = process.env['SUPABASE_ANON_KEY']!;
  const auth = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await auth.auth.signInWithPassword({ email, password });
  if (signIn.error || !signIn.data.user) return null;
  const userId = signIn.data.user.id;
  const discovery = createSupabaseDiscoveryPort(auth as never);
  return {
    email,
    ctx: () => ({
      accountId: userId,
      productCountry: null,
      online: true,
      surface: 'TEST',
      now: Date.now(),
    }),
    discovery,
    ports: {
      ...createSupabaseV2Ports(auth as never, { exactAuthority: 'gtin_rpc' }),
      external: createOpenFoodFactsEvidencePort(),
      offlineCache: createOfflineCache({ store: createMemoryStore() }),
      externalTimeoutMs: 8000,
      discovery,
    },
  };
}

function foundProduct(r: ScanImportV2Result): ExactCandidate | null {
  if (r.kind === 'resolved_exact') return r.product;
  if (r.kind === 'needs_confirmation' && r.reason !== 'family_confirmation' && r.product)
    return r.product;
  return null;
}
const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v ?? null));

async function rescueGolden(tag: string, code: string, expectName: RegExp) {
  const rec: Record<string, unknown> = { code };
  proof[tag] = rec;
  const before = await runScanImportV2(scan(code), main.ctx(), main.ports);
  const beforeProduct = foundProduct(before);
  rec['before'] = {
    kind: before.kind,
    product: beforeProduct
      ? {
          code: beforeProduct.productCode,
          name: beforeProduct.displayName,
          engineReady: beforeProduct.engineReady,
          entityKind: beforeProduct.entityKind,
        }
      : plain(before),
  };
  expect(beforeProduct, `${tag}: exact product before`).not.toBeNull();
  expect(beforeProduct!.displayName).toMatch(expectName);
  if (!beforeProduct!.engineReady) {
    const id = identifyCode(scan(code));
    if (!id.ok) throw new Error('code');
    const upgraded = await reenrichOwnProvisional({
      identity: id.identity,
      ctx: main.ctx(),
      ports: main.ports,
    });
    rec['reenrichment'] = upgraded
      ? {
          kind: upgraded.kind,
          engineReady: upgraded.kind === 'discovered_exact' ? upgraded.engineReady : null,
          product:
            upgraded.kind === 'discovered_exact'
              ? { code: upgraded.product.productCode, name: upgraded.product.displayName }
              : null,
          detail:
            upgraded.kind === 'discovered_pending'
              ? { missing: upgraded.ledger.missingCritical, note: upgraded.note }
              : upgraded.kind === 'needs_confirmation'
                ? upgraded.reason
                : null,
        }
      : null;
    expect(
      upgraded?.kind,
      `${tag}: re-enrichment ${JSON.stringify(rec['reenrichment']).slice(0, 400)}`,
    ).toBe('discovered_exact');
    if (upgraded?.kind === 'discovered_exact') {
      expect(upgraded.engineReady, `${tag}: engine ready after rescue`).toBe(true);
      expect(upgraded.product.productCode, `${tag}: same product, no duplicate`).toBe(
        beforeProduct!.productCode,
      );
    }
  }
  const after = await runScanImportV2(scan(code), main.ctx(), main.ports);
  const afterProduct = foundProduct(after);
  rec['after'] = {
    kind: after.kind,
    product: afterProduct
      ? {
          code: afterProduct.productCode,
          name: afterProduct.displayName,
          engineReady: afterProduct.engineReady,
        }
      : plain(after),
  };
  expect(afterProduct, `${tag}: exact product after`).not.toBeNull();
  expect(afterProduct!.productCode).toBe(beforeProduct!.productCode);
  expect(afterProduct!.displayName).toMatch(expectName);
  expect(afterProduct!.engineReady, `${tag}: usable after rescue (${after.kind})`).toBe(true);
  expect(after.kind).toBe('resolved_exact');
}

describe.skipIf(!RUN)('served rescue goldens on real staging', () => {
  beforeAll(async () => {
    const acc = await signedIn(process.env['QA_EMAIL']!, process.env['QA_PASSWORD']!);
    expect(acc, 'QA sign-in').not.toBeNull();
    main = acc!;
    proof['qaAccount'] = main.email;
  });

  it('R1 Vitamin Well: own private not-ready product is rescued to engine-usable, same product', async () => {
    await rescueGolden('r1', '7340222800464', /sport 002/i);
  }, 240_000);

  it('R2 Milka Choco brownie: own private not-ready product is rescued to usable, same product', async () => {
    await rescueGolden('r2', '7622210669315', /choco brownie/i);
  }, 240_000);

  it('R3 a second account scanning the same GTIN is linked to the SAME product — no duplicate identity', async () => {
    const alt = await signedIn(
      process.env['QA_EMAIL_ALT'] ?? 'test1@test1.com',
      process.env['QA_PASSWORD_ALT'] ?? process.env['QA_PASSWORD']!,
    );
    expect(alt, 'alt sign-in').not.toBeNull();
    const rec: Record<string, unknown> = { account: alt!.email, code: '7340222800464' };
    proof['r3'] = rec;
    const first = await runScanImportV2(scan('7340222800464'), alt!.ctx(), alt!.ports);
    rec['firstKind'] = first.kind;
    let product = foundProduct(first);
    if (!product) {
      // not linked yet: the normal path — research, recognition, Mapper/Rescue, one-EAN upsert (links, never duplicates)
      const id = identifyCode(scan('7340222800464'));
      if (!id.ok) throw new Error('code');
      const outcome = await reenrichOwnProvisional({
        identity: id.identity,
        ctx: alt!.ctx(),
        ports: alt!.ports,
      });
      rec['outcome'] = outcome
        ? {
            kind: outcome.kind,
            product:
              outcome.kind === 'discovered_exact'
                ? { code: outcome.product.productCode, name: outcome.product.displayName }
                : null,
            detail:
              outcome.kind === 'discovered_pending'
                ? {
                    missing: outcome.ledger.missingCritical,
                    note: outcome.note,
                    identity: outcome.ledger.identity,
                    sources: outcome.ledger.sourcesUsed,
                  }
                : outcome.kind === 'needs_confirmation'
                  ? outcome.reason
                  : null,
          }
        : null;
      expect(outcome?.kind, JSON.stringify(rec['outcome'])).toBe('discovered_exact');
      product = outcome && outcome.kind === 'discovered_exact' ? outcome.product : null;
    }
    expect(product).not.toBeNull();
    rec['product'] = { code: product!.productCode, name: product!.displayName };
    const mainSide = foundProduct(
      await runScanImportV2(scan('7340222800464'), main.ctx(), main.ports),
    );
    expect(mainSide?.productCode, 'both accounts resolve the same exact product').toBe(
      product!.productCode,
    );
  }, 240_000);

  it('R4 same account rescans: identical product code, usable', async () => {
    const a = foundProduct(await runScanImportV2(scan('7622210669315'), main.ctx(), main.ports));
    const b = foundProduct(await runScanImportV2(scan('7622210669315'), main.ctx(), main.ports));
    proof['r4'] = { a: a?.productCode, b: b?.productCode, engineReady: b?.engineReady };
    expect(a?.productCode).toBe(b?.productCode);
    expect(b?.engineReady).toBe(true);
  }, 120_000);

  it('writes the proof file', () => {
    const dir = join(process.cwd(), 'reports', 'scan-import-v2');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'STAGING_RESCUE_PROOF_2026-09-05.json'),
      JSON.stringify(proof, null, 2) + '\n',
    );
  });
});
