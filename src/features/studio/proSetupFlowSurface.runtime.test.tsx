// @vitest-environment jsdom
/**
 * DESIGN V3.0 §3 — on a phone / iPad portrait, NOTHING later in the flow is
 * reachable before the new-recipe setup is done.
 *
 * This renders the real `StudioEngineSurface` (the one PRO workbench) with a
 * phone viewport. Its heavy children are replaced by stand-ins that keep the
 * one thing this test is about: WHERE the later actions live. The dock's
 * „Przelicz" stand-in sits exactly where the real dock does (in the editor and
 * in the phone's bottom stack, next to the module tabs), so the assertions read
 * the surface's own wiring: the setup is a modal dialog, the workbench under it
 * is inert, and it comes back only when „Receptura" confirms the settings.
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { useRecipeProfileStore } from '@/features/pro-workbench/recipeProfileStore';
import { useProSetupFlowStore } from '@/features/pro-workbench/proSetupFlowGate';
import { useRecipeStore } from '@/stores/recipeStore';

vi.mock('@/access/useAccess', () => ({
  useAccess: () => ({ fullFormula: true, technicalView: false, exactCorrectionGrams: false }),
}));
vi.mock('@/features/production-workspace/useProductionWorkspace', () => ({
  useProductionWorkspace: () => ({
    session: null,
    practicalReady: false,
    deviationDecisionUnresolved: false,
    forecastResult: null,
    corrections: null,
    forecastInput: null,
  }),
}));
vi.mock('@/features/studio/useStudioResult', () => ({
  useStudioResult: () => ({ result: { items: [], total_batch_g: 0 }, corrections: {}, input: {} }),
}));
vi.mock('@/features/ingredient-builder/IngredientBuilder', () => ({
  IngredientBuilder: ({ recipeActionDock }: { recipeActionDock?: ReactNode }) => (
    <div data-testid="stand-in-ingredients">{recipeActionDock}</div>
  ),
}));
vi.mock('@/features/pro-core/HistoricalVersionNotice', () => ({
  HistoricalVersionNotice: () => null,
}));
vi.mock('@/features/pro-workbench/WorkbenchRecipeActionDock', () => ({
  WorkbenchRecipeActionDock: () => (
    <button type="button" data-testid="stand-in-recalc">
      Przelicz
    </button>
  ),
}));
/* The panel's real settings line stays: it owns the draft lifecycle and
   publishes the confirmation fact the surface reads. */
vi.mock('@/features/pro-workbench/RecipeProfilePanel', async () => {
  const { WorkbenchSettingsLine } = await import('@/features/pro-workbench/WorkbenchSettingsLine');
  return { RecipeProfilePanel: () => <WorkbenchSettingsLine compact /> };
});

const { StudioEngineSurface } = await import('./StudioEngineSurface');

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let host: HTMLDivElement;
let root: Root;
let phone = true;

const q = <T extends HTMLElement = HTMLElement>(testId: string) =>
  document.body.querySelector<T>(`[data-testid="${testId}"]`);
const click = async (element: HTMLElement | null) => {
  expect(element).not.toBeNull();
  await act(async () => element!.click());
};
const render = async () => {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <StudioEngineSurface onTabChange={() => undefined} onRecalculate={() => undefined} />
      </MemoryRouter>,
    ),
  );
};

beforeEach(() => {
  phone = true;
  window.matchMedia = ((query: string) => ({
    matches: phone,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  localStorage.clear();
  useConstraintStudioStore.getState().resetForTests();
  useRecipeProfileStore.getState().resetForTests();
  useProSetupFlowStore.getState().resetForTests();
  useRecipeStore.getState().startNewRecipe('gelato');
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('§3 — the setup comes before everything else of a new recipe', () => {
  it('shows the setup as a modal dialog and keeps Przelicz, the tabs and the sheet out of reach', async () => {
    await render();
    const setup = q('pro-setup-flow');
    expect(setup?.getAttribute('role')).toBe('dialog');
    expect(setup?.getAttribute('aria-modal')).toBe('true');
    const workbench = q('pro-workbench')!;
    expect(workbench.hasAttribute('inert')).toBe(true);
    // Every later action is INSIDE the inert workbench, never beside it.
    for (const recalc of document.body.querySelectorAll('[data-testid="stand-in-recalc"]')) {
      expect(workbench.contains(recalc)).toBe(true);
    }
    expect(workbench.contains(q('mobile-cockpit-trigger'))).toBe(true);
    expect(setup!.contains(q('stand-in-recalc'))).toBe(false);
    expect(q('mobile-cockpit-sheet')).toBeNull();
  });

  it('keeps the workbench inert through every step and releases it on „Receptura"', async () => {
    await render();
    await click(q('pro-setup-next'));
    expect(q('pro-setup-flow')?.getAttribute('data-setup-step')).toBe('2');
    expect(q('pro-workbench')?.hasAttribute('inert')).toBe(true);
    await click(q('pro-setup-next'));
    expect(q('pro-setup-flow')?.getAttribute('data-setup-step')).toBe('3');
    expect(q('pro-workbench')?.hasAttribute('inert')).toBe(true);
    expect(useRecipeProfileStore.getState().settingsConfirmed).toBe(false);

    await click(q('pro-setup-finish'));
    expect(q('pro-setup-flow')).toBeNull();
    expect(q('pro-workbench')?.hasAttribute('inert')).toBe(false);
    expect(useRecipeProfileStore.getState().settingsConfirmed).toBe(true);
  });

  it('leaves the desktop composition to its permanent settings column', async () => {
    phone = false;
    await render();
    expect(q('pro-setup-flow')).toBeNull();
    expect(q('pro-workbench')?.hasAttribute('inert')).toBe(false);
  });
});
