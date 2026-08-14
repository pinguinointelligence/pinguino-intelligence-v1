import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const migration = readFileSync(
  join(ROOT, 'supabase/migrations/20260814110000_product_search_v1.sql'),
  'utf8',
);
const service = readFileSync(join(ROOT, 'src/services/globalCatalog.ts'), 'utf8');
const picker = readFileSync(
  join(ROOT, 'src/features/ingredient-builder/ProductPickerPopover.tsx'),
  'utf8',
);
const legacyPickerHook = readFileSync(
  join(ROOT, 'src/features/ingredient-builder/useIngredientSearch.ts'),
  'utf8',
);
const customerShell = readFileSync(
  join(ROOT, 'src/features/customer-shell/CustomerShellV1.tsx'),
  'utf8',
);
const mapperAdapter = readFileSync(
  join(ROOT, 'src/services/productPicker/mapperSearch.ts'),
  'utf8',
);
const legacyPicker = readFileSync(
  join(ROOT, 'src/features/ingredient-builder/ServerIngredientPicker.tsx'),
  'utf8',
);

describe('canonical product search v1', () => {
  it('unifies all active Mapper references and allowed commercial products in one authenticated RPC', () => {
    expect(migration).toContain('create or replace function public.search_products_v1(');
    expect(migration).toContain("p_context text default 'BASE'");
    expect(migration).toContain("p_market_scope text default 'my_markets_and_global'");
    expect(migration).toContain('p_selected_markets text[]');
    expect(migration).toContain('p_favorites_only boolean');
    expect(migration).toContain('p_product_profile text');
    expect(migration).toContain('p_entity_kind text');
    expect(migration).toContain('p_cursor integer');
    expect(migration).toContain("p.product_kind='mapper_reference'");
    expect(migration).toContain("p.product_kind<>'mapper_reference'");
    expect(migration).toContain('m.is_active');
    expect(migration).toContain('auth.uid() is not null');
    expect(migration).toContain('grant execute on function public.search_products_v1');
    expect(migration).toContain('to authenticated');
    for (const column of [
      'water_percent',
      'carbohydrate_percent',
      'sucrose_percent',
      'dextrose_percent',
      'glucose_percent',
      'fructose_percent',
      'lactose_percent',
      'polyol_percent',
      'fiber_percent',
      'salt_percent',
      'de_value',
      'kcal_per_100g',
      'cost_per_kg',
      'currency',
    ])
      expect(migration).toContain(column);
  });

  it('does not erase PINGUINO Base rows through market, retailer or lowercase status filters', () => {
    expect(migration).toContain("entity_kind='pi_base'");
    expect(migration).toContain("lower(coalesce(m.verification_status,'')) like 'verified%'");
    expect(migration).not.toContain("m.verification_status='verified'");
    const mapperBranch = migration.slice(
      migration.indexOf('mapper_candidates as ('),
      migration.indexOf('commercial_candidates as ('),
    );
    expect(mapperBranch).not.toMatch(/markets\s*&&\s*p_selected_markets/);
    expect(mapperBranch).not.toContain('preferred_retailer');
    expect(migration).toContain('account_product_market_preferences');
    expect(migration).toContain('pref.preferred_retailers');
  });

  it('owns multilingual and typo-tolerant aliases on the server', () => {
    for (const term of ['truskawka', 'strawberry', 'fresa', 'erdbeere', 'fragola']) {
      expect(migration.toLowerCase()).toContain(term);
    }
    expect(migration).toContain('extensions.similarity');
    expect(migration).toContain('insert into public.product_aliases');
    expect(migration).toContain('where a.product_id=p.id');
    expect(migration).toContain('select a.normalized_alias from public.product_aliases');
  });

  it('creates search indexes before trigger-producing canonical backfills', () => {
    const productsIndex = migration.indexOf(
      'create index if not exists products_search_document_trgm_idx',
    );
    const canonicalBackfill = migration.indexOf('update public.products p');
    expect(productsIndex).toBeGreaterThan(0);
    expect(canonicalBackfill).toBeGreaterThan(productsIndex);
  });

  it('makes search the only picker authority while preserving selection-time behavior resolution', () => {
    expect(service).toContain("supabase.rpc('search_products_v1'");
    expect(picker).not.toContain('useIngredientSearch');
    expect(picker).not.toContain('pinnedBase');
    expect(picker).toContain('resolveProductBehaviorForSelection');
    expect(picker).toContain('getEngineApprovedIngredientById');
    expect(legacyPickerHook).toContain('searchCanonicalMapperIngredients');
    expect(legacyPickerHook).not.toContain('searchEngineApprovedIngredients');
    expect(legacyPickerHook).not.toContain('rankSearchHits(');
    expect(customerShell).toContain('{ authenticated: authUserId !== null }');
    expect(mapperAdapter).toContain('hit.usableInBase');
    expect(mapperAdapter).toContain("entityKind: 'pi_base'");
    expect(legacyPicker).toContain('getEngineApprovedIngredientById');
    expect(legacyPicker).not.toContain('getIngredientById');
  });

  it('returns explicit permission, form, block and relevance fields instead of reinterpreting status in each picker', () => {
    for (const field of [
      'entity_kind',
      'product_form',
      'usable_in_base',
      'main_allowed',
      'usable_as_topping',
      'blocked_reason',
      'relevance',
    ]) {
      expect(migration).toContain(field);
    }
  });

  it('previews exact and likely canonical duplicates immediately after analysis', () => {
    expect(migration).toContain('create or replace function public.preview_product_duplicates_v1');
    expect(migration).toContain("then 'exact'");
    expect(migration).toContain("then 'likely'");
    expect(migration).toContain("'label_facts'");
    expect(migration).toContain("'package_image_near_exact'");
    expect(migration).toContain('global_catalog_phash_distance');
    expect(migration).toContain(
      'grant execute on function public.preview_product_duplicates_v1(jsonb) to authenticated',
    );
    expect(service).toContain("supabase.rpc('preview_product_duplicates_v1'");
  });

  it('resolves legacy Mapper, product, version, binding and normalized identities through one server adapter', () => {
    expect(migration).toContain('resolve_legacy_recipe_behavior_v1');
    for (const key of [
      'behaviorBindingId',
      'productVersionId',
      'productId',
      'mapperIngredientId',
      'canonicalIdentity',
      'normalizedIdentity',
    ])
      expect(migration).toContain(key);
    expect(migration).toContain('b.is_current and p.current_behavior_binding_id=b.id');
    expect(migration).toContain('if v_entity_id is null');
    expect(migration).not.toContain("elsif coalesce(p_reference->>'productVersionId'");
    expect(migration).toContain('return public.resolve_product_behavior_v1');
    expect(migration).toContain('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
    expect(migration).not.toContain('^[0-9a-f-]{36}$');
  });
});
