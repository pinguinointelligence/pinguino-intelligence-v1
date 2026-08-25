// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { useRecipeProfileStore } from './recipeProfileStore';
import { WorkbenchSettingsLine } from './WorkbenchSettingsLine';

describe('WorkbenchSettingsLine deferred batch editing', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    useConstraintStudioStore.getState().resetForTests();
    useRecipeProfileStore.getState().resetForTests();
    useRecipeStore.getState().startNewRecipe('gelato');
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () =>
      root.render(
        <WorkbenchSettingsLine
          actualBatchG={useRecipeStore.getState().target_batch_grams}
          compact
        />,
      ),
    );
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  const selectValue = async (testId: string, value: string) => {
    const select = host.querySelector(`[data-testid="${testId}"]`) as HTMLSelectElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(
        select,
        value,
      );
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };

  const materialVector = () => {
    const state = useRecipeStore.getState();
    return {
      lines: state.items.map((item) => ({
        id: item.id,
        ingredient: item.ingredient.id,
        lockType: item.lock_type,
      })),
      toppings: state.toppings.map((item) => ({
        id: item.id,
        ingredient: item.ingredient.id,
        grams: item.planned_grams,
      })),
    };
  };

  it('commits the complete batch only after blur and preserves the active starter vector', async () => {
    useRecipeStore.getState().addTopping(useRecipeStore.getState().items[0]!.ingredient, 12);
    useRecipeStore
      .getState()
      .setGramLock(
        useRecipeStore.getState().items[0]!.id,
        useRecipeStore.getState().items[0]!.planned_grams,
      );
    const before = materialVector();
    const input = host.querySelector('[aria-label="Docelowa partia"]') as HTMLInputElement;
    const setValue = (value: string) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };

    await act(async () => input.focus());
    for (const value of ['2', '22', '222', '2222']) {
      await act(async () => setValue(value));
      expect(input.value).toBe(value);
      expect(useRecipeStore.getState().target_batch_grams).toBe(1_000);
    }

    await act(async () => input.blur());
    expect(useRecipeStore.getState().target_batch_grams).toBe(2_222);
    expect(materialVector()).toEqual(before);
  });

  it('starts a new recipe in OPTIMAL and restores ECO from a saved recipe', async () => {
    expect(useRecipeStore.getState().formulation_strategy).toBe('optimal');

    const saved = starterMilkBase();
    useRecipeStore.getState().loadRecipeInput(
      {
        ...saved,
        mode: 'eco',
        goals: { ...saved.goals, formulation_strategy: 'eco' },
      },
      { savedId: 'saved-eco', savedName: 'ECO Pistachio' },
    );
    await act(async () =>
      root.render(
        <WorkbenchSettingsLine
          actualBatchG={useRecipeStore.getState().target_batch_grams}
          compact
        />,
      ),
    );

    expect(useRecipeStore.getState().formulation_strategy).toBe('eco');
    expect(
      (host.querySelector('[data-testid="workbench-strategy"]') as HTMLSelectElement).value,
    ).toBe('eco');
  });

  it('changes strategy without replacing ingredients, toppings or locks', async () => {
    useRecipeStore.getState().addTopping(useRecipeStore.getState().items[0]!.ingredient, 12);
    useRecipeStore
      .getState()
      .setGramLock(
        useRecipeStore.getState().items[0]!.id,
        useRecipeStore.getState().items[0]!.planned_grams,
      );
    const before = materialVector();

    await selectValue('workbench-strategy', 'eco');

    expect(useRecipeStore.getState().formulation_strategy).toBe('eco');
    expect(materialVector()).toEqual(before);
  });

  it('changes serving temperature and machine without replacing the recipe vector', async () => {
    useRecipeStore.getState().addTopping(useRecipeStore.getState().items[0]!.ingredient, 8);
    const before = materialVector();

    await selectValue('workbench-serving', 'temp_minus_12');
    expect(useRecipeStore.getState().target_temperature_c).toBe(-12);
    expect(materialVector()).toEqual(before);

    const machine = Array.from(
      (host.querySelector('[data-testid="workbench-machine"]') as HTMLSelectElement).options,
    ).find((option) => option.value !== 'professional')!;
    await selectValue('workbench-machine', machine.value);
    expect(useRecipeStore.getState().machineKind).toBe('home');
    expect(materialVector()).toEqual(before);
  });

  it('changes Gelato to Protein in place and returns to one dirty confirmation CTA', async () => {
    useRecipeStore.getState().addTopping(useRecipeStore.getState().items[0]!.ingredient, 8);
    const before = materialVector();

    await selectValue('workbench-product-type', 'protein');

    expect(useRecipeStore.getState().visibleProductType).toBe('protein');
    expect(materialVector()).toEqual(before);
    const confirm = host.querySelector(
      '[data-testid="profile-settings-confirm"]',
    ) as HTMLButtonElement;
    expect(confirm).not.toBeNull();
    await act(async () => confirm.click());
    expect(host.querySelector('[data-testid="profile-settings-confirm"]')).toBeNull();
    expect(host.querySelector('[data-testid="profile-settings-confirmed"]')?.textContent).toContain(
      'Ustawienia potwierdzone',
    );
  });
});

describe('WorkbenchSettingsLine — Sorbet is a fully supported product type', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  const render = async () => {
    await act(async () =>
      root.render(
        <WorkbenchSettingsLine
          actualBatchG={useRecipeStore.getState().target_batch_grams}
          compact
        />,
      ),
    );
  };

  beforeEach(async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    useConstraintStudioStore.getState().resetForTests();
    useRecipeProfileStore.getState().resetForTests();
    useRecipeStore.getState().startNewRecipe('sorbet');
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await render();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('shows no obsolete preparation/coming-soon gating for Sorbet', () => {
    const select = host.querySelector(
      '[data-testid="workbench-product-type"]',
    ) as HTMLSelectElement;
    expect(select.value).toBe('sorbet');
    const sorbetOption = [...select.options].find((option) => option.value === 'sorbet');
    expect(sorbetOption?.disabled).toBe(false);
    const cell = host.querySelector('[data-settings-cell="product-type"]') as HTMLElement;
    expect(cell.querySelector('[data-readiness]')).toBeNull();
    expect(cell.textContent).not.toContain('W PRZYGOTOWANIU');
    expect(cell.textContent).not.toContain('Sorbet nie blokuje');
    expect(host.textContent ?? '').not.toMatch(/coming soon/i);
    expect(host.textContent ?? '').not.toMatch(/wkrótce/i);
  });

  it('lets Sorbet settings be confirmed through the normal flow', async () => {
    const confirm = host.querySelector(
      '[data-testid="profile-settings-confirm"]',
    ) as HTMLButtonElement;
    expect(confirm).not.toBeNull();
    expect(confirm.disabled).toBe(false);
    await act(async () => confirm.click());
    expect(host.querySelector('[data-testid="profile-settings-confirmed"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="profile-settings-confirm"]')).toBeNull();
    expect(useRecipeStore.getState().visibleProductType).toBe('sorbet');
    expect(useRecipeStore.getState().category).toBe('sorbet');
  });

  it('keeps the Gelato settings line unchanged (no readiness marker for Gelato either)', async () => {
    await act(async () => useRecipeStore.getState().startNewRecipe('gelato'));
    await render();
    const cell = host.querySelector('[data-settings-cell="product-type"]') as HTMLElement;
    expect(
      (host.querySelector('[data-testid="workbench-product-type"]') as HTMLSelectElement).value,
    ).toBe('gelato');
    expect(cell.querySelector('[data-readiness]')).toBeNull();
  });
});
