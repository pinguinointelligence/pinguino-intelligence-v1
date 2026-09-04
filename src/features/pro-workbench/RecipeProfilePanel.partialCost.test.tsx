import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { RecipeResult } from '@/engine';
import { NutritionCostProfileGrid } from './RecipeProfilePanel';

const RESULT = {
  nutrition_per_100g: {
    kcal: 120,
    fat_g: 4,
    saturated_fat_g: 2,
    carbohydrate_g: 20,
    sugars_g: 15,
    protein_g: 3,
    salt_g: 0.1,
    fiber_g: 1,
    alcohol_g: 0,
  },
  costs: {
    known_cost: 2.35,
    total_cost: null,
    cost_per_kg: null,
    cost_per_serving_60g: null,
    cost_per_serving_70g: null,
    cost_per_serving_80g: null,
    complete: false,
    missing_cost_ingredient_ids: ['catalog:sauce'],
  },
} as unknown as RecipeResult;

describe('Recipe Profile partial costing', () => {
  it('shows the known batch subtotal and exact missing ingredient without calling it a per-kg cost', () => {
    const html = renderToStaticMarkup(
      <NutritionCostProfileGrid
        result={RESULT}
        nutritionReady
        costReady
        costMissingNames={['Sos truskawkowy']}
      />,
    );

    expect(html).toContain('2.35 €');
    expect(html).toContain('Znany koszt partii');
    expect(html).toContain('Brak ceny: Sos truskawkowy');
    expect(html).toContain('Dokładny koszt za kg pozostaje niedostępny');
    expect(html).not.toContain(
      '2.35 €</b><span class="mt-[7px] block text-[13px] leading-4 text-[var(--g-text-muted)]">za kg',
    );
  });
});
