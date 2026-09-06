/**
 * TIME TO A USABLE PRODUCT ON REAL STAGING — runs only with SCAN_IMPORT_V2_STAGING_OWNER_CODES=1
 * (+ SUPABASE_URL, SUPABASE_ANON_KEY, QA_EMAIL, QA_PASSWORD). Measures what the customer waits for:
 *   T1 known exact product: cold (first) and warm (second) resolution
 *   T2 unknown product with registry/web data: research (registry → web) → finalize (recognition, Mapper
 *      completion, save) → rescan; each step timed separately, the sum is the customer-visible wait
 * Writes reports/scan-import-v2/STAGING_TIMING_<date>.json. Measures; never claims.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { createOpenFoodFactsEvidencePort } from '../adapters/openFoodFactsEvidence';
import { createOfflineCache, createSupabaseV2Ports } from '../adapters/supabaseAdapters';
import { createSupabaseDiscoveryPort } from '../adapters/supabaseDiscoveryAdapter';
import type { RequestContext, ScanImportV2Result } from '../contracts';
import { continueDiscovery, startDiscovery } from '../discovery/discovery';
import type { DiscoveryPort, DiscoverySession } from '../discovery/contracts';
import { identifyCode } from '../codeIdentity';
import { createMemoryStore } from '../offline/persistentStore';
import { runScanImportV2 } from '../pipeline';
import { scan } from './codeIdentity.test';

const RUN = process.env['SCAN_IMPORT_V2_STAGING_OWNER_CODES'] === '1';
const KNOWN = process.env['SCAN_TIMING_KNOWN'] ?? '7340222800464'; // Vitamin Well (CA, ready on staging)
/** candidates with a registry record; the first one staging does not know yet is measured as "new" */
const NEW_CANDIDATES = (
  process.env['SCAN_TIMING_NEW'] ?? '3245678047125,5900617002228,20005825,7622300742058'
).split(',');
type Ports = Parameters<typeof runScanImportV2>[2];
const report: Record<string, unknown> = { ranAt: new Date().toISOString() };
let ports: Ports;
let discovery: DiscoveryPort;
let ctx: () => RequestContext;

const ms = async <T>(label: string, fn: () => Promise<T>): Promise<{ value: T; ms: number }> => {
  const t0 = performance.now();
  const value = await fn();
  const elapsed = Math.round(performance.now() - t0);
  (report['steps'] as unknown[] | undefined)?.push({ label, ms: elapsed });
  return { value, ms: elapsed };
};

describe.skipIf(!RUN)('time to a usable product on real staging', () => {
  beforeAll(async () => {
    report['steps'] = [];
    const auth = createClient(process.env['SUPABASE_URL']!, process.env['SUPABASE_ANON_KEY']!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signIn = await auth.auth.signInWithPassword({
      email: process.env['QA_EMAIL']!,
      password: process.env['QA_PASSWORD']!,
    });
    expect(signIn.error, 'QA sign-in').toBeNull();
    const userId = signIn.data.user!.id;
    discovery = createSupabaseDiscoveryPort(auth as never);
    ctx = () => ({
      accountId: userId,
      productCountry: null,
      online: true,
      surface: 'TEST',
      now: Date.now(),
    });
    ports = {
      ...createSupabaseV2Ports(auth as never, { exactAuthority: 'gtin_rpc' }),
      external: createOpenFoodFactsEvidencePort(),
      offlineCache: createOfflineCache({ store: createMemoryStore() }),
      externalTimeoutMs: 8000,
      discovery,
    };
  });

  it('T1 known product: cold and warm exact resolution', async () => {
    const cold = await ms('known.cold', () => runScanImportV2(scan(KNOWN), ctx(), ports));
    const warm = await ms('known.warm', () => runScanImportV2(scan(KNOWN), ctx(), ports));
    report['known'] = {
      code: KNOWN,
      cold: { kind: cold.value.kind, ms: cold.ms },
      warm: { kind: warm.value.kind, ms: warm.ms },
    };
    expect(cold.value.kind, JSON.stringify(cold.value).slice(0, 300)).toBe('resolved_exact');
  }, 60_000);

  it('T2 new product: registry/web research → completion → save → rescan', async () => {
    let code: string | null = null;
    let probe: ScanImportV2Result | null = null;
    for (const candidate of NEW_CANDIDATES) {
      const r = await runScanImportV2(
        scan(candidate),
        { ...ctx() },
        { ...ports, discovery: undefined },
      );
      if (r.kind !== 'resolved_exact') {
        code = candidate;
        probe = r;
        break;
      }
    }
    report['new'] = { candidates: NEW_CANDIDATES, chosen: code, probeKind: probe?.kind ?? null };
    if (!code) {
      report['new'] = {
        ...(report['new'] as object),
        skipped: 'every candidate already known on staging',
      };
      return;
    }
    const id = identifyCode(scan(code));
    if (!id.ok) throw new Error('code');
    const research = await ms('new.research', () => startDiscovery(id.identity, ctx(), discovery));
    const rec: Record<string, unknown> = {
      code,
      research: { kind: research.value.kind, ms: research.ms },
    };
    report['new'] = { ...(report['new'] as object), ...rec };
    if (research.value.kind === 'discovered_pending') {
      const ledger = research.value.ledger;
      rec['ledger'] = {
        sources: ledger.sourcesUsed,
        facts: ledger.facts.map((f) => `${f.field}@${f.source}`),
        missingCritical: ledger.missingCritical,
        next: research.value.next,
      };
      const session: DiscoverySession = {
        sessionId: research.value.sessionId,
        identity: research.value.identity,
        result: null,
        overlayState: null,
        missingCritical: [...ledger.missingCritical],
        usage: { visionCalls: 0, webCalls: 0 },
        recordedAt: Date.now(),
      };
      // the same automatic path the flow takes: whatever the server research collected, finalized
      // without asking the customer (no registry prefill here — the server holds the facts itself)
      const finalize = await ms('new.finalize', () =>
        continueDiscovery(session, { type: 'finalize', input: {} }, ctx(), discovery),
      );
      rec['finalize'] = {
        kind: finalize.value.kind,
        ms: finalize.ms,
        engineReady: finalize.value.kind === 'discovered_exact' ? finalize.value.engineReady : null,
        product:
          finalize.value.kind === 'discovered_exact'
            ? { code: finalize.value.product.productCode, name: finalize.value.product.displayName }
            : null,
        note: finalize.value.kind === 'discovered_pending' ? finalize.value.note : null,
        missing:
          finalize.value.kind === 'discovered_pending'
            ? finalize.value.ledger.missingCritical
            : null,
      };
      rec['customerVisibleMs'] = research.ms + finalize.ms;
      const rescan = await ms('new.rescan', () => runScanImportV2(scan(code!), ctx(), ports));
      rec['rescan'] = { kind: rescan.value.kind, ms: rescan.ms };
    }
    report['new'] = { ...(report['new'] as object), ...rec };
  }, 240_000);

  it('writes the timing report', () => {
    const dir = join(process.cwd(), 'reports', 'scan-import-v2');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `STAGING_TIMING_${new Date().toISOString().slice(0, 10)}.json`);
    writeFileSync(file, JSON.stringify(report, null, 2));
    expect(report['known']).toBeDefined();
  });
});
