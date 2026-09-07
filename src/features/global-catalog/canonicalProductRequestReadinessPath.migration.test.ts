import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260904105754_canonical_product_request_readiness_path_fix.sql',
  ),
  'utf8',
);

describe('canonical Product Request readiness path repair', () => {
  it('reads the persisted product-owned readiness assessment from productIntelligence', () => {
    expect(migration).toContain(
      "pv.facts#>>'{productIntelligence,productAccuracyAssessment,gellattiReadiness,ready}'",
    );
    expect(migration).toContain("pv.facts#>>'{productAccuracyAssessment,gellattiReadiness,ready}'");
  });

  it('patches only the canonical Admin Product Request action and fails closed on drift', () => {
    expect(migration).toContain('public.gellatti_admin_product_request_action_v1(uuid,text,jsonb)');
    expect(migration).toContain('product_request_readiness_path_anchor_drifted');
    expect(migration).not.toContain('gellatti_upsert_customer_added_product_v1');
    expect(migration).not.toContain('mapper_basement');
  });
});
