import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../supabase/migrations/20260825200000_canonical_carbonation_and_production_degassing.sql',
  ),
  'utf8',
);

describe('canonical carbonation persistence', () => {
  it('adds one constrained status to Mapper and Products without rewriting Mapper rows', () => {
    expect(migration).toContain('alter table public.mapper_basement');
    expect(migration).toContain("default 'UNKNOWN'");
    expect(migration).toContain("('CARBONATED','NON_CARBONATED','UNKNOWN')");
    expect(migration).not.toMatch(/update\s+public\.mapper_basement/i);
    expect(migration).toContain('carbonation_evidence jsonb');
  });

  it('persists the server-recomputed profile into immutable product-version facts', () => {
    expect(migration).toContain("p_risk#>'{productProfileAuthority,carbonation}'");
    expect(migration).toContain("'carbonationStatus',p_risk#>>'{productProfileAuthority,carbonation,status}'");
    expect(migration).toContain('product_version_carbonation_projection_v1');
  });
});
