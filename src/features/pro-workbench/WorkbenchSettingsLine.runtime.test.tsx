// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copy } from '@/copy/en';
import { assessSorbetStabilizerSystem } from '@/features/recipe-constraints';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import { MACHINE_CATALOG, listActiveHomeMachines } from '@/features/machine-catalog';
import { machineDisplayName, machineOnboardingCopy } from '@/features/machine-onboarding';
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
      /* Every native starter is DEFINED at 1000 g, so converting to the
         professional batch reproduces it line for line — no scaling factor.

         For Sorbet that is the whole point: its scaffold is deliberately
         INCOMPLETE (~40 % support, the rest reserved for the fruit Main the
         customer has not chosen yet). This assertion previously expected the
         inflated vector — WATER 404.53 g — which is what filling the batch with
         support ingredients produces, and which pushed INULIN to 13.8 % against
         the 2–8 % owner policy. The lines now stay at their native grams and
         the reservation holds the rest:

             sum(lines) + starterReservedMainGrams === target batch          */
      const expectedGrams = { ...expected.grams } as Record<string, number>;
      const expectedLineSum = Object.values(expectedGrams).reduce((sum, grams) => sum + grams, 0);
      expect(target.visibleProductType).toBe(targetProfile);
      expect(target.category).toBe(expected.category);
      expect(target.newRecipeStarterTemplateId).toBe(expected.templateId);
      expect(target.formulation_strategy).toBe('optimal');
      expect(target.savedRecipeId).toBeNull();
      expect(target.savedRecipeName).toBeNull();
      expect(target.currentVersionId).toBeNull();
      expect(target.items).not.toEqual(sourceItems);
      const actualGrams = Object.fromEntries(
        target.items.map((item) => [
          item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
          item.planned_grams,
        ]),
      );
      expect(actualGrams).toEqual(expectedGrams);
      // The incomplete Sorbet scaffold reserves the balance; a complete starter
      // reserves nothing. Either way the batch is fully accounted for.
      expect(expectedLineSum + target.starterReservedMainGrams).toBeCloseTo(1_000, 6);
      expect(target.starterReservedMainGrams).toBe(
        expected.category === 'sorbet' ? 1_000 - expectedLineSum : 0,
      );
      expect(target.target_batch_grams).toBe(1_000);
      expect(target.batch_source).toBe('PROFESSIONAL_USER_BATCH');
      if (expected.category === 'sorbet') {
        // The point of the projection: the recipe the customer lands on is one
        // the owner stabilizer authority accepts.
        expect(assessSorbetStabilizerSystem(buildRecipeInput(target)).issues).toEqual([]);
      }
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

/**
 * The Studio batch surface must tell the truth about an over-capacity batch.
 *
 * Owner decision 2026-07-17: the machine recommendation is a SOFT proposal —
 * a bigger batch is never capped and never blocked, but it must be shown
 * truthfully in the validation layer. `claude/batch-lifecycle-coherence` made
 * this reachable in the Studio (an applied starter now keeps the batch the user
 * chose in the flow instead of adopting the account default), so the workbench
 * has to carry the SAME `deriveBatchGuidance` rule and the SAME copy the
 * machine settings card already shows.
 */
