import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260903212502_country_product_resolution_authority.sql',
  ),
  'utf8',
).replace(/\r\n/g, '\n');
const service = readFileSync(join(process.cwd(), 'src/services/globalCatalog.ts'), 'utf8');
const hook = readFileSync(
  join(process.cwd(), 'src/features/global-catalog/useGlobalCatalogPicker.ts'),
  'utf8',
);
const api = readFileSync(join(process.cwd(), 'api/product-country.js'), 'utf8');

describe('canonical country product resolution migration', () => {
  it('creates one explicit country/Mapper relationship authority with enforced primary and fallback order', () => {
    expect(migration).toContain('create table public.country_product_slot_assignments');
    expect(migration).toContain('country_product_slot_one_active_primary_idx');
    expect(migration).toContain("assignment_kind = 'PRIMARY_DEFAULT'");
    expect(migration).toContain('country_product_slot_fallback_priority_idx');
    expect(migration).toContain("assignment_kind = 'SAFE_FALLBACK'");
    expect(migration).toContain('fallback_priority between 1 and 32767');
    const resolverRanking = migration.slice(
      migration.indexOf('private.choose_country_product_resolution_v1'),
      migration.indexOf('revoke all on function private.choose_country_product_resolution_v1'),
    );
    expect(resolverRanking).not.toMatch(/price|created_at|brand|display_name/i);
  });

  it('accepts only a current ready shared product bound to the same Mapper slot and exact country', () => {
    const validator = migration.slice(
      migration.indexOf('private.country_product_slot_assignment_is_usable_v1'),
      migration.indexOf('private.validate_country_product_slot_assignment_v1'),
    );
    expect(validator).toContain("p.visibility = 'shared'");
    expect(validator).toContain('private.exact_product_has_picker_profile_v1(');
    expect(validator).toContain('version.id = p.current_version_id');
    expect(validator).toContain('binding.id = p.current_behavior_binding_id');
    expect(validator).toContain("binding.binding_status = 'ready'");
    expect(validator).toContain('binding.mapper_ingredient_id = btrim(p_mapper_ingredient_id)');
    expect(validator).toContain(
      'upper(coalesce(variant_market.market, variant.market)) = upper(btrim(p_country_code))',
    );
    const exactProfile = migration.slice(
      migration.indexOf('private.exact_product_has_picker_profile_v1'),
      migration.indexOf('revoke all on function private.exact_product_has_picker_profile_v1'),
    );
    for (const field of [
      'water',
      'totalSolids',
      'fat',
      'protein',
      'carbohydrate',
      'sugars',
      'salt',
    ]) {
      expect(exactProfile).toContain(`'{technicalComposition,${field}}'`);
    }
    expect(exactProfile).toMatch(
      /#>>\s*'\{productIntelligence,engineUsable\}'\s*\)?\s*=\s*'true'/,
    );
  });

  it('enforces the owner precedence and returns no implicit foreign/generic commercial winner', () => {
    const resolver = migration.slice(
      migration.indexOf('create or replace function public.resolve_country_product_slots_v1'),
      migration.indexOf('create or replace function public.merge_guest_product_country_v1'),
    );
    expect(resolver).toContain("'USER_PREFERRED'::text");
    expect(resolver).toContain('0 as authority_rank');
    expect(resolver).toContain("then 'COUNTRY_PRIMARY_DEFAULT'");
    expect(resolver).toContain("else 'COUNTRY_SAFE_FALLBACK'");
    expect(resolver).toContain('private.choose_country_product_resolution_v1(');
    expect(migration).toContain('order by candidates.authority_rank, candidates.fallback_rank');
    expect(resolver).toContain('assignment.country_code = effective_country.country_code');
    expect(resolver).not.toMatch(/favorite[^\n]*authority_rank|recent[^\n]*authority_rank/i);
    expect(resolver).not.toMatch(/limit\s+1/i);
  });

  it('lets saved account Product Country override a transient request country', () => {
    const effective = migration.slice(
      migration.indexOf('effective_country as ('),
      migration.indexOf('preferred_candidates as ('),
    );
    expect(effective.indexOf('pref.primary_market')).toBeLessThan(
      effective.indexOf('p_product_country'),
    );
  });

  it('keeps the assignment table admin-only while exposing only the bounded resolver', () => {
    expect(migration).toContain("gellatti_admin_has_permission_v1('CATALOG')");
    expect(migration).toContain('revoke all on table public.country_product_slot_assignments');
    expect(migration).toContain(
      'grant execute on function public.resolve_country_product_slots_v1(text[], text, text)',
    );
  });

  it('uses deployment country only for bootstrap and never browser/UI language', () => {
    expect(api).toContain("request.headers['x-vercel-ip-country']");
    expect(api).toContain("'Cache-Control', 'private, no-store, max-age=0'");
    const detection = service.slice(
      service.indexOf('export async function detectCatalogMarketCountry'),
      service.indexOf('export async function getCatalogMarketPreferences'),
    );
    expect(detection).toContain('readDeploymentProductCountry()');
    expect(detection).not.toMatch(/navigator|language|locale/i);
  });

  it('merges safe guest cases and surfaces different explicit choices as a conflict', () => {
    const merge = migration.slice(
      migration.indexOf('create or replace function public.merge_guest_product_country_v1'),
    );
    expect(merge).toContain("'GUEST_MERGED'");
    expect(merge).toContain("'ACCOUNT_KEPT'");
    expect(merge).toContain("'EXPLICIT_CONFLICT'");
    expect(merge).toContain("v_conflict_choice = 'ACCOUNT'");
    expect(merge).toContain("'GUEST_CHOSEN'");
  });

  it('routes HOME and PRO through the same resolver hook and one exact-SKU attachment', () => {
    expect(hook).toContain('resolveCountryProductsForSlots({');
    expect(hook).toContain('resolvedExactProduct: resolution.product');
    expect(hook).toContain('resolutionSource: resolution.source');
  });
});
