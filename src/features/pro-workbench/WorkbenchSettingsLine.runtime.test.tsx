// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
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

  it('routes the untouched fresh Gelato selector to native Protein P12 instead of relabelling G11', async () => {
    await selectValue('workbench-product-type', 'protein');

    const fresh = useRecipeStore.getState();
    expect(fresh.visibleProductType).toBe('protein');
    expect(fresh.category).toBe('protein_gelato');
    expect(fresh.newRecipeStarterTemplateId).toBe('protein_dairy_neutral_minus12_v1');
    expect(fresh.formulation_strategy).toBe('optimal');
    expect(
      Object.fromEntries(
        fresh.items.map((item) => [
          item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
          item.planned_grams,
        ]),
      ),
    ).toEqual({
      'PI-ING-000236': 522,
      'PI-ING-000180': 114,
      'PI-ING-000264': 81,
      'PI-ING-001409': 104,
      'PI-ING-000514': 71,
      'PI-ING-000494': 106,
      'PI-ING-000492': 2,
    });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it('changes dairy Protein to Gelato in place under the shared dairy-family authority', async () => {
    await act(async () => useRecipeStore.getState().startNewRecipe('protein'));
    const protein = buildRecipeInput(useRecipeStore.getState());
    await act(async () =>
      useRecipeStore.getState().loadRecipeInput(protein, {
        savedId: 'saved-protein-source',
        savedName: 'Protein source',
        versionNumber: 4,
      }),
    );
    await act(async () =>
      root.render(
        <WorkbenchSettingsLine
          actualBatchG={useRecipeStore.getState().target_batch_grams}
          compact
        />,
      ),
    );
    const before = materialVector();

    await selectValue('workbench-product-type', 'gelato');

    const after = useRecipeStore.getState();
    expect(after.visibleProductType).toBe('gelato');
    expect(after.category).toBe('milk_gelato');
    expect(materialVector()).toEqual(before);
    expect(after.newRecipeStarterTemplateId).toBeNull();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it('routes Gelato to a native Sorbet draft only after explicit structural confirmation', async () => {
    const source = buildRecipeInput(useRecipeStore.getState());
    useRecipeStore.getState().loadRecipeInput(source, {
      savedId: 'saved-gelato-source',
      savedName: 'Gelato source',
      versionNumber: 3,
    });
    await act(async () =>
      root.render(
        <WorkbenchSettingsLine
          actualBatchG={useRecipeStore.getState().target_batch_grams}
          compact
        />,
      ),
    );

    await selectValue('workbench-product-type', 'sorbet');

    expect(useRecipeStore.getState().visibleProductType).toBe('gelato');
    expect(host.textContent).toContain('Sorbet korzysta z innej bazy');
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();

    await act(async () =>
      (host.querySelector('[data-testid="confirm-new-recipe"]') as HTMLButtonElement).click(),
    );
    const fresh = useRecipeStore.getState();
    expect(fresh.visibleProductType).toBe('sorbet');
    expect(fresh.category).toBe('sorbet');
    expect(fresh.formulation_strategy).toBe('optimal');
    expect(fresh.savedRecipeId).toBeNull();
    expect(fresh.newRecipeStarterTemplateId).toBe('S02');
    expect(
      fresh.items.map((item) => [item.ingredient.canonical_ingredient_id, item.planned_grams]),
    ).toEqual([
      ['PI-ING-001409', 161],
      ['PI-ING-000514', 90],
      ['PI-ING-000494', 90],
      ['PI-ING-000456', 55],
      ['PI-ING-000492', 4],
    ]);
    expect(fresh.items.some((item) => item.ingredient.flags?.is_dairy === true)).toBe(false);
    expect(source.category).toBe('milk_gelato');
    expect(source.items.some((item) => /milk|cream/i.test(item.ingredient.name))).toBe(true);
  });

  it('offers an explicit native-base replacement for an edited unsaved Gelato draft', async () => {
    const source = structuredClone(useRecipeStore.getState().items);
    const firstLine = source[0]!;
    useRecipeStore.getState().setPlannedGrams(firstLine.id, firstLine.planned_grams + 17);
    await act(async () =>
      root.render(
        <WorkbenchSettingsLine
          actualBatchG={useRecipeStore.getState().target_batch_grams}
          compact
        />,
      ),
    );

    await selectValue('workbench-product-type', 'vegan');

    expect(useRecipeStore.getState().visibleProductType).toBe('gelato');
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(host.textContent).toContain('Niezapisane');

    await act(async () =>
      (host.querySelector('[data-testid="confirm-new-recipe"]') as HTMLButtonElement).click(),
    );

    const fresh = useRecipeStore.getState();
    expect(fresh.visibleProductType).toBe('vegan');
    expect(fresh.category).toBe('vegan_gelato');
    expect(fresh.newRecipeStarterTemplateId).toBe('vegan_neutral_minus12_final');
    expect(fresh.formulation_strategy).toBe('optimal');
    expect(fresh.items).not.toEqual(source);
    expect(fresh.items.some((item) => item.ingredient.flags?.is_dairy === true)).toBe(false);
  });

  it.each([
    ['gelato', 'vegan', 'vegan_gelato', 'vegan_neutral_minus12_final'],
    ['sorbet', 'gelato', 'milk_gelato', 'milk_base_g17_minus12_v1'],
    ['vegan', 'gelato', 'milk_gelato', 'milk_base_g17_minus12_v1'],
  ] as const)(
    'routes %s → %s to the destination-native base after confirmation',
    async (sourceProfile, targetProfile, targetCategory, targetTemplate) => {
      await act(async () => useRecipeStore.getState().startNewRecipe(sourceProfile));
      await act(async () =>
        root.render(
          <WorkbenchSettingsLine
            actualBatchG={useRecipeStore.getState().target_batch_grams}
            compact
          />,
        ),
      );
      const sourceItems = structuredClone(useRecipeStore.getState().items);

      await selectValue('workbench-product-type', targetProfile);

      expect(useRecipeStore.getState().visibleProductType).toBe(sourceProfile);
      expect(useRecipeStore.getState().items).toEqual(sourceItems);
      expect(host.querySelector('[role="dialog"]')).not.toBeNull();

      await act(async () =>
        (host.querySelector('[data-testid="confirm-new-recipe"]') as HTMLButtonElement).click(),
      );

      const target = useRecipeStore.getState();
      expect(target.visibleProductType).toBe(targetProfile);
      expect(target.category).toBe(targetCategory);
      expect(target.newRecipeStarterTemplateId).toBe(targetTemplate);
      expect(target.formulation_strategy).toBe('optimal');
      expect(target.items).not.toEqual(sourceItems);
    },
  );

  it('keeps engineering readiness and the large Protein result out of normal Settings', async () => {
    await act(async () => useRecipeStore.getState().startNewRecipe('vegan'));
    await act(async () =>
      root.render(
        <WorkbenchSettingsLine
          actualBatchG={useRecipeStore.getState().target_batch_grams}
          compact
        />,
      ),
    );
    expect(host.textContent).not.toContain('CZĘŚCIOWO PODŁĄCZONE');

    await act(async () => useRecipeStore.getState().startNewRecipe('protein'));
    await act(async () =>
      root.render(
        <WorkbenchSettingsLine
          actualBatchG={useRecipeStore.getState().target_batch_grams}
          compact
        />,
      ),
    );
    expect(host.textContent).not.toContain('BIAŁKO W RECEPTURZE');
    expect(host.textContent).not.toContain('To metryka wyniku');
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
