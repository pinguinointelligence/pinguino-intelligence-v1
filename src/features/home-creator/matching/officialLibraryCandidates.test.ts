/**
 * §32 official side. These assert against the REAL Gellatti Recipe Library, because the point
 * of several of them is the honest state of that library.
 */
import { describe, expect, it } from 'vitest';
import { OFFICIAL_RECIPES } from '@/data/recipes/official/officialRecipeLibrary';
import { officialRecipeReadiness } from '@/data/recipes/official/officialRecipeReadiness';
import { matchRecipes, type RequestedIngredient } from '../homeRecipeMatching';
import {
  officialCandidates,
  officialRecipeIngredients,
  officialRecipeToCandidate,
} from './officialLibraryCandidates';

const want = (productId: string): RequestedIngredient => ({
  productId,
  statedRole: null,
  displayName: productId,
});

// Real ids from the library: cocoa, milk and the FINAL-blocked branded vanilla paste.
const COCOA = 'PI-ING-001579';
const MILK = 'PI-ING-000236';
const VANILLE_LEAGEL_PASTE = 'PI-ING-001705';

describe('the Gellatti library is offered to every customer — READY recipes only', () => {
  const offered = new Set(officialCandidates().map((candidate) => candidate.id));

  it('offers real candidates without any admin gate', () => {
    expect(offered.size).toBeGreaterThan(50);
  });

  it('never offers a recipe that is not READY', () => {
    for (const recipe of OFFICIAL_RECIPES) {
      if (officialRecipeReadiness(recipe).state !== 'READY') {
        expect(offered.has(recipe.recipeId), recipe.recipeId).toBe(false);
      }
    }
  });

  it('offers no Technical Base and no Heritage record without a stated profile', () => {
    for (const recipe of OFFICIAL_RECIPES) {
      if (
        recipe.productType === 'Technical Base' ||
        recipe.productType === 'Heritage Gelato / Sorbet'
      ) {
        expect(officialRecipeToCandidate(recipe), recipe.recipeId).toBeNull();
      }
    }
  });

  it('never offers the FINAL-blocked vanilla paste', () => {
    for (const candidate of officialCandidates()) {
      expect(candidate.ingredients.some((i) => i.productId === VANILLE_LEAGEL_PASTE)).toBe(false);
    }
  });
});

describe('recipes map to candidates by CANONICAL identity, not by name', () => {
  it('carries only Mapper identities, each identity once', () => {
    for (const recipe of OFFICIAL_RECIPES) {
      const ids = officialRecipeIngredients(recipe).map((ingredient) => ingredient.productId);
      expect(ids.every((id) => id.startsWith('PI-ING-'))).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('carries the profile, the owner image and Gellatti attribution', () => {
    const sorbet = officialCandidates().find((candidate) => candidate.profile === 'sorbet');
    expect(sorbet).toBeDefined();
    expect(sorbet!.source).toBe('official');
    expect(sorbet!.imageUrl).toMatch(/^\/recipes\/official\/GEL-\d{3}-480\.webp$/);
    expect(sorbet!.originalCreatorName).toBeNull();
  });
});

describe('§32 strict matching against the real library', () => {
  const candidates = officialCandidates();

  it('finds the cocoa recipes for a cocoa request', () => {
    const matches = matchRecipes(candidates, { requested: [want(COCOA)], profile: null });
    expect(matches.length).toBeGreaterThan(0);
    for (const match of matches) {
      expect(match.candidate.ingredients.some((i) => i.productId === COCOA)).toBe(true);
    }
  });

  it('rejects a recipe missing one requested identity', () => {
    const matches = matchRecipes(candidates, {
      requested: [want(COCOA), want('PI-ING-000000')],
      profile: null,
    });
    expect(matches).toEqual([]);
  });

  it('§40 — a profile filter keeps a Sorbet request to Sorbets', () => {
    const matches = matchRecipes(candidates, { requested: [want(MILK)], profile: 'sorbet' });
    for (const match of matches) expect(match.candidate.profile).toBe('sorbet');
  });
});

describe('WRONG COMMERCIAL FORM — the flavour word must not be enough', () => {
  it('matches a recipe through its own identity and never through a different one', () => {
    const candidates = officialCandidates();
    const own = candidates[0]!.ingredients[0]!.productId;
    expect(
      matchRecipes(candidates, { requested: [want(own)], profile: null }).length,
    ).toBeGreaterThan(0);
    expect(matchRecipes(candidates, { requested: [want('PI-ING-999999')], profile: null })).toEqual(
      [],
    );
  });

  it('contains no brand-name special-casing', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync('src/features/home-creator/matching/officialLibraryCandidates.ts', 'utf8'),
    );
    const codeOnly = source
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'))
      .join('\n');
    for (const brand of ['Leagel', 'Backaldrin', 'Ravifruit', 'Master Martini', 'PreGel']) {
      expect(codeOnly).not.toContain(brand);
    }
  });
});
