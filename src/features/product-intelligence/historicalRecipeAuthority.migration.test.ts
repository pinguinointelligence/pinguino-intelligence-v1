import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  new URL(
    '../../../supabase/migrations/20260827160000_historical_recipe_product_authority.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('historical recipe product authority migration', () => {
  it('follows version successors and product merge aliases deterministically', () => {
    expect(SQL).toContain('historicalResolutionKind');
    expect(SQL).toContain('VERSION_SUCCESSOR');
    expect(SQL).toContain('PRODUCT_MERGE');
    expect(SQL).toContain('merged_into_product_id');
    expect(SQL).toContain('canonicalProductCode');
  });

  it('accepts an owner-scoped immutable recipe snapshot when the picker no longer exposes a product', () => {
    expect(SQL).toContain('IMMUTABLE_SNAPSHOT');
    expect(SQL).toContain('public.recipe_versions');
    expect(SQL).toContain('owner_user_id=auth.uid()');
    expect(SQL).toContain("product_composition->'behaviorSnapshots'");
  });

  it('keeps cross-account historical snapshots inaccessible', () => {
    expect(SQL).toMatch(/auth\.uid\(\) is null[\s\S]*authentication required/);
    expect(SQL).toContain('owner_user_id=auth.uid()');
    expect(SQL).not.toContain('owner_user_id=p_context');
  });
});
