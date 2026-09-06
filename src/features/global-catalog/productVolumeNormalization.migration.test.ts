import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260904102817_canonical_per_100ml_runtime_normalization.sql',
  ),
  'utf8',
).replace(/\r\n/g, '\n');

describe('frozen 1 ml = 1 g runtime normalization', () => {
  it('extends the existing ingest and Live Overlay gates instead of creating another authority', () => {
    expect(migration).toContain(
      "coalesce(v_facts->>'nutritionBasis',v_facts#>>'{nutrition,basis}') in ('per_100g','per_100ml')",
    );
    expect(migration).toContain(
      "coalesce(v_nutrition->>'basis','') not in ('per_100g','per_100ml')",
    );
    expect(migration).not.toMatch(/create table|country_product_slot_assignments/i);
  });

  it('preserves the source basis while projecting normalized per-100-g working values', () => {
    expect(migration).toContain("'basis','per_100g'");
    expect(migration).toContain("'sourceBasis',v_public_facts->'nutrition'->>'basis'");
    expect(migration).toContain("'GELLATTI_1ML_1G_NORMALIZATION'");
    expect(migration).toContain("'SOURCE_PER_100G'");
  });

  it('does not write to the frozen Mapper dataset or introduce a density authority', () => {
    expect(migration).not.toMatch(
      /(insert\s+into|update|delete\s+from|truncate)\s+(?:table\s+)?public\.mapper_basement/i,
    );
    expect(migration).not.toMatch(/density/i);
  });
});
