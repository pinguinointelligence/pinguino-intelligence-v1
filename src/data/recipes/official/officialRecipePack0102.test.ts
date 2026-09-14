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
import { GELLATTI_PACK_01_02_ADDITIONS } from './officialRecipePack0102';

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
const packageById = (id: (typeof scopedIds)[number]) => {
  const recipe =
    officialRecipeById(id) ?? GELLATTI_PACK_01_02_ADDITIONS.find((entry) => entry.recipeId === id);
  if (!recipe) throw new Error(`package recipe ${id} missing`);
  return recipe;
};
const vector = (id: (typeof scopedIds)[number], scope: 'base' | 'addon') => {
  const recipe = packageById(id);
  const lines =
    scope === 'base' ? officialRecipeBaseLines(recipe) : officialRecipeAddonLines(recipe);
  return lines.map((line) => [
    line.identity.kind === 'mapped' ? line.identity.mapperIngredientId : line.label,
    line.grams,
  ]);
};

describe('GELLATTI recipe packs 01 + 02', () => {
  it('[GRP-DATA-01] keeps eight source additions and 188 unique current identities', () => {
    expect(OFFICIAL_BASELINE_RECIPES).toHaveLength(177);
    expect(GELLATTI_PACK_01_02_ADDITIONS).toHaveLength(8);
    expect(OFFICIAL_RECIPES).toHaveLength(188);
    expect(OFFICIAL_RECIPE_LIBRARY_VERSION).toBe('official-188-v4');
    expect(OFFICIAL_RECIPE_SOURCE_SHA256).toBe(
      'd5066c2bd94404b880866c11207c494bb3f6cfc561c219baa546f0f643e4efb1',
    );
    expect(new Set(OFFICIAL_RECIPES.map((recipe) => recipe.recipeId)).size).toBe(188);
    expect(new Set(OFFICIAL_RECIPES.map((recipe) => recipe.number)).size).toBe(188);
    expect(
      scopedIds
        .filter((id) => id !== 'classic-eiskaffee')
        .every((id) => officialRecipeById(id) !== null),
    ).toBe(true);

    expect(officialRecipeById('classic-neapolitan')).toBeNull();
    expect(officialRecipeById('classic-hokey')).toBeNull();
    expect(officialRecipeById('classic-eiskaffee')).toBeNull();
    expect(packageById('classic-eiskaffee')).toMatchObject({
      number: 180,
      photoStatus: 'pending',
    });
    expect(byId('classic-crema-di-buontalenti')).toMatchObject({
      number: 39,
      photoId: 'GEL-039',
      recipeVersion: 2,
      collection: 'classics',
      subcategory: 'Dessert & Parlour',
      photoStatus: 'available',
    });
    expect(
      scopedIds
        .filter((id) => id !== 'classic-eiskaffee')
        .map((id) => [byId(id).number, byId(id).collection]),
    ).toEqual([
      [39, 'classics'],
      [178, 'lost_legendary'],
      [179, 'cocktails_spirits'],
      [181, 'lost_legendary'],
      [182, 'icons'],
      [183, 'icons'],
      [184, 'icons'],
      [185, 'lost_legendary'],
    ]);
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
      expect(packageById(id).baseRecipeReference).toEqual({
        recipeId: vanilla.recipeId,
        recipeVersion: 1,
        servingGrams: 120,
      });
      expect(vector(id, 'base')).toEqual(expected);
      expect(officialRecipeBaseTotal(packageById(id))).toBe(120);
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
    expect(officialRecipeById('classic-eiskaffee')).toBeNull();
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
      expect(officialRecipeBaseLines(packageById(id)).every((line) => line.scope === 'MAIN')).toBe(
        true,
      );
      expect(
        officialRecipeAddonLines(packageById(id)).every((line) => line.scope === 'TOPPING'),
      ).toBe(true);
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

  it('[GRP-DATA-06] exposes only the delivered package photographs', () => {
    const delivered = scopedIds.filter((id) => id !== 'classic-eiskaffee');
    for (const id of delivered) expect(officialRecipeHasImage(byId(id))).toBe(true);
    expect(officialRecipeHasImage(packageById('classic-eiskaffee'))).toBe(false);
    expect(packageById('classic-eiskaffee').photoStatus).toBe('pending');
    expect(officialRecipeById('classic-eiskaffee')).toBeNull();
  });
});
