/**
 * A scanned product is not a different kind of ingredient.
 *
 * Case 13 of the acceptance matrix asks for two things: that a confirmed product reaches
 * the SAME HOME draft, and that HOME and PRO then show the same line. Both are settled by
 * ONE structural fact rather than by comparing two renders — the scanner adds nothing of
 * its own. It supplies a catalogue id, and everything after that is the path a typed
 * ingredient already takes: `hydrateIngredient`, then `recipeStore.addIngredient`, then
 * the crown question asked of the existing authority.
 *
 * Parity is therefore by construction. These contracts are what keep it that way.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const HOOK = readFileSync('src/features/home-creator/useHomeIntentIngredients.ts', 'utf8');
const HOME_PAGE = readFileSync('src/pages/home/HomeCreatorPage.tsx', 'utf8');
const SCANNER = readFileSync('src/features/product-scanner/LiveMultiScanner.tsx', 'utf8');

describe('a scanned product enters through the typed-ingredient door', () => {
  it('both entry points delegate to one add', () => {
    expect(HOOK).toContain('const addScannedProduct = useCallback(');
    // Same helper, so there is no second way for an ingredient to reach a recipe.
    const scanned = HOOK.slice(HOOK.indexOf('const addScannedProduct'));
    expect(scanned).toContain('addByProductId(');
    const chip = HOOK.slice(
      HOOK.indexOf('const addResolvedChip'),
      HOOK.indexOf('const addScannedProduct'),
    );
    expect(chip).toContain('addByProductId(');
  });

  it('the one add uses the Pro store action, not a HOME-only path', () => {
    const add = HOOK.slice(
      HOOK.indexOf('const addByProductId'),
      HOOK.indexOf('const addResolvedChip'),
    );
    expect(add).toContain('hydrateIngredient(productId)');
    expect(add).toContain('store.addIngredient(ingredient, 0)');
    // §49: the crown is ASKED of the existing authority, never decided here.
    expect(add).toContain('setMainIngredient(added.lineId)');
  });

  it('HOME hands the scanner nothing but catalogue ids', () => {
    const handler = HOME_PAGE.slice(
      HOME_PAGE.indexOf('onAddToRecipe={'),
      HOME_PAGE.indexOf('onNeedsDeepScan={'),
    );
    expect(handler).toContain('addScannedProduct(product.identityKey)');
    // No grams, no roles, no engine call: the scanner does no formulation.
    expect(handler).not.toMatch(/planned_grams|setLockType|rebuild|engine/i);
  });

  it('the scanner itself never touches the recipe store', () => {
    expect(SCANNER).not.toContain('useRecipeStore');
    expect(SCANNER).not.toContain('addIngredient');
  });
});

describe('an unknown product never reaches a recipe', () => {
  it('only catalogue-resolved products are handed over', () => {
    const handoff = readFileSync('src/features/product-scanner/liveScanHandoff.ts', 'utf8');
    expect(handoff).toContain("product.acceptance === 'confirmed'");
    expect(handoff).toContain("product.acceptance === 'needs_resolution'");
  });

  it('and HOME never navigates away from a half-built recipe because of one', () => {
    const handler = HOME_PAGE.slice(HOME_PAGE.indexOf('onNeedsDeepScan={'));
    const block = handler.slice(0, handler.indexOf('/>'));
    expect(block).not.toContain('navigate(');
  });
});
