/**
 * FOUND DATA IS NEVER TRADED FOR AN ESTIMATE — on real staging.
 *
 * Owner rule (2026-09-06): what a source actually states about the product has precedence; only the
 * fields NO source states are completed from the most similar Mapper products. Two products saved on
 * 2026-09-05/06 violated it — the registry knew their whole nutrition table and the profile replaced
 * every value with a donor's (CA-ING-007183 "Jogurt z kiwi" carried 64 g lactose /100 g).
 *
 * This harness re-runs the SAME customer path on those codes and records what the saved version now
 * holds. It repairs by the normal supersede-when-better rule — no direct writes, no rollback of the
 * owner's products. Runs only with SCAN_IMPORT_V2_STAGING_OWNER_CODES=1 (+ SUPABASE_URL,
 * SUPABASE_ANON_KEY, QA_EMAIL_ALT/QA_PASSWORD). Writes reports/scan-import-v2/STAGING_FOUND_DATA.json.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { createSupabaseDiscoveryPort } from '../adapters/supabaseDiscoveryAdapter';
import type { RequestContext } from '../contracts';
import { continueDiscovery, startDiscovery } from '../discovery/discovery';
import type { DiscoveryPort, DiscoverySession } from '../discovery/contracts';
import { identifyCode } from '../codeIdentity';
import { identityFromEvidence } from '../adapters/openFoodFactsEvidence';
import { productFieldsNotInLedger } from '@/features/scan-flow/scanFlowLogic';
import { scan } from './codeIdentity.test';

const RUN = process.env['SCAN_IMPORT_V2_STAGING_OWNER_CODES'] === '1';

/** the two products the old rule damaged, plus the one it saved correctly (control) */
const CODES: readonly { code: string; label: string }[] = [
  { code: '5903767004470', label: 'Jogurt z kiwi (registry table replaced by a donor)' },
  { code: '3245678047125', label: '90% noir Absolu (registry table replaced by a donor)' },
];

let client: SupabaseClient;
let discovery: DiscoveryPort;
let userId: string;
const ctx = (): RequestContext => ({
  accountId: userId,
  productCountry: null,
  online: true,
  surface: 'TEST',
  now: Date.now(),
});
const report: Record<string, unknown> = { ranAt: new Date().toISOString() };

const sessionOf = (started: {
  sessionId: string;
  identity: DiscoverySession['identity'];
  ledger: { missingCritical: readonly string[] };
}): DiscoverySession => ({
  sessionId: started.sessionId,
  identity: started.identity,
  result: null,
  overlayState: null,
  missingCritical: [...started.ledger.missingCritical],
  usage: { visionCalls: 0, webCalls: 0 },
  recordedAt: Date.now(),
});

async function savedTruth(code: string) {
  const { data } = await client.rpc('resolve_exact_products_by_gtin_v1', {
    p_gtin: code,
    p_symbology: 'EAN-13',
  } as never);
  const row = (
    (data ?? []) as { product_id: string; product_code: string; current_version_id: string }[]
  )[0];
  if (!row) return null;
  const { data: versionRow } = await client
    .from('product_versions')
    .select('version, facts')
    .eq('id', row.current_version_id)
    .maybeSingle();
  const v = versionRow as unknown as { version: number; facts: Record<string, unknown> } | null;
  const facts = (v?.facts ?? {}) as Record<string, unknown>;
  const pi = (facts['productIntelligence'] ?? {}) as Record<string, unknown>;
  const truth = (pi['fieldTruth'] ?? {}) as Record<
    string,
    { value?: unknown; state?: unknown; basis?: unknown }
  >;
  const macro = (field: string) => {
    const t = truth[field];
    return t ? `${String(t.value)}/${String(t.state)}/${String(t.basis)}` : null;
  };
  return {
    productCode: row.product_code,
    version: v?.version ?? null,
    versionId: row.current_version_id,
    fat: macro('fat_percent'),
    protein: macro('protein_percent'),
    carbohydrate: macro('carbohydrate_percent'),
    sugars: macro('total_sugars_percent'),
    lactose: macro('lactose_percent'),
    ready: ((pi['productAccuracyAssessment'] ?? {}) as Record<string, Record<string, unknown>>)[
      'gellattiReadiness'
    ]?.['ready'],
    accuracy: ((pi['productAccuracyAssessment'] ?? {}) as Record<string, unknown>)[
      'productAccuracy'
    ],
  };
}

describe.skipIf(!RUN)('found data survives into the saved product, on real staging', () => {
  beforeAll(async () => {
    client = createClient(process.env['SUPABASE_URL']!, process.env['SUPABASE_ANON_KEY']!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signIn = await client.auth.signInWithPassword({
      email: process.env['QA_EMAIL_ALT'] ?? 'test1@test1.com',
      password: process.env['QA_PASSWORD']!,
    });
    if (signIn.error || !signIn.data.user) throw new Error('sign-in failed');
    userId = signIn.data.user.id;
    discovery = createSupabaseDiscoveryPort(client as never);
  });

  it.each(CODES)('$label', async ({ code }) => {
    const before = await savedTruth(code);
    const id = identifyCode(scan(code));
    if (!id.ok) throw new Error('code');
    // refresh: a linked customer product's exact answer is set aside so the sources run again
    const started = await startDiscovery(id.identity, ctx(), discovery, { refresh: true });
    let after = before;
    let finalized: string | null = null;
    if (started.kind === 'discovered_pending') {
      const web = identityFromEvidence(started.externalEvidence);
      const r = await continueDiscovery(
        sessionOf(started),
        {
          type: 'finalize',
          input: {
            customerFamily: web?.family ?? 'other',
            confirmations: web
              ? { productFields: productFieldsNotInLedger(web.productFields, started.ledger) }
              : undefined,
          },
        },
        ctx(),
        discovery,
      );
      finalized = r.kind;
      after = await savedTruth(code);
    } else {
      finalized = started.kind;
    }
    (report[code] as unknown) = { before, finalized, after };
    // the registry states this product's whole table: no macro may remain a donor's estimate
    expect(after, JSON.stringify({ code, before, finalized, after })).not.toBeNull();
    for (const field of ['fat', 'protein', 'carbohydrate', 'sugars'] as const) {
      expect(after?.[field], `${code} ${field}`).toContain('VERIFIED');
    }
  });

  it('writes the report', () => {
    const dir = join(process.cwd(), 'reports', 'scan-import-v2');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'STAGING_FOUND_DATA.json'), JSON.stringify(report, null, 2));
  });
});
