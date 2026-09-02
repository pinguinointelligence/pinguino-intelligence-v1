/**
 * Migration 20260824140000 — a failed analysis must not spend the session, and the exact
 * GTIN lookup needs somewhere to put what it finds.
 *
 * The owner reached „Limit analiz wykorzystany" on a scan that had produced nothing: the
 * completion function incremented `vision_calls` for BOTH outcomes, so two failures used
 * up an allowance of two. The same statement wrote `overlay_state='BLOCKED'` on failure,
 * discarding a good earlier analysis whenever a follow-up call failed.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = join(import.meta.dirname, '..', '..', '..');
const SQL = readFileSync(
  join(REPO, 'supabase', 'migrations', '20260824140000_product_scan_live_evidence.sql'),
  'utf8',
).replace(/--.*$/gm, '');
const PRIOR = readFileSync(
  join(REPO, 'supabase', 'migrations', '20260821120000_product_scanner_v1.sql'),
  'utf8',
);

const fn = (name: string) => {
  const start = SQL.indexOf(`create or replace function public.${name}`);
  const end = SQL.indexOf('$$;', start);
  return SQL.slice(start, end);
};

describe('a failed analysis costs the session nothing', () => {
  it('replaces the unconditional increment the owner ran into', () => {
    expect(PRIOR).toContain('vision_calls=vision_calls+1,');
    expect(SQL).not.toContain('vision_calls=vision_calls+1,');
    expect(fn('complete_product_scan_analysis_v1')).toContain(
      "vision_calls=vision_calls+case when p_status='completed' then 1 else 0 end",
    );
  });

  it('never lets a failure erase an analysis the session already holds', () => {
    const body = fn('complete_product_scan_analysis_v1');
    expect(body).toContain("overlay_state=case when p_status='completed' then p_overlay_state else overlay_state end");
    expect(body).toContain("result_json=case when p_status='completed' then p_result else result_json end");
    expect(body).toContain("when v_session.result_json is not null then 'analyzed'");
  });

  it('still records what the failed call actually cost', () => {
    const body = fn('complete_product_scan_analysis_v1');
    expect(body).toContain('status=p_status,actual_cost_usd=p_actual_cost_usd');
    expect(body).toContain('estimated_cost_usd=estimated_cost_usd+p_actual_cost_usd');
  });

  it('bounds retries by ATTEMPTS instead, so a free failure cannot become a loop', () => {
    const body = fn('reserve_product_scan_analysis_v1');
    expect(body).toContain('select count(*) into v_attempts from public.product_scan_usage_ledger');
    expect(body).toContain("'reason','session_analysis_attempt_limit'");
    expect(body).toContain('if v_attempts>=4 then');
    // The other spend controls are carried over untouched.
    expect(body).toContain("'reason','daily_cost_kill_switch'");
    expect(body).toContain("'reason','monthly_cost_kill_switch'");
    expect(body).toContain("'reason','analysis_burst'");
    expect(body).toContain("'reason','analysis_call_already_failed'");
  });

  it('keeps the successful-call ceiling at two', () => {
    const body = fn('reserve_product_scan_analysis_v1');
    expect(body).toContain("if v_session.vision_calls>=2 then");
    expect(body).toContain("'reason','fast_call_already_used'");
    expect(body).toContain("'reason','accurate_retry_requires_one_fast_call'");
  });
});

describe('the exact GTIN lookup has its own reservation', () => {
  it('runs at most once per session and only with a barcode', () => {
    const body = fn('reserve_product_scan_ean_lookup_v1');
    expect(body).toContain("'reason','lookup_requires_barcode'");
    expect(body).toContain('if v_session.web_calls>=1 then');
    expect(body).toContain("'reason','session_lookup_already_used'");
    // Reserved before the call, so two tabs cannot both spend it.
    expect(body).toContain('set web_calls=web_calls+1');
    expect(body).toContain("pg_advisory_xact_lock(hashtext('product-scan-lookup:'");
  });

  it('spends no analysis allowance', () => {
    const body = fn('complete_product_scan_ean_lookup_v1');
    expect(body).not.toContain('vision_calls');
  });

  it('writes source provenance exactly as a label analysis does', () => {
    const body = fn('complete_product_scan_ean_lookup_v1');
    expect(body).toContain('insert into public.product_scan_external_sources');
    expect(body).toContain("item->>'sourceType' in ('barcode_registry','manufacturer','retailer','web_search')");
    expect(body).toContain("item->>'url'~*'^https://'");
  });

  it('cannot resurrect an expired or finalized scan', () => {
    expect(fn('complete_product_scan_ean_lookup_v1')).toContain(
      "and state not in ('expired','finalized')",
    );
    expect(fn('reserve_product_scan_ean_lookup_v1')).toContain(
      "v_session.state in ('expired','finalized')",
    );
  });

  it('stays server-only, like every other scanner function', () => {
    expect(SQL).toContain(
      'revoke all on function public.reserve_product_scan_ean_lookup_v1(uuid,uuid) from public,anon,authenticated',
    );
    expect(SQL).toContain(
      'grant execute on function public.reserve_product_scan_ean_lookup_v1(uuid,uuid) to service_role',
    );
    expect(SQL).not.toMatch(/grant execute.*to (?:anon|authenticated)/);
    expect(SQL.match(/security definer set search_path=public/g)?.length).toBe(4);
  });
});
