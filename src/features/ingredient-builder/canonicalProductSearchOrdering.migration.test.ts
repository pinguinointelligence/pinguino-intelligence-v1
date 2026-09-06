import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve('supabase/migrations/20260903170000_canonical_product_picker_deterministic_order.sql'),
  'utf8',
);

describe('canonical product picker search ordering migration', () => {
  it('removes favorites and recents as ranking signals while a query is active', () => {
    expect(migration).toContain("when e.q<>'' then c.relevance - case when c.favorite then 8");
    expect(migration).toContain("when e.q='' then c.recently_used_at");
    // The legacy forms occur only once, as the guarded replacement anchor.
    expect(migration.match(/desc,c\.favorite desc,c\.relevance desc/g)).toHaveLength(1);
    expect(migration.match(/c\.relevance desc,c\.recently_used_at desc/g)).toHaveLength(1);
  });

  it('patches the current authority forward without replacing the Mapper dataset', () => {
    expect(migration).toContain('pg_get_functiondef');
    expect(migration).toContain('search_products_v1');
    expect(migration).toContain('ordering anchor drifted');
    expect(migration).not.toMatch(
      /\b(update|insert into|delete from)\s+public\.mapper_basement\b/i,
    );
  });
});