describe('WorkbenchSettingsLine — over-capacity batch guidance', () => {
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

  /* A REAL catalog machine — an unknown id is its own hard conflict, which
     would mask whether this guidance blocks anything. */
  const homeMachine = listActiveHomeMachines(MACHINE_CATALOG)[0]!;

  /** Select that machine with a 700 g recommendation and the given batch. */
  const selectHomeMachine = async (batchGrams: number, capacityGrams = 700) => {
    await act(async () => {
      useRecipeStore.getState().setMachineSelection({
        kind: 'home',
        servingModeId: 'temp_minus_12',
        machineId: homeMachine.id,
        label: machineDisplayName(homeMachine),
        temperatureC: -12,
        batchGrams,
        capacityGrams,
        batchSource: 'MACHINE_DEFAULT',
      });
    });
    await render();
  };

  const click = async (testId: string) => {
    const button = host.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement;
    expect(button, `${testId} must be rendered`).not.toBeNull();
    await act(async () => button.click());
  };

  const warning = () => host.querySelector('[data-testid="workbench-batch-above-recommendation"]');

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
    await render();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('warns with the machine-settings copy when the batch exceeds the recommendation', async () => {
    await selectHomeMachine(5_000);

    expect(useRecipeStore.getState().target_batch_grams).toBe(5_000);
    expect(warning()).not.toBeNull();
    // The SAME string the machine settings card shows — one rule, one copy.
    expect(warning()!.textContent).toContain(machineOnboardingCopy.batch.aboveWarning);
    expect(warning()!.textContent).toContain(machineOnboardingCopy.batch.splitAction);
    expect(warning()!.textContent).toContain(machineOnboardingCopy.batch.keepMine);
    expect(warning()!.textContent).toContain(machineOnboardingCopy.batch.restoreShort);
    // A screen reader must hear it as it appears (WCAG 4.1.3).
    expect(warning()!.querySelector('[role="status"]')).not.toBeNull();
  });

  it('never blocks: the batch stays exactly what the user chose', async () => {
    await selectHomeMachine(5_000);

    expect(useRecipeStore.getState().target_batch_grams).toBe(5_000);
    expect(useRecipeStore.getState().machine_capacity_grams).toBe(700);
    // No capping, and settings stay confirmable — the warning is advisory only.
    const confirm = host.querySelector(
      '[data-testid="profile-settings-confirm"]',
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    await act(async () => confirm.click());
    expect(host.querySelector('[data-testid="profile-settings-confirmed"]')).not.toBeNull();
    expect(useRecipeStore.getState().target_batch_grams).toBe(5_000);
  });

  it('stays silent at or below the recommendation, and for a Professional machine', async () => {
    await selectHomeMachine(700);
    expect(warning()).toBeNull();
    expect(host.querySelector('[data-testid="workbench-batch-custom-in-use"]')).toBeNull();

    // Below the recommendation is the subtle marker only — never the warning.
    await selectHomeMachine(500);
    expect(warning()).toBeNull();
    expect(host.querySelector('[data-testid="workbench-batch-custom-in-use"]')?.textContent).toBe(
      machineOnboardingCopy.batch.customInUse,
    );

    // Professional has no machine recommendation, so there is nothing to warn about.
    await act(async () => {
      useRecipeStore.getState().setMachineSelection({
        kind: 'professional',
        servingModeId: 'temp_minus_12',
        machineId: null,
        label: 'Maszyna profesjonalna',
        temperatureC: -12,
        batchGrams: 5_000,
        capacityGrams: null,
      });
    });
    await render();
    expect(useRecipeStore.getState().target_batch_grams).toBe(5_000);
    expect(warning()).toBeNull();
  });

  it('offers the split plan without changing the batch', async () => {
    await selectHomeMachine(5_000);
    await click('workbench-batch-split');

    const plan = host.querySelector('[data-testid="workbench-batch-split-plan"]');
    expect(plan).not.toBeNull();
    // 5000 g over a 700 g recommendation → 8 EVEN containers of 625 g,
    // in the owner's verbatim split copy (§7.3).
    expect(plan!.textContent).toContain(machineOnboardingCopy.split.message(8));
    expect(plan!.textContent).toContain(machineOnboardingCopy.split.detail(8, '625'));
    expect(warning()).toBeNull();
    // Splitting is presentation only: the recipe batch is untouched.
    expect(useRecipeStore.getState().target_batch_grams).toBe(5_000);
  });

  it('keeps my amount exactly and swaps the warning for the custom marker', async () => {
    await selectHomeMachine(5_000);
    await click('workbench-batch-keep-mine');

    expect(warning()).toBeNull();
    expect(host.querySelector('[data-testid="workbench-batch-custom-in-use"]')?.textContent).toBe(
      machineOnboardingCopy.batch.customInUse,
    );
    expect(useRecipeStore.getState().target_batch_grams).toBe(5_000);
  });

  it('restores the recommendation through the ordinary batch path', async () => {
    await selectHomeMachine(5_000);
    await click('workbench-batch-restore-recommended');

    expect(useRecipeStore.getState().target_batch_grams).toBe(700);
    expect(warning()).toBeNull();
    expect(host.querySelector('[data-testid="workbench-batch-custom-in-use"]')).toBeNull();
  });

  it('re-asks after a dismissal when the batch changes again (sticky per amount)', async () => {
    await selectHomeMachine(5_000);
    await click('workbench-batch-keep-mine');
    expect(warning()).toBeNull();

    const input = host.querySelector('[aria-label="Docelowa partia"]') as HTMLInputElement;
    await act(async () => input.focus());
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        input,
        '6000',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => input.blur());

    expect(useRecipeStore.getState().target_batch_grams).toBe(6_000);
    // A new amount is a new decision — the warning legitimately returns.
    expect(warning()).not.toBeNull();
  });
});

/**
 * Owner UX correction — the batch field must read as ONE editable amount.
 *
 * The old presentation put the recipe's current Base and the target batch in
 * one `5000 / 470 g` row, which read as two inputs, overflowed the card, and
 * left no way to tell where to type or what the second number meant. The fix
 * is presentation only: one labelled editable field, the Base demoted to a
 * read-only line, and the machine guidance kept separate.
 */
