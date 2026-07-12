/**
 * PINGÜINO PRO CORE — CANONICAL capability rule (owner decision, 2026-07-12).
 *
 * This module is the single source of truth for the PRO CORE plan rule. It is capability-
 * driven and keyed on the internal persona/entitlement, NEVER on a plan price id and never on
 * email. The runtime entitlement layer maps a real subscription onto one of these personas; the
 * feature code only ever reads booleans/limits from here.
 *
 * OWNER DECISION — now canonical (previously "passed in" in Track A):
 *  - Home may own exactly ONE saved-recipe aggregate. Immutable versions of that same recipe do
 *    NOT count as additional recipes — Home may edit, save new versions, compare and restore an
 *    older version as a new version of its single recipe. Creating a SECOND separate recipe is
 *    blocked honestly.
 *  - Pro has the full saved-recipe capability (unlimited aggregates).
 *  - Production Mode is Pro-ONLY.
 *  - Demo cannot save recipes, cannot view exact grams, and cannot use Production Mode.
 */
import type { RecipeCapabilities } from './recipeContracts';
import type { ProductionCapabilities } from './productionContracts';

/** The canonical Home saved-recipe limit (versions of the one recipe never count). */
export const HOME_MAX_SAVED_RECIPES = 1;

/** Pro saved-recipe limit — null = unlimited. */
export const PRO_MAX_SAVED_RECIPES: number | null = null;

/** The three PRO CORE personas the entitlement layer resolves a subscription onto. */
export type ProCorePersona = 'demo' | 'home' | 'pro';

/** Everything PRO CORE gates, in one place, per persona. */
export interface ProCoreCapabilities {
  canSaveRecipe: boolean;
  canViewRecipeVersions: boolean;
  canRestoreRecipeVersion: boolean;
  /** null = unlimited; Home = 1 (canonical). */
  maxSavedRecipes: number | null;
  canViewExactGrams: boolean;
  /** Production Mode — Pro-only (canonical). */
  canUseProductionMode: boolean;
}

/** The canonical persona → capability matrix. Frozen so it can never be mutated at runtime. */
export const PRO_CORE_CAPABILITIES: Readonly<Record<ProCorePersona, ProCoreCapabilities>> = Object.freeze({
  demo: Object.freeze({
    canSaveRecipe: false,
    canViewRecipeVersions: false,
    canRestoreRecipeVersion: false,
    maxSavedRecipes: 0,
    canViewExactGrams: false,
    canUseProductionMode: false,
  }),
  home: Object.freeze({
    canSaveRecipe: true,
    canViewRecipeVersions: true,
    canRestoreRecipeVersion: true,
    maxSavedRecipes: HOME_MAX_SAVED_RECIPES,
    canViewExactGrams: true,
    canUseProductionMode: false,
  }),
  pro: Object.freeze({
    canSaveRecipe: true,
    canViewRecipeVersions: true,
    canRestoreRecipeVersion: true,
    maxSavedRecipes: PRO_MAX_SAVED_RECIPES,
    canViewExactGrams: true,
    canUseProductionMode: true,
  }),
});

/** Resolve the full PRO CORE capability set for a persona. */
export function proCoreCapabilitiesFor(persona: ProCorePersona): ProCoreCapabilities {
  return PRO_CORE_CAPABILITIES[persona];
}

/** Project the PRO CORE capabilities onto the Track A saved-recipe/version capability shape. */
export function recipeCapabilitiesFor(persona: ProCorePersona): RecipeCapabilities {
  const c = PRO_CORE_CAPABILITIES[persona];
  return {
    canSaveRecipe: c.canSaveRecipe,
    canViewRecipeVersions: c.canViewRecipeVersions,
    canRestoreRecipeVersion: c.canRestoreRecipeVersion,
    maxSavedRecipes: c.maxSavedRecipes,
    canViewExactGrams: c.canViewExactGrams,
  };
}

/** Project the PRO CORE capabilities onto the Track B Production-Mode capability shape. */
export function productionCapabilitiesFor(persona: ProCorePersona): ProductionCapabilities {
  const c = PRO_CORE_CAPABILITIES[persona];
  return {
    canUseProductionMode: c.canUseProductionMode,
    canViewExactGrams: c.canViewExactGrams,
  };
}
