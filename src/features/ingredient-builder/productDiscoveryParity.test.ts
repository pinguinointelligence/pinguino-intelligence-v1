import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('HOME and PRO canonical product-discovery parity gate', () => {
  it('routes both product and topping discovery through the shared picker', () => {
    const home = read('src/features/home-creator/ui/HomeRecipeSection.tsx');
    const pro = read('src/features/ingredient-builder/IngredientBuilder.tsx');

    expect(home.match(/<ProductPickerPopover/g)).toHaveLength(2);
    expect(pro.match(/<ProductPickerPopover/g)).toHaveLength(2);
    expect(home).toContain('scope="BASE_FORMULATION"');
    expect(home).toContain('scope="POST_PROCESS_ADDON"');
    expect(pro).toContain('scope="BASE_FORMULATION"');
    expect(pro).toContain('scope="POST_PROCESS_ADDON"');
  });

  it('uses live search for both paid HOME and PRO while Demo stays local', () => {
    const library = read('src/features/ingredient-builder/ingredientLibrary.ts');
    const hook = read('src/features/ingredient-builder/useIngredientLibrary.ts');

    expect(library).toContain('return !demo;');
    expect(hook).toContain('serverSearchLibrary()');
    expect(hook).not.toMatch(/home.*filter|pro.*filter/i);
  });

  it('keeps the taxonomy and slot projection outside either presentation entry point', () => {
    const home = read('src/features/home-creator/ui/HomeRecipeSection.tsx');
    const pro = read('src/features/ingredient-builder/IngredientBuilder.tsx');

    for (const source of [home, pro]) {
      expect(source).not.toContain('PRODUCT_DISCOVERY_TOP_FILTERS');
      expect(source).not.toContain('projectCatalogHitsForDiscovery');
      expect(source).not.toContain('canonicalSearchConceptForQuery');
    }
  });
});
