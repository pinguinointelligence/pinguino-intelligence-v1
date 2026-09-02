import { describe, expect, it } from 'vitest';
import { createCompleteLabel } from './masterLabelTestFixture';
import { renderMarketLabelHtml } from './renderers';
import {
  marketAllergenDeclarationIssues,
  marketAllergenDisplay,
  unresolvedMarketAllergens,
} from './allergenTaxonomy';

describe('market-specific allergen authority', () => {
  it('does not assume the EU list equals the US, Canada or AU/NZ list', () => {
    expect(unresolvedMarketAllergens('EU', ['mustard'])).toEqual([]);
    expect(unresolvedMarketAllergens('US', ['mustard'])).toEqual(['mustard']);
    expect(unresolvedMarketAllergens('CA', ['mustard'])).toEqual([]);
    expect(unresolvedMarketAllergens('US', ['sesame'])).toEqual([]);
    expect(unresolvedMarketAllergens('AU_NZ', ['gluten_wheat'])).toEqual([]);
  });

  it('fails unknown authority closed instead of inferring an allergen', () => {
    expect(unresolvedMarketAllergens('WORLD', ['possible dairy-like substance'])).toEqual([
      'possible dairy-like substance',
    ]);
  });

  it('requires and renders the specific FDA source for fish, crustaceans and tree nuts', () => {
    expect(marketAllergenDeclarationIssues('US', ['tree_nuts'])).toHaveLength(1);
    expect(marketAllergenDeclarationIssues('US', ['tree_nuts: almond'])).toEqual([]);
    expect(unresolvedMarketAllergens('US', ['tree_nuts: almond'])).toEqual([]);
    expect(marketAllergenDisplay('US', 'tree_nuts: almond')).toBe('almond');
    const html = renderMarketLabelHtml(
      createCompleteLabel('US', {
        allergens: {
          ...createCompleteLabel('US').allergens,
          declared: ['milk', 'tree_nuts: almond'],
        },
      }),
    );
    expect(html).toContain('Contains:</strong> milk, almond');
  });

  it('emphasises only confirmed allergen terms and prints QUID only when triggered', () => {
    const label = createCompleteLabel('EU', {
      ingredients: [
        {
          ...createCompleteLabel('EU').ingredients[0]!,
          names: { en: 'Cream (milk), cocoa' },
          quid: {
            required: true,
            percentage: 60,
            reason: 'characterising ingredient',
            reviewedByUser: true,
          },
        },
        createCompleteLabel('EU').ingredients[1]!,
      ],
    });
    const html = renderMarketLabelHtml(label);
    expect(html).toContain('Cream (<strong class="allergen-term">milk</strong>), cocoa (60%)');
    expect(html).not.toContain('<strong class="allergen-term">Cream');
    expect(html).not.toContain('Sugar (40%)');
  });

  it('keeps FSANZ PEAL Contains bold and adjacent to the ingredient declaration', () => {
    const html = renderMarketLabelHtml(createCompleteLabel('AU_NZ'));
    expect(html).toContain('class="contains peal"');
    expect(html.indexOf('class="contains peal"')).toBeGreaterThan(html.indexOf('Ingredients:'));
    expect(html).toContain('<strong>Contains: milk</strong>');
  });
});
