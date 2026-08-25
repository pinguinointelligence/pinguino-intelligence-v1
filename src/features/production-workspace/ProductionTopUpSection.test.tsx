import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ProductionTopUpTask } from './productionSession';
import { ProductionTopUpSection } from './ProductionTopUpSection';

const task: ProductionTopUpTask = {
  taskId: 'top-up:4:cream-line',
  sourceIngredientId: 'PI-ING-CREAM-30',
  sourceRecipeLineId: 'cream-line',
  ingredientName: 'CREAM 30%',
  physicalBaselineG: 98,
  authorizedDeltaG: 0.8,
  draftDeltaG: 0.8,
  cumulativeTargetG: 98.8,
  revisionId: 4,
  sourceActualRevision: 6,
  status: 'pending',
  completedAt: null,
};

describe('Production correction top-up section', () => {
  it('shows grams to add now as the active value and cumulative mass only as secondary information', () => {
    const html = renderToStaticMarkup(
      <ProductionTopUpSection
        tasks={[task]}
        disabled={false}
        onChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(html).toContain('KOREKTA — DODAJ JESZCZE');
    expect(html).toContain('Dodaj teraz');
    expect(html).toContain('value="0.8"');
    expect(html).toContain('W naczyniu: 98 g');
    expect(html).toContain('Po uzupełnieniu: 98.8 g');
    expect(html).not.toContain('value="98.8"');
    expect(html).toContain('data-production-top-up-task="top-up:4:cream-line"');
  });

  it('renders nothing when no pending tasks remain', () => {
    expect(
      renderToStaticMarkup(
        <ProductionTopUpSection
          tasks={[]}
          disabled={false}
          onChange={vi.fn()}
          onConfirm={vi.fn()}
        />,
      ),
    ).toBe('');
  });
});
