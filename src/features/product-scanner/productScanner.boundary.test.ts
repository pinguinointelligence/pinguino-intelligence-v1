import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Product Scanner server/client/security boundary', () => {
  const ui = read('src/pages/products/ProductScannerV1Page.tsx');
  const service = read('src/services/productScanner.ts');
  const analyze = read('supabase/functions/product-scan-analyze/index.ts');
  const finalize = read('supabase/functions/product-scan-finalize/index.ts');
  const migration = read('supabase/migrations/20260821120000_product_scanner_v1.sql');

  it('offers one capture session across camera/upload/drop/paste with local barcode detection', () => {
    expect(ui).toContain('navigator.mediaDevices.getUserMedia');
    expect(ui).toContain('BarcodeDetector');
    expect(ui).toContain("void addFiles(files, 'paste')");
    expect(ui).toContain("void addFiles([...event.dataTransfer.files], 'drop')");
    expect(ui).toContain('camera_auto');
    expect(ui).toContain('bestFrameRef');
    expect(ui).toContain('Zastąp');
    expect(ui).toContain('Skanuj kamerą');
    expect(ui).toContain('Dodaj zdjęcia');
    expect(ui).not.toMatch(/MediaRecorder|RTCPeerConnection|webrtc/i);
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

  it('shows the required privacy message before cloud analysis', () => {
    expect(ui).toContain('Zdjęcia etykiety mogą zostać przesłane do analizy produktu.');
    expect(ui).toContain('Ceny, dostawcy, notatki i stan magazynowy nie są publikowane.');
    expect(ui.indexOf('if (!privacyAccepted)')).toBeLessThan(
      ui.indexOf('const response = await analyzeProductImages'),
    );
  });
});
