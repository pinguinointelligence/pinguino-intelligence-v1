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
import { sorbetMultiMainBase } from '@/features/recipe-constraints/__fixtures__/sorbetAuthorityFixture';
import { useRecipeProfileStore } from './recipeProfileStore';
import { WorkbenchIntelligenceHeader } from './WorkbenchIntelligenceHeader';
import { monitorScoreView } from './monitorSummaryView';

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

const render = (product: VisibleProductType, variant?: 'dock') => {
  useRecipeProfileStore.getState().resetForTests();
  useConstraintStudioStore.getState().resetDraftSession();
  useRecipeStore.getState().startNewRecipe(product);
  const input = buildRecipeInput(useRecipeStore.getState());
  act(() => {
    root.render(
      <WorkbenchIntelligenceHeader
        result={calculateRecipe(input)}
        input={input}
        variant={variant}
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

  it('shows „—" instead of a scored value in the panel readout', () => {
    const header = render('sorbet');
    // The score slot reads „— · <action>", never „2 · Wymaga przebudowy".
    expect(header.textContent).toContain('— · Najpierw wybierz składnik: owoc.');
    expect(header.textContent).not.toContain('Wymaga przebudowy');
    // The screen-reader label must not announce a score either.
    expect(header.getAttribute('aria-label')).toContain('Najpierw wybierz składnik: owoc.');
  });

  it('shows a neutral no-data ring instead of a bad score in the dock', () => {
    const header = render('sorbet', 'dock');
    const ring = header.querySelector('[data-testid="workbench-score-ring"]')!;
    // The scaffold is unfinished, not bad: no numeral, no scored arc, no low tone.
    expect(ring.getAttribute('data-score')).toBe('no-data');
    expect(ring.getAttribute('data-score-progress')).toBe('0.00');
    expect(ring.querySelector('[data-testid="workbench-score-ring-arc"]')).toBeNull();
    expect(ring.textContent).toContain('—');
    expect(header.textContent).not.toContain('Wymaga przebudowy');
    // …and the actionable message takes the label slot the score label had.
    expect(header.textContent).toContain('Najpierw wybierz składnik: owoc.');

    // The scoring maths is UNTOUCHED — it still computes a real value for this
    // exact input. The header suppresses its PRESENTATION, nothing more.
    const input = buildRecipeInput(useRecipeStore.getState());
    const computed = monitorScoreView(calculateRecipe(input), input).match;
    expect(computed.score).not.toBeNull();
    expect(computed.label).toBeTruthy();
  });

  it('returns the real score as soon as the fruit Main is present', () => {
    // Same scaffold plus the owner-approved strawberry + lime Multi-Main.
    const input = sorbetMultiMainBase(-13, [2, 1]);
    act(() => {
      root.render(
        <WorkbenchIntelligenceHeader
          result={calculateRecipe(input)}
          input={input}
          onRecalculate={() => {}}
        />,
      );
    });
    const header = host.querySelector('[data-testid="workbench-intelligence-header"]')!;
    expect(header.getAttribute('data-missing-user-supplied-role')).toBeNull();
    expect(header.textContent).not.toContain('Najpierw wybierz składnik');
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
