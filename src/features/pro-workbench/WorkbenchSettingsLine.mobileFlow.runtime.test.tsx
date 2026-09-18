// @vitest-environment jsdom
/**
 * PRO MOBILE UX v2 · B5 / B8 and DESIGN V3.0 correction I — the settings line.
 *
 * I  the panel's Ustawienia box: summary on two lines with the status under it
 *    on a phone, the fields in the design's order, the serving segments, the
 *    OPTIMAL / ECO tiles and „[ ] Ustaw jako domyślne" — every one wired through
 *    the panel's existing handlers. (It supersedes B4's three-step pager, which
 *    is now the full-screen setup — see ProSetupFlow.runtime.test.tsx.)
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

describe('DESIGN V3.0 correction I — the Ustawienia box of the one settings panel', () => {
  const OWNER_KEY = 'local-device:gelato';
  const cellOrder = (cell: string) => {
    const element = host.querySelector(`[data-settings-cell="${cell}"]`);
    // jsdom applies no CSS: the design's phone order is carried by `order-N`
    // (unprefixed), the frozen desktop grid by `min-[68.5rem]:order-N`.
    const phone = element?.className.match(/(?:^|\s)order-(\d)/);
    return phone ? Number(phone[1]) : null;
  };

  it('wraps the collapsed summary on a phone and puts the status under it', async () => {
    await render();
    await click(q('profile-settings-confirm'));
    const row = q('settings-grid-status')!;
    expect(row.className).toContain('grid-cols-[38px_minmax(0,1fr)_15px]');
    const summary = q('settings-summary')!;
    expect(summary.className).toContain('row-start-1');
    // Nothing is cut on a phone; only the frozen desktop row still truncates.
    expect(summary.className).not.toMatch(/(?:^|\s)truncate(?:\s|$)/);
    expect(summary.className).toContain('min-[68.5rem]:truncate');
    const status = q('settings-status')!;
    expect(status.className).toContain('row-start-2');
    expect(status.className).toContain('justify-self-end');
    expect(status.textContent).toContain('Zatwierdzone');
  });

  it('lays the fields out in the design order: type · batch · machine · serving · OPTIMAL/ECO', async () => {
    await render();
    expect(cellOrder('product-type')).toBe(1);
    expect(cellOrder('batch')).toBe(2);
    expect(cellOrder('machine')).toBe(3);
    expect(cellOrder('serving')).toBe(4);
    expect(cellOrder('strategy')).toBe(5);
    expect(q('workbench-product-type-row')?.closest('label')?.textContent).toContain(
      'Rodzaj lodów',
    );
    expect(q('workbench-batch-scope')?.textContent).toBe(
      'Cała receptura bazy — nie pojedynczy składnik',
    );
    expect(q('workbench-batch-shortcut')).toBeNull();
    expect(q<HTMLSelectElement>('workbench-machine-field')?.value).toBe('professional');
    // The panel's pill carries no „quick shortcut" sentence (Step 2 keeps it).
    expect(host.textContent).not.toContain('szybki skrót');
  });

  it('serves as ONE segmented control (Świeże kept as a fourth segment) through pickServing', async () => {
    await render();
    const group = q('workbench-serving-segments')!;
    const radios = [...group.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    expect(radios.map((radio) => radio.getAttribute('aria-label'))).toEqual([
      'Miękkie · −11 °C',
      'Klasyczne · −12 °C',
      'Twardsze · −13 °C',
      'Świeże',
    ]);
    expect(radios[1]!.getAttribute('aria-checked')).toBe('true');
    await click(radios[0]!);
    expect(useRecipeStore.getState().target_temperature_c).toBe(-11);
    expect(useRecipeStore.getState().servingModeId).toBe('temp_minus_11');
    expect(radios[0]!.getAttribute('aria-checked')).toBe('true');
  });

  it('offers OPTIMAL / ECO as two tiles with „Priorytet smaku / kosztu" and no „Tryb" heading', async () => {
    await render();
    const tiles = q('workbench-strategy')!;
    expect(tiles.getAttribute('role')).toBe('radiogroup');
    expect(tiles.textContent).toBe('OPTIMALPriorytet smakuECOPriorytet kosztu');
    expect(tiles.closest('[data-settings-cell="strategy"]')?.textContent).not.toContain('Tryb');
    await click(q('workbench-strategy-eco'));
    expect(useRecipeStore.getState().formulation_strategy).toBe('eco');
    expect(q('workbench-strategy-eco')?.getAttribute('aria-checked')).toBe('true');
  });

  it('saves the defaults only through the confirmation when „Ustaw jako domyślne" is ticked', async () => {
    await render();
    // First confirmation of a brand-new user still establishes the defaults (§8).
    await click(q('profile-settings-confirm'));
    expect(surface().getAttribute('data-settings-surface')).toBe('collapsed');
    const seeded = useRecipeProfileStore.getState().defaultsFor(OWNER_KEY);
    expect(seeded?.formulationStrategy).toBe('optimal');

    // A later, unticked confirmation never rewrites them.
    await click(q('settings-grid-status'));
    await click(q('workbench-strategy-eco'));
    await click(q('profile-settings-confirm'));
    expect(useRecipeProfileStore.getState().defaultsFor(OWNER_KEY)?.formulationStrategy).toBe(
      'optimal',
    );

    // Ticking the box on confirmed settings brings the confirmation back —
    // nothing is written by the tick itself.
    await click(q('settings-grid-status'));
    expect(q('profile-settings-confirm')).toBeNull();
    await click(q<HTMLInputElement>('profile-settings-default'));
    expect(q<HTMLInputElement>('profile-settings-default')?.checked).toBe(true);
    expect(useRecipeProfileStore.getState().defaultsFor(OWNER_KEY)?.formulationStrategy).toBe(
      'optimal',
    );
    await click(q('profile-settings-confirm'));
    expect(useRecipeProfileStore.getState().defaultsFor(OWNER_KEY)?.formulationStrategy).toBe(
      'eco',
    );
    expect(host.textContent).toContain('Ustawienia zapisane jako domyślne.');
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
