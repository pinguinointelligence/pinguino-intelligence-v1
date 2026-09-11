import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '@/lib/csv';
import {
  OFFICIAL_COLLECTIONS,
  OFFICIAL_RECIPES,
  OFFICIAL_RECIPE_SOURCE_SHA256,
  officialRecipeById,
  officialRecipeImage,
  officialRecipeUseState,
  officialRecipeWorkingCopy,
  officialRecipeWorkingProfile,
  officialRecipesInCollection,
  officialUnresolvedLines,
} from './officialRecipeLibrary';

const here = (file: string) => resolve(process.cwd(), 'src/data/recipes/official', file);
const manifest = JSON.parse(readFileSync(here('officialRecipeLibrary.manifest.json'), 'utf8'));
const generatedSource = readFileSync(here('officialRecipeLibrary.generated.ts'), 'utf8');
const lines = OFFICIAL_RECIPES.flatMap((recipe) => recipe.lines);
const byNumber = (number: number) => OFFICIAL_RECIPES.find((recipe) => recipe.number === number)!;
const countBy = <T,>(values: readonly T[]) =>
  values.reduce<Record<string, number>>((acc, value) => {
    acc[String(value)] = (acc[String(value)] ?? 0) + 1;
    return acc;
  }, {});

describe('official recipe import audit (§25)', () => {
  it('imports exactly 177 recipes and 1510 lines from the owner workbook', () => {
    expect(OFFICIAL_RECIPE_SOURCE_SHA256).toBe(
      'a85e32a42a8a2e18a375647f8606c3d20c77f7f37a178273f557445579c76dfb',
    );
    expect(OFFICIAL_RECIPES).toHaveLength(177);
    expect(lines).toHaveLength(1510);
    expect(OFFICIAL_RECIPES.map((recipe) => recipe.number)).toEqual(
      Array.from({ length: 177 }, (_, index) => index + 1),
    );
    expect(new Set(OFFICIAL_RECIPES.map((recipe) => recipe.recipeId)).size).toBe(177);
    for (const recipe of OFFICIAL_RECIPES) {
      expect(recipe.photoId).toBe(`GEL-${String(recipe.number).padStart(3, '0')}`);
    }
  });

  it('keeps every source formula at exactly 1000 g, lines in source order', () => {
    for (const recipe of OFFICIAL_RECIPES) {
      expect(recipe.sourceTotalGrams).toBe(1000);
      expect(recipe.lines.reduce((sum, line) => sum + line.grams, 0)).toBe(1000);
      expect(recipe.lines.map((line) => line.line)).toEqual(
        recipe.lines.map((_, index) => index + 1),
      );
    }
    expect(lines.map((line) => line.sourceRow)).toEqual(
      Array.from({ length: 1510 }, (_, index) => index + 1),
    );
  });

  it('keeps the owner collection split, ranges and order', () => {
    expect(OFFICIAL_COLLECTIONS.map((collection) => collection.name)).toEqual([
      'Classics',
      'Icons',
      'Cocktails & Spirits',
      'Lost & Legendary',
      'Technical Bases',
    ]);
    const expected = {
      classics: [77, 1, 77],
      icons: [25, 78, 102],
      cocktails_spirits: [48, 103, 150],
      lost_legendary: [15, 151, 165],
      technical_bases: [12, 166, 177],
    } as const;
    for (const collection of OFFICIAL_COLLECTIONS) {
      const recipes = officialRecipesInCollection(collection.id);
      const [count, first, last] = expected[collection.id];
      expect(recipes).toHaveLength(count);
      expect(recipes[0]!.number).toBe(first);
      expect(recipes.at(-1)!.number).toBe(last);
      expect([collection.firstNumber, collection.lastNumber]).toEqual([first, last]);
    }
  });

  it('keeps 1458 mapped lines, 52 BRAK lines in 41 recipes and 113 distinct PIs', () => {
    const mapped = lines.filter((line) => line.identity.kind === 'mapped');
    const brak = lines.filter((line) => line.identity.kind !== 'mapped');
    expect(mapped).toHaveLength(1458);
    expect(brak).toHaveLength(52);
    expect(brak.filter((line) => line.identity.kind === 'dynamic_main')).toHaveLength(3);
    expect(OFFICIAL_RECIPES.filter((recipe) => recipe.lines.some((l) => l.identity.kind !== 'mapped'))).toHaveLength(41);
    const pis = new Set(mapped.map((line) => (line.identity.kind === 'mapped' ? line.identity.mapperIngredientId : '')));
    expect(pis.size).toBe(113);
    expect(manifest.counts).toMatchObject({
      recipes: 177,
      lines: 1510,
      mappedLines: 1458,
      brakLines: 52,
      unresolvedLines: 49,
      dynamicMainLines: 3,
      recipesWithBrak: 41,
      uniqueReferencedPi: 113,
      referencedPiMissingFromMapper: 0,
      images: 177,
      imagesMissing: 0,
      collectionHeroes: 5,
    });
  });

  it('audited every referenced PI against the FINAL 2541 × 62 Mapper (0 missing)', () => {
    expect(manifest.source.mapper).toEqual({
      file: 'mapper_basement.csv',
      sha256: 'a6a849a596acef75e0760992353bddf5cbca24ff37744e36414da18ca45556f6',
      rows: 2541,
      columns: 62,
    });
    expect(manifest.referencedPi).toHaveLength(113);
  });

  it('references only PIs that the repository Mapper projection also holds', () => {
    const grid = parseCsv(
      readFileSync(resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'), 'utf8'),
    );
    const idIndex = grid[0]!.indexOf('ingredient_id');
    const repoIds = new Set(grid.slice(1).map((row) => row[idIndex]));
    const missing = (manifest.referencedPi as string[]).filter((pi) => !repoIds.has(pi));
    expect(missing).toEqual([]);
  });

  it('preserves every source status instead of promoting recipes', () => {
    expect(countBy(OFFICIAL_RECIPES.map((recipe) => recipe.sourceStatus))).toEqual({
      NEW_TO_ENGINE: 159,
      ENGINE_BASE_VALID_BLOCKED: 5,
      CORRECTION_TO_ENGINE: 5,
      VERIFIED_EXISTING: 5,
      SCAFFOLD_RECALC_BY_MAIN: 3,
    });
  });

  it('preserves source stages verbatim — LATE ADD is not turned into a topping', () => {
    expect(countBy(lines.map((line) => line.stage))).toEqual({
      MIX: 1440,
      'LATE ADD': 32,
      SWIRL: 13,
      'CHOCOLATE THIRD': 9,
      'VANILLA THIRD': 8,
      'STRAWBERRY THIRD': 8,
    });
    expect(generatedSource).not.toMatch(/TOPPING|POST_PROCESS_ADDON/);
  });

  it('keeps the degassing flag and the source process notices verbatim (§19)', () => {
    const degassing = OFFICIAL_RECIPES.filter((recipe) => recipe.degassingRequired);
    expect(degassing.map((recipe) => recipe.number)).toEqual([
      107, 109, 110, 111, 115, 116, 119, 120, 126, 129,
    ]);
    for (const recipe of degassing) {
      expect(recipe.processNotice).toContain('Odgazuj napój przed użyciem.');
    }
    expect(OFFICIAL_RECIPES.filter((recipe) => recipe.processNotice === null).map((r) => r.number)).toEqual([
      156, 158, 160,
    ]);
    expect(
      OFFICIAL_RECIPES.filter((recipe) =>
        recipe.processNotice?.startsWith('Tara — składnik podlega obróbce cieplnej.'),
      ),
    ).toHaveLength(174);
    const line = byNumber(110).lines[1]!;
    expect(line).toMatchObject({ label: 'Bitter aperitivo 11%', publicLabelOnly: true });
    expect(lines.filter((entry) => entry.publicLabelOnly)).toHaveLength(1);
  });

  it('never carries the workbook’s historical Exact Mapper name into the runtime module', () => {
    // The header comment documents the rule; the data itself must not carry the column.
    const data = generatedSource.slice(generatedSource.indexOf('export const OFFICIAL_RECIPE_SOURCE:'));
    expect(data).not.toContain('Exact Mapper name');
    expect(data).not.toContain('historicalMapperName');
    for (const entry of manifest.nameDrift.entries as { historicalNames: string[] }[]) {
      for (const historical of entry.historicalNames) {
        expect(generatedSource).not.toContain(historical);
      }
    }
  });
});

describe('canonical name reconciliation (§26)', () => {
  const examples = {
    'PI-ING-000236': ['MILK 3.5% · Milk · Chilled', 'MILK · 3.5% FAT · Chilled'],
    'PI-ING-000270': ['SKIMMED MILK · Milk', 'SKIMMED MILK POWDER · 0.8% FAT · Dairy · Dry'],
    'PI-ING-000494': ['DEXTROSE · Sweetener · Dry', 'DEXTROSE MONOHYDRATE · Sweetener · Dry'],
    'PI-ING-000456': ['INULIN · Specialty', 'INULIN · Fibre · Powder'],
    'PI-ING-001579': [
      'DEFATTED COCOA 12% · Cocoa Powder',
      'ALKALIZED COCOA POWDER · 11% FAT · Unsweetened',
    ],
  } as const;

  it('records 634 drifted lines over 16 PIs and keeps each on its own PI', () => {
    expect(manifest.nameDrift.lines).toBe(634);
    expect(manifest.nameDrift.pi).toBe(16);
    for (const [pi, [historical, current]] of Object.entries(examples)) {
      const entry = (manifest.nameDrift.entries as { pi: string; historicalNames: string[]; currentName: string }[]).find(
        (candidate) => candidate.pi === pi,
      );
      expect(entry, pi).toBeDefined();
      expect(entry!.historicalNames).toEqual([historical]);
      expect(entry!.currentName).toBe(current);
      const attached = lines.filter(
        (line) => line.identity.kind === 'mapped' && line.identity.mapperIngredientId === pi,
      );
      expect(attached.length, pi).toBeGreaterThan(0);
    }
  });
});

describe('BRAK stays unresolved (§27)', () => {
  it('keeps each unresolved line visible with its label and grams and no guessed PI', () => {
    const unresolved = lines.filter((line) => line.identity.kind === 'unresolved');
    expect(unresolved).toHaveLength(49);
    for (const line of unresolved) {
      expect(line.identity).toEqual({ kind: 'unresolved', sourceIdStatus: 'BRAK' });
      expect(line.label.length).toBeGreaterThan(0);
      expect(line.grams).toBeGreaterThan(0);
    }
  });

  it.each([
    [20, ['Birthday cake pieces'], 75],
    [42, ['Tamarind pulp'], 250],
    [73, ['Saffron'], 0.5],
    [112, ['Cachaca'], 40],
    [158, ['Mleko kozie', 'Salep', 'Guma arabska'], 842],
  ])('recipe #%i stays browsable but its use is blocked on %j', (number, labels, firstGrams) => {
    const recipe = byNumber(number);
    expect(officialRecipeById(recipe.recipeId)).toBe(recipe);
    const state = officialRecipeUseState(recipe);
    expect(state.kind).toBe('unresolved_identity');
    const blocked = officialUnresolvedLines(recipe);
    expect(blocked.map((line) => line.label)).toEqual(labels);
    expect(blocked[0]!.grams).toBe(firstGrams);
  });

  it('lets the 136 recipes without BRAK or a scaffold Main be used', () => {
    expect(OFFICIAL_RECIPES.filter((recipe) => officialRecipeUseState(recipe).kind === 'ready')).toHaveLength(
      177 - 41,
    );
  });
});

describe('Technical Bases (§28)', () => {
  it.each([
    [166, 'tech-protein-11', 'VERIFIED_EXISTING', 'protein', 'temp_minus_11'],
    [169, 'tech-sorbet-11', 'SCAFFOLD_RECALC_BY_MAIN', 'sorbet', 'temp_minus_11'],
    [172, 'tech-gelato-11', 'VERIFIED_EXISTING', 'gelato', 'temp_minus_11'],
    [175, 'tech-vegan-11-v2', 'CORRECTION_TO_ENGINE', 'vegan', 'temp_minus_11'],
    [177, 'tech-vegan-13', 'VERIFIED_EXISTING', 'vegan', 'temp_minus_13'],
  ] as const)('GEL-%i keeps its identity, collection, image and status', (number, id, status, type, mode) => {
    const recipe = byNumber(number);
    expect(recipe).toMatchObject({
      recipeId: id,
      collection: 'technical_bases',
      productType: 'Technical Base',
      sourceStatus: status,
    });
    expect(officialRecipeImage(recipe).detail).toBe(
      `/recipes/official/GEL-${number}-960.webp`,
    );
    expect(officialRecipeWorkingProfile(recipe)).toEqual({
      visibleProductType: type,
      servingModeId: mode,
    });
  });

  it('keeps the Sorbet scaffold Main dynamic, never a missing product (169/170/171)', () => {
    for (const number of [169, 170, 171]) {
      const recipe = byNumber(number);
      expect(recipe.sourceStatus).toBe('SCAFFOLD_RECALC_BY_MAIN');
      expect(recipe.lines[0]).toMatchObject({
        line: 1,
        label: 'Wybrany owoc / Main',
        grams: 600,
        identity: { kind: 'dynamic_main', sourceIdStatus: 'BRAK' },
      });
      expect(officialUnresolvedLines(recipe)).toEqual([]);
      expect(officialRecipeUseState(recipe).kind).toBe('dynamic_main_required');
    }
  });

  it('gives every Technical Base a stated profile and temperature', () => {
    for (const recipe of officialRecipesInCollection('technical_bases')) {
      expect(officialRecipeWorkingProfile(recipe).servingModeId).not.toBeNull();
    }
  });
});

describe('immutable official source (§12)', () => {
  it('deep-freezes the registry', () => {
    const recipe = byNumber(1);
    expect(Object.isFrozen(OFFICIAL_RECIPES)).toBe(true);
    expect(Object.isFrozen(recipe)).toBe(true);
    expect(Object.isFrozen(recipe.lines[0])).toBe(true);
    expect(() => {
      (recipe.lines[0] as { grams: number }).grams = 1;
    }).toThrow(TypeError);
    expect(recipe.lines[0]!.grams).toBe(490);
  });

  it('hands out detached working copies', () => {
    const copy = officialRecipeWorkingCopy('classic-dark-chocolate')!;
    (copy.lines[0] as { grams: number }).grams = 999;
    expect(byNumber(1).lines[0]!.grams).toBe(490);
    expect(officialRecipeWorkingCopy('missing-recipe')).toBeNull();
  });
});
