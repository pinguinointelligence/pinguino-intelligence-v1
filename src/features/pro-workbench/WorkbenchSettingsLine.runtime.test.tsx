// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copy } from '@/copy/en';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { useRecipeStore } from '@/stores/recipeStore';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import type { VisibleProductType } from '@/features/studio/productType';
import { useRecipeProfileStore } from './recipeProfileStore';
import { WorkbenchSettingsLine } from './WorkbenchSettingsLine';

const NATIVE_PROFILE_STARTERS = {
  gelato: {
    category: 'milk_gelato',
    templateId: 'milk_base_g17_minus12_v1',
    grams: {
      'PI-ING-000236': 599,
      'PI-ING-000180': 135,
      'PI-ING-000270': 43,
      'PI-ING-000514': 86,
      'PI-ING-000494': 80,
      'PI-ING-000456': 54,
      'PI-ING-000492': 3,
    },
  },
  sorbet: {
    category: 'sorbet',
    templateId: 'S02',
    grams: {
      'PI-ING-001409': 161,
      'PI-ING-000514': 90,
      'PI-ING-000494': 90,
      'PI-ING-000456': 55,
      'PI-ING-000492': 4,
    },
  },
  vegan: {
    category: 'vegan_gelato',
    templateId: 'vegan_neutral_minus12_final',
    grams: {
      'PI-ING-001409': 397,
      'PI-ING-001565': 250,
      'PI-ING-000163': 53,
      'PI-ING-000514': 145,
      'PI-ING-000494': 100,
      'PI-ING-000456': 53,
      'PI-ING-000492': 2,
    },
  },
  protein: {
    category: 'protein_gelato',
    templateId: 'protein_dairy_neutral_minus12_v1',
    grams: {
      'PI-ING-000236': 522,
      'PI-ING-000180': 114,
      'PI-ING-000264': 81,
      'PI-ING-001409': 104,
      'PI-ING-000514': 71,
      'PI-ING-000494': 106,
      'PI-ING-000492': 2,
    },
  },
} as const;

const ALL_PROFILE_TRANSITIONS = [
  ['gelato', 'sorbet'],
  ['gelato', 'vegan'],
  ['gelato', 'protein'],
  ['sorbet', 'gelato'],
  ['sorbet', 'vegan'],
  ['sorbet', 'protein'],
  ['vegan', 'gelato'],
  ['vegan', 'sorbet'],
  ['vegan', 'protein'],
  ['protein', 'gelato'],
  ['protein', 'sorbet'],
  ['protein', 'vegan'],
] as const satisfies readonly (readonly [VisibleProductType, VisibleProductType])[];

