import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_BASELINE_RECIPES,
  OFFICIAL_BASELINE_RECIPE_SOURCE_SHA256,
  OFFICIAL_RECIPES,
  OFFICIAL_RECIPE_LIBRARY_VERSION,
  OFFICIAL_RECIPE_SOURCE_SHA256,
  officialRecipeById,
  officialRecipeFinalTotal,
  officialRecipeHasImage,
  officialRecipeUseState,
  officialRecipeWorkingCopy,
  officialRecipesInCollection,
} from './officialRecipeLibrary';
import { officialRecipeReadiness } from './officialRecipeReadiness';
import {
  GELLATTI_PACK_03_ADDITIONS,
  GELLATTI_PACK_03_REPLACEMENT_164,
  OFFICIAL_RECIPE_PACK_03_SHA256,
  officialRecipePack03HashInput,
} from './officialRecipePack03';
import { OFFICIAL_RECIPE_PACK_01_02_SHA256 } from './officialRecipePack0102';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const byNumber = (number: number) => OFFICIAL_RECIPES.find((recipe) => recipe.number === number)!;

describe('GELLATTI recipe package 03', () => {
  it('[GRP03-DATA-01] exposes exactly 188 unique canonical identities and real provenance hashes', () => {
    expect(OFFICIAL_RECIPE_PACK_03_SHA256).toBe(sha256(officialRecipePack03HashInput()));
    expect(OFFICIAL_RECIPES).toHaveLength(188);
    expect(new Set(OFFICIAL_RECIPES.map((recipe) => recipe.number)).size).toBe(188);
    expect(new Set(OFFICIAL_RECIPES.map((recipe) => recipe.recipeId)).size).toBe(188);
    expect(OFFICIAL_RECIPE_LIBRARY_VERSION).toBe('official-188-v4');
    expect(OFFICIAL_RECIPE_SOURCE_SHA256).toBe(
      sha256(
        [
          OFFICIAL_BASELINE_RECIPE_SOURCE_SHA256,
          OFFICIAL_RECIPE_PACK_01_02_SHA256,
          OFFICIAL_RECIPE_PACK_03_SHA256,
        ].join('\n'),
      ),
    );
  });

  it('[GRP03-DATA-02] keeps additions #186-190 at 1000 g with consecutive lines', () => {
    expect(GELLATTI_PACK_03_ADDITIONS.map((recipe) => recipe.number)).toEqual([
      186, 187, 188, 189, 190,
    ]);
    for (const number of [186, 187, 188, 189, 190]) {
      const recipe = byNumber(number);
      expect(recipe.sourceTotalGrams, recipe.name).toBe(1000);
      expect(officialRecipeFinalTotal(recipe), recipe.name).toBe(1000);
      expect(recipe.lines.map((line) => line.line)).toEqual(
        recipe.lines.map((_, index) => index + 1),
      );
      expect(recipe.sourcePackage).toEqual({
        id: 'GELLATTI_RECIPE_PACK_03',
        sha256: OFFICIAL_RECIPE_PACK_03_SHA256,
      });
    }
  });

  it('[GRP03-DATA-03] keeps #186-188 exact BRAK products unresolved without guessed PIs', () => {
    expect(
      [186, 187, 188].map((number) => ({
        number,
        labels: byNumber(number)
          .lines.filter((line) => line.identity.kind === 'unresolved')
          .map((line) => line.label),
      })),
    ).toEqual([
      {
        number: 186,
        labels: [
          'Guinness / odpowiedni irlandzki stout',
          'Brown bread — karmelizowane pełnoziarniste pieczywo',
        ],
      },
      { number: 187, labels: ['Redukcja Cabernet Sauvignon z Cafayate'] },
      { number: 188, labels: ['Vin Santo', 'Cantucci / cantuccini migdałowe'] },
    ]);
    for (const number of [186, 187, 188]) {
      const recipe = byNumber(number);
      expect(officialRecipeUseState(recipe).kind).toBe('unresolved_identity');
      expect(recipe.photoStatus).toBe('pending');
      expect(officialRecipeHasImage(recipe)).toBe(false);
      for (const line of recipe.lines.filter((entry) => entry.identity.kind === 'unresolved')) {
        expect(line.identity).toEqual({ kind: 'unresolved', sourceIdStatus: 'BRAK' });
        expect(line.unresolvedRequirement).toBe('physical_product');
      }
    }
  });

  it('[GRP03-DATA-04] maps #189 and #190 exactly while preserving the PI-ING-001705 block', () => {
    const vector = (number: number) =>
      byNumber(number).lines.map((line) => [
        line.label,
        line.grams,
        line.identity.kind === 'mapped' ? line.identity.mapperIngredientId : null,
      ]);
    expect(vector(189)).toEqual([
      ['Mleko 3,5%', 555, 'PI-ING-000236'],
      ['Śmietanka 30%', 110, 'PI-ING-000180'],
      ['Odtłuszczone mleko w proszku', 30, 'PI-ING-000270'],
      ['Sacharoza', 60, 'PI-ING-000514'],
      ['Dekstroza', 50, 'PI-ING-000494'],
      ['Inulina', 43, 'PI-ING-000456'],
      ['Espresso', 100, 'PI-ING-001591'],
      ['Irish cream / coffee cream liqueur', 40, 'PI-ING-000022'],
      ['Pasta waniliowa', 10, 'PI-ING-001705'],
      ['Guma tara', 2, 'PI-ING-000492'],
    ]);
    expect(vector(190)).toEqual([
      ['Mleko 3,5%', 555, 'PI-ING-000236'],
      ['Śmietanka 30%', 100, 'PI-ING-000180'],
      ['Odtłuszczone mleko w proszku', 30, 'PI-ING-000270'],
      ['Sacharoza', 60, 'PI-ING-000514'],
      ['Dekstroza', 50, 'PI-ING-000494'],
      ['Inulina', 43, 'PI-ING-000456'],
      ['Espresso', 110, 'PI-ING-001591'],
      ['Disaronno Originale / Amaretto liqueur', 40, 'PI-ING-001768'],
      ['Pasta waniliowa', 10, 'PI-ING-001705'],
      ['Guma tara', 2, 'PI-ING-000492'],
    ]);
    for (const number of [189, 190]) {
      const recipe = byNumber(number);
      expect(recipe.photoStatus).toBe('available');
      expect(officialRecipeHasImage(recipe)).toBe(true);
      const readiness = officialRecipeReadiness(recipe);
      expect(readiness.state).toBe('OTHER_EXPLICIT_BLOCKER');
      expect(readiness.blockingLines).toHaveLength(1);
      expect(readiness.blockingLines[0]).toMatchObject({
        reason: 'final_mapper_blocked',
        line: {
          line: 9,
          label: 'Pasta waniliowa',
          identity: { kind: 'mapped', mapperIngredientId: 'PI-ING-001705' },
        },
      });
    }
  });

  it('[GRP03-DATA-05] replaces #164 provenance and collection only', () => {
    const baseline = OFFICIAL_BASELINE_RECIPES.find((recipe) => recipe.number === 164)!;
    const expected = {
      ...baseline,
      recipeVersion: 2,
      sourcePackage: {
        id: 'GELLATTI_RECIPE_PACK_03',
        sha256: OFFICIAL_RECIPE_PACK_03_SHA256,
      },
      collection: 'cocktails_spirits',
    };
    expect(GELLATTI_PACK_03_REPLACEMENT_164).toEqual(expected);
    expect(byNumber(164)).toEqual(expected);
    expect(OFFICIAL_RECIPES.filter((recipe) => recipe.number === 164)).toHaveLength(1);
    expect(officialRecipeById('lost-it-zabaione')).toBe(byNumber(164));
  });

  it('[GRP03-DATA-06] applies exact owner collection counts and stable tails', () => {
    const expected = {
      classics: { count: 76, tail: [74, 75, 76] },
      icons: { count: 28, tail: [182, 183, 184] },
      cocktails_spirits: { count: 52, tail: [179, 164, 189, 190] },
      lost_legendary: { count: 16, tail: [165, 178, 185, 181] },
      technical_bases: { count: 12, tail: [175, 176, 177] },
    } as const;
    const memberships = Object.keys(expected).flatMap((collection) =>
      officialRecipesInCollection(collection as keyof typeof expected),
    );
    for (const [collection, contract] of Object.entries(expected)) {
      const recipes = officialRecipesInCollection(collection as keyof typeof expected);
      expect(recipes, collection).toHaveLength(contract.count);
      expect(recipes.slice(-contract.tail.length).map((recipe) => recipe.number)).toEqual(
        contract.tail,
      );
    }
    expect(memberships).toHaveLength(184);
    expect(new Set(memberships.map((recipe) => recipe.recipeId)).size).toBe(memberships.length);
    expect(
      OFFICIAL_RECIPES.filter(
        (recipe) => !memberships.some((member) => member.recipeId === recipe.recipeId),
      ).map((recipe) => recipe.recipeId),
    ).toEqual([
      'lost-gb-rum-raisin',
      'heritage-irish-stout-brown-bread',
      'heritage-cafayate-cabernet-sauvignon',
      'heritage-vin-santo-cantucci',
    ]);
    expect(
      officialRecipesInCollection('lost_legendary')
        .filter((recipe) => [164, 186, 187, 188].includes(recipe.number))
        .map((recipe) => recipe.number),
    ).toEqual([]);
    expect(
      officialRecipesInCollection('lost_legendary')
        .filter((recipe) => [178, 181].includes(recipe.number))
        .map((recipe) => recipe.number),
    ).toEqual([178, 181]);
  });

  it('[GRP03-DATA-07] keeps canonical records frozen and working copies detached', () => {
    const canonical = byNumber(189);
    expect(Object.isFrozen(canonical)).toBe(true);
    expect(Object.isFrozen(canonical.lines[0])).toBe(true);
    const copy = officialRecipeWorkingCopy(canonical.recipeId)!;
    (copy.lines[0] as { grams: number }).grams = 1;
    expect(byNumber(189).lines[0]!.grams).toBe(555);
  });
});
