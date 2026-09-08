import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const scanFlow = readFileSync(resolve(root, 'src/features/scan-flow/ScanFlow.tsx'), 'utf8');
const finalizer = readFileSync(
  resolve(root, 'supabase/functions/product-scan-finalize/index.ts'),
  'utf8',
);
const analyze = readFileSync(
  resolve(root, 'supabase/functions/product-scan-analyze/index.ts'),
  'utf8',
);
const migration = readFileSync(
  resolve(root, 'supabase/migrations/20260908101050_sol_052_publication_eligibility.sql'),
  'utf8',
);

describe('SOL-052 publication boundary across client, Edge and SQL', () => {
  it('does not send exact-registry automation through the customer-confirmation channel', () => {
    expect(scanFlow).not.toContain('confirmations: { productFields: web.productFields }');
    expect(scanFlow).toContain('automaticEvidence: web.automaticEvidence');
  });

  it('requires explicit customer action before the finalizer creates user_confirmed provenance', () => {
    expect(finalizer).toContain("evidenceOrigin === 'customer_action'");
    expect(finalizer).toContain('publicationIdentityEligibilityFromScanResult');
    expect(finalizer).toContain('setPathIfMissing(result, path, supplied)');
    expect(finalizer).toContain("source.hostname === 'world.openfoodfacts.org'");
  });

  it('has an independent SQL exact-SKU gate in addition to ready and confidence', () => {
    expect(migration).toContain('product_publication_identity_eligible_v1');
    expect(migration).toMatch(/v_ready\s+and\s+v_conf\s*>\s*85\s+and\s+v_publication_eligible/i);
    expect(migration).toContain('product_publication_identity_correction_required');
    expect(migration).toContain('v_correction_shared_count');
    expect(migration).toContain("if v_route=''PR'' then");
    expect(migration).toContain('values(v_ean,v_product_id,null) on conflict do nothing');
    expect(migration).toContain("raise exception ''shared_product_demand_state_invalid''");
    expect(migration).not.toMatch(
      /canonical_verification_status\s*=\s*''verified''[\s\S]{0,80}\bor\s+public\.product_publication_identity_eligible_v1/,
    );
  });

  it('excludes quarantine in both exact Edge lookup and every SQL catalogue route', () => {
    expect(analyze).toContain("canonical_verification_status === 'blocked'");
    expect(migration).toContain('resolve_exact_products_by_gtin_v1');
    expect(migration).toContain('search_products_v1');
    expect(migration).toContain("canonical_verification_status, '''') <> ''blocked''");
    expect(migration).toContain('existing PR');
    expect(analyze.indexOf('const eligibleCandidateRows')).toBeLessThan(
      analyze.indexOf("service.rpc('canonicalize_ean_identity_v1'"),
    );
  });

  it('keeps session state and correction-in-place semantics consistent', () => {
    expect(migration).toContain('finalized_at=coalesce(finalized_at,statement_timestamp())');
    expect(migration).toContain("when v_route=''PR'' then ''PUBLISHED''");
    expect(finalizer).toContain('missingCriticalFields: criticalGaps');
    expect(migration).toContain("if v_route<>''PR'' and exists (");
    expect(migration).toContain("raise exception ''ambiguous_shared_products_for_ean''");
  });
});
