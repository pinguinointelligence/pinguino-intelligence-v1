import type { EngineIngredient, LockType, ProductCategory } from '@/engine';
import type {
  ProductBehaviorSnapshot,
  ProductFormulationMode,
  RuntimeEligibilityState,
} from '@/features/product-intelligence';
import {
  isCatalogLabelToppingIngredient,
  type RecipeToppingIngredient,
} from '@/features/recipe-composition/labelTopping';
import type { ProductDiscoveryReplaceContext } from './canonicalProductDiscovery';
import {
  matchesProductDiscoveryFamily,
  matchesProductDiscoveryFilter,
  matchesProductDiscoverySubfilter,
  type ProductDiscoveryMetadata,
} from './canonicalProductDiscovery';

export type CentralSearchUsageMode = 'HOME_ADD' | 'PRO_SEARCH' | 'HOME_REPLACE' | 'PRO_REPLACE';

/**
 * Narrow application adapter for the central search/replacement authority.
 * It carries facts only: it does not expand aliases, infer compatibility or rank.
 */
export interface ReplacementSearchLineContext {
  usageMode: Extract<CentralSearchUsageMode, 'HOME_REPLACE' | 'PRO_REPLACE'>;
  lineId: string;
  currentIdentity: {
    canonicalIngredientId: string;
    mapperIngredientId: string | null;
    productId: string | null;
    productVersionId: string | null;
    privateProductId: string | null;
  };
  searchConceptSeed: string;
  familyId: string | null;
  subfamilyId: string | null;
  formId: string | null;
  gradeOrSubtype: string | null;
  recipeProfile: ProductCategory;
  currentRole: 'MAIN' | 'STANDARD' | 'TOPPING';
  processScope: 'BASE_FORMULATION' | 'POST_PROCESS_ADDON';
  temperatureC: number;
  formulationMode: ProductFormulationMode;
  marketCountry: string | null;
  userFilters: ProductDiscoveryReplaceContext;
  moduleEligibility: Readonly<Partial<Record<string, RuntimeEligibilityState>>>;
  recipeLine: {
    plannedGrams: number;
    actualGrams: number | null;
    lockType: LockType | null;
  };
}

type ReplacementIngredient = EngineIngredient | RecipeToppingIngredient;

export interface ReplacementCandidateFacts extends ProductDiscoveryMetadata {
  usableInBase: boolean;
  usableAsTopping: boolean;
  mainAllowed?: boolean;
}

export function createReplacementSearchLineContext(input: {
  usageMode: ReplacementSearchLineContext['usageMode'];
  lineId: string;
  ingredient: ReplacementIngredient;
  snapshot?: ProductBehaviorSnapshot;
  recipeProfile: ProductCategory;
  currentRole: ReplacementSearchLineContext['currentRole'];
  processScope: ReplacementSearchLineContext['processScope'];
  temperatureC: number;
  formulationMode: ProductFormulationMode;
  marketCountry?: string | null;
  userFilters: ProductDiscoveryReplaceContext;
  plannedGrams: number;
  actualGrams: number | null;
  lockType: LockType | null;
}): ReplacementSearchLineContext {
  const labelTopping = isCatalogLabelToppingIngredient(input.ingredient) ? input.ingredient : null;
  const engineIngredient = labelTopping ? null : (input.ingredient as EngineIngredient);
  const snapshot = input.snapshot;
  return {
    usageMode: input.usageMode,
    lineId: input.lineId,
    currentIdentity: {
      canonicalIngredientId:
        input.ingredient.canonical_ingredient_id?.trim() || input.ingredient.id.trim(),
      mapperIngredientId:
        snapshot?.mapperIngredientId ?? engineIngredient?.canonical_ingredient_id?.trim() ?? null,
      productId: snapshot?.productId ?? labelTopping?.catalog_product_id ?? null,
      productVersionId: snapshot?.productVersionId ?? labelTopping?.catalog_version_id ?? null,
      privateProductId: input.ingredient.private_product_id?.trim() || null,
    },
    searchConceptSeed: input.ingredient.name,
    familyId: snapshot?.familyId ?? null,
    subfamilyId: snapshot?.subfamilyId ?? null,
    formId: snapshot?.formId ?? null,
    gradeOrSubtype: engineIngredient?.source_subcategory?.trim() || null,
    recipeProfile: input.recipeProfile,
    currentRole: input.currentRole,
    processScope: input.processScope,
    temperatureC: input.temperatureC,
    formulationMode: input.formulationMode,
    marketCountry: input.marketCountry ?? null,
    userFilters: { ...input.userFilters },
    moduleEligibility: { ...(snapshot?.moduleEligibility ?? {}) },
    recipeLine: {
      plannedGrams: input.plannedGrams,
      actualGrams: input.actualGrams,
      lockType: input.lockType,
    },
  };
}

/** Identity-only self exclusion. Other candidates sharing a Mapper family remain legal. */
export function isCurrentReplacementIdentity(
  context: ReplacementSearchLineContext,
  candidate: {
    id: string;
    entityKind: 'pi_base' | 'commercial_product';
    productCode?: string | null;
    mappedIngredientId?: string | null;
  },
): boolean {
  const current = context.currentIdentity;
  if (candidate.entityKind === 'commercial_product') {
    return (
      current.productId === candidate.id ||
      (Boolean(candidate.productCode) && current.productId === candidate.productCode) ||
      current.privateProductId === candidate.id ||
      current.privateProductId?.includes(`catalog:${candidate.id}:`) === true
    );
  }
  if (current.productId && current.productId !== current.mapperIngredientId) return false;
  return (
    current.mapperIngredientId === candidate.mappedIngredientId ||
    current.canonicalIngredientId === candidate.mappedIngredientId ||
    current.canonicalIngredientId === candidate.id
  );
}

/**
 * Hard compatibility gate for the complete replacement candidate set.
 *
 * The picker may change presentation filters, but those controls must never widen
 * the line-derived family/form/scope contract. Ranking and recency run only after
 * this predicate has accepted a candidate.
 */
export function isHardCompatibleReplacementCandidate(
  context: ReplacementSearchLineContext,
  candidate: ReplacementCandidateFacts,
): boolean {
  if (context.processScope === 'BASE_FORMULATION' && !candidate.usableInBase) return false;
  if (context.processScope === 'POST_PROCESS_ADDON' && !candidate.usableAsTopping) return false;
  if (context.currentRole === 'MAIN' && candidate.mainAllowed !== true) return false;

  const required = context.userFilters;
  if (required.family && !matchesProductDiscoveryFamily(candidate, required.family)) return false;
  if (
    required.filter !== 'all' &&
    required.filter !== 'favorites' &&
    !matchesProductDiscoveryFilter(candidate, required.filter)
  ) {
    return false;
  }
  if (
    required.subfilter !== 'all' &&
    !matchesProductDiscoverySubfilter(candidate, required.filter, required.subfilter)
  ) {
    return false;
  }
  return true;
}
