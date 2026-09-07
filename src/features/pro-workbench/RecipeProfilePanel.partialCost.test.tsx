import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { RecipeResult } from '@/engine';
import { NutritionCostScorePanel } from '@/features/pi-panel/NutritionCostScorePanel';
import { NutritionCostProfileGrid } from './RecipeProfilePanel';
import { missingCostIngredientNames } from './missingCostIngredientNames';

const PARTIAL_RESULT = {
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
    missing_cost_ingredient_ids: ['catalog:lime'],
  },
} as unknown as RecipeResult;

const COMPLETE_RESULT = {
  ...PARTIAL_RESULT,
  costs: {
    known_cost: 3.1,
    total_cost: 3.1,
    cost_per_kg: 3.1,
    cost_per_serving_60g: 0.186,
    cost_per_serving_70g: 0.217,
    cost_per_serving_80g: 0.248,
    complete: true,
    missing_cost_ingredient_ids: [],
  },
} as unknown as RecipeResult;

const LIME = 'LIME · MASTER MARTINI VARIEGATO · AJ01AQ';

const renderGrid = (result: RecipeResult, costMissingNames: readonly string[]) =>
  renderToStaticMarkup(
    <NutritionCostProfileGrid
      result={result}
      nutritionReady
      costReady
      costMissingNames={costMissingNames}
    />,
  );

const missingNamesFromFinalItems = (...names: readonly string[]) =>
  missingCostIngredientNames({
    finalCosts: {
      ...PARTIAL_RESULT.costs,
      missing_cost_ingredient_ids: names.map((_, index) =>
        index === 0 ? 'catalog:lime' : `catalog:missing-${index}`,
      ),
    },
    finalItems: names.map((name, index) => {
      const id = index === 0 ? 'catalog:lime' : `catalog:missing-${index}`;
      return { ingredient: { id, name } };
    }),
  } as Parameters<typeof missingCostIngredientNames>[0]);

describe('Recipe Profile missing-price message', () => {
  it('shows the requested short copy for one dynamically supplied product name', () => {
    const html = renderGrid(PARTIAL_RESULT, missingNamesFromFinalItems(LIME));

    expect(html).toContain(`Wprowadź cenę dla ${LIME}.`);
    expect(html).not.toContain('Koszt częściowy');
    expect(html).not.toContain('Brak ceny:');
    expect(html).not.toContain('Dokładny koszt');
    expect(html).toContain('2.35 €');
    expect(html).toContain('Znany koszt partii');
    expect(html).not.toContain(
      '2.35 €</b><span class="mt-[7px] block text-[13px] leading-4 text-[var(--g-text-muted)]">za kg',
    );
  });

  it('consolidates several missing products into one short plural message', () => {
    const html = renderGrid(PARTIAL_RESULT, missingNamesFromFinalItems(LIME, 'Sos truskawkowy'));

    expect(html).toContain(`Wprowadź ceny dla: ${LIME}, Sos truskawkowy.`);
    expect(html).not.toContain(`Wprowadź cenę dla ${LIME}.`);
  });

  it('removes the missing-price message after every price is complete', () => {
    const html = renderGrid(COMPLETE_RESULT, []);

    expect(html).not.toContain('data-testid="profile-missing-price-message"');
    expect(html).not.toContain('Wprowadź cenę');
    expect(html).not.toContain('Wprowadź ceny');
  });

  it('renders the consolidated missing-price message exactly once on the recipe surface', () => {
    const message = `Wprowadź cenę dla ${LIME}.`;
    const html = renderGrid(PARTIAL_RESULT, [LIME]);

    expect(html.split(message)).toHaveLength(2);
    expect(html.match(/data-testid="profile-missing-price-message"/g)).toHaveLength(1);
  });

  it('does not expose the legacy technical partial-cost status on the older PI surface', () => {
    const html = renderToStaticMarkup(<NutritionCostScorePanel result={PARTIAL_RESULT} />);

    expect(html).not.toContain('Koszt częściowy');
    expect(html).not.toContain('Dokładny koszt');
  });
});
