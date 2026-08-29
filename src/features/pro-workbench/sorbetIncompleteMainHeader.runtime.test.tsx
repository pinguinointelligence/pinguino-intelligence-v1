// @vitest-environment jsdom
/**
 * RESTORATION #2B — the missing-Main state must be visible BEFORE the customer
 * clicks Przelicz. A fresh Sorbet used to render as an ordinary recipe that
 * merely happened to be 600 g short of its target.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { calculateRecipe } from '@/engine';
import { useRecipeStore } from '@/stores/recipeStore';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import type { VisibleProductType } from '@/features/studio/productType';
import { useRecipeProfileStore } from './recipeProfileStore';
import { WorkbenchIntelligenceHeader } from './WorkbenchIntelligenceHeader';

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

const render = (product: VisibleProductType) => {
  useRecipeProfileStore.getState().resetForTests();
  useConstraintStudioStore.getState().resetDraftSession();
  useRecipeStore.getState().startNewRecipe(product);
  const input = buildRecipeInput(useRecipeStore.getState());
  act(() => {
    root.render(
      <WorkbenchIntelligenceHeader
        result={calculateRecipe(input)}
        input={input}
        onRecalculate={() => {}}
      />,
    );
  });
  return host.querySelector('[data-testid="workbench-intelligence-header"]')!;
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('fresh Sorbet is presented as incomplete, not as a short recipe', () => {
  it('marks the missing user-supplied role and names it in Polish', () => {
    const header = render('sorbet');
    expect(header.getAttribute('data-missing-user-supplied-role')).toBe('fruit');
    expect(header.textContent).toContain('Receptura niekompletna');
    expect(header.textContent).toContain('Najpierw wybierz składnik: owoc.');
    // It must NOT read as an ordinary draft merely awaiting a recalculation.
    expect(header.textContent).not.toContain('Oczekuje na przeliczenie');
  });

  it('leaves Gelato, Vegan and Protein headers untouched', () => {
    for (const product of ['gelato', 'vegan', 'protein'] as const) {
      const header = render(product);
      expect(header.getAttribute('data-missing-user-supplied-role'), product).toBeNull();
      expect(header.textContent, product).not.toContain('Receptura niekompletna');
      expect(header.textContent, product).not.toContain('Najpierw wybierz składnik');
    }
  });
});
