import type { EngineIngredient, LockType } from '@/engine';
import {
  EMPTY_PRODUCT_DOSE_META,
  type ProductDoseMeta,
} from './productDoseSuggestion';

/** Customer vocabulary only. Engine lock enums are deliberately not exposed here. */
export type IngredientCustomerRole = 'standard' | 'addition';
export type IngredientDisplayUnit = 'g' | 'kg';

export interface IngredientRowMeta {
  role: IngredientCustomerRole;
  required: boolean;
  unavailable: boolean;
  /** Picker-time suggestion ownership. It is product-layer UI state only and
   * never participates in Engine math or creates an invisible lock. */
  dose: ProductDoseMeta;
}

export interface SubstituteCandidate {
  id: string;
  name: string;
  ingredient?: EngineIngredient;
  /** Session-only evidence derived from the exact fetched Mapper row. It is
   * never persisted with a recipe or trusted from the Preview payload. */
  authorization?: SubstituteAuthorization;
  fit: 'direct' | 'reformulation';
  expectedImpact: string;
  compatibility: string;
  requiresMainConfirmation?: boolean;
}

export interface SubstituteAuthorization {
  canonicalId: string;
  ingredientFingerprint: string;
  mapperRowFingerprint: string;
  allergensFingerprint: string;
  veganEligibility: string;
}

export const DEFAULT_INGREDIENT_ROW_META: IngredientRowMeta = {
  role: 'standard',
  required: false,
  unavailable: false,
  dose: EMPTY_PRODUCT_DOSE_META,
};

/** Presentation conversion only. RecipeInput remains gram-canonical. */
export function gramsToDisplayValue(grams: number, unit: IngredientDisplayUnit): number {
  return unit === 'kg' ? grams / 1000 : grams;
}

/** Presentation conversion only. Every edit is returned to the recipe store as grams. */
export function displayValueToGrams(value: number, unit: IngredientDisplayUnit): number {
  return unit === 'kg' ? value * 1000 : value;
}

export function customerRoleFor(
  lockType: LockType,
  meta: IngredientRowMeta,
): 'main' | IngredientCustomerRole {
  return lockType === 'main' ? 'main' : meta.role;
}

/**
 * One line can carry one exact formulation lock. This helper documents the final
 * switch contract without pretending the currently unfinished percentage solver
 * contract is available from the UI.
 */
export function nextExclusiveLock(current: LockType, requested: 'grams' | 'percent'): LockType {
  return current === requested ? 'unlocked' : requested;
}

export type RequiredRemovalRoute = 'normal-remove' | 'offer-substitute' | 'no-substitute';

/** Pure guard routing; callers never invent candidates. */
export function requiredRemovalRoute(
  required: boolean,
  candidates: readonly SubstituteCandidate[],
): RequiredRemovalRoute {
  if (!required) return 'normal-remove';
  return candidates.length > 0 ? 'offer-substitute' : 'no-substitute';
}
