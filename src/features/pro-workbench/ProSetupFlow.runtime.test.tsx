// @vitest-environment jsdom
/**
 * DESIGN V3.0 §3 (owner-LOCKED Points 1–4) — the full-screen setup of a new
 * PRO recipe on a phone and iPad portrait, with its default skip.
 *
 * The harness mounts exactly what the workbench mounts for it: the always
 * present settings panel (which owns the draft lifecycle and publishes the
 * confirmation fact), the gate, the setup and the defaults notice. Every
 * assertion reads the ONE recipe/profile store, so the tests fail if the setup
 * ever keeps a setting of its own.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { useRecipeProfileStore } from './recipeProfileStore';
import { profileSnapshotFromState } from './recipeProfilePersistence';
import { useProSetupFlowGate, useProSetupFlowStore } from './proSetupFlowGate';
import { ProSetupDefaultsNotice, ProSetupFlow } from './ProSetupFlow';
import { WorkbenchSettingsLine } from './WorkbenchSettingsLine';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const OWNER = 'local-device';

let host: HTMLDivElement;
let root: Root;
let reveals = 0;

function Harness({ phone = true }: { phone?: boolean }) {
  const setup = useProSetupFlowGate({
    mobileViewport: phone,
    available: true,
    activeTab: 'profile',
  });
  return (
    <>
      <WorkbenchSettingsLine compact />
      <div data-testid="harness-workbench" inert={setup.step !== null || undefined}>
        {setup.defaultsNotice && setup.draftIdentity !== null ? (
          <ProSetupDefaultsNotice draftIdentity={setup.draftIdentity} />
        ) : null}
        <button type="button" data-testid="harness-recalc">
          Przelicz
        </button>
      </div>
      {setup.step !== null ? (
        <ProSetupFlow
          step={setup.step}
          onReveal={(apply) => {
            reveals += 1;
            apply();
          }}
        />
      ) : null}
    </>
  );
}

const render = async (phone = true) => {
  await act(async () => root.render(<Harness phone={phone} />));
};
const q = <T extends HTMLElement = HTMLElement>(testId: string) =>
  host.querySelector<T>(`[data-testid="${testId}"]`);
const click = async (element: HTMLElement | null) => {
  expect(element).not.toBeNull();
  await act(async () => element!.click());
};
const flow = () => q('pro-setup-flow');
const step = () => flow()?.getAttribute('data-setup-step') ?? null;
const title = () => q('pro-setup-title')?.textContent;

/** Stores the current settings as this device's defaults for the product. */
const saveCurrentAsDefaults = () => {
  const recipe = useRecipeStore.getState();
  const profile = useRecipeProfileStore.getState();
  profile.saveDefaults(
    `${OWNER}:${recipe.visibleProductType}`,
    profileSnapshotFromState(recipe, recipe.direction_targets, profile.directionIntents),
  );
};

