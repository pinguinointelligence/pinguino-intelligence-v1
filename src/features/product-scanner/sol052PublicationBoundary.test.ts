import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const scanFlow = readFileSync(resolve(root, 'src/features/scan-flow/ScanFlow.tsx'), 'utf8');
const discoveryAdapter = readFileSync(
  resolve(root, 'src/scan-import-v2/adapters/supabaseDiscoveryAdapter.ts'),
  'utf8',
);
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
const rollback = readFileSync(
  resolve(root, 'supabase/rollbacks/20260908101050_sol_052_publication_eligibility.rollback.sql'),
  'utf8',
);

describe('SOL-052 publication boundary across client, Edge and SQL', () => {
  it('sends an explicit V2 contract with a V1 compatibility projection', () => {
    expect(scanFlow).not.toContain('confirmations: { productFields: web.productFields }');
    expect(scanFlow).toContain('automaticEvidence: web.automaticEvidence');
    expect(discoveryAdapter).toContain('withProductScanFinalizeV2Contract');
  });

  it('resolves legacy and V2 explicitly before assigning provenance', () => {
    expect(finalizer).toContain('resolveProductScanFinalizeContract(body)');
    expect(finalizer).toContain("contract.mode === 'unsupported'");
    expect(finalizer).toContain('publicationIdentityEligibilityFromScanResult');
    expect(finalizer).toContain('setPathIfMissing(result, path, supplied)');
    expect(finalizer).toContain("source.hostname === 'world.openfoodfacts.org'");
  });

  it('has an independent SQL exact-SKU gate in addition to ready and confidence', () => {
    expect(migration).toContain('product_publication_identity_eligible_v1');
    expect(migration).toMatch(/v_ready\s+and\s+v_conf\s*>\s*85\s+and\s+v_publication_eligible/i);
    expect(migration).toContain('shared_product_requires_separate_correction');
    expect(migration).not.toContain('v_correction_shared_count');
    expect(migration).not.toContain('product_publication_identity_correction_required');
    expect(migration).not.toContain('values(v_ean,v_product_id,null) on conflict do nothing');
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

  it('keeps session state while excluding correction-in-place from this rollout', () => {
    expect(migration).toContain('finalized_at=coalesce(finalized_at,statement_timestamp())');
    expect(migration).toContain("when v_route=''PR'' then ''PUBLISHED''");
    expect(finalizer).toContain('missingCriticalFields: criticalGaps');
    expect(migration).not.toContain('correction-in-place');
    expect(migration).not.toContain('ambiguous_shared_products_for_ean');
    expect(migration).not.toContain(
      'v_improves:=(not public.product_publication_identity_eligible',
    );
  });

  it('is transactional, idempotent and has an inverse rollback for every patched RPC', () => {
    expect(migration.trimStart().indexOf('begin;')).toBeLessThan(
      migration.indexOf('create or replace function'),
    );
    expect(migration.trimEnd().endsWith('commit;')).toBe(true);
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("p_facts->>'displayName'");
    for (const marker of [
      'SOL052_PUBLICATION_ELIGIBILITY_UPSERT_V2',
      'SOL052_PUBLICATION_ELIGIBILITY_EXACT_V2',
      'SOL052_PUBLICATION_ELIGIBILITY_SEARCH_V2',
      'SOL052_PUBLICATION_ELIGIBILITY_CANONICAL_V2',
    ]) {
      expect(migration).toContain(marker);
      expect(rollback).toContain(marker);
    }
    expect(rollback.trimStart().indexOf('begin;')).toBeGreaterThanOrEqual(0);
    expect(rollback.trimEnd().endsWith('commit;')).toBe(true);
    expect(rollback).toContain(
      'drop function if exists public.product_publication_identity_eligible_v1(jsonb)',
    );
  });
});
