/**
 * Required-field policy (PURE, versioned, category-aware). Decides which fields must be
 * RESOLVED before PI Verified sign-off. Never invents values to satisfy completeness —
 * unknown stays unknown, and only fields marked `blocking_unknown` prevent sign-off.
 *
 * Locked: PAC/POD and technical composition are NEVER required to be filled for sign-off
 * (they remain null unless independently measured); requiring them would push a reviewer to
 * invent values, which is forbidden.
 */

export const REQUIRED_FIELDS_POLICY_VERSION = 'pi_verified.required_fields.v1';

/** How a field is treated by the policy. */
export type FieldRequirement =
  /** Must be resolved (accepted/edited/known) before sign-off. Unknown blocks. */
  | 'required_signoff'
  /** Identity-critical; must be resolved before sign-off. */
  | 'required_identity'
  /** May remain unknown/null — never blocks. */
  | 'optional'
  /** Explicitly allowed to be unknown for this category. */
  | 'not_applicable';

/** Product category families that change the policy (kept coarse + safe). */
export type ProductCategoryFamily = 'food_label' | 'beverage' | 'ingredient' | 'unknown';

/** Base requirement per field key (superset of the OCR IntakeFieldKey vocabulary + technical). */
const BASE_POLICY: Readonly<Record<string, FieldRequirement>> = {
  // identity
  product_name: 'required_identity',
  brand: 'required_identity',
  package_size: 'required_signoff',
  package_unit: 'required_signoff',
  ean_code: 'required_signoff',
  country: 'optional',
  supplier: 'optional',
  category: 'required_signoff',
  subcategory: 'optional',
  // nutrition (per declared basis)
  nutrition_basis: 'required_signoff',
  energy_kcal: 'required_signoff',
  energy_kj: 'optional', // derivable for display; kcal is the required figure
  fat: 'required_signoff',
  saturated_fat: 'optional',
  carbohydrate: 'required_signoff',
  sugars: 'required_signoff',
  protein: 'required_signoff',
  salt: 'required_signoff',
  sodium: 'optional', // recorded as-is; never auto-converted to salt
  fibre: 'optional',
  // ingredients & claims
  ingredients_text: 'required_signoff',
  allergens_text: 'required_signoff',
  may_contain_text: 'optional',
  claim_vegan: 'optional',
  claim_vegetarian: 'optional',
  claim_gluten_free: 'optional',
  claim_lactose_free: 'optional',
  claims_other: 'optional',
  // technical / engine — NEVER required (stay null unless independently measured)
  water: 'optional',
  total_solids: 'optional',
  milk_fat: 'optional',
  msnf: 'optional',
  cocoa_solids: 'optional',
  fruit_solids: 'optional',
  stabilizer: 'optional',
  emulsifier: 'optional',
  pac: 'optional',
  pod: 'optional',
  alcohol: 'optional',
};

/** Category adjustments over the base policy. */
function requirementFor(fieldKey: string, family: ProductCategoryFamily): FieldRequirement {
  const base = BASE_POLICY[fieldKey] ?? 'optional';
  // An ingredient (raw material) has no consumer label basis/allergen declaration requirement.
  if (family === 'ingredient' && ['nutrition_basis', 'allergens_text'].includes(fieldKey)) {
    return 'not_applicable';
  }
  return base;
}

export interface RequiredFieldsInput {
  categoryFamily: ProductCategoryFamily;
  /** Resolution status per field key (from the case's FieldResolution). */
  resolved: Readonly<Record<string, 'unknown' | 'accepted' | 'edited' | 'unresolved' | 'conflict' | 'evidence_requested'>>;
}

export interface RequiredFieldsEvaluation {
  policyVersion: string;
  /** Required fields that are still unresolved/unknown (block sign-off). */
  missingRequired: readonly string[];
  /** Required fields in an unresolved conflict (block sign-off). */
  conflictingRequired: readonly string[];
  /** 0..1 — resolved required fields / total required fields. */
  completeness: number;
  /** True when every required field is resolved (accepted/edited) with no conflicts. */
  complete: boolean;
}

const SETTLED = new Set(['accepted', 'edited']);

/** Evaluate required-field completeness for a category. Pure + deterministic. */
export function evaluateRequiredFields(input: RequiredFieldsInput): RequiredFieldsEvaluation {
  const requiredKeys = Object.keys(BASE_POLICY).filter((k) => {
    const req = requirementFor(k, input.categoryFamily);
    return req === 'required_signoff' || req === 'required_identity';
  });
  const missingRequired: string[] = [];
  const conflictingRequired: string[] = [];
  let settled = 0;
  for (const key of requiredKeys) {
    const status = input.resolved[key] ?? 'unresolved';
    if (status === 'conflict') conflictingRequired.push(key);
    else if (SETTLED.has(status)) settled += 1;
    else missingRequired.push(key); // unresolved / unknown / evidence_requested
  }
  const total = requiredKeys.length;
  return {
    policyVersion: REQUIRED_FIELDS_POLICY_VERSION,
    missingRequired,
    conflictingRequired,
    completeness: total === 0 ? 1 : settled / total,
    complete: missingRequired.length === 0 && conflictingRequired.length === 0,
  };
}
