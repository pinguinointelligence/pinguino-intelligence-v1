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
