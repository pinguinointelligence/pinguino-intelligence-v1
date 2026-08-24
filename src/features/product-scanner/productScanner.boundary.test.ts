import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Product Scanner server/client/security boundary', () => {
  // The scanning UI is one component entered from two places — the standalone page and
  // the recipe's „Dodaj składnik" (§37) — so the client boundary is both files together.
  const ui = [
    read('src/pages/products/ProductScannerV1Page.tsx'),
    read('src/features/product-scanner/LiveProductScanner.tsx'),
  ].join('\n');
  const service = read('src/services/productScanner.ts');
  const analyze = read('supabase/functions/product-scan-analyze/index.ts');
  const finalize = read('supabase/functions/product-scan-finalize/index.ts');
  const migration = read('supabase/migrations/20260821120000_product_scanner_v1.sql');

  it('offers one capture session across camera/upload/drop/paste with local barcode detection', () => {
    expect(ui).toContain('navigator.mediaDevices.getUserMedia');
    expect(ui).toContain("void addFiles(files, 'paste')");
    expect(ui).toContain("void addFiles([...event.dataTransfer.files], 'drop')");
    expect(ui).toContain('camera_auto');
    expect(ui).toContain('RollingBestFrameWindow');
    expect(ui).toContain('getSharedBarcodeDecoder');
    expect(ui).toContain('createLiveFrameSource');
    expect(ui).toContain('Usuń');
    expect(ui).toContain('Skanuj kamerą');
    expect(ui).toContain('Dodaj zdjęcia');
    expect(ui).not.toMatch(/MediaRecorder|RTCPeerConnection|webrtc/i);
    expect(ui).toContain("document.addEventListener('visibilitychange'");
  });

  it('keeps the OpenAI key and model choice server-only', () => {
    expect(service).not.toMatch(/OPENAI_API_KEY|api\.openai\.com|gpt-5/i);
    expect(ui).not.toMatch(/OPENAI_API_KEY|api\.openai\.com|gpt-5/i);
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
  });

  it('pins the exact Basic/Pro product quota and excludes failures/duplicates', () => {
    expect(migration).toContain("v_plan='pro' and v_month>=50");
    expect(migration).toContain("v_plan='basic' and v_month>=10");
    expect(migration).toContain("v_plan='basic' and v_lifetime>=5 and v_day>=1");
    expect(migration).toContain("status=case when p_created then 'consumed' else 'released' end");
    expect(finalize).toContain("const created = result.kind === 'created'");
    expect(migration).toContain('from public.account_profiles where user_id=p_actor_user_id');
    expect(migration).toContain("v_timezone:='UTC'");
  });

  it('limits the default session to four images and two paid vision calls', () => {
    expect(ui).toContain('const MAX_IMAGES = 4');
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

  it('keeps ordinary missing allergen declaration behind one truthful owner confirmation', () => {
    expect(finalize).toContain('noAdditionalAllergenStatementVisible');
    expect(finalize).toContain("missingCriticalFields[0] === 'allergen_confirmation'");
    expect(finalize).toContain('absence_of_statement_is_not_no_allergens');
    expect(finalize).toContain('missingFieldsAfterNotOnLabelConfirmation');
    expect(finalize).toContain('absence_only_not_zero_or_none');
    expect(finalize).toContain('userConfirmedNotOnLabelFields');
    expect(finalize).toContain('validation.highRiskAuthorityRequired !== true');
    expect(finalize).toContain('result_json: scanResult');
    expect(finalize).toContain('modelValidation: effectiveValidation');
    expect(finalize).toContain(".select('id')");
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
    expect(ui).not.toContain('allowWeb');
    expect(analyze).toContain("Deno.env.get('PRODUCT_SCANNER_WEB_SEARCH_ENABLED') === 'true'");
    expect(analyze).not.toContain('body.allowWeb === true');
  });

  it('feeds uploaded photos through the very same session and pipeline', () => {
    expect(ui).toContain("void addFiles(files, 'paste')");
    expect(ui).toContain("addFiles([...event.dataTransfer.files], 'drop')");
    expect(ui).toContain("void addFiles(files, 'gallery')");
    // One analyse path, one finalize path — there is no second ingestion pipeline.
    expect(ui.match(/analyzeProductImages\(/g)?.length).toBe(1);
    expect(ui.match(/finalizeProductScan\(/g)?.length).toBe(1);
  });

  it('sends only new evidence and the canonical list of unresolved fields', () => {
    expect(ui).toContain('analyzedAssetIds');
    expect(ui).toContain('missingFieldsForAnalysis');
    expect(service).toContain('missingFields: string[]');
    expect(analyze).toContain('Requested missing fields only:');
  });

  it('creates products through the shared canonical ingest, deduplicating on the GTIN', () => {
    expect(finalize).toContain("await service.rpc('ingest_product_v1'");
    expect(finalize).toContain("const source = text(input.ean) ? 'barcode' : 'manual'");
    expect(finalize).toContain("provenance: 'product_scanner_v1'");
    // No scanner-specific physical estimate is invented on the way in.
    expect(finalize).not.toMatch(/estimate|inference|mapper_value/i);
  });

  it('shows the required privacy message before cloud analysis', () => {
    expect(ui).toContain('Zdjęcia etykiety mogą zostać przesłane do analizy produktu.');
    expect(ui).toContain('Ceny, dostawcy, notatki i stan magazynowy nie są publikowane.');
    expect(ui.indexOf('if (!current.privacyAccepted)')).toBeLessThan(
      ui.indexOf('const response = await analyzeProductImages'),
    );
    // Live capture uploads on its own, so consent is taken BEFORE the camera opens —
    // not after the frames the owner never chose to send already exist.
    expect(ui).toContain('if (!session.current.privacyAccepted)');
    expect(ui).toContain('disabled={!state.privacyAccepted}');
  });
});
