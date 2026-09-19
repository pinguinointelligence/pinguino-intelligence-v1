// @vitest-environment jsdom
/**
 * PRO MOBILE UX v2 · B6 — the phone strip offers ONE next step.
 *
 * Only the phone dock receives `mobileFlow`; the desktop dock stays exactly as
 * it was. Unconfirmed settings come first (Przelicz would refuse until they are
 * confirmed), and the strip's own recalculation authority keeps „Przelicz"
 * ahead of saving — PRO stays manual.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateRecipe } from '@/engine';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';
import type { MobileNextStep } from './mobileNextStep';
import { useRecipeProfileStore } from './recipeProfileStore';
import { WorkbenchIntelligenceHeader } from './WorkbenchIntelligenceHeader';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let host: HTMLDivElement;
let root: Root;

const renderDock = async (mobileFlow?: {
  next: MobileNextStep | null;
  onNext: (step: MobileNextStep) => void;
}) => {
  const input = buildRecipeInput(useRecipeStore.getState());
  const result = calculateRecipe(input);
  await act(async () =>
    root.render(
      <WorkbenchIntelligenceHeader
        result={result}
        input={input}
        variant="dock"
        onRecalculate={() => undefined}
        mobileFlow={mobileFlow}
      />,
    ),
  );
};
const recalc = () => host.querySelector('[data-testid="pro-workbar-recalc"]');
const nextStep = () =>
  host.querySelector<HTMLButtonElement>('[data-testid="pro-mobile-next-step"]');

beforeEach(() => {
  localStorage.clear();
  useConstraintStudioStore.getState().resetForTests();
  useRecipeProfileStore.getState().resetForTests();
  useRecipeStore.getState().startNewRecipe('gelato');
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('B6 — one state-driven next step on the phone strip', () => {
  it('leaves the desktop dock untouched: a fresh recipe offers „Przelicz" and nothing else', async () => {
    await renderDock();
    expect(recalc()).not.toBeNull();
    expect(nextStep()).toBeNull();
  });

  it('asks for the settings first — one action, never „Przelicz" beside it', async () => {
    const onNext = vi.fn();
    await renderDock({ next: 'settings', onNext });
    expect(nextStep()?.textContent).toBe('Potwierdź ustawienia');
    expect(nextStep()?.dataset.nextStep).toBe('settings');
    expect(host.querySelector('[data-testid="pro-mobile-next-step-cue"]')?.textContent).toContain(
      'Najpierw ustawienia receptury',
    );
    expect(recalc()).toBeNull();
    await act(async () => nextStep()!.click());
    expect(onNext).toHaveBeenCalledWith('settings');
  });

  it('keeps „Przelicz" ahead of saving while the recipe needs recalculating', async () => {
    await renderDock({ next: 'save', onNext: vi.fn() });
    expect(recalc()).not.toBeNull();
    expect(nextStep()).toBeNull();
  });
});
