import { describe, expect, it } from 'vitest';
import { buildLabelPreflight } from './masterLabel';
import { createCompleteLabel } from './masterLabelTestFixture';
import { renderMarketLabelHtml } from './renderers';
import type { MarketProfileCode } from './marketProfiles';

interface GoldenCase {
  id: string;
  market: MarketProfileCode;
  label: ReturnType<typeof createCompleteLabel>;
  markers: string[];
}

const longIngredients = (market: MarketProfileCode) => {
  const base = createCompleteLabel(market);
  return Array.from({ length: 12 }, (_, index) => {
    const ingredient = base.ingredients[index % base.ingredients.length]!;
    return {
      ...ingredient,
      lineId: `${ingredient.lineId}-long-${index}`,
      canonicalIngredientId: `${ingredient.canonicalIngredientId}-LONG-${index}`,
      names: Object.fromEntries(
        base.labelLanguages.map((language) => [
          language,
          `${ingredient.names[language]} preparation ${index} (cocoa butter, natural flavouring, stabiliser blend)`,
        ]),
      ),
    };
  });
};

const cases: GoldenCase[] = [
  {
    id: 'eu-dairy',
    market: 'EU',
    label: createCompleteLabel('EU'),
    markers: ['eu-renderer', 'eu-nutrition'],
  },
  {
    id: 'eu-nut',
    market: 'EU',
    label: createCompleteLabel('EU', {
      allergens: { ...createCompleteLabel('EU').allergens, declared: ['milk', 'tree_nuts'] },
    }),
    markers: ['Allergens:', 'nuts'],
  },
  {
    id: 'eu-multi-allergen',
    market: 'EU',
    label: createCompleteLabel('EU', {
      allergens: {
        ...createCompleteLabel('EU').allergens,
        declared: ['milk', 'eggs', 'soy', 'peanuts', 'sesame'],
      },
    }),
    markers: ['eggs', 'sesame'],
  },
  {
    id: 'eu-long-ingredients',
    market: 'EU',
    label: createCompleteLabel('EU', { ingredients: longIngredients('EU') }),
    markers: ['stabiliser blend'],
  },
  {
    id: 'uk-prepacked',
    market: 'UK',
    label: createCompleteLabel('UK', { packagingContext: 'prepacked' }),
    markers: ['uk-renderer prepacked', 'Great Britain'],
  },
  {
    id: 'uk-ppds',
    market: 'UK',
    label: createCompleteLabel('UK', { packagingContext: 'ppds' }),
    markers: ['PPDS · full ingredients', 'Contains:'],
  },
  {
    id: 'us-dairy',
    market: 'US',
    label: createCompleteLabel('US'),
    markers: ['Nutrition Facts', 'Total Fat'],
  },
  {
    id: 'us-added-sugars',
    market: 'US',
    label: createCompleteLabel('US'),
    markers: ['Added Sugars'],
  },
  {
    id: 'us-sesame',
    market: 'US',
    label: createCompleteLabel('US', {
      allergens: { ...createCompleteLabel('US').allergens, declared: ['milk', 'sesame'] },
    }),
    markers: ['Contains:', 'sesame'],
  },
  {
    id: 'us-long-business',
    market: 'US',
    label: createCompleteLabel('US', {
      operator: {
        ...createCompleteLabel('US').operator,
        operatorName: 'Gellatti Artisan Frozen Dessert Manufacturing and Distribution Company',
        address: '12345 Exceptionally Long Industrial Boulevard, Suite 900, Los Angeles, CA 90001',
      },
    }),
    markers: ['Manufacturing and Distribution'],
  },
  {
    id: 'ca-bilingual',
    market: 'CA',
    label: createCompleteLabel('CA'),
    markers: ['Valeur nutritive', 'Ingrédients'],
  },
  {
    id: 'ca-fop-triggering',
    market: 'CA',
    label: createCompleteLabel('CA'),
    markers: ['canada-renderer'],
  },
  {
    id: 'ca-non-fop',
    market: 'CA',
    label: createCompleteLabel('CA', {
      nutritionSource: {
        ...createCompleteLabel('CA').nutritionSource!,
        saturated_fat_g: 0,
        sugars_g: 0,
      },
      regulatoryNutrition: { ...createCompleteLabel('CA').regulatoryNutrition, sodiumMgPer100g: 0 },
    }),
    markers: ['Nutrition Facts', 'Valeur nutritive'],
  },
  {
    id: 'ca-long-bilingual',
    market: 'CA',
    label: createCompleteLabel('CA', { ingredients: longIngredients('CA') }),
    markers: ['stabiliser blend'],
  },
  {
    id: 'au-nz-standard',
    market: 'AU_NZ',
    label: createCompleteLabel('AU_NZ'),
    markers: ['NUTRITION INFORMATION'],
  },
  {
    id: 'au-nz-peal',
    market: 'AU_NZ',
    label: createCompleteLabel('AU_NZ', {
      allergens: { ...createCompleteLabel('AU_NZ').allergens, declared: ['milk', 'sesame'] },
    }),
    markers: ['contains peal', 'Contains: milk, sesame'],
  },
  {
    id: 'au-nz-long-nip',
    market: 'AU_NZ',
    label: createCompleteLabel('AU_NZ', { ingredients: longIngredients('AU_NZ') }),
    markers: ['Average quantity', 'per 100 g'],
  },
  {
    id: 'world-thermal-minimal',
    market: 'WORLD',
    label: createCompleteLabel('WORLD'),
    markers: ['world-neutral-v1'],
  },
  {
    id: 'world-long-content',
    market: 'WORLD',
    label: createCompleteLabel('WORLD', { ingredients: longIngredients('WORLD') }),
    markers: ['stabiliser blend'],
  },
  {
    id: 'world-qr-barcode',
    market: 'WORLD',
    label: createCompleteLabel('WORLD', {
      enabledOptionalFields: ['qr_code', 'lot_barcode'],
      qrCodeValue: 'https://gellatti.example/lot/001',
    }),
    markers: ['data-code-kind="qr"', 'data-code-kind="lot"'],
  },
  {
    id: 'world-actual-production-deviation',
    market: 'WORLD',
    label: createCompleteLabel('WORLD', { actualBatchQuantityG: 1128.5 }),
    markers: ['LOT-20260825-001'],
  },
];

describe('required market golden-output cases', () => {
  it.each(cases)('$id renders through the independent $market renderer', ({ label, markers }) => {
    const html = renderMarketLabelHtml(label);
    for (const marker of markers) expect(html).toContain(marker);
    expect(html).not.toContain('market-specific data required');
  });

  it('keeps every Canada golden externally blocked until the official package is installed', () => {
    for (const testCase of cases.filter((candidate) => candidate.market === 'CA')) {
      expect(buildLabelPreflight(testCase.label).printReadiness, testCase.id).toBe('NOT_READY');
      expect(renderMarketLabelHtml(testCase.label)).not.toContain('official-authority-asset');
    }
  });
});
