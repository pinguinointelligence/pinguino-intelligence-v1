import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

/*
  ONE CANONICAL SCANNER (owner decision 2026-09-06). The second scanner UI
  (`LiveProductScanner` / `LiveMultiScanner` and its private modules) is gone: it was a
  duplicate implementation with its own state machine, decoder, messages and — after the
  allergen ruling — its own contradicting rule. Assertions that described only that UI are
  removed with it. Everything below is about the SERVER side, which both entries always
  shared and which the canonical flow still calls.
*/
describe('Product Scanner server/client/security boundary', () => {
  const service = read('src/services/productScanner.ts');
  const analyze = read('supabase/functions/product-scan-analyze/index.ts');
  const finalize = read('supabase/functions/product-scan-finalize/index.ts');
  const migration = read('supabase/migrations/20260821120000_product_scanner_v1.sql');

  it('keeps the OpenAI key and model choice server-only', () => {
    expect(service).not.toMatch(/OPENAI_API_KEY|api\.openai\.com|gpt-5/i);
    expect(analyze).toContain("Deno.env.get('OPENAI_API_KEY')");
    expect(analyze).toContain("Deno.env.get('OPENAI_PROJECT_ID')");
    expect(analyze).toContain("'gpt-5.6-luna'");
    expect(analyze).toContain("'gpt-5.6-terra'");
    expect(analyze).toContain('store: false');
    expect(analyze).toContain("type: 'json_schema'");
    expect(analyze).toContain('max_tool_calls = 1');
    expect(analyze).toContain('PRODUCT_SCANNER_WEB_SEARCH_ENABLED');
    expect(analyze).toContain('PRODUCT_SCANNER_DAILY_COST_LIMIT');
    expect(analyze).toContain('PRODUCT_SCANNER_MONTHLY_COST_LIMIT');
    expect(analyze).toContain('PRODUCT_SCANNER_V1_ENABLED');
  });

  it('repeats exact barcode lookup before cost reservation and does not log payloads', () => {
    expect(analyze.indexOf('exactProductForBarcode')).toBeLessThan(
      analyze.indexOf('reserve_product_scan_analysis_v1'),
    );
    expect(analyze).toContain("kind: 'existing_product'");
    expect(analyze.indexOf("kind: 'existing_product'")).toBeLessThan(
      analyze.indexOf('if (!openAiKey || !projectId)'),
    );
    expect(analyze).not.toMatch(/console\.(?:log|info|debug|error)/);
    expect(finalize).not.toMatch(/console\.(?:log|info|debug|error)/);
  });

  it('treats a governed TOPPING_ONLY role as usable on every future exact-EAN scan', () => {
    expect(analyze).toContain('const roleReady =');
    expect(analyze).toContain("behavior.classificationOutcome === 'classified'");
    expect(analyze).toContain('behavior.toppingEligible === true');
    expect(analyze).toContain('intelligence.engineUsable === true ||');
    expect(analyze).toContain('roleReady');
  });

  it('makes scanner data server-owned and cross-account reads RLS-bound', () => {
    expect(migration).toContain('auth.uid()=user_id');
    expect(migration).toContain('for select using (auth.uid()=creator_user_id)');
    expect(migration).toContain('product_scan_published_overlay_v1');
    expect(migration).toContain(
      'select id,product_id,product_version_id,pi_product_code,state,updated_at,published_at',
    );
    expect(migration).toContain('revoke all on public.product_scan_sessions');
    expect(migration).toContain('grant select on public.product_scan_sessions');
    expect(migration).not.toMatch(/grant (?:insert|update|delete).*authenticated/i);
    expect(migration).toContain('security definer set search_path=public');
  });

  it('keeps private commerce data outside shared overlay and never mutates Mapper', () => {
    const overlayDefinition = migration.slice(
      migration.indexOf('create table public.product_scan_overlay_states'),
      migration.indexOf('alter table public.product_scan_sessions enable row level security'),
    );
    expect(overlayDefinition).not.toMatch(/private_price|supplier|notes|stock/);
    expect(migration).not.toMatch(
      /(?:insert|update|delete|truncate)\s+(?:table\s+)?public\.mapper_basement/i,
    );
    expect(finalize).toContain('p_private_overlay: privateOverlay');
    expect(finalize).toContain("'gellatti_upsert_customer_added_product_v1'");
  });

  it('keeps legacy Scanner cost quotas without allocating retired PM creation slots', () => {
    expect(migration).toContain("v_plan='pro' and v_month>=50");
    expect(migration).toContain("v_plan='basic' and v_month>=10");
    expect(migration).toContain("v_plan='basic' and v_lifetime>=5 and v_day>=1");
    expect(migration).toContain("status=case when p_created then 'consumed' else 'released' end");
    expect(finalize).not.toContain('reserve_product_scan_creation_v1');
    expect(finalize).toContain('usableProductCreated: true');
    expect(migration).toContain('from public.account_profiles where user_id=p_actor_user_id');
    expect(migration).toContain("v_timezone:='UTC'");
  });

  it('limits the default session to four images and two paid vision calls', () => {
    expect(analyze).toContain("numberEnv('PRODUCT_SCANNER_MAX_IMAGES', 4)");
    expect(analyze).toContain('PRODUCT_SCANNER_MAX_VISION_CALLS');
    expect(analyze).toContain('PRODUCT_SCANNER_MAX_WEB_CALLS');
    expect(analyze).toContain('accurate_retry_requires_fast_evidence');
    expect(migration).toContain(
      'vision_calls smallint not null default 0 check (vision_calls between 0 and 2)',
    );
  });

  it('merges each call into cumulative server-owned session evidence before readiness', () => {
    expect(analyze).toContain('mergeProductScanResults');
    expect(analyze).toContain('existingSession?.result_json');
    expect(analyze).toContain('sessionAssetIds');
    expect(analyze.indexOf('mergeProductScanResults')).toBeLessThan(
      analyze.lastIndexOf('validateServerResult'),
    );
    expect(analyze).toContain('p_result: cumulativeResult');
  });

  it('never converts exhausted package evidence into a synthetic allergen fact', () => {
    expect(finalize).toContain('packageEvidenceExhausted');
    expect(finalize).not.toContain('no allergens');
    expect(finalize).not.toContain('brak alergenów');
  });

  it('records safe cost/rate diagnostics without raw IPs or images', () => {
    expect(migration).toContain('openai_project_id text not null');
    expect(migration).toContain('latency_ms integer');
    expect(migration).toContain('ip_hash text not null');
    expect(migration).toContain('device_hash text not null');
    expect(migration).toContain("reason','analysis_ip_burst'");
    expect(migration).toContain("reason','analysis_device_burst'");
    expect(migration).toContain("pg_advisory_xact_lock(hashtext('product-scan-global-cost'))");
    expect(analyze).toContain('proj_qfPNkkHlfmI3LAx7NoUjwowZ');
    expect(analyze).toContain('proj_1MvKPXEEkg3KjNL2Fh90eCIj');
    expect(analyze).not.toMatch(/console\.(?:log|info|debug|error)/);
  });

  it('asks the code, the catalogue and the exact source before it spends anything', () => {
    // The order IS the fix. Everything free happens before the first paid call.
    expect(analyze.indexOf("mode === 'ean_lookup'")).toBeLessThan(
      analyze.indexOf('reserve_product_scan_analysis_v1'),
    );
    expect(analyze).toContain('reserve_product_scan_ean_lookup_v1');
    expect(analyze).toContain("researchStep: { kind: 'GTIN_LOOKUP'");
    expect(analyze).toContain('lookup_requires_barcode');
    // The lookup reaches the source through the dedicated provider function, which owns
    // its own flag, caps and source-authority classification.
    expect(analyze).toContain('/functions/v1/intimport-enrich');
    expect(analyze).not.toMatch(/api\.openai\.com[\s\S]{0,400}ean_lookup/);
  });

  it('keeps Scanner general web search opt-in and off the client path', () => {
    // `allowWeb: true` used to be sent on EVERY ordinary scan, held back only by a flag
    // whose default was ON. The client no longer sends it and the server no longer reads it.
    expect(service).not.toContain('allowWeb');
    expect(analyze).toContain("Deno.env.get('PRODUCT_SCANNER_WEB_SEARCH_ENABLED') === 'true'");
    expect(analyze).not.toContain('body.allowWeb === true');
  });

  it('feeds every photo through the ONE canonical pipeline', () => {
    // One analyse path, one finalize path, one adapter — there is no second ingestion pipeline.
    const adapter = read('src/scan-import-v2/adapters/supabaseDiscoveryAdapter.ts');
    expect(adapter).toContain("invoke('product-scan-analyze'");
    expect(adapter).toContain("invoke('product-scan-finalize'");
    expect(analyze).toContain('mergeProductScanResults');
  });

  it('sends the canonical unresolved fields and permits one targeted re-read of the same good photo', () => {
    expect(service).toContain('missingFields: string[]');
    expect(analyze).toContain('Requested missing fields only:');
  });

  it('creates one customer-added product through shared profile authority and lets exact GTIN reuse win', () => {
    expect(finalize).toContain("'gellatti_upsert_customer_added_product_v1'");
    expect(finalize).toContain('normalizeValidatedBarcode');
    expect(finalize).toContain('usableProductCreated: true');
    expect(finalize).not.toContain("service.rpc('ingest_product_v1'");
    expect(finalize).toContain('validateIntimportProductProfileProposal');
    expect(finalize).toContain('validateProductBehaviorAuthority');
    expect(service).not.toContain('validateIntimportProductProfileProposal');
  });

  it('shows the upload privacy contract before the photo actions', () => {
    // The disclosure follows the camera. Since 2026-09-06 exactly one surface uploads a photo,
    // so the contract is asserted there — it must never become a promise nobody makes.
    const flow = read('src/features/scan-flow/ScanFlow.tsx');
    expect(flow).toContain('Zdjęcie zostanie przesłane do analizy etykiety');
    // JSX wraps the sentence, so assert the two halves it is actually split into
    expect(flow).toContain('ceny, dostawcy, notatki i stan');
    expect(flow).toContain('magazynowy pozostają prywatne');
    // every surface that can upload a photo renders the disclosure first
    const uploads = [...flow.matchAll(/void sendLabel\(/g)].length;
    expect(uploads).toBeGreaterThan(0);
    expect([...flow.matchAll(/\{photoPrivacyNote\}/g)].length).toBe(2);
    for (const m of flow.matchAll(/\{photoPrivacyNote\}/g))
      expect(flow.indexOf('void sendLabel(', m.index)).toBeGreaterThan(m.index);
    expect(flow).not.toContain('privacyAccepted');
  });
});
