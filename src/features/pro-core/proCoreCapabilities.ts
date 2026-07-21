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
import type { ExportCapabilities } from './costContracts';

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
  /** May produce recipe / cost exports at all (Demo cannot). Exact grams stay gated on
   * canViewExactGrams, so an export can never leak exact grams without that capability. */
  canExport: boolean;

  // ── S1 (owner "Pro first", 2026-07-21) — named capabilities the Pro product gates on.
  //    Additive: existing fields above are unchanged, so Home/Demo behaviour is preserved.
  //    `canSaveRecipe` above IS the spec's "canSaveRecipes". Every field is pure gating
  //    data (boolean/number) — it never affects the canonical Engine result. ──
  /** Compare two immutable versions (Home may compare its one recipe; Demo cannot). */
  canCompareRecipeVersions: boolean;
  /** The temperature-first professional recipe flow (vs Home's machine-first flow). Pro-only. */
  canUseProfessionalFlow: boolean;
  /** Choose a professional serving mode — Świeże / −11 / −12 / −13 °C. Pro-only. */
  canChooseProfessionalServingMode: boolean;
  /** The full modular Monitor Pro (vs the simplified Home Monitor). Pro-only. */
  canUseProfessionalMonitor: boolean;
  /** Edit exact ingredient grams through the Preview → verify → Apply chain. Pro-only. */
  canEditIngredientGrams: boolean;
  /** Lock an ingredient's exact grams (the optimizer may never move a locked value). Pro-only. */
  canLockIngredientGrams: boolean;
  /** Constrain an ingredient to a min–max range. Pro-only. */
  canSetIngredientRange: boolean;
  /** Repair a recipe (IF9 / IF10 / verified substitutes) around real-world constraints. Pro-only. */
  canRepairRecipe: boolean;
  /** Repair an in-progress PHYSICAL production batch (already-added ingredients are fixed). Pro-only. */
  canRepairProductionBatch: boolean;
  /** Scale an immutable recipe version to any batch size. Pro-only. */
  canScaleRecipe: boolean;
  /** View the production-run history. Pro-only. */
  canViewProductionHistory: boolean;
  /** Use the ingredient-costing surface. Pro-only. */
  canUseCosts: boolean;
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
    canExport: false,
    canCompareRecipeVersions: false,
    canUseProfessionalFlow: false,
    canChooseProfessionalServingMode: false,
    canUseProfessionalMonitor: false,
    canEditIngredientGrams: false,
    canLockIngredientGrams: false,
    canSetIngredientRange: false,
    canRepairRecipe: false,
    canRepairProductionBatch: false,
    canScaleRecipe: false,
    canViewProductionHistory: false,
    canUseCosts: false,
  }),
  home: Object.freeze({
    canSaveRecipe: true,
    canViewRecipeVersions: true,
    canRestoreRecipeVersion: true,
    maxSavedRecipes: HOME_MAX_SAVED_RECIPES,
    canViewExactGrams: true,
    canUseProductionMode: false,
    canExport: true,
    canCompareRecipeVersions: true,
    canUseProfessionalFlow: false,
    canChooseProfessionalServingMode: false,
    canUseProfessionalMonitor: false,
    canEditIngredientGrams: false,
    canLockIngredientGrams: false,
    canSetIngredientRange: false,
    canRepairRecipe: false,
    canRepairProductionBatch: false,
    canScaleRecipe: false,
    canViewProductionHistory: false,
    canUseCosts: false,
  }),
  pro: Object.freeze({
    canSaveRecipe: true,
    canViewRecipeVersions: true,
    canRestoreRecipeVersion: true,
    maxSavedRecipes: PRO_MAX_SAVED_RECIPES,
    canViewExactGrams: true,
    canUseProductionMode: true,
    canExport: true,
    canCompareRecipeVersions: true,
    canUseProfessionalFlow: true,
    canChooseProfessionalServingMode: true,
    canUseProfessionalMonitor: true,
    canEditIngredientGrams: true,
    canLockIngredientGrams: true,
    canSetIngredientRange: true,
    canRepairRecipe: true,
    canRepairProductionBatch: true,
    canScaleRecipe: true,
    canViewProductionHistory: true,
    canUseCosts: true,
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

/** Project the PRO CORE capabilities onto the Track C export capability shape. */
export function exportCapabilitiesFor(persona: ProCorePersona): ExportCapabilities {
  const c = PRO_CORE_CAPABILITIES[persona];
  return {
    canExport: c.canExport,
    canViewExactGrams: c.canViewExactGrams,
  };
}
