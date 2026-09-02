import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const migration = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260829210000_favorites_mapper_visibility.sql'),
  'utf8',
);

/**
 * Regression: a customer could never save a favourite.
 *
 * The `pi_base` RLS WITH CHECK inlined `exists (select 1 from mapper_basement …)`,
 * which is evaluated as the CALLER. `mapper_basement` is invisible to the
 * `authenticated` role (0 of 2089 rows), so the predicate was always false and
 * every star was refused with 42501 — silently, because the UI renders
 * optimistically and then reverts.
 */
describe('favourites / recent usage may be written by their owner', () => {
  it('moves the Mapper existence check behind an owner-privileged predicate', () => {
    expect(migration).toContain(
      'create or replace function public.gellatti_active_mapper_ingredient_v1',
    );
    expect(migration).toContain('security definer');
    expect(migration).toContain(
      'grant execute on function public.gellatti_active_mapper_ingredient_v1(text) to authenticated',
    );
  });

  it('keeps the accepted validation intent on both tables', () => {
    for (const policy of [
      'global_catalog_favorites_pi_base_own',
      'global_catalog_recent_pi_base_own',
    ]) {
      expect(migration).toContain(`create policy ${policy}`);
    }
    const checks = migration.split('with check (').slice(1);
    expect(checks).toHaveLength(2);
    for (const check of checks) {
      expect(check).toContain('user_id = auth.uid()');
      expect(check).toContain("entity_kind = 'pi_base'");
      expect(check).toContain('catalog_product_id is null');
      expect(check).toContain('mapper_ingredient_id is not null');
      expect(check).toContain('public.gellatti_active_mapper_ingredient_v1(mapper_ingredient_id)');
    }
  });

  it('never re-inlines a client-evaluated read of the Mapper dataset in a policy', () => {
    const policyBodies = migration.slice(migration.indexOf('drop policy'));
    expect(policyBodies).not.toContain('from public.mapper_basement');
    expect(policyBodies).not.toContain('from mapper_basement');
  });

  it('changes nothing about the Mapper dataset itself', () => {
    expect(migration).not.toMatch(/\b(insert into|update|delete from)\s+public\.mapper_basement/i);
    expect(migration).not.toMatch(/grant\s+select\s+on\s+public\.mapper_basement/i);
    expect(migration).not.toMatch(/alter table public\.mapper_basement/i);
  });
});
