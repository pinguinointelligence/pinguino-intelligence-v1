/**
 * NOT_READY → ESTIMATED_READY ON REAL STAGING, on a CONTROLLED product (owner §10/§12: the transition
 * must really happen, on test state, never by rolling back the owner's products). Runs only with
 * SCAN_IMPORT_V2_STAGING_OWNER_CODES=1 (+ SUPABASE_URL, SUPABASE_ANON_KEY, QA_EMAIL/QA_PASSWORD,
 * QA_EMAIL_ALT/QA_PASSWORD_ALT).
 *
 * A fresh restricted-circulation GTIN (prefix 200, valid check digit) has no registry record and no web
 * page, so the first save can only be PRIVATE and NOT READY (identity alone). The same account then
 * supplies the label facts: the SAME provisional product becomes engine-usable — a superseding version,
 * no duplicate. A second account scanning the same code with the same facts is linked without another
 * version (no churn). A rescan resolves the exact product, usable.
 * Writes reports/scan-import-v2/STAGING_TRANSITION_<date>.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { createOfflineCache, createSupabaseV2Ports } from '../adapters/supabaseAdapters';
import { createSupabaseDiscoveryPort } from '../adapters/supabaseDiscoveryAdapter';
import type { ExternalEvidence, RequestContext } from '../contracts';
import { continueDiscovery, startDiscovery } from '../discovery/discovery';
import type { DiscoveryPort, DiscoverySession } from '../discovery/contracts';
import { identifyCode } from '../codeIdentity';
import { fileToLabelImage } from '../labelImage';
import { createMemoryStore } from '../offline/persistentStore';
import { runScanImportV2 } from '../pipeline';
import { scan } from './codeIdentity.test';

const RUN = process.env['SCAN_IMPORT_V2_STAGING_OWNER_CODES'] === '1';
type Ports = Parameters<typeof runScanImportV2>[2];
interface Account {
  email: string;
  userId: string;
  ports: Ports;
  discovery: DiscoveryPort;
  ctx: () => RequestContext;
  client: SupabaseClient;
}
const report: Record<string, unknown> = { ranAt: new Date().toISOString() };

/**
 * The controlled product: a real GTIN whose registry record carries a name but NO nutrition table and no
 * brand (the first save can only be private/not-ready, with the honest unbranded identity). Given per run
 * through SCAN_TRANSITION_CODE; default: the registry's bare "butter" record. A code already turned into a
 * ready product on staging cannot demonstrate the transition again — S1 then records that honestly.
 */
const controlledCode = (): string => CODE;

