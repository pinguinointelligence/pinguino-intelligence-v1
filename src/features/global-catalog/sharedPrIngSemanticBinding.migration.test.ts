import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260912120000_shared_pr_ing_semantic_binding.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

const topLevelSql = sql.replace(/\$([a-z_]*)\$[\s\S]*?\$\1\$/g, '');
const scannerExistingPrPatch =
  sql.match(/do \$patch_scanner_existing_pr\$([\s\S]*?)\$patch_scanner_existing_pr\$;/)?.[1] ??
  '';

describe('shared PR-ING semantic binding migration', () => {
  it('PRING-MIG-01 admits only trusted standalone TOPPING_ONLY authority', () => {
    expect(sql).toMatch(
      /referenceMapperIngredientId}'\s+is not distinct from 'null'::jsonb/,
    );
    expect(sql).toContain("intendedUsageRole}'='TOPPING_ONLY'");
    expect(sql).toContain("profilePermissions,BASE_RECIPE}')::boolean,true)=false");
    expect(sql).toContain("profilePermissions,TOPPING}')::boolean,false");
    expect(sql).toContain("profilePermissions,SUBSTITUTION}')::boolean,true)=false");
    expect(sql).toContain("processBehavior,decision}'='POST_PROCESS'");
    expect(sql).toContain("profileReferenceAuthority}'='RECOGNITION_SEMANTIC_AUTHORITY'");
  });

  it('PRING-MIG-02 leaves BASE fail-closed on independent technical authority', () => {
    expect(sql).toContain("'BASE_RECIPE',v_product_behavior_accepted and v_base");
    expect(sql).toContain("'technicalAuthorityRequired',true");
    expect(sql).toContain("profile_permissions->>'BASE_RECIPE'");
    expect(sql).not.toContain("'BASE_RECIPE',v_product_behavior_topping_accepted");
  });

  it('PRING-MIG-03 leaves SUBSTITUTE fail-closed on its existing BASE authority', () => {
    expect(sql).toContain("'SUBSTITUTION',v_product_behavior_accepted and v_base");
    expect(sql).toContain("'compatibilityAuthorityRequired',true");
    expect(sql).not.toContain("'SUBSTITUTION',v_product_behavior_topping_accepted");
  });

  it('PRING-MIG-04 performs no migration-time backfill or product/Mapper mutation', () => {
    expect(topLevelSql).not.toMatch(
      /\b(?:insert\s+into|update|delete\s+from)\s+public\.(?:products|product_versions|product_behavior_bindings|mapper_basement)\b/i,
    );
    expect(sql).not.toMatch(
      /\b(?:insert\s+into|update|delete\s+from)\s+public\.mapper_basement\b/i,
    );
    expect(sql).not.toContain('PI-ING-');
  });

  it('PRING-MIG-05 binds exact product/version/code plus pack and variant', () => {
    expect(sql).toContain("'productId',v_product.id");
    expect(sql).toContain("'articleCode',v_product.product_code");
    expect(sql).toContain("'productVersionId',v_version.id");
    expect(sql).toContain("'variant',nullif(v_public_data#>>");
    expect(sql).toContain("'pack',nullif(v_public_data#>>");
    expect(sql).toContain(
      "'product_semantic_binding',b.behavior_snapshot->'productSemanticBinding'",
    );
  });

  it('PRING-MIG-06 fails closed on weak, conflicting or non-FINAL semantics', () => {
    expect(sql).toContain("evidence,materialConflicts}'");
    expect(sql).toContain("semanticBindingProposal,state}'='RESOLVED'");
    expect(sql).toContain("='GELLATTI-SA10-2026-09-10-FINAL'");
    expect(sql).toContain("concept->>'id' !~ '^SC-'");
    expect(sql).toContain("semanticBindingProposal,reasonCodes}'");
  });

  it('PRING-MIG-07 exposes persisted readiness to catalogue and known-product reads', () => {
    expect(sql).toContain("'productSemanticBinding',b.behavior_snapshot->'productSemanticBinding'");
    expect(sql).toContain("'roleReadiness',b.behavior_snapshot->'roleReadiness'");
    expect(sql).toContain(
      'create or replace function public.get_canonical_product_for_account_v1(',
    );
    expect(sql).toContain("'package_size',coalesce(");
    expect(sql).toContain("'product_variant',coalesce(");
  });

  it('PRING-MIG-08 is transactional, advisory-locked and forward-only', () => {
    expect(sql.trimStart().startsWith('-- SHARED PR-ING')).toBe(true);
    expect(sql).toMatch(/\nbegin;\n/);
    expect(sql).toContain(
      "pg_advisory_xact_lock(hashtextextended('shared-pr-ing-semantic-binding-v1',0))",
    );
    expect(sql.trimEnd().endsWith('commit;')).toBe(true);
    expect(sql).not.toMatch(/\brollback\b/i);
  });

  it('PRING-MIG-09 version-bumps only a newly resolved exact existing PR', () => {
    expect(scannerExistingPrPatch).toContain('SHARED_PR_ING_TARGETED_REVALIDATION_V1');
    expect(scannerExistingPrPatch).toContain("semanticBindingProposal,state}'='RESOLVED'");
    expect(scannerExistingPrPatch).toContain("exactIdentity,ean}',''),'\\D','','g'");
    expect(scannerExistingPrPatch).toContain('insert into public.product_versions(');
    expect(scannerExistingPrPatch).toContain('v_existing_version.version+1');
    expect(scannerExistingPrPatch).toContain('v_existing_version.id');
    expect(scannerExistingPrPatch).toContain('shared_pr_semantic_revalidation_rejected');
    expect(scannerExistingPrPatch).toContain('current_binding.behavior_snapshot#>>');
    expect(scannerExistingPrPatch).not.toContain('insert into public.products(');
    expect(scannerExistingPrPatch).not.toContain('PI-ING-');
  });
});