beforeEach(() => {
  localStorage.clear();
  reveals = 0;
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

describe('§3 — three full-screen steps in the owner-locked order', () => {
  it('opens a new unsaved recipe on Step 1 with the four types and only „Dalej"', async () => {
    await render();
    expect(flow()?.getAttribute('role')).toBe('dialog');
    expect(step()).toBe('1');
    expect(q('pro-setup-step')?.textContent).toBe('Krok 1 z 3');
    expect(flow()?.textContent).toContain('Nowa receptura');
    expect(title()).toBe('Jakie lody dziś robimy?');
    const types = [...q('pro-setup-types')!.querySelectorAll('[role="radio"]')];
    expect(types.map((type) => type.textContent)).toEqual([
      'GelatoMleczne, kremowe',
      'SorbetOwocowe, bez mleka',
      'WegańskieNa bazie roślinnej',
      'ProteinoweWięcej białka',
    ]);
    expect(q('pro-setup-type-gelato')?.getAttribute('aria-checked')).toBe('true');
    expect(q('pro-setup-back')).toBeNull();
    expect(q('pro-setup-finish')).toBeNull();
    expect(q('pro-setup-next')?.textContent).toContain('Dalej');
  });

  it('walks 1 → 2 (amount + OPTIMAL/ECO) → 3 (machine, serving, taste, default) and back', async () => {
    await render();
    await click(q('pro-setup-next'));
    expect(step()).toBe('2');
    expect(q('pro-setup-step')?.textContent).toBe('Krok 2 z 3');
    expect(title()).toBe('Ile lodów dziś przygotowujemy?');
    expect(flow()?.querySelector('[aria-label="Docelowa partia"]')).not.toBeNull();
    expect(q('workbench-batch-shortcut')?.textContent).toContain('szybki skrót');
    expect(q('pro-setup-strategy')?.textContent).toContain(
      'Najlepsza równowaga jakości, tekstury i parametrów receptury.',
    );
    expect(q('pro-setup-strategy')?.textContent).toContain(
      'Tańszy skład, nadal w bezpiecznych granicach technicznych.',
    );
    expect(flow()?.querySelector('[data-testid="pro-setup-machine"]')).toBeNull();

    await click(q('pro-setup-back'));
    expect(step()).toBe('1');
    await click(q('pro-setup-next'));
    await click(q('pro-setup-next'));
    expect(step()).toBe('3');
    expect(title()).toBe('Maszyna, podawanie i smak');
    expect(q<HTMLSelectElement>('pro-setup-machine')?.value).toBe('professional');
    const serving = [...q('pro-setup-serving')!.querySelectorAll('[role="radio"]')];
    expect(serving.map((radio) => radio.getAttribute('aria-label')).slice(0, 3)).toEqual([
      'Miękkie · −11 °C',
      'Klasyczne · −12 °C',
      'Twardsze · −13 °C',
    ]);
    expect(flow()?.querySelector('[data-testid="profile-regulator-sweetness"]')).not.toBeNull();
    expect(flow()?.querySelector('[data-testid="profile-regulator-softness"]')).not.toBeNull();
    expect(q<HTMLInputElement>('pro-setup-default')?.checked).toBe(false);
    expect(q<HTMLInputElement>('pro-setup-default')?.closest('label')?.textContent).toContain(
      'Ilość, tryb, maszyna, podawanie, słodycz i twardość',
    );
    expect(q('pro-setup-next')).toBeNull();
    expect(q('pro-setup-finish')?.textContent).toBe('Receptura');
  });

  it('writes every answer into the ONE recipe store through the panel handlers', async () => {
    await render();
    await click(q('pro-setup-next'));
    await click(flow()!.querySelector<HTMLElement>('[data-testid="workbench-batch-increment"]'));
    expect(useRecipeStore.getState().target_batch_grams).toBe(1_010);
    await click(q('pro-setup-strategy-eco'));
    expect(useRecipeStore.getState().formulation_strategy).toBe('eco');
    await click(q('pro-setup-next'));
    await click(q('pro-setup-serving-temp_minus_13'));
    expect(useRecipeStore.getState().target_temperature_c).toBe(-13);
    const sweeter = [
      ...flow()!.querySelectorAll<HTMLButtonElement>(
        '[data-testid="profile-regulator-sweetness"] [role="radio"]',
      ),
    ].find((radio) => radio.getAttribute('aria-label') === 'Słodycz: bardziej słodkie');
    await click(sweeter!);
    expect(useRecipeStore.getState().direction_targets.sweetness).toBe(1);
    // The panel shows the same values — there is no second copy of them.
    expect(q('workbench-strategy-eco')?.getAttribute('aria-checked')).toBe('true');
  });
});

describe('§3 — nothing later in the flow before the setup is done', () => {
  it('keeps the workbench inert and the settings unconfirmed until „Receptura"', async () => {
    await render();
    expect(q('harness-workbench')?.hasAttribute('inert')).toBe(true);
    await click(q('pro-setup-next'));
    await click(q('pro-setup-next'));
    expect(useRecipeProfileStore.getState().settingsConfirmed).toBe(false);
    expect(q('harness-workbench')?.hasAttribute('inert')).toBe(true);

    await click(q('pro-setup-finish'));
    expect(useRecipeProfileStore.getState().settingsConfirmed).toBe(true);
    expect(flow()).toBeNull();
    expect(reveals).toBe(1);
    expect(q('harness-workbench')?.hasAttribute('inert')).toBe(false);
    expect(q('pro-setup-defaults-notice')).toBeNull();
  });

  it('never opens on the desktop composition or for a saved recipe', async () => {
    await render(false);
    expect(flow()).toBeNull();
    await act(async () => root.render(null));

    await act(async () =>
      useRecipeStore
        .getState()
        .markSaved('setup-saved', 'Zapisana', 1, null, undefined, 'setup-saved-v1'),
    );
    await render();
    expect(useRecipeProfileStore.getState().activeDraftIdentity).toContain('saved-recipe');
    expect(flow()).toBeNull();
  });
});

describe('Point 3 — default skip', () => {
  it('always asks Step 1, then valid defaults skip 2–3 and the recipe says so', async () => {
    saveCurrentAsDefaults();
    await act(async () => useRecipeStore.getState().startNewRecipe('gelato'));
    await render();
    // The panel's own rule already confirmed the inherited draft …
    expect(useRecipeProfileStore.getState().settingsConfirmed).toBe(true);
    // … and Step 1 is asked all the same.
    expect(step()).toBe('1');
    await click(q('pro-setup-next'));
    expect(flow()).toBeNull();
    expect(reveals).toBe(1);
    const notice = q('pro-setup-defaults-notice');
    expect(notice?.textContent).toContain('Używamy Twoich domyślnych ustawień');
    expect(notice?.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Zastosowane');

    // „Zmień" reopens the setup at Step 2.
    await click(q('pro-setup-defaults-change'));
    expect(step()).toBe('2');
    expect(q('pro-setup-defaults-notice')).toBeNull();
  });

  it('does not skip when the defaults do not cover the chosen type', async () => {
    saveCurrentAsDefaults();
    await act(async () => useRecipeStore.getState().startNewRecipe('gelato'));
    await render();
    await click(q('pro-setup-type-sorbet'));
    await click(q('pro-setup-next'));
    // Step 1 answered: the untouched starter became a Sorbet draft …
    expect(useRecipeStore.getState().visibleProductType).toBe('sorbet');
    // … which has no stored defaults, so Steps 2–3 are asked.
    expect(step()).toBe('2');
  });

  it('does not skip on defaults that no longer match the draft', async () => {
    saveCurrentAsDefaults();
    await act(async () => useRecipeStore.getState().startNewRecipe('gelato'));
    await act(async () => useConstraintStudioStore.getState().resizeBatchGrams(1_200));
    await render();
    expect(useRecipeProfileStore.getState().settingsConfirmed).toBe(false);
    await click(q('pro-setup-next'));
    expect(step()).toBe('2');
  });
});

describe('Point 3 — „Ustaw jako domyślne" for the whole package', () => {
  it('saves the confirmed package as the defaults only when ticked', async () => {
    saveCurrentAsDefaults();
    const before = useRecipeProfileStore.getState().defaultsFor(`${OWNER}:gelato`);
    await act(async () => useRecipeStore.getState().startNewRecipe('gelato'));
    await render();
    await click(q('pro-setup-next'));
    await click(q('pro-setup-defaults-change'));
    await click(q('pro-setup-strategy-eco'));
    await click(q('pro-setup-next'));
    // Unticked: confirming changes this recipe only.
    await click(q('pro-setup-finish'));
    expect(useRecipeProfileStore.getState().defaultsFor(`${OWNER}:gelato`)).toEqual(before);
  });

  it('writes the defaults through the existing mechanism when ticked', async () => {
    await render();
    await click(q('pro-setup-next'));
    await click(q('pro-setup-strategy-eco'));
    await click(q('pro-setup-next'));
    await click(q('pro-setup-default'));
    await click(q('pro-setup-finish'));
    const saved = useRecipeProfileStore.getState().defaultsFor(`${OWNER}:gelato`);
    expect(saved?.formulationStrategy).toBe('eco');
    expect(flow()).toBeNull();
  });
});
