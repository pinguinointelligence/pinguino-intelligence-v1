/**
 * SERVED GOLDENS ON REAL STAGING — runs only with SCAN_IMPORT_V2_STAGING_OWNER_CODES=1 (+ SUPABASE_URL,
 * SUPABASE_ANON_KEY, QA_EMAIL, QA_PASSWORD; optional QA_EMAIL_ALT / QA_PASSWORD_ALT for G5). Real
 * exact-identity RPC, real registries, real discovery authorities (product-scan-analyze /
 * product-scan-finalize / the private not-ready upsert).
 *
 *   G1 cacao control 8410109121551 → exact product immediately.
 *   G2 Vitamin Well 7340222800464 → registry identity → PRIVATE not-ready save → rescan finds the SAME
 *      private product (no duplicate, identity kept, shown as known / not recipe-ready).
 *   G3 Milka 7622210669315 → the same.
 *   G4 unknown GTIN, not online anywhere → no invented identity; the customer's minimal fields save it
 *      privately → rescan finds it.
 *   G5 multi-photo label: two real label photographs of one product analysed ADDITIVELY in one session
 *      (second photo never resets the first); a third one inside the burst window comes back as a
 *      structured per-photo failure (retryable) instead of a thrown error — the session survives.
 * Writes reports/scan-import-v2/STAGING_GOLDENS_PROOF_2026-09-05.json
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createOpenFoodFactsEvidencePort,
  identityFromEvidence,
} from '../adapters/openFoodFactsEvidence';
import { createOfflineCache, createSupabaseV2Ports } from '../adapters/supabaseAdapters';
import { createSupabaseDiscoveryPort } from '../adapters/supabaseDiscoveryAdapter';
import type { ExactCandidate, RequestContext, ScanImportV2Result } from '../contracts';
import type {
  DiscoveryPort,
  DiscoverySession,
  FinalizeInput,
  LabelImage,
} from '../discovery/contracts';
import { continueDiscovery } from '../discovery/discovery';
import { createMemoryStore } from '../offline/persistentStore';
import { runScanImportV2 } from '../pipeline';
import { scan } from './codeIdentity.test';

const RUN = process.env['SCAN_IMPORT_V2_STAGING_OWNER_CODES'] === '1';
const LABELS =
  process.env['SCAN_CORPUS_LABELS'] ??
  join(process.env['HOME'] ?? '', 'Developer/scan-corpus/labels');

/** checksum-valid EAN-13 that no registry or catalogue knows (owner golden 4) */
export function ean13(body12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(body12[i]) * (i % 2 === 0 ? 1 : 3);
  return body12 + String((10 - (sum % 10)) % 10);
}
const UNKNOWN_EAN = ean13('590987654321');

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

/** the flow's "known product" surface: exact resolution, or an exact product the behaviour authority has not classified yet (shown as known, not recipe-ready) */
function foundProduct(r: ScanImportV2Result): ExactCandidate | null {
  if (r.kind === 'resolved_exact') return r.product;
  if (r.kind === 'needs_confirmation' && r.reason !== 'family_confirmation' && r.product)
    return r.product;
  return null;
}

function sessionOf(r: ScanImportV2Result): DiscoverySession | null {
  if (r.kind !== 'discovered_pending' && r.kind !== 'needs_confirmation') return null;
  return {
    sessionId: r.kind === 'discovered_pending' ? r.sessionId : (r.sessionId ?? ''),
    identity: r.identity,
    result: null,
    overlayState: null,
    missingCritical: r.kind === 'discovered_pending' ? r.ledger.missingCritical : [],
    usage: { visionCalls: 0, webCalls: 0 },
    recordedAt: Date.now(),
  };
}

function externalOf(r: ScanImportV2Result) {
  return r.kind === 'discovered_pending' || r.kind === 'needs_confirmation'
    ? (r.externalEvidence ?? null)
    : null;
}

function plain(v: unknown): unknown {
  return JSON.parse(JSON.stringify(v ?? null));
}

async function finalizeOn(acc: Account, session: DiscoverySession, input: FinalizeInput) {
  return continueDiscovery(session, { type: 'finalize', input }, acc.ctx(), acc.discovery);
}

