// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

  it('commits the complete batch only after blur and rebuilds the untouched starter at 2222 g', async () => {
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
    expect(useRecipeStore.getState().newRecipeStarterKey?.targetBatchGrams).toBe(2_222);
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
