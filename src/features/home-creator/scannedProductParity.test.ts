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
const SCANNER = readFileSync('src/features/scan-flow/ScanFlow.tsx', 'utf8');

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
    /* The amount is CARRIED, not hard-coded. It used to be `addIngredient(ingredient, 0)`,
       which is where HOME's 0 g rows came from: a confirmed amount had nowhere to go. */
    expect(add).toContain('store.addIngredient(ingredient, grams)');
    // §49: the crown is ASKED of the existing authority, never decided here —
    // on the HOME surface, so HOME's Crown rules never reach PRO.
    expect(add).toContain("setMainIngredient(added.lineId, 'home')");
    /* And a topping goes to the topping collection instead — uncrowned, because the
       Crown is a Main concept and a topping is not a Main. Ignoring the role is what put
       a stated topping in the base wearing a Crown while its chip still read TOPPING. */
    expect(add).toContain("if (role === 'topping')");
    expect(add).toContain('store.addTopping(');
  });

  it('HOME hands the scanner nothing but catalogue ids', () => {
    // ONE Canonical Scanner: HOME mounts the same component every other entry mounts.
    const handler = HOME_PAGE.slice(
      HOME_PAGE.indexOf('onResolved={'),
      HOME_PAGE.indexOf('onReturn={'),
    );
    expect(handler).toContain('addScannedProduct(product.id)');
    // No grams, no roles, no engine call: the scanner does no formulation.
    expect(handler).not.toMatch(/planned_grams|setLockType|rebuild|engine/i);
  });

  it('the scanner itself never touches the recipe store', () => {
    expect(SCANNER).not.toContain('useRecipeStore');
    expect(SCANNER).not.toContain('addIngredient');
  });
});

describe('an unknown product never reaches a recipe', () => {
  it('only an engine-ready product can be handed over', () => {
    // The add button IS the gate: a product the engine cannot use is never offered to a recipe.
    expect(SCANNER).toMatch(/disabled=\{!engineReady \|\| busy\}/);
    expect(SCANNER).toContain(
      'Ten produkt nie ma jeszcze wszystkich danych potrzebnych do receptury.',
    );
  });

  it('and HOME never navigates away from a half-built recipe because of one', () => {
    // The unknown half is completed INSIDE the scanner, over the recipe, so the draft survives.
    const block = HOME_PAGE.slice(
      HOME_PAGE.indexOf('<ScanFlow'),
      HOME_PAGE.indexOf('onChoosePlan={'),
    );
    expect(block).not.toContain('navigate(');
  });
});