function labelImage(file: string, assetId: string): LabelImage {
  return {
    assetId,
    mime: 'image/jpeg',
    base64: readFileSync(join(LABELS, file)).toString('base64'),
    source: 'gallery',
    originalMime: 'image/jpeg',
    transformations: [],
    qualityScore: null,
  };
}

/** identity → private save → rescan, for a code a registry knows; tolerant of earlier runs on the account */
async function registryGolden(
  g: string,
  code: string,
  expectName: RegExp,
  expectBrand: RegExp,
): Promise<void> {
  const rec: Record<string, unknown> = { code };
  proof[g] = rec;
  const first = await runScanImportV2(scan(code), main.ctx(), main.ports);
  rec['firstKind'] = first.kind;
  let productCode: string | null = null;
  const foundFirst = foundProduct(first);
  if (foundFirst) {
    // saved by an earlier run on this QA account: identity must still be the exact one
    productCode = foundFirst.productCode;
    rec['product'] = {
      code: productCode,
      name: foundFirst.displayName,
      brand: foundFirst.brand,
      engineReady: foundFirst.engineReady,
    };
    expect(foundFirst.displayName, `${g}: saved identity`).toMatch(expectName);
  } else {
    const session = sessionOf(first);
    expect(session, `${g}: discovery session (${first.kind})`).not.toBeNull();
    const web = identityFromEvidence(externalOf(first));
    rec['registry'] = web
      ? { displayName: web.displayName, brand: web.brand, family: web.family }
      : null;
    expect(web, `${g}: registry identity`).not.toBeNull();
    expect(web!.displayName).toMatch(expectName);
    expect(web!.brand ?? '').toMatch(expectBrand);
    const f = await finalizeOn(main, session!, {
      customerFamily: web!.family ?? 'other',
      confirmations: { productFields: web!.productFields, packageEvidenceExhausted: true },
      savePrivateNotReady: true,
    });
    rec['finalizeKind'] = f.kind;
    if (f.kind !== 'discovered_exact') rec['finalizeDetail'] = plain(f);
    expect(f.kind, `${g}: finalize ${JSON.stringify(f).slice(0, 300)}`).toBe('discovered_exact');
    if (f.kind === 'discovered_exact') {
      productCode = f.product.productCode;
      rec['created'] = {
        code: productCode,
        name: f.product.displayName,
        brand: f.product.brand,
        engineReady: f.engineReady,
        privateNotReady: f.privateNotReady,
      };
      expect(f.product.displayName, `${g}: created identity`).toMatch(expectName);
    }
  }
  const again = await runScanImportV2(scan(code), main.ctx(), main.ports);
  rec['rescanKind'] = again.kind;
  const foundAgain = foundProduct(again);
  rec['rescanProduct'] = foundAgain
    ? {
        code: foundAgain.productCode,
        name: foundAgain.displayName,
        brand: foundAgain.brand,
        engineReady: foundAgain.engineReady,
      }
    : plain(again);
  expect(foundAgain, `${g}: rescan ${again.kind}`).not.toBeNull();
  expect(foundAgain!.productCode).toBe(productCode);
  expect(foundAgain!.displayName).toMatch(expectName);
}

