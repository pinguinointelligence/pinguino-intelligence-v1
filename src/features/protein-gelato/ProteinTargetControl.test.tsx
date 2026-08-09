import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { findDemoIngredient } from '@/data/demoIngredients';
import { useRecipeStore } from '@/stores/recipeStore';
import { ProteinTargetControl } from './ProteinTargetControl';

beforeEach(() => {
  useRecipeStore.setState({
    category: 'protein_gelato',
    visibleProductType: 'protein',
    target_protein_percent: 20,
    dirty: false,
    draftRevision: 10,
    items: [
      {
        id: 'main-raspberry',
        ingredient: findDemoIngredient('raspberry')!,
        planned_grams: 100,
        actual_grams: null,
        lock_type: 'main',
      },
    ],
  });
});

describe('ProteinTargetControl', () => {
  it('shows one compact target, actual result and explicit ±1 controls', () => {
    const html = renderToStaticMarkup(<ProteinTargetControl actualPercent={18.7} />);
    expect(html).toContain('Cel białka');
    expect(html).toContain('Wynik aktualnej receptury');
    expect(html).toContain('18.7%');
    expect(html).toContain('Zwiększ cel białka o 1 punkt procentowy');
    expect(html).toContain('Zmniejsz cel białka o 1 punkt procentowy');
    expect(html).not.toContain('19,0–21,0');
  });

  it('changes only the target, marks the draft pending and leaves grams untouched', () => {
    const beforeItems = useRecipeStore.getState().items;
    useRecipeStore.getState().setTargetProteinPercent(21);
    expect(useRecipeStore.getState()).toMatchObject({
      target_protein_percent: 21,
      dirty: true,
      draftRevision: 11,
    });
    expect(useRecipeStore.getState().items).toBe(beforeItems);

    useRecipeStore.getState().setTargetProteinPercent(20);
    expect(useRecipeStore.getState().target_protein_percent).toBe(20);
    expect(useRecipeStore.getState().items).toBe(beforeItems);
  });

  it('accepts targets outside the 19–21 owner review window without a fake universal maximum', () => {
    useRecipeStore.getState().setTargetProteinPercent(25);
    expect(useRecipeStore.getState().target_protein_percent).toBe(25);
    useRecipeStore.getState().setTargetProteinPercent(15.4);
    expect(useRecipeStore.getState().target_protein_percent).toBe(15.4);
  });
});
