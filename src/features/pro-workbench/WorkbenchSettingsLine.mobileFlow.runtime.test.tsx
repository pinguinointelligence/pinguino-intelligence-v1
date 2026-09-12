// @vitest-environment jsdom
/**
 * PRO MOBILE UX v2 · B4 / B5 / B8 — the settings line in the guided phone flow.
 *
 * B4 the first settings of a new recipe come as a three-step sequence (the CSS
 *    shows one step at a time below the workbench breakpoint; jsdom applies no
 *    CSS, so the steps are asserted through their data attributes).
 * B5 the target mass reads as a parameter of the whole batch, beside the
 *    recipe's current total, and never disappears from the collapsed row.
 * B8 a saved recipe reopened unchanged is not asked to re-confirm settings it
 *    was saved with.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';
import { useRecipeProfileStore } from './recipeProfileStore';
import { attachRecipeProfileMetadata, profileSnapshotFromState } from './recipeProfilePersistence';
import { WorkbenchSettingsLine } from './WorkbenchSettingsLine';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let host: HTMLDivElement;
let root: Root;

const render = async (currentTotalGrams: number | null = null) => {
  await act(async () =>
    root.render(<WorkbenchSettingsLine compact currentTotalGrams={currentTotalGrams} />),
  );
};
const q = <T extends HTMLElement = HTMLElement>(testId: string) =>
  host.querySelector<T>(`[data-testid="${testId}"]`);
const surface = () => host.querySelector<HTMLElement>('[data-settings-surface]')!;
const click = async (element: HTMLElement | null) => {
  expect(element).not.toBeNull();
  await act(async () => element!.click());
};

/** A saved version exactly as the library hands it back. */
const savedVersionInput = () => {
  const recipe = useRecipeStore.getState();
  const profile = useRecipeProfileStore.getState();
  return attachRecipeProfileMetadata(
    buildRecipeInput(recipe),
    profileSnapshotFromState(recipe, recipe.direction_targets, profile.directionIntents),
  );
};

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

describe('B4 — the first-run settings come as a three-step sequence', () => {
  it('opens a new recipe on step 1 of 3, titled „Jakie lody robisz?", with back and forward', async () => {
    await render();
    expect(surface().getAttribute('data-settings-pager-scope')).toBe('on');
    expect(surface().getAttribute('data-settings-active-step')).toBe('1');
    expect(q('profile-settings-pager')?.textContent).toContain('Krok 1 z 3');
    expect(q('profile-settings-pager-title')?.textContent).toBe('Jakie lody robisz?');
    expect(q<HTMLButtonElement>('profile-settings-pager-back')?.disabled).toBe(true);
    expect(q('profile-settings-pager-next')).not.toBeNull();
  });

  it('gives every setting one step: type → machine and serving → batch, mode and confirmation', async () => {
    await render();
    const step = (selector: string) =>
      host.querySelector(selector)?.getAttribute('data-settings-step');
    expect(step('[data-settings-cell="product-type"]')).toBe('1');
    expect(step('[data-settings-cell="machine"]')).toBe('2');
    expect(step('[data-settings-cell="serving"]')).toBe('2');
    expect(step('[data-settings-cell="batch"]')).toBe('3');
    expect(step('[data-settings-cell="strategy"]')).toBe('3');
    expect(step('[data-settings-cell="actions"]')).toBe('3');
  });

  it('moves forward and back; the last step offers the confirmation instead of „Dalej"', async () => {
    await render();
    await click(q('profile-settings-pager-next'));
    expect(surface().getAttribute('data-settings-active-step')).toBe('2');
    expect(q('profile-settings-pager')?.textContent).toContain('Krok 2 z 3');
    await click(q('profile-settings-pager-next'));
    expect(surface().getAttribute('data-settings-active-step')).toBe('3');
    expect(q('profile-settings-pager-next')).toBeNull();
    expect(q('profile-settings-confirm')).not.toBeNull();
    await click(q('profile-settings-pager-back'));
    expect(surface().getAttribute('data-settings-active-step')).toBe('2');
  });

  it('ends at the confirmation; reopening confirmed settings shows the whole grid, never the sequence', async () => {
    await render();
    await click(q('profile-settings-confirm'));
    expect(q('profile-settings-pager')).toBeNull();
    expect(surface().getAttribute('data-settings-pager-scope')).toBeNull();
    await click(q('settings-grid-status'));
    expect(surface().getAttribute('data-settings-surface')).toBe('expanded');
    expect(q('profile-settings-pager')).toBeNull();
  });
});

