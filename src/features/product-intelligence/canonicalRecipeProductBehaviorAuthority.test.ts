import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProductCategory } from '@/engine';
import { listFormulationTemplates } from '@/features/formulation/templateRegistry';
import {
  CANONICAL_RECIPE_PRODUCT_BEHAVIOR_AUTHORITY,
  isCanonicalRecipeProductBehaviorProfileEligible,
} from './canonicalRecipeProductBehaviorAuthority';

const MIGRATION_PATH = resolve(
  process.cwd(),
  'supabase/migrations/20260828230000_canonical_recipe_product_behavior_authority.sql',
);
const SQL = readFileSync(MIGRATION_PATH, 'utf8');

const CANONICAL_REFERENCE_BY_MAPPER_ID = {
  'PI-ING-000270': 'smp',
  'PI-ING-000514': 'sucrose',
} as const;

const ALL_RESOLVER_PROFILES = [
  'milk_gelato',
  'fruit_gelato',
  'nut_gelato',
  'chocolate_gelato',
  'alcohol_gelato',
  'sorbet',
  'vegan_gelato',
  'protein_gelato',
] as const satisfies readonly ProductCategory[];

const approvedProfilesUsing = (canonicalReference: string): ProductCategory[] =>
  [
    ...new Set(
      listFormulationTemplates()
        .filter((template) => template.roles.some((role) => role.toolboxId === canonicalReference))
        .map((template) => template.category),
    ),
  ].sort();

describe('canonical recipe ProductBehavior authority', () => {
  it.each(Object.entries(CANONICAL_REFERENCE_BY_MAPPER_ID))(
    '%s exactly mirrors the approved runtime templates that use it',
    (mapperId, canonicalReference) => {
      const authority =
        CANONICAL_RECIPE_PRODUCT_BEHAVIOR_AUTHORITY[
          mapperId as keyof typeof CANONICAL_RECIPE_PRODUCT_BEHAVIOR_AUTHORITY
        ];
      expect([...authority.supportedProfiles].sort()).toEqual(
        approvedProfilesUsing(canonicalReference),
      );
    },
  );

  it.each([
    ['PI-ING-000270', ['milk_gelato', 'chocolate_gelato']],
    [
      'PI-ING-000514',
      ['milk_gelato', 'chocolate_gelato', 'sorbet', 'vegan_gelato', 'protein_gelato'],
    ],
  ] as const)('%s is eligible only in its evidence-backed profiles', (mapperId, allowed) => {
    for (const profile of ALL_RESOLVER_PROFILES) {
      expect(isCanonicalRecipeProductBehaviorProfileEligible(mapperId, profile)).toBe(
        (allowed as readonly ProductCategory[]).includes(profile),
      );
    }
  });

  it('is exact-identity authority with no display-name or historical fallback', () => {
    expect(isCanonicalRecipeProductBehaviorProfileEligible('smp', 'milk_gelato')).toBe(false);
    expect(isCanonicalRecipeProductBehaviorProfileEligible('Skimmed Milk', 'milk_gelato')).toBe(
      false,
    );
    expect(isCanonicalRecipeProductBehaviorProfileEligible('sucrose', 'milk_gelato')).toBe(false);
    expect(isCanonicalRecipeProductBehaviorProfileEligible('Sucrose', 'milk_gelato')).toBe(false);
  });

  it('publishes one forward-only, exact two-product authority migration', () => {
    expect(SQL).toContain("new.mapper_ingredient_id in ('PI-ING-000270','PI-ING-000514')");
    expect(SQL).toContain("'CANONICAL_RECIPE_PROFILE_ALLOWLIST'");
    expect(SQL).toContain("'BASE_RECIPE',true");
    expect(SQL).toContain("'TOPPING',false");
    expect(SQL).toContain("v_profile_applicability->>'authorityType'");
    expect(SQL).toContain("coalesce(v_profile_applicability->>v_profile,'blocked')='eligible'");
    expect(SQL).not.toMatch(/(?:update|insert\s+into)\s+public\.mapper_basement/i);
    expect(SQL).not.toMatch(/ingredient_name|display_name|legacy/i);
    expect(SQL).not.toContain('all_existing_profiles');
  });

  it('pins the SQL profile payloads to the source authority mirror', () => {
    for (const [mapperId, authority] of Object.entries(
      CANONICAL_RECIPE_PRODUCT_BEHAVIOR_AUTHORITY,
    )) {
      expect(SQL).toContain(`'${mapperId}'`);
      for (const profile of authority.supportedProfiles) {
        expect(SQL).toContain(`'${profile}','eligible'`);
      }
    }
    expect(SQL).toContain("'fruit_gelato','blocked'");
    expect(SQL).toContain("'protein_gelato','blocked'");
  });
});
