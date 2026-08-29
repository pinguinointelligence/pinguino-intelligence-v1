import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CORE_INGREDIENT_IDENTITIES,
  LEGACY_BUILTIN_INGREDIENT_IDENTITIES,
  PROTEIN_INGREDIENT_IDENTITIES,
} from '@/data/ingredients/canonicalIngredientIdentity';
import {
  BASE_ONLY_CATEGORIES,
  BASE_ONLY_SUBCATEGORIES,
  TOPPING_ONLY_CATEGORIES,
  canonicalModuleEligibility,
  canonicalProductRole,
} from './canonicalModuleEligibility';

const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260829070507_canonical_module_eligibility_authority.sql',
);
const SQL = readFileSync(MIGRATION_PATH, 'utf8');

const base = {
  isActive: true,
  approvedForBase: true,
  ingredientCategory: 'dairy',
  ingredientSubcategory: 'milk',
};

describe('canonical product role', () => {
  it.each(TOPPING_ONLY_CATEGORIES)('%s is a post-process inclusion', (category) => {
    expect(canonicalProductRole(category, null)).toBe('TOPPING_ONLY');
  });

  it.each(BASE_ONLY_CATEGORIES)('%s is structural, base only', (category) => {
    expect(canonicalProductRole(category, null)).toBe('BASE_ONLY');
  });

  it.each(BASE_ONLY_SUBCATEGORIES)('the %s subcategory is structural, base only', (subcategory) => {
    expect(canonicalProductRole('liquid', subcategory)).toBe('BASE_ONLY');
  });

  it('defaults every other canonical class to both modules', () => {
    expect(canonicalProductRole('fruit', 'fresh_fruit_profile')).toBe('BASE_AND_TOPPING');
    expect(canonicalProductRole('dairy', 'skimmed_milk_powder')).toBe('BASE_AND_TOPPING');
    expect(canonicalProductRole('nut', 'nut_paste')).toBe('BASE_AND_TOPPING');
    expect(canonicalProductRole(null, null)).toBe('BASE_AND_TOPPING');
  });

  it('is case-insensitive on the canonical class, never on identity', () => {
    expect(canonicalProductRole('SWEETENER', null)).toBe('BASE_ONLY');
    expect(canonicalProductRole('Variegate', null)).toBe('TOPPING_ONLY');
  });
});

describe('canonical module eligibility', () => {
  it('gives an approved ordinary product both modules', () => {
    expect(canonicalModuleEligibility(base)).toEqual({
      productRole: 'BASE_AND_TOPPING',
      BASE_RECIPE: true,
      TOPPING: true,
    });
  });

  it('keeps a post-process inclusion out of BASE_RECIPE', () => {
    expect(
      canonicalModuleEligibility({
        ...base,
        ingredientCategory: 'bakery_inclusion',
        ingredientSubcategory: null,
      }),
    ).toEqual({ productRole: 'TOPPING_ONLY', BASE_RECIPE: false, TOPPING: true });
  });

  it('keeps a structural product out of TOPPING', () => {
    expect(
      canonicalModuleEligibility({
        ...base,
        ingredientCategory: 'sweetener',
        ingredientSubcategory: 'sucrose',
      }),
    ).toEqual({ productRole: 'BASE_ONLY', BASE_RECIPE: true, TOPPING: false });
  });

  it('fails closed for an unapproved or inactive canonical identity', () => {
    expect(canonicalModuleEligibility({ ...base, approvedForBase: false })).toMatchObject({
      BASE_RECIPE: false,
      TOPPING: false,
    });
    expect(canonicalModuleEligibility({ ...base, isActive: false })).toMatchObject({
      BASE_RECIPE: false,
      TOPPING: false,
    });
    expect(
      canonicalModuleEligibility({
        ...base,
        approvedForBase: false,
        ingredientCategory: 'variegate',
      }),
    ).toMatchObject({ BASE_RECIPE: false, TOPPING: false });
  });
});

describe('the previously hand-maintained authorities are now mechanical', () => {
  // PI-ING-000514 sucrose and PI-ING-002114 (Gellatti stabilizer) were pinned
  // BASE-only by two per-product override triggers. Their canonical class
  // reproduces that answer with no id in the rule.
  it('reproduces the sucrose and stabilizer decisions from the canonical class', () => {
    expect(canonicalModuleEligibility({ ...base, ingredientCategory: 'sweetener' })).toMatchObject({
      BASE_RECIPE: true,
      TOPPING: false,
    });
    expect(canonicalModuleEligibility({ ...base, ingredientCategory: 'stabilizer' })).toMatchObject(
      {
        BASE_RECIPE: true,
        TOPPING: false,
      },
    );
  });

  it('restores skimmed milk powder to BASE_RECIPE without an allow-list', () => {
    expect(
      canonicalModuleEligibility({ ...base, ingredientSubcategory: 'skimmed_milk_powder' }),
    ).toMatchObject({ BASE_RECIPE: true });
  });

  it('restores BANANA (fresh fruit) to BASE_RECIPE without an allow-list', () => {
    expect(
      canonicalModuleEligibility({
        ...base,
        ingredientCategory: 'fruit',
        ingredientSubcategory: 'fresh_fruit_profile',
      }),
    ).toMatchObject({ BASE_RECIPE: true, TOPPING: true });
  });
});

