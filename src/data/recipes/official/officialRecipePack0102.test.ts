import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_BASELINE_RECIPES,
  OFFICIAL_RECIPES,
  OFFICIAL_RECIPE_LIBRARY_VERSION,
  OFFICIAL_RECIPE_SOURCE_SHA256,
  officialRecipeAddonLines,
  officialRecipeAddonTotal,
  officialRecipeBaseLines,
  officialRecipeBaseTotal,
  officialRecipeById,
  officialRecipeFinalTotal,
  officialRecipeHasImage,
} from './officialRecipeLibrary';
import { officialRecipeReadiness } from './officialRecipeReadiness';

const scopedIds = [
  'classic-crema-di-buontalenti',
  'classic-plombir',
  'classic-porter-ice-cream',
  'classic-eiskaffee',
  'classic-spaghettieis',
  'icon-pistachio-white-chocolate-praline',
  'icon-red-velvet-cheesecake-chunk',
  'icon-milky-hazelnut-chocolate-crunch',
  'heritage-parmesan-ice-cream',
] as const;

const byId = (id: (typeof scopedIds)[number]) => officialRecipeById(id)!;
const vector = (id: (typeof scopedIds)[number], scope: 'base' | 'addon') => {
  const recipe = byId(id);
  const lines =
    scope === 'base' ? officialRecipeBaseLines(recipe) : officialRecipeAddonLines(recipe);
  return lines.map((line) => [
    line.identity.kind === 'mapped' ? line.identity.mapperIngredientId : line.label,
    line.grams,
  ]);
};