/** the label as the customer reads it from the pack of the controlled product (per code) */
const LABEL_FACTS_BY_CODE: Record<string, Record<string, unknown>> = {
  // registry record "butter", no brand, no nutrition, no ingredients — the honest unbranded identity
  '5900512902388': {
    identity: { displayName: 'Masło ekstra 82%', explicitlyUnbranded: true },
    nutrition: {
      basis: 'per_100g',
      energyKcal: 740,
      fat: 82,
      carbohydrate: 0.7,
      sugars: 0.7,
      protein: 0.7,
      salt: 0.02,
    },
    ingredientsText: 'śmietanka pasteryzowana (z mleka)',
    allergensText: 'mleko',
  },
  // Piątnica Serek śmietankowy z ziołami 135 g — registry: name + brand only
  '5900531001710': {
    identity: { displayName: 'Serek śmietankowy z ziołami', brand: 'Piątnica' },
    nutrition: {
      basis: 'per_100g',
      energyKcal: 254,
      fat: 24,
      carbohydrate: 3.5,
      sugars: 3.5,
      protein: 6,
      salt: 0.9,
    },
    ingredientsText: 'śmietanka pasteryzowana, mleko, sól, zioła 1%, kultury bakterii mlekowych',
    allergensText: 'mleko',
  },
};
const gtinCheck = (body12: string): string => {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(body12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
};
/**
 * Default: a fresh restricted-circulation code (prefix 200) per run — no registry record, no web page, so
 * the ONLY evidence is what the customer photographs. The front-of-pack photo carries the name and the
 * brand and nothing else: the first save can only be private/not-ready. SCAN_TRANSITION_CODE overrides
 * with a real code (then the registry/web decide what S1 finds, honestly recorded).
 */
const CODE =
  process.env['SCAN_TRANSITION_CODE'] ??
  (() => {
    const body = `200${String(Date.now()).slice(-9)}`;
    return `${body}${gtinCheck(body)}`;
  })();
const LABEL_FACTS = LABEL_FACTS_BY_CODE[CODE] ?? LABEL_FACTS_BY_CODE['5900512902388']!;
/** the front-of-pack photograph (identity only) — rendered fixture, see reports for its provenance */
const FRONT_LABEL_PHOTO =
  process.env['SCAN_TRANSITION_LABEL_PHOTO'] ??
  '/private/tmp/claude-501/-Users-tomaszboro22-Developer/e85acd18-60cf-44d8-8054-1bced55d6252/scratchpad/qa-label-front.png';

async function signedIn(email: string, password: string): Promise<Account> {
  const client = createClient(process.env['SUPABASE_URL']!, process.env['SUPABASE_ANON_KEY']!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error || !signIn.data.user) throw new Error(`sign-in failed for ${email}`);
  const userId = signIn.data.user.id;
  const discovery = createSupabaseDiscoveryPort(client as never);
  const noRegistry = { research: async (): Promise<ExternalEvidence | null> => null };
  return {
    email,
    userId,
    client,
    discovery,
    ctx: () => ({
      accountId: userId,
      productCountry: null,
      online: true,
      surface: 'TEST',
      now: Date.now(),
    }),
    ports: {
      ...createSupabaseV2Ports(client as never, { exactAuthority: 'gtin_rpc' }),
      external: noRegistry,
      offlineCache: createOfflineCache({ store: createMemoryStore() }),
      externalTimeoutMs: 4000,
      discovery,
    },
  };
}

const sessionOf = (
  started: Extract<Awaited<ReturnType<typeof startDiscovery>>, { kind: 'discovered_pending' }>,
): DiscoverySession => ({
  sessionId: started.sessionId,
  identity: started.identity,
  result: null,
  overlayState: null,
  missingCritical: [...started.ledger.missingCritical],
  usage: { visionCalls: 0, webCalls: 0 },
  recordedAt: Date.now(),
});

async function currentVersion(account: Account, code: string) {
  const { data } = await account.client.rpc('resolve_exact_products_by_gtin_v1', {
    p_gtin: code,
    p_symbology: 'EAN-13',
  } as never);
  const rows = (data ?? []) as {
    product_code: string;
    current_version_id: string;
    engine_usable: boolean;
    ownership: string;
  }[];
  return rows[0] ?? null;
}

describe.skipIf(!RUN)('NOT_READY → ESTIMATED_READY on a controlled product, real staging', () => {
  let a: Account;
  let b: Account;
  const code = controlledCode();
  beforeAll(async () => {
    a = await signedIn(process.env['QA_EMAIL']!, process.env['QA_PASSWORD']!);
    b = await signedIn(
      process.env['QA_EMAIL_ALT'] ?? 'test1@test1.com',
      process.env['QA_PASSWORD_ALT'] ?? process.env['QA_PASSWORD']!,
    );
    report['code'] = code;
    report['accounts'] = [a.email, b.email];
  });

  it('S1 identity alone: saved privately, not ready (version 1)', async () => {
    const id = identifyCode(scan(code));
    if (!id.ok) throw new Error('code');
    const started = await startDiscovery(id.identity, a.ctx(), a.discovery);
    if (started.kind === 'resolved_exact') {
      report['s1'] = {
        skipped: 'already a product on staging — the transition was demonstrated in an earlier run',
        product: started.product.productCode,
      };
      return;
    }
    expect(started.kind, JSON.stringify(started).slice(0, 300)).toBe('discovered_pending');
    if (started.kind !== 'discovered_pending') return;
    let session = sessionOf(started);
    const registryOrWebKnowsIt = started.ledger.facts.some((f) => f.source !== 'barcode');
    if (!registryOrWebKnowsIt) {
      // nobody knows the code: the customer photographs the front of the pack (name + brand only)
      expect(existsSync(FRONT_LABEL_PHOTO), `label photo ${FRONT_LABEL_PHOTO}`).toBe(true);
      const image = await fileToLabelImage(
        new Blob([readFileSync(FRONT_LABEL_PHOTO)], { type: 'image/png' }),
        'camera_manual',
      );
      const analyzed = await a.discovery.analyzeLabel(session, [image], a.ctx());
      report['s1photo'] = { kind: analyzed.kind };
      expect(analyzed.kind, JSON.stringify(analyzed).slice(0, 300)).toBe('analyzed');
      if (analyzed.kind !== 'analyzed') return;
      session = analyzed.session;
    }
    const r = await continueDiscovery(
      session,
      {
        type: 'finalize',
        input: {
          customerFamily: 'dairy',
          confirmations: { productFields: { identity: LABEL_FACTS['identity'] } },
          savePrivateNotReady: true,
        },
      },
      a.ctx(),
      a.discovery,
    );
    const v = await currentVersion(a, code);
    report['s1'] = {
      kind: r.kind,
      engineReady: r.kind === 'discovered_exact' ? r.engineReady : null,
      product: r.kind === 'discovered_exact' ? r.product.productCode : null,
      version: v,
    };
    expect(r.kind).toBe('discovered_exact');
    if (r.kind === 'discovered_exact') {
      expect(r.engineReady).toBe(false);
      expect(r.privateNotReady).toBe(true);
    }
    expect(v?.engine_usable).toBe(false);
  }, 120_000);

  it('S2 the same account supplies the label facts: the SAME product becomes usable (version 2 supersedes)', async () => {
    const before = await currentVersion(a, code);
    const id = identifyCode(scan(code));
    if (!id.ok) throw new Error('code');
    const started = await startDiscovery(id.identity, a.ctx(), a.discovery);
    expect(started.kind, JSON.stringify(started).slice(0, 300)).toBe('discovered_pending');
    if (started.kind !== 'discovered_pending') return;
    const r = await continueDiscovery(
      sessionOf(started),
      {
        type: 'finalize',
        input: { customerFamily: 'dairy', confirmations: { productFields: LABEL_FACTS } },
      },
      a.ctx(),
      a.discovery,
    );
    const after = await currentVersion(a, code);
    report['s2'] = {
      kind: r.kind,
      engineReady: r.kind === 'discovered_exact' ? r.engineReady : null,
      product: r.kind === 'discovered_exact' ? r.product.productCode : null,
      before,
      after,
      note: r.kind === 'discovered_pending' ? r.note : null,
    };
    expect(r.kind, JSON.stringify(report['s2']).slice(0, 600)).toBe('discovered_exact');
    if (r.kind === 'discovered_exact') expect(r.engineReady).toBe(true);
    expect(after?.product_code).toBe(before?.product_code);
    expect(after?.current_version_id).not.toBe(before?.current_version_id);
    expect(after?.engine_usable).toBe(true);
  }, 120_000);

  it('S3 a second account with the same facts is linked — same product, no new version', async () => {
    const before = await currentVersion(a, code);
    const first = await runScanImportV2(scan(code), { ...b.ctx(), discovery: 'ask' }, b.ports);
    report['s3'] = { firstKind: first.kind };
    const id = identifyCode(scan(code));
    if (!id.ok) throw new Error('code');
    const started = await startDiscovery(id.identity, b.ctx(), b.discovery);
    // the SAME label facts the first account confirmed: identical truth must not become a new version
    const created =
      started.kind === 'discovered_pending'
        ? await continueDiscovery(
            sessionOf(started),
            {
              type: 'finalize',
              input: { customerFamily: 'dairy', confirmations: { productFields: LABEL_FACTS } },
            },
            b.ctx(),
            b.discovery,
          ).then((r) => ({
            kind: r.kind,
            product: r.kind === 'discovered_exact' ? r.product.productCode : null,
          }))
        : { kind: started.kind };
    const afterA = await currentVersion(a, code);
    const asB = await currentVersion(b, code);
    report['s3'] = { ...(report['s3'] as object), created, before, afterA, asB };
    expect(asB?.product_code, JSON.stringify(report['s3']).slice(0, 600)).toBe(
      before?.product_code,
    );
    expect(asB?.ownership).toBe('linked');
    // the second account confirmed the same label facts the first one did: the version stays
    expect(afterA?.current_version_id, 'identical facts must not create a new version').toBe(
      before?.current_version_id,
    );
  }, 120_000);

  it('S3b a third account with facts identical to the current version: linked, no new version', async () => {
    const c = await signedIn(
      process.env['QA_EMAIL_THIRD'] ?? 'pro@pro.com',
      process.env['QA_PASSWORD_THIRD'] ?? process.env['QA_PASSWORD']!,
    );
    const before = await currentVersion(a, code);
    const id = identifyCode(scan(code));
    if (!id.ok) throw new Error('code');
    const started = await startDiscovery(id.identity, c.ctx(), c.discovery);
    const outcome =
      started.kind === 'discovered_pending'
        ? await continueDiscovery(
            sessionOf(started),
            {
              type: 'finalize',
              input: { customerFamily: 'dairy', confirmations: { productFields: LABEL_FACTS } },
            },
            c.ctx(),
            c.discovery,
          ).then((r) => r.kind)
        : started.kind;
    const after = await currentVersion(a, code);
    const asC = await currentVersion(c, code);
    report['s3b'] = { account: c.email, outcome, before, after, asC };
    expect(asC?.product_code).toBe(before?.product_code);
    expect(asC?.ownership).toBe('linked');
    expect(after?.current_version_id, 'identical facts must not create a new version').toBe(
      before?.current_version_id,
    );
  }, 120_000);

  it('S4 rescan by the first account resolves the exact, usable product', async () => {
    const r = await runScanImportV2(scan(code), a.ctx(), a.ports);
    report['s4'] = {
      kind: r.kind,
      engineReady: r.kind === 'resolved_exact' ? r.product.engineReady : null,
    };
    expect(r.kind).toBe('resolved_exact');
    if (r.kind === 'resolved_exact') expect(r.product.engineReady).toBe(true);
    const dir = join(process.cwd(), 'reports', 'scan-import-v2');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, `STAGING_TRANSITION_${new Date().toISOString().slice(0, 10)}.json`),
      JSON.stringify(report, null, 2),
    );
  }, 60_000);
});
