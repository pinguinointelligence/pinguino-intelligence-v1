import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const migration = readFileSync(
  resolve(root, 'supabase/migrations/20260825210000_product_behavior_authority_restore.sql'),
  'utf8',
);
const articleCodeSearchMigration = readFileSync(
  resolve(root, 'supabase/migrations/20260825213000_product_article_code_search.sql'),
  'utf8',
);
const articleCodeExactMatchMigration = readFileSync(
  resolve(root, 'supabase/migrations/20260825214500_product_article_code_exact_match.sql'),
  'utf8',
);
const catalogSubmit = readFileSync(
  resolve(root, 'supabase/functions/catalog-submit/index.ts'),
  'utf8',
);
const scannerFinalize = readFileSync(
  resolve(root, 'supabase/functions/product-scan-finalize/index.ts'),
  'utf8',
);

describe('PR/PM ProductBehavior authority restore', () => {
  it('persists ProductBehavior on the immutable product/version binding without PI identity', () => {
    expect(migration).toContain('PRODUCT_BEHAVIOR_V1');
    expect(migration).toContain('server_recomputed_product_behavior');
    expect(migration).toContain(
      "v_behavior_reference:=nullif(v_public_data#>>'{productIntelligence,productBehaviorAuthority,referenceMapperIngredientId}','')",
    );
    expect(migration).toContain('v_product_behavior_accepted');
    expect(migration).toContain('v_product_behavior_accepted and v_base');
    expect(migration).toContain("runtimeMapperIngredientId}' is distinct from 'null'::jsonb");
    expect(migration).toContain("runtimeMapperIngredientId}' is null");
    expect(migration).toContain("'productBehaviorAuthority',p_risk#>'{productBehaviorAuthority}'");
    expect(migration).toContain('v_mapping is null');
  });

  it('retires every automatic or admin PR→PI runtime writer', () => {
    expect(migration).toContain('commercial Mapper runtime identity is retired');
    expect(migration).toContain('authorize_live_overlay_mapper_identity_v1');
    expect(migration).toMatch(
      /revoke all on function public\.authorize_live_overlay_mapper_identity_v1\(uuid,uuid\)[\s\S]*service_role/i,
    );
    expect(catalogSubmit).not.toContain('authorizeLiveOverlayIdentity');
    expect(scannerFinalize).not.toContain('authorizeLiveOverlayIdentity');
  });

  it('does not write or copy Mapper composition and never weakens thresholds', () => {
    expect(migration).not.toMatch(/(insert\s+into|update)\s+public\.mapper_basement/i);
    expect(migration).not.toContain("'technicalComposition',v_mapper");
    expect(migration).not.toMatch(/0\.8[0-49]/);
    expect(catalogSubmit).toContain('validateProductBehaviorAuthority');
    expect(scannerFinalize).toContain('validateProductBehaviorAuthority');
    expect(scannerFinalize).toContain("'gellatti_upsert_customer_added_product_v1'");
    expect(catalogSubmit).toContain('.range(offset, offset + 999)');
    expect(scannerFinalize).toContain('.range(offset, offset + 999)');
  });

  it('keeps the product-owned PR/PM article code searchable in the normal picker', () => {
    expect(articleCodeSearchMigration).toContain('public.search_products_v1');
    expect(articleCodeSearchMigration).toContain('p.product_name_internal,p.product_code,p.brand');
    expect(articleCodeExactMatchMigration).toContain(
      "(' '||c.search_text||' ') like '% '||e.q||' %'",
    );
    expect(articleCodeExactMatchMigration).not.toContain(
      'extensions.similarity(c.search_text,e.q)',
    );
    expect(articleCodeSearchMigration).not.toContain('mapper_ingredient_id:=p.product_code');
    expect(articleCodeSearchMigration).not.toMatch(
      /(insert\s+into|update)\s+public\.mapper_basement/i,
    );
    expect(articleCodeExactMatchMigration).not.toMatch(
      /(insert\s+into|update)\s+public\.mapper_basement/i,
    );
  });
});