describe('GELLATTI recipe packs 01 + 02', () => {
  it('[GRP-DATA-01] adds eight unique records and replaces only current #039', () => {
    expect(OFFICIAL_BASELINE_RECIPES).toHaveLength(177);
    expect(OFFICIAL_RECIPES).toHaveLength(185);
    expect(OFFICIAL_RECIPE_LIBRARY_VERSION).toBe('official-185-v2');
    expect(OFFICIAL_RECIPE_SOURCE_SHA256).toBe(
      '5aeb4248cfc49dfab7082e67dff8ad30bf097b3fb5d74812c3b2d1cd16113d91',
    );
    expect(new Set(OFFICIAL_RECIPES.map((recipe) => recipe.recipeId)).size).toBe(185);
    expect(new Set(OFFICIAL_RECIPES.map((recipe) => recipe.number)).size).toBe(185);
    expect(scopedIds.every((id) => officialRecipeById(id) !== null)).toBe(true);

    expect(officialRecipeById('classic-neapolitan')).toBeNull();
    expect(byId('classic-crema-di-buontalenti')).toMatchObject({
      number: 39,
      photoId: 'GEL-039',
      recipeVersion: 2,
      collection: 'classics',
      subcategory: 'Dessert & Parlour',
      photoStatus: 'pending',
    });
    expect(OFFICIAL_BASELINE_RECIPES.find((recipe) => recipe.number === 39)?.recipeId).toBe(
      'classic-neapolitan',
    );
    expect(officialRecipeById('classic-dubai')).toEqual(
      OFFICIAL_BASELINE_RECIPES.find((recipe) => recipe.number === 66),
    );
    expect(officialRecipeById('icon-caramel-biscuit-cream')).toEqual(
      OFFICIAL_BASELINE_RECIPES.find((recipe) => recipe.number === 86),
    );
  });

  it('[GRP-DATA-02] keeps the four pack-01 MAIN vectors at exactly 1000 g', () => {
    expect(vector('heritage-parmesan-ice-cream', 'base')).toEqual([
      ['PI-ING-000236', 400],
      ['PI-ING-002196', 250],
      ['PI-ING-001666', 100],
      ['PI-ING-000514', 110],
      ['PI-ING-000494', 40],
      ['PI-ING-001447', 80],
      ['PI-ING-000270', 20],
    ]);
    expect(vector('classic-crema-di-buontalenti', 'base')).toEqual([
      ['PI-ING-000236', 330],
      ['PI-ING-002196', 400],
      ['PI-ING-001646', 80],
      ['PI-ING-000514', 150],
      ['PI-ING-000494', 25],
      ['PI-ING-000270', 15],
    ]);
    expect(vector('classic-plombir', 'base')).toEqual([
      ['PI-ING-000201', 430],
      ['PI-ING-002196', 350],
      ['PI-ING-000270', 45],
      ['PI-ING-000514', 120],
      ['PI-ING-000494', 30],
      ['PI-ING-001463', 15],
      ['PI-ING-000516', 10],
    ]);
    expect(vector('classic-porter-ice-cream', 'base')).toEqual([
      ['PI-ING-000236', 370],
      ['PI-ING-002196', 250],
      ['PI-ING-001615', 150],
      ['PI-ING-001646', 50],
      ['PI-ING-000270', 65],
      ['PI-ING-000514', 80],
      ['PI-ING-002144', 35],
    ]);
    for (const id of [
      'heritage-parmesan-ice-cream',
      'classic-crema-di-buontalenti',
      'classic-plombir',
      'classic-porter-ice-cream',
    ] as const)
      expect(officialRecipeBaseTotal(byId(id))).toBe(1000);
  });

  it('[GRP-DATA-03] uses the exact frozen vanilla #015 vector for the 120 g serving bases', () => {
    const vanilla = OFFICIAL_BASELINE_RECIPES.find((recipe) => recipe.number === 15)!;
    const expected = vanilla.lines.map((line) => [
      line.identity.kind === 'mapped' ? line.identity.mapperIngredientId : line.label,
      Number((line.grams * 0.12).toFixed(6)),
    ]);
    for (const id of ['classic-eiskaffee', 'classic-spaghettieis'] as const) {
      expect(byId(id).baseRecipeReference).toEqual({
        recipeId: vanilla.recipeId,
        recipeVersion: 1,
        servingGrams: 120,
      });
      expect(vector(id, 'base')).toEqual(expected);
      expect(officialRecipeBaseTotal(byId(id))).toBe(120);
    }
    expect(vector('classic-eiskaffee', 'addon')).toEqual([
      ['PI-ING-002479', 200],
      ['PI-ING-002196', 50],
      ['PI-ING-002453', 3],
    ]);
    expect(vector('classic-spaghettieis', 'addon')).toEqual([
      ['PI-ING-002196', 50],
      ['PI-ING-001553', 60],
      ['PI-ING-000514', 6],
      ['PI-ING-002466', 10],
    ]);
    expect(byId('classic-spaghettieis').toolNotice).toContain('Spätzlepresse');
    expect(byId('classic-spaghettieis').searchAliases).toContain('Spagettieis');
  });

  it('[GRP-DATA-04] keeps every Icons MAIN at 1000 g and additions outside the Engine Base', () => {
    expect(officialRecipeBaseTotal(byId('icon-pistachio-white-chocolate-praline'))).toBe(1000);
    expect(officialRecipeAddonTotal(byId('icon-pistachio-white-chocolate-praline'))).toBe(115.5);
    expect(officialRecipeFinalTotal(byId('icon-pistachio-white-chocolate-praline'))).toBe(1115.5);
    expect(officialRecipeBaseTotal(byId('icon-red-velvet-cheesecake-chunk'))).toBe(1000);
    expect(officialRecipeAddonTotal(byId('icon-red-velvet-cheesecake-chunk'))).toBe(200);
    expect(officialRecipeFinalTotal(byId('icon-red-velvet-cheesecake-chunk'))).toBe(1200);
    expect(officialRecipeBaseTotal(byId('icon-milky-hazelnut-chocolate-crunch'))).toBe(1000);
    expect(officialRecipeAddonTotal(byId('icon-milky-hazelnut-chocolate-crunch'))).toBe(175);
    expect(officialRecipeFinalTotal(byId('icon-milky-hazelnut-chocolate-crunch'))).toBe(1175);
    for (const id of scopedIds) {
      expect(officialRecipeBaseLines(byId(id)).every((line) => line.scope === 'MAIN')).toBe(true);
      expect(officialRecipeAddonLines(byId(id)).every((line) => line.scope === 'TOPPING')).toBe(
        true,
      );
    }
  });

  it('[GRP-DATA-05] preserves exact unresolved add-ons, their grams and PRODUCT_BLOCKED state', () => {
    const redVelvet = byId('icon-red-velvet-cheesecake-chunk');
    const schoko = byId('icon-milky-hazelnut-chocolate-crunch');
    expect(vector('icon-red-velvet-cheesecake-chunk', 'addon')[0]).toEqual([
      'Ciasto Red Velvet — upieczone, bez kremu i polewy',
      150,
    ]);
    expect(vector('icon-milky-hazelnut-chocolate-crunch', 'addon')[0]).toEqual([
      'Kinder Schoko-Bons ORIGINAL — mleczna czekolada, posiekane',
      120,
    ]);
    expect(officialRecipeReadiness(redVelvet).state).toBe('PRODUCT_BLOCKED');
    expect(officialRecipeReadiness(schoko).state).toBe('PRODUCT_BLOCKED');
  });

  it('[GRP-DATA-06] never assigns an image URL to any current pack card', () => {
    for (const id of scopedIds) expect(officialRecipeHasImage(byId(id))).toBe(false);
  });
});
