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

/* Unresolved flavor lines never carry grams — even for a grams-visible persona. */
describe('unresolved lines are honest requirements, never a fabricated gram', () => {
  const MIXED: CustomerRecipeInput = {
    recipeId: 'r-2',
    title: 'Chocolate + whisky',
    productType: 'gelato',
    lines: [
      { ingredientId: 'milk', ingredientName: 'Milk', grams: 620, resolution: 'resolved' },
      { ingredientId: 'flavor:chocolate', ingredientName: 'Chocolate', grams: null, resolution: 'needs_dose' },
      { ingredientId: 'flavor:whisky', ingredientName: 'Whisky', grams: null, resolution: 'needs_ingredient' },
    ],
  };

  it('Pro sees grams on the resolved base line only, never on the unresolved flavors', () => {
    const view = buildCustomerRecipeView(MIXED, gramVisibilityForPersona('pro'));
    expect(view.lines[0]!.grams).toBe(620);
    expect('grams' in view.lines[1]!).toBe(false);
    expect('grams' in view.lines[2]!).toBe(false);
  });

  it('reports the recipe as not fully resolved and counts the open requirements', () => {
    const view = buildCustomerRecipeView(MIXED, gramVisibilityForPersona('pro'));
    expect(view.fullyResolved).toBe(false);
    expect(view.unresolvedCount).toBe(2);
    // Every output line carries an explicit resolution status.
    expect(view.lines.map((l) => l.resolution)).toEqual(['resolved', 'needs_dose', 'needs_ingredient']);
  });

  it('Demo still carries no grams anywhere', () => {
    const view = buildCustomerRecipeView(MIXED, gramVisibilityForPersona('demo'));
    for (const line of view.lines) expect('grams' in line).toBe(false);
  });
});
