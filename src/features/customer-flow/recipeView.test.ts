import { describe, expect, it } from 'vitest';
import {
  buildCustomerRecipeView,
  gramVisibilityForPersona,
  type CustomerRecipeInput,
} from './recipeView';

const RECIPE: CustomerRecipeInput = {
  recipeId: 'r-1',
  title: 'Vanilla',
  productType: 'gelato',
  servingProfile: 'display-minus-11',
  lines: [
    { ingredientId: 'milk', ingredientName: 'Milk', grams: 670 },
    { ingredientId: 'sucrose', ingredientName: 'Sucrose', grams: 130 },
  ],
};

/* Acceptance test (8) */
describe('(8) Demo persona → exact grams are absent from the returned DATA', () => {
  const view = buildCustomerRecipeView(RECIPE, gramVisibilityForPersona('demo'));

  it('reports grams as not visible', () => {
    expect(view.gramsVisible).toBe(false);
  });

  it('omits the grams property entirely from every line (redacted at source)', () => {
    for (const line of view.lines) {
      expect('grams' in line).toBe(false);
      expect(line.grams).toBeUndefined();
    }
    // The number never entered the payload — a serialized view carries no grams.
    expect(JSON.stringify(view)).not.toContain('670');
    expect(JSON.stringify(view)).not.toContain('130');
  });
});

/* Acceptance test (9) */
describe('(9) Home/Pro → exact grams present via the capability (never a raw isPro flag)', () => {
  it('Home persona sees exact grams', () => {
    const view = buildCustomerRecipeView(RECIPE, gramVisibilityForPersona('home'));
    expect(view.gramsVisible).toBe(true);
    expect(view.lines[0]!.grams).toBe(670);
    expect(view.lines[1]!.grams).toBe(130);
  });

  it('Pro persona sees exact grams', () => {
    const view = buildCustomerRecipeView(RECIPE, gramVisibilityForPersona('pro'));
    expect(view.gramsVisible).toBe(true);
    expect(view.lines.map((l) => l.grams)).toEqual([670, 130]);
  });

  it('is driven by the capability object, not a persona/isPro boolean', () => {
    const view = buildCustomerRecipeView(RECIPE, { canViewExactGrams: true });
    expect(view.lines[0]!.grams).toBe(670);
    const redacted = buildCustomerRecipeView(RECIPE, { canViewExactGrams: false });
    expect('grams' in redacted.lines[0]!).toBe(false);
  });
});
