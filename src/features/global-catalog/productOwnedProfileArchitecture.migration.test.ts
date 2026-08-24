import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const migration = readFileSync(
  resolve(root, 'supabase/migrations/20260824203000_product_owned_profile_authority.sql'),
  'utf8',
);
const identityMigration = readFileSync(
  resolve(root, 'supabase/migrations/20260824204000_normalize_pi_pm_article_identity.sql'),
  'utf8',
);
const edge = readFileSync(resolve(root, 'supabase/functions/catalog-submit/index.ts'), 'utf8');
const picker = readFileSync(
  resolve(root, 'src/features/ingredient-builder/mapperOnlyCatalog.ts'),
  'utf8',
);

describe('product-owned PR profile authority', () => {
  it('persists only the server-private recomputed profile and accuracy', () => {
    expect(edge).toContain('validateIntimportProductProfileProposal');
    expect(edge).toContain('productProfileAuthority: serverProductProfileAuthority');
    expect(edge).toContain('browser_intimport_product_profile_authority_forbidden');
    expect(migration).toContain("p_risk#>'{productProfileAuthority,technicalComposition}'");
    expect(migration).toContain("'technicalComposition',p_risk#>'{productProfileAuthority,technicalComposition}'");
    expect(migration).toContain("'productAccuracy'");
    expect(migration).toContain("'fieldTruth'");
  });

  it('uses product readiness and own composition without requiring a Mapper binding', () => {
    expect(migration).toContain("v_public_data#>>'{productIntelligence,engineUsable}'='true'");
    expect(migration).toContain("'technicalComposition',v_public_facts->'technicalComposition'");
    expect(migration).toContain("v_old:=$old$      'technicalComposition',v_mapper_composition");
    expect(migration).toContain('product_owned_profile_missing');
  });

  it('keeps unknown allergen evidence distinct from confirmed absence', () => {
    expect(migration).toContain("'allergenEvidenceStatus'");
    expect(migration).toContain('NOT_CONFIRMED');
    expect(migration).not.toContain("'NO_ALLERGENS'");
  });

  it('makes PR article IDs searchable and removes Mapper-specific refusal copy', () => {
    expect(migration).toContain('p.product_code');
    expect(migration).toContain('product_owned_profile_incomplete');
    expect(picker).not.toContain('borrowing an authorized Mapper identity');
  });

  it('allocates PM at the canonical insert seam and accepts PM-owned profiles', () => {
    expect(migration).toContain("case when p_source in ('ocr','barcode','manual') then 'PM' else 'PR' end");
    expect(migration).toContain("p_risk#>>'{productProfileAuthority,origin}'='PM'");
    expect(migration).toContain("return v_origin||'-ING-'");
  });

  it('never writes the immutable Mapper dataset', () => {
    expect(migration).not.toMatch(/(insert\s+into|update|delete\s+from)\s+public\.mapper_basement/i);
    expect(identityMigration).not.toMatch(
      /(insert\s+into|update|delete\s+from)\s+public\.mapper_basement/i,
    );
  });

  it('repairs legacy PI and PM namespaces without renumbering their suffixes', () => {
    expect(identityMigration).toContain("p.normalized_identity like 'mapper:PI-ING-%'");
    expect(identityMigration).toContain("set product_code='PM'||substring(p.product_code from 3)");
    expect(identityMigration).toContain("p.source_type in ('label_scan','manual')");
  });
});