describe('WorkbenchSettingsLine — one editable batch field', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  const render = async (actualBatchG: number, compact = true) => {
    await act(async () =>
      root.render(<WorkbenchSettingsLine actualBatchG={actualBatchG} compact={compact} />),
    );
  };

  const batchCard = () => host.querySelector('[data-testid="profile-batch-combined"]')!;
  const baseLine = () => host.querySelector('[data-testid="workbench-recipe-base"]');

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
    await render(useRecipeStore.getState().target_batch_grams);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  for (const compact of [true, false]) {
    it(`exposes exactly one editable amount in the batch card (compact=${compact})`, async () => {
      await render(470, compact);
      const card = batchCard();
      // One number input. The unit stays a real control; nothing else.
      const inputs = card.querySelectorAll('input');
      expect(inputs).toHaveLength(1);
      expect(inputs[0]!.getAttribute('aria-label')).toBe('Docelowa partia');
      expect(card.querySelectorAll('select')).toHaveLength(1);
      expect(card.querySelector('[aria-label="Jednostka partii"]')).not.toBeNull();
      // The old two-number `5000 / 470` row is gone from the card.
      expect(card.textContent).not.toContain('/');
      expect(card.textContent).toContain('Partia docelowa');
      // …and the Base is NOT inside the card, where it read as a second input.
      expect(card.querySelector('[data-testid="workbench-recipe-base"]')).toBeNull();
    });
  }

  it('reports the recipe Base as read-only information, never as a control', async () => {
    await render(470);
    const base = baseLine();
    expect(base).not.toBeNull();
    expect(base!.textContent).toContain('Baza receptury:');
    expect(base!.textContent).toContain('470');
    // Read-only means read-only: no input, no select, no button, not focusable.
    expect(base!.querySelectorAll('input, select, button, textarea, [contenteditable]')).toHaveLength(
      0,
    );
    expect(base!.tagName).toBe('P');
    expect(base!.hasAttribute('tabindex')).toBe(false);
  });

  it('shows the reconciled Base once the recipe matches the target', async () => {
    await render(470);
    expect(baseLine()!.textContent).toContain('470');
    await render(5_000);
    expect(baseLine()!.textContent).toContain('5000');
    expect(baseLine()!.textContent).toContain('Baza receptury:');
  });

  it('keeps target, Base and machine guidance as three separate readings', async () => {
    await act(async () => {
      useRecipeStore.getState().setMachineSelection({
        kind: 'home',
        servingModeId: 'temp_minus_12',
        machineId: listActiveHomeMachines(MACHINE_CATALOG)[0]!.id,
        label: 'Home machine',
        temperatureC: -12,
        batchGrams: 5_000,
        capacityGrams: 670,
        batchSource: 'MACHINE_DEFAULT',
      });
    });
    await render(470);

    // 1 — what I want to make (the one editable field).
    expect(
      (host.querySelector('[aria-label="Docelowa partia"]') as HTMLInputElement).value,
    ).toBe('5000');
    // 2 — what the recipe weighs right now (read-only).
    expect(baseLine()!.textContent).toContain('470');
    // 3 — the machine reading, kept separate from both.
    const capacity = host.querySelector('[data-testid="home-machine-capacity"]')!;
    expect(capacity.textContent).toContain('Zalecany wsad na cykl');
    expect(capacity.textContent).toContain('670');
    // Polish plural: 8 is the genitive „cykli", not „cykle" (2-4 only).
    expect(host.querySelector('[data-testid="home-machine-cycles"]')!.textContent).toBe(
      '8 cykli · 625 g / cykl',
    );
    // The batch is presentation-corrected, not re-authored.
    expect(useRecipeStore.getState().target_batch_grams).toBe(5_000);
  });

  it('renders no duplicate batch control anywhere in the panel', async () => {
    await render(470);
    const panel = host.querySelector('[data-testid="workbench-settings-line"]')!;
    expect(panel.querySelectorAll('[aria-label="Docelowa partia"]')).toHaveLength(1);
    expect(panel.querySelectorAll('[aria-label="Jednostka partii"]')).toHaveLength(1);
    expect(panel.querySelectorAll('[data-testid="profile-batch-combined"]')).toHaveLength(1);
    expect(panel.querySelectorAll('[data-testid="workbench-recipe-base"]')).toHaveLength(1);
  });

  it('keeps the Base readout directly under the batch field at both widths', async () => {
    await render(470);
    const grid = host.querySelector('.profile-settings-grid')!;
    const base = baseLine()!;
    // A grid child, so it can be ordered relative to the batch/Tryb row rather
    // than floating below the whole panel.
    expect(base.parentElement).toBe(grid);
    // OWNER FROZEN PRO VISUAL: Base is an ordinary cell of the 2x3 grid,
    // sitting BESIDE Partia docelowa rather than spanning a fourth row under
    // it. What the old contract protected — Base immediately follows the batch
    // field it reports on — is now true by default order at every width, so
    // the narrow-width override that used to lift it no longer exists.
    expect(base.className).not.toContain('col-span-2');
    expect(base.className).toContain('order-6');
    expect(base.className).toContain('profile-settings-base-readout');
    const batchCell = host.querySelector("[data-settings-cell='batch']") as HTMLElement;
    expect(batchCell.className).toContain('order-5');
    const theme = readFileSync(
      resolve(import.meta.dirname, '..', '..', 'styles', 'theme-pro-light.css'),
      'utf8',
    );
    const narrow = theme.slice(theme.indexOf('@container right-pane (max-width: 399px)'));
    expect(narrow).not.toContain('.profile-settings-base-readout {');
    expect(narrow).not.toContain("[data-settings-cell='strategy']");
  });

  it('still commits an edited batch through the one remaining field', async () => {
    await render(470);
    const input = host.querySelector('[aria-label="Docelowa partia"]') as HTMLInputElement;
    await act(async () => input.focus());
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '2500');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => input.blur());
    expect(useRecipeStore.getState().target_batch_grams).toBe(2_500);
  });
});