describe('WorkbenchSettingsLine deferred batch editing', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
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

  it('applies the 1000 g Professional default on selection and preserves only a manual Professional batch across serving modes', async () => {
    const baseSum = () =>
      useRecipeStore
        .getState()
        .items.reduce((sum, item) => sum + item.planned_grams, 0);
    const displayedBatch = () =>
      (host.querySelector('[aria-label="Docelowa partia"]') as HTMLInputElement).value;
    const expectBatch = (grams: number, source: string) => {
      expect(displayedBatch()).toBe(String(grams));
      expect(useRecipeStore.getState().target_batch_grams).toBe(grams);
      expect(baseSum()).toBeCloseTo(grams, 8);
      expect(useRecipeStore.getState().batch_source).toBe(source);
    };

    expectBatch(1_000, 'PROFESSIONAL_DEFAULT');

    await selectValue('workbench-machine', 'ninja-creami-deluxe-nc502eu-eu-es');
    expectBatch(670, 'MACHINE_DEFAULT');

    await selectValue('workbench-machine', 'professional');
    expectBatch(1_000, 'PROFESSIONAL_DEFAULT');

    const input = host.querySelector('[aria-label="Docelowa partia"]') as HTMLInputElement;
    await act(async () => {
      input.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '3000');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.blur();
    });
    expectBatch(3_000, 'PROFESSIONAL_USER_BATCH');

    for (const servingMode of ['temp_minus_11', 'temp_minus_12', 'temp_minus_13']) {
      await selectValue('workbench-serving', servingMode);
      expectBatch(3_000, 'PROFESSIONAL_USER_BATCH');
    }

    await selectValue('workbench-machine', 'ninja-creami-nc302eu-eu-es');
    expectBatch(450, 'MACHINE_DEFAULT');

    await selectValue('workbench-machine', 'professional');
    expectBatch(1_000, 'PROFESSIONAL_DEFAULT');
  });

  it.each(ALL_PROFILE_TRANSITIONS)(
    '%s → %s requires confirmation, preserves the source, and scales the native target to the professional batch',
    async (sourceProfile, targetProfile) => {
      await act(async () => useRecipeStore.getState().startNewRecipe(sourceProfile));
      const sourceInput = structuredClone(buildRecipeInput(useRecipeStore.getState()));
      const immutableSource = structuredClone(sourceInput);
      await act(async () =>
        useRecipeStore.getState().loadRecipeInput(sourceInput, {
          savedId: `saved-${sourceProfile}`,
          savedName: `Saved ${sourceProfile}`,
          versionNumber: 4,
          latestVersionNumber: 4,
          versionId: `${sourceProfile}-version-4`,
        }),
      );
      const sourceItems = structuredClone(useRecipeStore.getState().items);
      useRecipeStore.setState({
        productBehaviorSnapshots: productBehaviorTestSnapshots(sourceInput),
        compositionMigrationAmbiguities: [
          { lineId: sourceItems[0]!.id, reason: 'LEGACY_BEHAVIOR:stale source authority' },
        ],
      });
      useConstraintStudioStore.setState({
        preview: { stale: true } as never,
        history: [{ stale: true }] as never,
      });
      await act(async () =>
        root.render(
          <WorkbenchSettingsLine
            actualBatchG={useRecipeStore.getState().target_batch_grams}
            compact
          />,
        ),
      );

      await selectValue('workbench-product-type', targetProfile);

      const beforeConfirm = useRecipeStore.getState();
      expect(beforeConfirm.visibleProductType).toBe(sourceProfile);
      expect(beforeConfirm.savedRecipeId).toBe(`saved-${sourceProfile}`);
      expect(beforeConfirm.currentVersionId).toBe(`${sourceProfile}-version-4`);
      expect(beforeConfirm.items).toEqual(sourceItems);
      expect(host.querySelector('[role="dialog"]')).not.toBeNull();
      expect(host.textContent).toContain(
        `${copy.studio.goal.productTypes[targetProfile]} korzysta z innej bazy`,
      );

      await act(async () =>
        (host.querySelector('[data-testid="confirm-new-recipe"]') as HTMLButtonElement).click(),
      );

      const target = useRecipeStore.getState();
      const expected = NATIVE_PROFILE_STARTERS[targetProfile];
      const expectedBase = Object.values(expected.grams).reduce((sum, grams) => sum + grams, 0);
      const expectedGrams = Object.fromEntries(
        Object.entries(expected.grams).map(([id, grams]) => [id, (grams * 1_000) / expectedBase]),
      );
      expect(target.visibleProductType).toBe(targetProfile);
      expect(target.category).toBe(expected.category);
      expect(target.newRecipeStarterTemplateId).toBe(expected.templateId);
      expect(target.formulation_strategy).toBe('optimal');
      expect(target.savedRecipeId).toBeNull();
      expect(target.savedRecipeName).toBeNull();
      expect(target.currentVersionId).toBeNull();
      expect(target.items).not.toEqual(sourceItems);
      expect(
        Object.fromEntries(
          target.items.map((item) => [
            item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
            item.planned_grams,
          ]),
        ),
      ).toEqual(expectedGrams);
      expect(target.target_batch_grams).toBe(1_000);
      expect(target.batch_source).toBe('PROFESSIONAL_USER_BATCH');
      expect(target.productBehaviorSnapshots).toEqual({});
      expect(target.compositionMigrationAmbiguities).toEqual([]);
      expect(useConstraintStudioStore.getState().preview).toBeNull();
      expect(useConstraintStudioStore.getState().history).toEqual([]);
      expect(sourceInput).toEqual(immutableSource);
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
