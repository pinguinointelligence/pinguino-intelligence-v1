import { describe, expect, it } from 'vitest';
import {
  HOME_MAX_SAVED_RECIPES,
  PRO_CORE_CAPABILITIES,
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

  it('Demo cannot save recipes, view exact grams, or use Production Mode', () => {
    const demo = proCoreCapabilitiesFor('demo');
    expect(demo.canSaveRecipe).toBe(false);
    expect(demo.canViewExactGrams).toBe(false);
    expect(demo.canUseProductionMode).toBe(false);
    expect(demo.maxSavedRecipes).toBe(0);
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
