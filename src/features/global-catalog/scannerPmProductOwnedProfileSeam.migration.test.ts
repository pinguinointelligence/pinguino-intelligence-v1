import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const migration = readFileSync(
  resolve(root, 'supabase/migrations/20260825233000_scanner_pm_product_owned_profile_seam.sql'),
  'utf8',
);
const scannerFinalize = readFileSync(
  resolve(root, 'supabase/functions/product-scan-finalize/index.ts'),
  'utf8',
);
const catalogSubmit = readFileSync(
  resolve(root, 'supabase/functions/catalog-submit/index.ts'),
  'utf8',
);

describe('Scanner PM canonical product-owned profile seam', () => {
  it('persists the complete server-recomputed profile snapshot for both PM and PR', () => {
    expect(migration).toContain("'productProfileAuthority',p_risk#>'{productProfileAuthority}'");
    expect(migration).toContain(
      "coalesce(p_risk#>>'{productProfileAuthority,origin}','') not in ('PR','PM')",
    );
    expect(migration).toContain("p_risk#>'{productProfileAuthority,criticalPhysicsBlockers}'");
    expect(migration).toContain("p_risk#>'{productProfileAuthority,sweetnessPath}'");
    expect(migration).toContain("p_risk#>'{productProfileAuthority,productAccuracyAssessment}'");
    expect(migration).toContain('PRODUCT_PRODUCTION_ACCURACY_V1');
  });

  it('does not call an existing but non-ready product profile missing', () => {
    expect(migration).toContain(
      "coalesce(v_public_data#>>'{productIntelligence,authority}','')<>'PRODUCT_PROFILE_V1'",
    );
    expect(migration).toContain("jsonb_typeof(v_public_data->'technicalComposition')<>'object'");
    expect(migration).toContain('product_owned_profile_missing');
    expect(migration).toContain('classificationReasonCodes');
  });

  it('keeps canonical profile creation Admin-owned after Scanner evidence', () => {
    expect(scannerFinalize).toContain("'gellatti_submit_product_request_v1'");
    expect(scannerFinalize).not.toContain("service.rpc('ingest_product_v1'");
    expect(scannerFinalize).not.toContain('productProfileAuthority');
    expect(catalogSubmit).toContain('validateIntimportProductProfileProposal');
    expect(catalogSubmit).toContain('validateProductBehaviorAuthority');
    expect(catalogSubmit).toContain("service.rpc('ingest_product_v1'");
    expect(catalogSubmit).toContain('productProfileAuthority');
    expect(catalogSubmit).toContain('productBehaviorAuthority');
  });

  it('keeps Mapper read-only and out of PM runtime identity', () => {
    expect(migration).not.toMatch(
      /(insert\s+into|update|delete\s+from|truncate)\s+(?:table\s+)?public\.mapper_basement/i,
    );
    expect(migration).not.toContain('matched_basement_id');
    expect(migration).not.toContain("'mapperIngredientId'");
  });

  it('accepts canonical TOPPING_ONLY authority without granting BASE readiness', () => {
    expect(migration).toContain('v_product_behavior_topping_accepted');
    expect(migration).toContain("p_risk#>>'{productBehaviorAuthority,toppingEligible}'");
    expect(migration).toContain("'TOPPING',v_product_behavior_topping_accepted and v_topping");
    expect(migration).toContain("mb.profile_permissions->>'BASE_RECIPE'");
  });
});
