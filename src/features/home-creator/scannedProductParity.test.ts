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
/** the ONE shared scanner every entry point mounts (camera → Scan Core → EAN → Scan Import 2.0) */
const SCANNER = readFileSync('src/features/scan-flow/ScanFlow.tsx', 'utf8');
/** HOME's mount of the shared scanner: from the element to its self-closing end */
const HOME_SCANNER_BLOCK = (() => {
  const start = HOME_PAGE.indexOf('<ScanFlow');
  const end = HOME_PAGE.indexOf('/>', start);
  return start >= 0 && end > start ? HOME_PAGE.slice(start, end) : '';
})();

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

  it('a scanned catalogue product takes the PRO picker door, never a HOME-only hydration', () => {
    const door = readFileSync('src/features/home-creator/homeScannedCatalogProduct.ts', 'utf8');
    // the exact building blocks ProductPickerPopover.addScannedProduct uses, in the same order
    for (const step of [
      "scannedProductRecipeTarget(hits, scanned, 'BASE')",
      'resolveCurrentMapperCatalogSelection(hit, context, deps.loadCurrentRow)',
      'engineIngredientForCatalogSelection(hit, selection)',
      'resolveBehavior({',
      'snapshotServerResolvedProductBehavior({',
    ])
      expect(door).toContain(step);
    // HOME routes by kind: Mapper rows through the typed door, everything else through this one
    expect(HOME_SCANNER_BLOCK).toContain("product.entityKind !== 'pi_base'");
    expect(HOME_SCANNER_BLOCK).toContain('addScannedCatalogProduct(product)');
    expect(HOME_PAGE).toContain(
      'handleAddIngredient(outcome.ingredient, outcome.behavior ?? undefined)',
    );
  });

  it('a scanned add-on lands as a topping line through the "Dodaj topping" door, not a notice', () => {
    const door = readFileSync('src/features/home-creator/homeScannedCatalogProduct.ts', 'utf8');
    const picker = readFileSync('src/features/ingredient-builder/ProductPickerPopover.tsx', 'utf8');
    // base first, then the add-on target — the picker's own selection helper in TOPPING context
    expect(door).toContain("scannedProductRecipeTarget(hits, scanned, 'TOPPING')");
    // the ProductBehavior call is the picker's: the scope decides the module, nothing HOME-only
    const moduleRule = "module: scope === 'BASE_FORMULATION' ? 'BASE_RECIPE' : 'TOPPING'";
    expect(door).toContain(moduleRule);
    expect(picker).toContain(moduleRule);
    expect(door).toContain("requestedRole: 'STANDARD'");
    // a label-only base article is an add-on, never a base ingredient
    expect(door).toContain("context === 'BASE' && isCatalogLabelToppingIngredient(ingredient)");
    // HOME adds the topping with the SAME handler the picker's onAdd uses, and shows the recipe
    expect(HOME_PAGE).toContain(
      'handleAddTopping(outcome.ingredient, outcome.behavior ?? undefined)',
    );
    expect(HOME_PAGE).toContain('onAddTopping={handleAddTopping}');
    const toppingCase = HOME_PAGE.slice(
      HOME_PAGE.indexOf("case 'topping':"),
      HOME_PAGE.indexOf("case 'unavailable':"),
    );
    expect(toppingCase).toContain('revealRecipeAfterScan()');
    // the old "go add it yourself" notice is gone
    expect(HOME_PAGE).not.toContain('dodaj go w sekcji dodatków');
  });

  it('HOME hands the scanner nothing but catalogue ids', () => {
    expect(HOME_SCANNER_BLOCK).toContain('mode="recipe"');
    expect(HOME_SCANNER_BLOCK).toContain('addScannedProduct(product.id)');
    // No grams, no roles, no engine call: the scanner does no formulation.
    expect(HOME_SCANNER_BLOCK).not.toMatch(/planned_grams|setLockType|rebuild|engine/i);
    // no second scanner on HOME
    expect(HOME_PAGE).not.toContain('LiveMultiScanner');
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
    expect(HOME_SCANNER_BLOCK.length).toBeGreaterThan(0);
    expect(HOME_SCANNER_BLOCK).not.toContain('navigate(');
    // an unknown product is resolved, saved privately or refused INSIDE the scanner; HOME only ever
    // receives a resolved product id
    expect(HOME_SCANNER_BLOCK).toContain('onResolved={');
  });
});
