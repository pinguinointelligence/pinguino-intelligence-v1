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
  it('reuses the normal weighing hierarchy without exposing technical rescue details', () => {
    const html = renderToStaticMarkup(
      <ProductionTopUpSection
        tasks={[task]}
        disabled={false}
        onChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(html).toContain('Dodaj jeszcze');
    expect(html).toMatch(/Do dodania:[\s\S]*?>0\.8 g<\/strong>/);
    expect(html).toContain('value="0.8"');
    expect(html).toContain('data-production-active="true"');
    expect(html).toContain('production-line-active');
    expect(html).toContain('data-production-control-state="top-up"');
    expect(html).toContain('aria-label="CREAM 30% — potwierdź dolewkę"');
    expect(html).not.toContain('Osobne zadania wykonawcze');
    expect(html).not.toContain('W naczyniu:');
    expect(html).not.toContain('Po uzupełnieniu:');
    expect(html).not.toContain('Dodaj teraz +0.8 g');
    expect(html).not.toContain('value="98.8"');
    expect(html).toContain('data-production-top-up-task="top-up:4:cream-line"');
  });

  it('marks only the next pending top-up as the current weighing action', () => {
    const secondTask: ProductionTopUpTask = {
      ...task,
      taskId: 'top-up:4:milk-line',
      sourceIngredientId: 'PI-ING-MILK-35',
      sourceRecipeLineId: 'milk-line',
      ingredientName: 'MILK 3.5%',
    };
    const html = renderToStaticMarkup(
      <ProductionTopUpSection
        tasks={[task, secondTask]}
        disabled={false}
        onChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(html.match(/data-production-active="true"/g)).toHaveLength(1);
    expect(html.match(/production-line-active/g)).toHaveLength(1);
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
