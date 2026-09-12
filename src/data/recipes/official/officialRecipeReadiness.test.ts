import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCsv } from '@/lib/csv';
import {
  OFFICIAL_BRAK_CROSSWALK_SOURCE,
  OFFICIAL_BRAK_RESOLUTIONS,
  OFFICIAL_FINAL_BLOCKED_PIS,
} from './officialBrakResolution.generated';
import { OFFICIAL_RECIPES } from './officialRecipeLibrary';
import {
  officialBrakResolutionFor,
  officialLibraryReadinessCounts,
  officialRecipeCanStart,
  officialRecipeReadiness,
  type OfficialRecipeReadinessState,
} from './officialRecipeReadiness';

const here = (name: string) => resolve(dirname(fileURLToPath(import.meta.url)), name);
const manifest = JSON.parse(readFileSync(here('officialRecipeLibrary.manifest.json'), 'utf8'));

const byNumber = (number: number) => {
  const recipe = OFFICIAL_RECIPES.find((candidate) => candidate.number === number);
  if (!recipe) throw new Error(`recipe #${number} missing`);
  return recipe;
};
const numbersIn = (state: OfficialRecipeReadinessState) =>
  OFFICIAL_RECIPES.filter((recipe) => officialRecipeReadiness(recipe).state === state).map((recipe) => recipe.number);

describe('official Recipe Library readiness', () => {
  it('has one owner crosswalk row for every BRAK label, and a line for every row', () => {
    const brakLabels = new Set(
      OFFICIAL_RECIPES.flatMap((recipe) => recipe.lines)
        .filter((line) => line.identity.kind !== 'mapped')
        .map((line) => line.label),
    );
    expect(OFFICIAL_BRAK_CROSSWALK_SOURCE.sha256).toBe(
      '7227d2c9c4a8faec25c3ffcc2ae6bade9be7271e9eb615abde2512da4f723a46',
    );
    expect(OFFICIAL_BRAK_RESOLUTIONS).toHaveLength(44);
    expect(brakLabels.size).toBe(44);
    expect([...brakLabels].filter((label) => !officialBrakResolutionFor(label))).toEqual([]);
    expect(OFFICIAL_BRAK_RESOLUTIONS.filter((row) => !brakLabels.has(row.label))).toEqual([]);
  });

  it('records exactly the referenced PIs that the FINAL 2541 projection does not approve', () => {
    const grid = parseCsv(
      readFileSync(resolve(process.cwd(), 'docs/ingredients/validation/mapper_basement.csv'), 'utf8'),
    );
    const header = grid[0]!;
    const column = (name: string) => header.indexOf(name);
    const approved = new Map(
      grid
        .slice(1)
        .map((cells) => [
          cells[column('ingredient_id')],
          cells[column('approved_for_base')] === 'TRUE' && cells[column('approved_for_engines')] === 'TRUE',
        ] as const),
    );
    const blocked = (manifest.referencedPi as string[]).filter((pi) => approved.get(pi) !== true).sort();
    expect(OFFICIAL_FINAL_BLOCKED_PIS.map((entry) => entry.pi)).toEqual(blocked);
    expect(blocked).toEqual(['PI-ING-000618', 'PI-ING-001705']);
    for (const row of OFFICIAL_BRAK_RESOLUTIONS.filter((entry) => entry.targetPi)) {
      expect(row.targetApproved, row.label).toBe(approved.get(row.targetPi!) === true);
    }
  });

  it('gives every recipe exactly one explicit state', () => {
    expect(officialLibraryReadinessCounts(OFFICIAL_RECIPES)).toEqual({
      READY: 127,
      DYNAMIC_MAIN: 3,
      REVIEW_REQUIRED: 4,
      PRODUCT_BLOCKED: 27,
      INTERNAL_SUBRECIPE: 2,
      OTHER_EXPLICIT_BLOCKER: 14,
    });
    expect(numbersIn('DYNAMIC_MAIN')).toEqual([169, 170, 171]);
    expect(numbersIn('INTERNAL_SUBRECIPE')).toEqual([22, 62]);
    expect(numbersIn('REVIEW_REQUIRED')).toEqual([25, 29, 31, 163]);
    expect(numbersIn('OTHER_EXPLICIT_BLOCKER')).toEqual([
      15, 19, 20, 34, 39, 72, 77, 78, 123, 138, 150, 153, 159, 165,
    ]);
  });

  it('ranks the worst line: a FINAL-blocked PI outranks an internal subrecipe', () => {
    const hokeyPokey = officialRecipeReadiness(byNumber(77));
    expect(hokeyPokey.state).toBe('OTHER_EXPLICIT_BLOCKER');
    expect(hokeyPokey.blockingLines.map((entry) => entry.reason).sort()).toEqual([
      'final_mapper_blocked',
      'internal_subrecipe',
    ]);
    const cajeta = officialRecipeReadiness(byNumber(62));
    expect(cajeta.state).toBe('INTERNAL_SUBRECIPE');
    expect(cajeta.blockingLines.map((entry) => entry.line.label)).toEqual(['Cajeta']);
  });

  it('keeps the Sorbet scaffold Main dynamic — never a missing product', () => {
    for (const number of [169, 170, 171]) {
      const readiness = officialRecipeReadiness(byNumber(number));
      expect(readiness.state).toBe('DYNAMIC_MAIN');
      expect(readiness.blockingLines.every((entry) => entry.reason === 'dynamic_main')).toBe(true);
    }
  });

  it('starts only READY recipes, and runtime unavailability can only make a recipe worse', () => {
    const darkChocolate = byNumber(1);
    const ready = officialRecipeReadiness(darkChocolate);
    expect(ready.state).toBe('READY');
    expect(officialRecipeCanStart(ready)).toBe(true);
    const firstPi = darkChocolate.lines.find((line) => line.identity.kind === 'mapped')!;
    const pi = firstPi.identity.kind === 'mapped' ? firstPi.identity.mapperIngredientId : '';
    const unavailable = officialRecipeReadiness(darkChocolate, { unavailablePis: new Set([pi]) });
    expect(unavailable.state).toBe('OTHER_EXPLICIT_BLOCKER');
    expect(unavailable.blockingLines[0]?.reason).toBe('runtime_unavailable');
    expect(officialRecipeCanStart(unavailable)).toBe(false);
    for (const recipe of OFFICIAL_RECIPES) {
      const state = officialRecipeReadiness(recipe).state;
      expect(officialRecipeCanStart(officialRecipeReadiness(recipe)), recipe.recipeId).toBe(state === 'READY');
    }
  });

  it('never changes a source recipe', () => {
    const before = JSON.stringify(OFFICIAL_RECIPES);
    officialLibraryReadinessCounts(OFFICIAL_RECIPES);
    for (const recipe of OFFICIAL_RECIPES) officialRecipeReadiness(recipe, { unavailablePis: new Set(['PI-ING-000236']) });
    expect(JSON.stringify(OFFICIAL_RECIPES)).toBe(before);
    expect(Object.isFrozen(OFFICIAL_RECIPES[0])).toBe(true);
  });
});
