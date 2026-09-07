import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260904110935_product_canonical_slot_review_authority.sql',
  ),
  'utf8',
).replace(/\r\n/g, '\n');

describe('product canonical-slot review authority migration', () => {
  it('creates one version-bound, evidence-backed active slot review per exact product', () => {
    expect(migration).toContain('create table public.product_canonical_slot_reviews');
    expect(migration).toContain(
      'product_version_id uuid not null references public.product_versions(id) on delete restrict',
    );
    expect(migration).toContain('product_canonical_slot_one_active_slot_idx');
    expect(migration).toContain('on public.product_canonical_slot_reviews(product_id)');
    expect(migration).toContain("review_evidence->>'slotMatchBasis'");
    expect(migration).toContain("gellatti_admin_has_permission_v1('CATALOG')");
  });

  it('validates the current product-owned Engine profile and current approved canonical slot', () => {
    const validator = migration.slice(
      migration.indexOf('private.product_canonical_slot_candidate_is_valid_v1'),
      migration.indexOf(
        'revoke all on function private.product_canonical_slot_candidate_is_valid_v1',
      ),
    );
    expect(validator).toContain('version.id = product.current_version_id');
    expect(validator).toContain('binding.id = product.current_behavior_binding_id');
    expect(validator).toContain("binding.binding_status = 'ready'");
    expect(validator).toContain("binding.profile_permissions->>'BASE_RECIPE'");
    expect(validator).toContain("#>> '{productIntelligence,engineUsable}'");
    expect(validator).toContain('mapper.ingredient_id = btrim(p_mapper_ingredient_id)');
    expect(validator).toContain('mapper.approved_for_base');
    expect(validator).toContain('mapper.approved_for_engines');
    for (const field of [
      'water',
      'totalSolids',
      'fat',
      'protein',
      'carbohydrate',
      'sugars',
      'salt',
    ]) {
      expect(validator).toContain(`'{technicalComposition,${field}}'`);
    }
  });

  it('keeps slot eligibility separate from country/default ranking and ProductBehavior identity', () => {
    expect(migration).not.toMatch(
      /(?:insert\s+into|update|delete\s+from)\s+public\.mapper_basement/i,
    );
    expect(migration).not.toMatch(
      /(?:insert\s+into|update|delete\s+from)\s+public\.product_behavior_bindings/i,
    );
    expect(migration).not.toContain('create table public.country_product_slot_assignments');
    expect(migration).not.toContain('mapperDecision');
    const exactProfile = migration.slice(
      migration.indexOf('create or replace function private.exact_product_has_picker_profile_v1'),
      migration.indexOf('revoke all on function private.exact_product_has_picker_profile_v1'),
    );
    expect(exactProfile).toContain('private.product_has_current_canonical_slot_review_v1(');
    expect(exactProfile).not.toContain('binding.mapper_ingredient_id');
  });

  it('serves the reviewed requested slot without reintroducing runtime Mapper identity', () => {
    const resolver = migration.slice(
      migration.indexOf('create or replace function public.resolve_country_product_slots_v1'),
      migration.indexOf(
        'revoke all on function public.resolve_country_product_slots_v1(text[], text, text)',
      ),
    );
    expect(resolver).toContain('winner.mapper_ingredient_id');
    expect(resolver).toContain('mapper.ingredient_id = winner.mapper_ingredient_id');
    expect(resolver).toContain('private.product_has_current_canonical_slot_review_v1(');
    expect(resolver).not.toContain('binding.mapper_ingredient_id');
  });
});
