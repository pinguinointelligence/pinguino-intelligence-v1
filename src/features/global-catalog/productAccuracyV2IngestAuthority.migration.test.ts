import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRODUCT_PRODUCTION_ACCURACY_VERSION } from '@/features/product-intelligence/productProductionAccuracy';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260827230000_product_accuracy_v2_ingest_authority.sql',
  ),
  'utf8',
);

describe('Product Accuracy V2 ingest authority migration', () => {
  it('keeps the database gate aligned with the current shared PR/PM scorer authority', () => {
    expect(PRODUCT_PRODUCTION_ACCURACY_VERSION).toBe('PRODUCT_PRODUCTION_ACCURACY_V2');
    expect(migration).toContain("<>'PRODUCT_PRODUCTION_ACCURACY_V1'");
    expect(migration).toContain("<>'PRODUCT_PRODUCTION_ACCURACY_V2'");
    expect(migration).toContain('product accuracy ingest authority anchor drifted');
  });

  it('patches only the nested score authority and does not weaken product-owned profile gates', () => {
    expect(migration).toContain(
      "p_risk#>>'{productProfileAuthority,productAccuracyAssessment,authority}'",
    );
    expect(migration).not.toContain('mapper_basement');
    expect(migration).not.toContain('engineUsable');
    expect(migration).not.toContain('criticalPhysicsBlockers');
  });
});
