import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { RecipeItem } from '@/engine';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { SummaryBaseRecipeList } from './SummaryBaseRecipeList';

function itemWithMasses(
  item: RecipeItem,
  plannedGrams: number,
  actualGrams: number | null,
): RecipeItem {
  return { ...item, planned_grams: plannedGrams, actual_grams: actualGrams };
}

describe('completed Summary Base list', () => {
  it('renders frozen actual grams, includes rescue-added lines, and never leaks their plan', () => {
    const [milk, cream] = starterMilkBase().items;
    const html = renderToStaticMarkup(
      <SummaryBaseRecipeList
        completed
        items={[itemWithMasses(milk!, 600, 705), itemWithMasses(cream!, 0, 95)]}
      />,
    );

    expect(html).toContain('705 g');
    expect(html).toContain('95 g');
    expect(html).not.toContain('600 g');
  });

  it('keeps planned grams authoritative before Production completion', () => {
    const [milk] = starterMilkBase().items;
    const html = renderToStaticMarkup(
      <SummaryBaseRecipeList items={[itemWithMasses(milk!, 600, 705)]} completed={false} />,
    );

    expect(html).toContain('600 g');
    expect(html).not.toContain('705 g');
  });
});
