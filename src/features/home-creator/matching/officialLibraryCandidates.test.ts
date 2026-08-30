/**
 * §32 official side. These assert against the REAL `EXECUTABLE_RECIPE_TEMPLATES`,
 * because the point of several of them is the honest state of that library.
 */
import { describe, expect, it } from 'vitest';
import { EXECUTABLE_RECIPE_TEMPLATES } from '@/data/recipes/executableRecipeLibrary';
import { matchRecipes, type RequestedIngredient } from '../homeRecipeMatching';
import {
  isOfferableTemplate,
  officialCandidatesFor,
  templateIngredients,
  templateToCandidate,
} from './officialLibraryCandidates';

const want = (productId: string): RequestedIngredient => ({
  productId,
  statedRole: null,
  displayName: productId,
});

// Real ids from the library: cocoa and the BRANDED vanilla paste.
const COCOA = 'PI-ING-001579';
const VANILLE_LEAGEL_PASTE = 'PI-ING-001705';
const MILK = 'PI-ING-000236';

describe('the official library is admin-gated — a customer is offered nothing', () => {
  it('offers nothing without owner-review access', () => {
    expect(officialCandidatesFor(false)).toEqual([]);
  });

  it('offers real candidates WITH owner-review access', () => {
    expect(officialCandidatesFor(true).length).toBeGreaterThan(0);
  });

  it('never offers a template that cannot be produced', () => {
    const blocked = EXECUTABLE_RECIPE_TEMPLATES.filter((t) => !isOfferableTemplate(t));
    expect(blocked.length).toBeGreaterThan(0); // Śmietankowe is BLOCKED_EXACT_PRODUCT_DATA
    const offeredIds = officialCandidatesFor(true).map((c) => c.id);
    for (const template of blocked) expect(offeredIds).not.toContain(template.id);
  });
});

describe('templates map to candidates by CANONICAL identity, not by name', () => {
  it('carries only lines with a resolved Mapper identity', () => {
    for (const template of EXECUTABLE_RECIPE_TEMPLATES) {
      const ingredients = templateIngredients(template);
      expect(ingredients.every((i) => i.productId.startsWith('PI-ING-'))).toBe(true);
    }
  });

  it('maps a post-process line to the topping role (§33)', () => {
    const withTopping = EXECUTABLE_RECIPE_TEMPLATES.find((t) =>
      t.toppings.some((line) => line.mapperIngredientId !== null),
    );
    if (withTopping) {
      expect(templateIngredients(withTopping).some((i) => i.role === 'topping')).toBe(true);
    }
  });

  it('maps milk_gelato onto the customer-visible gelato profile', () => {
    const candidate = templateToCandidate(EXECUTABLE_RECIPE_TEMPLATES[1]!);
    expect(candidate?.profile).toBe('gelato');
    expect(candidate?.source).toBe('official');
  });
});

describe('§32 strict matching against the real library', () => {
  const candidates = officialCandidatesFor(true);

  it('finds the cocoa templates for a cocoa request', () => {
    const matches = matchRecipes(candidates, { requested: [want(COCOA)], profile: null });
    expect(matches.length).toBeGreaterThan(0);
    for (const match of matches) {
      expect(match.candidate.ingredients.some((i) => i.productId === COCOA)).toBe(true);
    }
  });

  it('rejects a recipe missing one requested identity', () => {
    // Cocoa AND an identity no template carries.
    const matches = matchRecipes(candidates, {
      requested: [want(COCOA), want('PI-ING-000000')],
      profile: null,
    });
    expect(matches).toEqual([]);
  });

  it('§40 — a Sorbet request matches nothing, because the library is gelato-only', () => {
    const matches = matchRecipes(candidates, { requested: [want(MILK)], profile: 'sorbet' });
    expect(matches).toEqual([]);
  });
});

describe('WRONG COMMERCIAL FORM — the flavour word must not be enough', () => {
  it('does not match a branded vanilla paste for a different vanilla identity', () => {
    const candidates = officialCandidatesFor(true);
    // The library's vanilla is `VANILLE · Leagel Paste` (PI-ING-001705). A user whose
    // §23 choice resolved to ANY other vanilla identity must not match it — and this
    // falls out of canonical ids alone, with no brand list anywhere in the code.
    const someOtherVanilla = 'PI-ING-000999';
    expect(
      matchRecipes(candidates, { requested: [want(someOtherVanilla)], profile: null }),
    ).toEqual([]);
    // …while the paste's OWN identity does match, proving the rejection was about
    // identity and not about the word "vanilla".
    expect(
      matchRecipes(candidates, { requested: [want(VANILLE_LEAGEL_PASTE)], profile: null }).length,
    ).toBeGreaterThan(0);
  });

  it('contains no brand-name special-casing', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync('src/features/home-creator/matching/officialLibraryCandidates.ts', 'utf8'),
    );
    for (const brand of ['Leagel', 'Backaldrin', 'Ravifruit', 'Master Martini', 'PreGel']) {
      // Brands may be named in the explanatory comment, but never in a code branch.
      const codeOnly = source
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'))
        .join('\n');
      expect(codeOnly).not.toContain(brand);
    }
  });
});
