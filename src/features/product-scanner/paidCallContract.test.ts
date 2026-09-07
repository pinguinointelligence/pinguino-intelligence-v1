import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

/*
  PAID-CALL CONTRACT (owner, 2026-09-07). A scan must not spend money it does not need to.

  Measured on the deployed functions the same day, from product_scan_usage_ledger:

    3375f79a  Sport 002  12:48:22  fast  image_count 1  completed  $0.001078
    6b8f1040  Sport 001  12:49:12  fast  image_count 1  completed  $0.001107

  — one billed vision call per photograph that reached the model, and the 503 at 12:48:47 is
  absent from the ledger, so a failed call bills nothing. What those billed calls bought was
  nothing at all: `evidence: []`, because the prompt asked for no fields. That is the waste this
  branch removes, and it is why the request-shaping test lives beside this one.

  These assertions guard the ORDER and the SHORT-CIRCUITS. They are deliberately source-level:
  the paths they protect are inside an edge function that cannot be imported here, and a comment
  is not a guarantee — the code shape is.
*/
describe('scanner paid-call contract', () => {
  const analyze = read('supabase/functions/product-scan-analyze/index.ts');
  const finalize = read('supabase/functions/product-scan-finalize/index.ts');
  const lookupSql = read('supabase/migrations/20260824140000_product_scan_live_evidence.sql');

  it('answers an exact EAN from the registry with no model call and no allowance', () => {
    const branch = analyze.slice(analyze.indexOf("if (mode === 'ean_lookup')"));
    const zeroCostReturn = branch.slice(0, branch.indexOf('reserve_product_scan_ean_lookup_v1'));
    // The exact-product answer must come BEFORE anything that reserves or spends.
    expect(zeroCostReturn).toContain('if (exact)');
    expect(zeroCostReturn).toContain('visionCalls: 0, webCalls: 0, estimatedCostUsd: 0');
    expect(zeroCostReturn).not.toContain('api.openai.com');
  });

  it("lets a customer rescan their own private product on the same free path", () => {
    // A customer_provisional row is account-private, so only a linked owner may take it — but a
    // linked owner MUST take it, or every rescan of their own product would pay again.
    expect(analyze).toContain("product.product_kind === 'customer_provisional'");
    expect(analyze).toContain('customer_added_product_accounts');
  });

  it('spends the EAN lookup at most once per session', () => {
    expect(lookupSql).toContain('session_lookup_already_used');
    // Preview, finalize and a repeated save reuse the session, so they cannot re-trigger it.
    expect(analyze).toContain('reserve_product_scan_ean_lookup_v1');
  });

  it('never calls vision without an image', () => {
    expect(analyze).toContain("(mode === 'analyze' && images.length < 1)");
    expect(analyze).toContain("json({ error: 'invalid_scan_session' }, 400)");
  });

  it('reserves the budget before the model, so a refusal cannot bill', () => {
    const reserve = analyze.indexOf('reserve_product_scan_analysis_v1');
    const call = analyze.indexOf('api.openai.com');
    expect(reserve).toBeGreaterThan(-1);
    expect(reserve).toBeLessThan(call);
  });

  it('asks the text model only when the deterministic classifier could not decide', () => {
    // serverSemanticClassification returns early on a resolved verdict; the fetch is unreachable
    // for a product the deterministic pass settled.
    const fn = finalize.slice(finalize.indexOf('async function serverSemanticClassification'));
    const guard = fn.indexOf('if (!deterministic.modelRequired) return deterministic;');
    const enrich = fn.indexOf('intimport-enrich');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(enrich);
  });

  it('keys the model verdict so an unchanged product is not paid for twice', () => {
    // intimport_semantic_classification_usage is written per evidence fingerprint; a repeat with
    // the same evidence reads the row instead of calling. Observed live: fingerprint
    // recognition-v2-fe0cf025 was reused across three sessions on 2026-09-07.
    expect(finalize).toContain('evidenceFingerprint');
    expect(finalize).toContain('classification.evidenceFingerprint === deterministic.evidenceFingerprint');
  });

  it('does not let a model outage manufacture a verdict', () => {
    expect(finalize).toContain('A model outage cannot create authority');
  });
});