describe('B5 — the target mass reads as a parameter of the whole batch', () => {
  it('is „Docelowa masa partii" for the whole recipe, with quiet chips instead of a stepper', async () => {
    await render();
    const card = q('profile-batch-combined')!;
    expect(card.textContent).toContain('Docelowa masa partii');
    expect(q('workbench-batch-scope')?.textContent).toContain('Cała receptura');
    expect(
      card
        .querySelector('[data-settings-control="batch"]')
        ?.getAttribute('data-batch-presentation'),
    ).toBe('whole-batch');
    // OWNER 2026-09-12 — the side segments carry their unit: [ −10 g | value | +10 g ].
    expect(q('workbench-batch-decrement')?.textContent).toBe('−10 g');
    expect(q('workbench-batch-increment')?.textContent).toBe('+10 g');
  });

  it('shows the recipe current total beside the target, and says Przelicz will match them when they differ', async () => {
    const target = useRecipeStore.getState().target_batch_grams;
    await render(target);
    expect(q('workbench-batch-current')?.textContent).toContain(
      `Receptura teraz: ${target.toLocaleString('pl-PL')} g`,
    );
    expect(q('workbench-batch-mismatch')).toBeNull();

    await render(target + 80);
    expect(q('workbench-batch-current')?.textContent).toContain(
      `Receptura teraz: ${(target + 80).toLocaleString('pl-PL')} g`,
    );
    expect(q('workbench-batch-mismatch')?.textContent).toContain(
      'Przelicz dopasuje recepturę do tej masy.',
    );
  });

  it('keeps the target in the collapsed settings row', async () => {
    await render();
    await click(q('profile-settings-confirm'));
    const target = useRecipeStore.getState().target_batch_grams;
    expect(q('settings-grid-status')?.textContent).toContain(`${target.toLocaleString('pl-PL')} g`);
  });
});

describe('B8 — a saved recipe reopened unchanged is not asked to re-confirm', () => {
  const reopenSaved = async () => {
    const input = savedVersionInput();
    // The last confirmation belongs to a DIFFERENT draft — as after a new recipe.
    await click(q('profile-settings-confirm'));
    await act(async () => useRecipeStore.getState().startNewRecipe('gelato'));
    await act(async () => {
      useRecipeStore.getState().loadRecipeInput(input, {
        savedId: 'b8-reopen',
        savedName: 'B8 reopen',
        versionNumber: 3,
        versionId: 'b8-reopen-v3',
      });
    });
  };

  it('confirms the clean working copy of the saved version it was saved with', async () => {
    await render();
    await reopenSaved();
    expect(host.textContent).toContain('Zatwierdzone');
    expect(useRecipeProfileStore.getState().settingsConfirmed).toBe(true);
  });

  it('still asks once a setting of the reopened recipe really changes', async () => {
    await render();
    await reopenSaved();
    await act(async () => useRecipeStore.getState().setFormulationStrategy('eco'));
    expect(host.textContent).toContain('Wymaga potwierdzenia');
    expect(useRecipeProfileStore.getState().settingsConfirmed).toBe(false);
  });
});

describe('B3/B6 — closing the phone settings sheet keeps „settings first"', () => {
  it('clears the published fact only when the LAST Settings copy unmounts', async () => {
    // Below the workbench breakpoint Settings is mounted twice: the CSS-hidden desktop
    // aside (the shared root) and the phone sheet (its own root here).
    await render();
    const sheetHost = document.createElement('div');
    document.body.append(sheetHost);
    const sheetRoot = createRoot(sheetHost);
    await act(async () => sheetRoot.render(<WorkbenchSettingsLine compact />));
    expect(useRecipeProfileStore.getState().settingsConfirmed).toBe(false);

    // The sheet closes; the aside copy stays, so the phone still knows settings wait.
    await act(async () => sheetRoot.unmount());
    sheetHost.remove();
    expect(useRecipeProfileStore.getState().settingsConfirmed).toBe(false);

    // Only when no Settings is left is the fact unknown again.
    await act(async () => root.render(null));
    expect(useRecipeProfileStore.getState().settingsConfirmed).toBeNull();
  });
});
