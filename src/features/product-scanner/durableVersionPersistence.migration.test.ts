import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const MIGRATION = read(
  'supabase/migrations/20260913194637_scanner_durable_version_persistence.sql',
);
const ROOT = read('supabase/migrations/20260813110300_canonical_product_root_and_ingest.sql');
const ANALYZE = read('supabase/functions/product-scan-analyze/index.ts');

describe('Scanner 2.4 durable immutable product-version persistence', () => {
  it('SCN-2.4-VERSION-01 supersedes stale current facts and switches current_version_id', () => {
    expect(MIGRATION).toContain('v_existing_version.version+1');
    expect(MIGRATION).toContain('insert into public.product_versions(');
    expect(MIGRATION).toContain('update public.products set current_version_id=v_version_id');
    expect(MIGRATION).toContain('v_version_superseded:=true');
  });

  it('SCN-2.4-VERSION-02 exact corrected replay reuses the current version', () => {
    expect(MIGRATION).toContain('public.gellatti_scanner_material_facts_v1(v_facts)');
    expect(MIGRATION).toContain(
      'is distinct from public.gellatti_scanner_material_facts_v1(v_prior_facts)',
    );
    expect(MIGRATION).not.toMatch(/else\s+insert into public\.product_versions/i);
  });

  it('SCN-2.4-VERSION-03 metadata-only or key-order-only changes are not material', () => {
    expect(MIGRATION).toContain("'retrievedAt'");
    expect(MIGRATION).toContain("'sourceEanConfirmedAt'");
    expect(MIGRATION).toContain("'receiptId'");
    expect(MIGRATION).toContain('jsonb_agg(item.value order by item.value::text)');
  });

  it('SCN-2.4-VERSION-04 historical versions remain immutable and linked', () => {
    expect(MIGRATION).toContain('v_existing_version.id');
    expect(MIGRATION).toContain('facts_fingerprint,supersedes');
    expect(MIGRATION).not.toMatch(/update\s+public\.product_versions/i);
    expect(MIGRATION).not.toMatch(/delete\s+from\s+public\.product_versions/i);
    expect(ROOT).toContain('create trigger product_versions_immutable');
  });

  it('SCN-2.4-VERSION-05 product, article, EAN and variant identity are not recreated', () => {
    expect(MIGRATION).not.toMatch(/insert\s+into\s+public\.products\s*\(/i);
    expect(MIGRATION).not.toMatch(/insert\s+into\s+public\.product_variants\s*\(/i);
    expect(MIGRATION).not.toMatch(/product_code\s*=/i);
    expect(MIGRATION).not.toMatch(/ean_code(?:_normalized)?\s*=/i);
  });

  it('SCN-2.4-VERSION-06 unrelated canonical facts survive the Scanner-owned merge', () => {
    expect(MIGRATION).toContain("coalesce(p_current_facts, '{}'::jsonb) - array[");
    expect(MIGRATION).toContain(
      "coalesce(p_current_facts->'productIntelligence', '{}'::jsonb) - array[",
    );
    expect(MIGRATION).toContain("'productProfileAuthority', p_product_profile");
    expect(MIGRATION).toContain("'productBehaviorAuthority', p_product_behavior");
  });

  it('SCN-2.4-VERSION-07 equivalent concurrent finalizes serialize to at most one version', () => {
    expect(MIGRATION).toContain(
      "pg_advisory_xact_lock(hashtextextended(''customer-added-ean:''||v_ean,0))",
    );
    expect(MIGRATION).toContain('where id=v_existing_pr.id for update');
    expect(MIGRATION).toContain('and merged_into_product_id is null\n      for update;');
    expect(ROOT).toContain('unique(product_id,version)');
  });

  it('SCN-2.4-VERSION-08 Owner yogurt semantic removal is material, not score-gated', () => {
    expect(MIGRATION).toContain('SCANNER_DURABLE_VERSION_PERSISTENCE_V1');
    expect(MIGRATION).toContain("v_old := '      if v_improves then';");
    expect(MIGRATION).toContain(
      'is distinct from public.gellatti_scanner_material_facts_v1(v_prior_facts)',
    );
    expect(MIGRATION).toContain("'productProfileAuthority', p_product_profile");
    expect(MIGRATION).toContain("'productionDeclarations'");
  });

  it('SCN-2.4-VERSION-09 second Owner yogurt replay returns the reused version ID', () => {
    expect(MIGRATION).toContain("'versionSuperseded',v_version_superseded");
    expect(MIGRATION).toContain("'productVersionId',v_version_id");
    expect(MIGRATION).toContain('v_version_id:=v_existing_version.id');
    expect(ANALYZE).toContain('body.versionSuperseded === true');
  });
});
