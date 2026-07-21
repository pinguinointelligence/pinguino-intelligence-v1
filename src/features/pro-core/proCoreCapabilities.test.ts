import { describe, expect, it } from 'vitest';
import {
  HOME_MAX_SAVED_RECIPES,
  PRO_CORE_CAPABILITIES,
  exportCapabilitiesFor,
  proCoreCapabilitiesFor,
  productionCapabilitiesFor,
  recipeCapabilitiesFor,
} from './proCoreCapabilities';
import { canCreateNewRecipe } from './recipeVersioning';

/**
 * Pins the OWNER DECISION (2026-07-12) as canonical:
 *  Home = exactly 1 saved recipe (versions don't count); Production Mode Pro-only; Demo nothing.
 */
describe('canonical PRO CORE capability rule', () => {
  it('Home owns exactly one saved recipe; versions never count as extra recipes', () => {
    expect(HOME_MAX_SAVED_RECIPES).toBe(1);
    const home = recipeCapabilitiesFor('home');
    expect(home.maxSavedRecipes).toBe(1);
    // may create its first recipe...
    expect(canCreateNewRecipe(0, home).allowed).toBe(true);
    // ...but not a SECOND separate recipe (versions of the one recipe are a different action)
    expect(canCreateNewRecipe(1, home).allowed).toBe(false);
    // Home can still version/restore its single recipe
    expect(home.canViewRecipeVersions).toBe(true);
    expect(home.canRestoreRecipeVersion).toBe(true);
    expect(home.canViewExactGrams).toBe(true);
  });

  it('Production Mode is Pro-only — Demo and Home cannot use it, Pro can', () => {
    expect(productionCapabilitiesFor('demo').canUseProductionMode).toBe(false);
    expect(productionCapabilitiesFor('home').canUseProductionMode).toBe(false);
    expect(productionCapabilitiesFor('pro').canUseProductionMode).toBe(true);
  });

  it('Demo cannot save recipes, view exact grams, use Production Mode, or export', () => {
    const demo = proCoreCapabilitiesFor('demo');
    expect(demo.canSaveRecipe).toBe(false);
    expect(demo.canViewExactGrams).toBe(false);
    expect(demo.canUseProductionMode).toBe(false);
    expect(demo.canExport).toBe(false);
    expect(demo.maxSavedRecipes).toBe(0);
  });

  it('exports: Demo cannot export; Home and Pro can', () => {
    expect(exportCapabilitiesFor('demo')).toEqual({ canExport: false, canViewExactGrams: false });
    expect(exportCapabilitiesFor('home')).toEqual({ canExport: true, canViewExactGrams: true });
    expect(exportCapabilitiesFor('pro')).toEqual({ canExport: true, canViewExactGrams: true });
  });

  it('Pro has the full saved-recipe capability (unlimited aggregates)', () => {
    const pro = recipeCapabilitiesFor('pro');
    expect(pro.canSaveRecipe).toBe(true);
    expect(pro.maxSavedRecipes).toBeNull();
    expect(canCreateNewRecipe(999, pro).allowed).toBe(true);
  });

  it('the canonical matrix is frozen (cannot be mutated at runtime)', () => {
    expect(Object.isFrozen(PRO_CORE_CAPABILITIES)).toBe(true);
    expect(Object.isFrozen(PRO_CORE_CAPABILITIES.pro)).toBe(true);
    expect(() => {
      (PRO_CORE_CAPABILITIES.home as { maxSavedRecipes: number }).maxSavedRecipes = 99;
    }).toThrow();
  });
});

/**
 * S1 (owner "Pro first", 2026-07-21): the complete named capability set. Pro receives
 * everything; Home keeps its existing paid basics (unchanged) but no professional
 * capability; Demo receives nothing paid.
 */
describe('S1 — full canonical Pro capability set', () => {
  /** Every boolean capability the Pro product gates on (maxSavedRecipes is number|null). */
  const ALL_BOOL_CAPS = [
    'canSaveRecipe', 'canViewRecipeVersions', 'canRestoreRecipeVersion', 'canViewExactGrams',
    'canUseProductionMode', 'canExport', 'canCompareRecipeVersions', 'canUseProfessionalFlow',
    'canChooseProfessionalServingMode', 'canUseProfessionalMonitor', 'canEditIngredientGrams',
    'canLockIngredientGrams', 'canSetIngredientRange', 'canRepairRecipe',
    'canRepairProductionBatch', 'canScaleRecipe', 'canViewProductionHistory', 'canUseCosts',
  ] as const;

  /** Pro-ONLY capabilities — Home and Demo must never receive these. */
  const PRO_ONLY = [
    'canUseProfessionalFlow', 'canChooseProfessionalServingMode', 'canUseProfessionalMonitor',
    'canEditIngredientGrams', 'canLockIngredientGrams', 'canSetIngredientRange', 'canRepairRecipe',
    'canRepairProductionBatch', 'canScaleRecipe', 'canUseProductionMode', 'canViewProductionHistory',
    'canUseCosts',
  ] as const;

  it('Pro receives the COMPLETE capability set (every flag true, unlimited saves)', () => {
    const pro = proCoreCapabilitiesFor('pro');
    for (const cap of ALL_BOOL_CAPS) expect(pro[cap], cap).toBe(true);
    expect(pro.maxSavedRecipes).toBeNull();
  });

  it('Home receives NO Pro-only capability, but keeps its paid basics (unchanged this slice)', () => {
    const home = proCoreCapabilitiesFor('home');
    for (const cap of PRO_ONLY) expect(home[cap], cap).toBe(false);
    expect(home.canViewExactGrams).toBe(true);
    expect(home.canSaveRecipe).toBe(true);
    expect(home.canExport).toBe(true);
    expect(home.canCompareRecipeVersions).toBe(true); // Home may compare its one recipe
  });

  it('Demo receives NONE of the paid capabilities', () => {
    const demo = proCoreCapabilitiesFor('demo');
    for (const cap of ALL_BOOL_CAPS) expect(demo[cap], cap).toBe(false);
    expect(demo.maxSavedRecipes).toBe(0);
  });

  it('capabilities are pure gating DATA — never engine-affecting', () => {
    // The matrix holds only boolean/number values and imports no engine module, so no
    // persona/capability can alter a canonical Engine result (calculateRecipe takes no persona).
    for (const persona of ['demo', 'home', 'pro'] as const) {
      for (const value of Object.values(proCoreCapabilitiesFor(persona))) {
        expect(typeof value === 'boolean' || typeof value === 'number' || value === null).toBe(true);
      }
    }
  });
});
