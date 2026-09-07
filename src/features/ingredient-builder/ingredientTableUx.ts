import type { EngineIngredient, LockType } from '@/engine';
import {
  EMPTY_PRODUCT_DOSE_META,
  type ProductDoseMeta,
} from './productDoseSuggestion';
import type { ProductDiscoveryReplaceContext } from './canonicalProductDiscovery';

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
  /**
   * Why this line's amount cannot be edited right now, in the customer's words,
   * or null when it can.
   *
   * OWNER QA 2026-09-03. The ProductBehavior gate already refused these edits —
   * correctly, it is a safety boundary — but it refused them at CLICK time and
   * answered with a notice at the top of the table. From the row's point of
   * view the steppers looked entirely operable and did nothing, which is the
   * "dead +/-" the owner reported. Evaluating the SAME gate at render lets the
   * control show that it is closed and say why, next to the number it governs.
   *
   * Not a second authority: the value is produced by `productBehaviorModuleGate`
   * exactly as the click path produces it.
   */
  editRefusal?: string | null;
  /** Context for the explicit row-level Replace invocation. This is derived
   * from the current ingredient and never persisted as product authority. */
  replaceContext?: ProductDiscoveryReplaceContext | null;
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