describe('CORE INGREDIENT INVARIANT', () => {
  // Every identity a fresh recipe/starter can emit must satisfy the module
  // eligibility its own canonical authority requires. A starter that seeds an
  // ingredient its own authority rejects is a deployment failure.
  const STARTER_IDENTITIES = [
    ...CORE_INGREDIENT_IDENTITIES,
    ...LEGACY_BUILTIN_INGREDIENT_IDENTITIES,
    ...PROTEIN_INGREDIENT_IDENTITIES,
  ];

  it('pins every starter identity into the migration invariant', () => {
    expect(STARTER_IDENTITIES.length).toBeGreaterThan(0);
    for (const identity of STARTER_IDENTITIES) {
      expect(SQL).toContain(`'${identity.mapperId}'`);
    }
  });

  it('never emits a starter ingredient from a post-process-only class', () => {
    // No starter role is an inclusion/variegate/coating role.
    for (const identity of STARTER_IDENTITIES) {
      expect(TOPPING_ONLY_CATEGORIES as readonly string[]).not.toContain(identity.role);
    }
  });
});

describe('single source of truth migration', () => {
  it('publishes the canonical authority functions', () => {
    expect(SQL).toContain('create or replace function public.canonical_module_product_role_v1');
    expect(SQL).toContain('create or replace function public.canonical_module_eligibility_v1');
  });

  it('mirrors the exact canonical class sets used by this module', () => {
    for (const category of TOPPING_ONLY_CATEGORIES) expect(SQL).toContain(`'${category}'`);
    for (const category of BASE_ONLY_CATEGORIES) expect(SQL).toContain(`'${category}'`);
    for (const subcategory of BASE_ONLY_SUBCATEGORIES)
      expect(SQL).toContain(`lower(coalesce(p_subcategory,''))='${subcategory}'`);
  });

  it('removes both duplicate per-product BASE_RECIPE registries', () => {
    expect(SQL).toContain(
      'drop function if exists public.enforce_canonical_recipe_product_behavior_authority_v1()',
    );
    expect(SQL).toContain(
      'drop function if exists public.enforce_gellatti_stabilizer_base_only_v1()',
    );
    expect(SQL).toContain("when v_profile in ('vegan_gelato','sorbet') then v_vegan='verified'");
    // The removed branch must not survive anywhere in the new gate body.
    expect(SQL).not.toContain(
      'v_gate_new:=$new$  v_profile_allowed := case\n    when v_profile_applicability',
    );
  });

  it('closes the catalog-classifier leak for canonical Mapper references', () => {
    expect(SQL).toContain("and p.product_kind<>'mapper_reference'");
    expect(SQL).toContain("and p.product_kind='mapper_reference'");
  });

  it('makes the picker read the same authority as the module gates', () => {
    expect(SQL).toContain('usable_in_base');
    expect(SQL).toContain('usable_as_topping');
    expect(SQL).toContain("in ('BASE_ONLY','BASE_AND_TOPPING')) usable_in_base,");
    expect(SQL).toContain("in ('TOPPING_ONLY','BASE_AND_TOPPING')) usable_as_topping,");
  });

  it('asserts zero catalogue contradictions and never rewrites Mapper', () => {
    expect(SQL).toContain('canonical module eligibility contradictions remain');
    expect(SQL).toContain('canonical product role leaked into the wrong module');
    expect(SQL).not.toMatch(/(?:update|insert\s+into|delete\s+from)\s+public\.mapper_basement/i);
  });

  it('authorizes by canonical identity only, with no name fallback', () => {
    expect(SQL).not.toMatch(/ingredient_name_display\s*(?:=|ilike|~)/i);
    expect(SQL).not.toContain("CANONICAL_RECIPE_PROFILE_ALLOWLIST',");
  });

  it('leaves process authority separate from module eligibility', () => {
    // Module eligibility must never consult process evidence.
    const authority = SQL.slice(
      SQL.indexOf('create or replace function public.canonical_module_eligibility_v1'),
      SQL.indexOf('revoke all on function public.canonical_module_product_role_v1'),
    );
    expect(authority).not.toMatch(/process/i);
    expect(authority).not.toMatch(/verification_status/i);
  });
});
