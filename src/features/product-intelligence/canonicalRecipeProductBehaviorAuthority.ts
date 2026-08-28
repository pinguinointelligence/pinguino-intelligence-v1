import type { ProductCategory } from '@/engine';

/**
 * Exact ProductBehavior authority proven by the approved formulation registry.
 *
 * This is intentionally an allow-list of canonical Mapper identities and
 * runtime recipe profiles. It is not a name matcher and it must not be used to
 * infer authority for a neighbouring ingredient or a new profile.
 */
export const CANONICAL_RECIPE_PRODUCT_BEHAVIOR_AUTHORITY = {
  'PI-ING-000270': {
    role: 'milk_solids',
    supportedProfiles: ['milk_gelato', 'chocolate_gelato'],
  },
  'PI-ING-000514': {
    role: 'sweetener_sucrose',
    supportedProfiles: [
      'milk_gelato',
      'chocolate_gelato',
      'sorbet',
      'vegan_gelato',
      'protein_gelato',
    ],
  },
} as const satisfies Record<
  string,
  {
    role: 'milk_solids' | 'sweetener_sucrose';
    supportedProfiles: readonly ProductCategory[];
  }
>;

export type CanonicalRecipeAuthorityIngredientId =
  keyof typeof CANONICAL_RECIPE_PRODUCT_BEHAVIOR_AUTHORITY;

export function isCanonicalRecipeProductBehaviorProfileEligible(
  ingredientId: string,
  profile: ProductCategory,
): boolean {
  if (!(ingredientId in CANONICAL_RECIPE_PRODUCT_BEHAVIOR_AUTHORITY)) return false;
  const authority =
    CANONICAL_RECIPE_PRODUCT_BEHAVIOR_AUTHORITY[
      ingredientId as CanonicalRecipeAuthorityIngredientId
    ];
  return (authority.supportedProfiles as readonly ProductCategory[]).includes(profile);
}
