/**
 * CANONICAL MODULE ELIGIBILITY — the one rule that decides whether a canonical
 * Mapper identity may participate in BASE_RECIPE, in TOPPING, or in both.
 *
 * This is a MIRROR of the server authority
 * (`public.canonical_module_product_role_v1` /
 * `public.canonical_module_eligibility_v1`, migration
 * `20260829120000_canonical_module_eligibility_authority.sql`). The server
 * remains the only decision-maker at runtime; this module exists so the rule
 * can be reasoned about, tested and pinned to the migration in CI.
 *
 * Three separate questions, never mixed:
 *  1. MODULE eligibility  — this file. Mapper approval + canonical technical
 *     class. Nothing else.
 *  2. PROFILE compatibility — vegan verification, protein behavior and the
 *     other fact-derived profile rules in the served evidence gate.
 *  3. PROCESS authority — whether Production may proceed. An unknown process
 *     never blocks module eligibility; it blocks Production.
 *
 * There is deliberately NO per-product allow-list here. Eligibility is decided
 * by canonical identity and canonical class only — never by display name,
 * translation, brand or substring.
 */

/** Post-process inclusions. Never part of base formulation physics. */
export const TOPPING_ONLY_CATEGORIES = [
  'confectionery_inclusion',
  'bakery_inclusion',
  'decorative_inclusion',
  'variegate',
  'coating',
] as const;

/** Structural/functional matter. Base formulation only. */
export const BASE_ONLY_CATEGORIES = [
  'sweetener',
  'stabilizer',
  'fiber',
  'emulsifier',
  'starch',
  'acid',
  'colorant',
  'functional_additive',
  'additive',
] as const;

/** The only subcategory that carries a structural class its category does not. */
export const BASE_ONLY_SUBCATEGORIES = ['water'] as const;

export type CanonicalProductRole = 'BASE_ONLY' | 'TOPPING_ONLY' | 'BASE_AND_TOPPING';

export interface CanonicalModuleEligibilityFacts {
  /** `mapper_basement.is_active`. */
  isActive: boolean;
  /** `mapper_basement.approved_for_base`. */
  approvedForBase: boolean;
  /** `mapper_basement.ingredient_category`. */
  ingredientCategory: string | null;
  /** `mapper_basement.ingredient_subcategory`. */
  ingredientSubcategory: string | null;
}

export interface CanonicalModuleEligibility {
  productRole: CanonicalProductRole;
  BASE_RECIPE: boolean;
  TOPPING: boolean;
}

export function canonicalProductRole(
  ingredientCategory: string | null | undefined,
  ingredientSubcategory: string | null | undefined,
): CanonicalProductRole {
  const category = (ingredientCategory ?? '').toLowerCase();
  const subcategory = (ingredientSubcategory ?? '').toLowerCase();
  if ((TOPPING_ONLY_CATEGORIES as readonly string[]).includes(category)) return 'TOPPING_ONLY';
  if (
    (BASE_ONLY_CATEGORIES as readonly string[]).includes(category) ||
    (BASE_ONLY_SUBCATEGORIES as readonly string[]).includes(subcategory)
  )
    return 'BASE_ONLY';
  return 'BASE_AND_TOPPING';
}

/**
 * Fail-closed: an inactive identity, or one the catalogue has not approved for
 * base use, is eligible for no formulation module at all.
 */
export function canonicalModuleEligibility(
  facts: CanonicalModuleEligibilityFacts,
): CanonicalModuleEligibility {
  const productRole = canonicalProductRole(facts.ingredientCategory, facts.ingredientSubcategory);
  const approved = facts.isActive && facts.approvedForBase;
  return {
    productRole,
    BASE_RECIPE: approved && (productRole === 'BASE_ONLY' || productRole === 'BASE_AND_TOPPING'),
    TOPPING: approved && (productRole === 'TOPPING_ONLY' || productRole === 'BASE_AND_TOPPING'),
  };
}