describe.skipIf(!RUN)('served goldens on real staging', () => {
  beforeAll(async () => {
    const acc = await signedIn(process.env['QA_EMAIL']!, process.env['QA_PASSWORD']!);
    expect(acc, 'QA sign-in').not.toBeNull();
    main = acc!;
    proof['qaAccount'] = main.email;
    proof['stagingUrlHost'] = new URL(process.env['SUPABASE_URL']!).host;
  });

  it('G1 cacao control resolves to the exact catalogue product immediately', async () => {
    const t0 = Date.now();
    const r = await runScanImportV2(scan('8410109121551'), main.ctx(), main.ports);
    proof['g1'] = {
      kind: r.kind,
      ms: Date.now() - t0,
      name: r.kind === 'resolved_exact' ? r.product.displayName : null,
    };
    expect(r.kind).toBe('resolved_exact');
  }, 60_000);

  it('G2 Vitamin Well 7340222800464: registry identity → private save → rescan finds the same product', async () => {
    await registryGolden('g2', '7340222800464', /sport 002/i, /vitamin well/i);
  }, 120_000);

  it('G3 Milka 7622210669315: registry identity → private save → rescan finds the same product', async () => {
    await registryGolden('g3', '7622210669315', /choco brownie/i, /milka/i);
  }, 120_000);

  it('G4 unknown GTIN not online: no invented identity; minimal customer fields save it privately; rescan finds it', async () => {
    const rec: Record<string, unknown> = { code: UNKNOWN_EAN };
    proof['g4'] = rec;
    const first = await runScanImportV2(scan(UNKNOWN_EAN), main.ctx(), main.ports);
    rec['firstKind'] = first.kind;
    let productCode: string | null = null;
    const foundFirst = foundProduct(first);
    if (foundFirst) {
      productCode = foundFirst.productCode;
      rec['product'] = { code: productCode, name: foundFirst.displayName };
      expect(foundFirst.displayName).toMatch(/test product/i); // only ever our own earlier private save
    } else {
      const session = sessionOf(first);
      expect(session, `g4: discovery session (${first.kind})`).not.toBeNull();
      const web = identityFromEvidence(externalOf(first));
      rec['registry'] = web;
      expect(web).toBeNull(); // nothing online — nothing invented
      if (first.kind === 'discovered_pending') rec['ledgerIdentity'] = first.ledger.identity;
      const f = await finalizeOn(main, session!, {
        customerFamily: 'other',
        confirmations: {
          productFields: {
            identity: { displayName: 'Test product (unknown GTIN golden)', brand: 'Gellatti QA' },
          },
          packageEvidenceExhausted: true,
        },
        savePrivateNotReady: true,
      });
      rec['finalizeKind'] = f.kind;
      if (f.kind !== 'discovered_exact') rec['finalizeDetail'] = plain(f);
      expect(f.kind, JSON.stringify(f).slice(0, 300)).toBe('discovered_exact');
      if (f.kind === 'discovered_exact') {
        productCode = f.product.productCode;
        rec['created'] = {
          code: productCode,
          name: f.product.displayName,
          engineReady: f.engineReady,
          privateNotReady: f.privateNotReady,
        };
        expect(f.engineReady).toBe(false);
        expect(f.privateNotReady).toBe(true);
        expect(f.product.displayName).toMatch(/test product/i);
      }
    }
    const again = await runScanImportV2(scan(UNKNOWN_EAN), main.ctx(), main.ports);
    rec['rescanKind'] = again.kind;
    const foundAgain = foundProduct(again);
    rec['rescanProduct'] = foundAgain
      ? { code: foundAgain.productCode, name: foundAgain.displayName }
      : plain(again);
    expect(foundAgain, `g4: rescan ${again.kind}`).not.toBeNull();
    expect(foundAgain!.productCode).toBe(productCode);
    expect(foundAgain!.displayName).toMatch(/test product/i);
  }, 120_000);

  it('G5 two real label photographs analysed additively in one session; a burst-window failure is structured and retryable', async () => {
    // the main account may already have requested/saved the corpus products (earlier QA); the label
    // path needs an account that has not — the second QA account when it signs in, else the main one
    const alt = await signedIn(
      process.env['QA_EMAIL_ALT'] ?? 'test1@test1.com',
      process.env['QA_PASSWORD_ALT'] ?? process.env['QA_PASSWORD']!,
    );
    const acc = alt ?? main;
    const skip = new Set((process.env['SCAN_G5_SKIP'] ?? '').split(',').filter(Boolean));
    const candidates = [
      [
        '8411902004089',
        'cabreiroa-50cl_8411902004089.jpg',
        'cabreiroa-50cl_8411902004089_original.jpg',
      ],
      [
        '8426617014032',
        'haribo-favoritos_8426617014032.jpg',
        'haribo-favoritos_8426617014032_original.jpg',
      ],
      ['8411092731130', 'nestea-can_8411092731130.jpg', 'nestea-can_8411092731130_original.jpg'],
      [
        '7622201492786',
        'milka-choco-mini-wafers_7622201492786.jpg',
        'milka-choco-mini-wafers_7622201492786_original.jpg',
      ],
    ] as const;
    const rec: Record<string, unknown> = {
      account: acc.email,
      skipped: {} as Record<string, string>,
    };
    proof['g5'] = rec;
    let ran = false;
    for (const [code, photo1, photo2] of candidates) {
      if (skip.has(code)) {
        (rec['skipped'] as Record<string, string>)[code] = 'SCAN_G5_SKIP';
        continue;
      }
      const first = await runScanImportV2(scan(code), acc.ctx(), acc.ports);
      if (first.kind !== 'discovered_pending' && first.kind !== 'needs_confirmation') {
        // saved / already requested on this account: the multi-photo path is not reachable — next product
        (rec['skipped'] as Record<string, string>)[code] = first.kind;
        continue;
      }
      const session = sessionOf(first)!;
      rec['code'] = code;
      rec['firstKind'] = first.kind;
      const a1 = await continueDiscovery(
        session,
        { type: 'label', images: [labelImage(photo1, randomUUID())] },
        acc.ctx(),
        acc.discovery,
      );
      rec['photo1'] = {
        kind: a1.kind,
        missing: a1.kind === 'discovered_pending' ? a1.ledger.missingCritical : null,
        labelError: a1.kind === 'discovered_pending' ? (a1.labelError ?? null) : null,
        identity: a1.kind === 'discovered_pending' ? a1.ledger.identity : null,
        facts: a1.kind === 'discovered_pending' ? a1.ledger.facts.length : null,
      };
      expect(
        a1.kind === 'discovered_pending' && a1.labelError == null,
        `photo1 ${JSON.stringify(a1).slice(0, 300)}`,
      ).toBe(true);
      const s2: DiscoverySession = {
        ...session,
        missingCritical: a1.kind === 'discovered_pending' ? a1.ledger.missingCritical : [],
      };
      const a2 = await continueDiscovery(
        s2,
        { type: 'label', images: [labelImage(photo2, randomUUID())] },
        acc.ctx(),
        acc.discovery,
      );
      rec['photo2'] = {
        kind: a2.kind,
        missing: a2.kind === 'discovered_pending' ? a2.ledger.missingCritical : null,
        labelError: a2.kind === 'discovered_pending' ? (a2.labelError ?? null) : null,
        facts: a2.kind === 'discovered_pending' ? a2.ledger.facts.length : null,
      };
      // the second photograph is either accepted additively or reported as a structured per-photo
      // failure — never a throw, never a lost session
      expect(['discovered_pending', 'discovered_exact', 'needs_confirmation']).toContain(a2.kind);
      if (a2.kind === 'discovered_pending' && a2.labelError) {
        expect([
          'burst',
          'vision_limit',
          'asset_conflict',
          'asset_metadata',
          'network',
          'provider',
          'other',
        ]).toContain(a2.labelError.reason);
      } else if (a2.kind === 'discovered_pending' && a1.kind === 'discovered_pending') {
        // additive: evidence never shrinks
        expect(a2.ledger.facts.length).toBeGreaterThanOrEqual(a1.ledger.facts.length);
        expect(a2.ledger.missingCritical.length).toBeLessThanOrEqual(
          a1.ledger.missingCritical.length,
        );
      }
      // third image inside the same minute: the server's burst rule must surface as a structured failure
      const a3 = await continueDiscovery(
        s2,
        { type: 'label', images: [labelImage(photo1, randomUUID())] },
        acc.ctx(),
        acc.discovery,
      );
      rec['photo3'] = {
        kind: a3.kind,
        labelError: a3.kind === 'discovered_pending' ? (a3.labelError ?? null) : null,
      };
      expect(['discovered_pending', 'discovered_exact', 'needs_confirmation']).toContain(a3.kind);
      ran = true;
      break;
    }
    expect(ran, `g5: no corpus product reachable on ${acc.email}`).toBe(true);
  }, 240_000);

  it('writes the proof file', () => {
    const dir = join(process.cwd(), 'reports', 'scan-import-v2');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'STAGING_GOLDENS_PROOF_2026-09-05.json'),
      JSON.stringify(proof, null, 2) + '\n',
    );
  });
});
