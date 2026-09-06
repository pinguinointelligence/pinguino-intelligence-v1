// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SaturatedFatControl } from './SaturatedFatControl';
import type { MasterLabelData } from './masterLabel';
import { createCompleteLabel } from './masterLabelTestFixture';

function Harness({
  initial,
  onSave,
}: {
  initial: MasterLabelData;
  onSave: (label: MasterLabelData) => Promise<void>;
}) {
  const [label, setLabel] = useState(initial);
  return (
    <SaturatedFatControl
      label={label}
      onSave={async (next) => {
        await onSave(next);
        setLabel(next);
      }}
    />
  );
}

describe('SaturatedFatControl', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('keeps the missing World value optional and saves one number without an evidence field', async () => {
    const base = createCompleteLabel('WORLD');
    const onSave = vi.fn(async () => undefined);
    await act(async () =>
      root.render(
        <Harness
          initial={createCompleteLabel('WORLD', {
            nutritionSource: { ...base.nutritionSource!, saturated_fat_g: null },
            saturatedFatAuthority: {
              status: 'missing',
              sourceReferences: [],
              missingIngredientNames: ['Milk'],
            },
          })}
          onSave={onSave}
        />,
      ),
    );

    expect(host.textContent).toContain('Tłuszcze nasycone nieustalone');
    expect(host.textContent).not.toContain('Źródło potwierdzenia');
    const set = host.querySelector<HTMLButtonElement>('[data-testid="label-saturated-fat-set"]')!;
    expect(set.textContent).toBe('Ustaw');
    await act(async () => set.click());

    const input = host.querySelector<HTMLInputElement>(
      '[data-testid="label-saturated-fat-input"]',
    )!;
    expect(input.type).toBe('number');
    expect(host.querySelectorAll('input')).toHaveLength(1);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '4.2');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-testid="label-saturated-fat-save"]')!.click();
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        nutritionSource: expect.objectContaining({ saturated_fat_g: 4.2 }),
        saturatedFatAuthority: expect.objectContaining({ status: 'manual_final_value' }),
      }),
    );
    expect(host.textContent).toContain('Tłuszcze nasycone: 4,2 g / 100 g');
    expect(host.querySelector('[data-testid="label-saturated-fat-change"]')?.textContent).toBe(
      'Zmień',
    );
  });

  it('uses Wróć to discard an unfinished edit and return to the same row', async () => {
    const onSave = vi.fn(async () => undefined);
    await act(async () =>
      root.render(<Harness initial={createCompleteLabel('WORLD')} onSave={onSave} />),
    );
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-testid="label-saturated-fat-change"]')!.click(),
    );
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-testid="label-saturated-fat-back"]')!.click(),
    );
    expect(host.textContent).toContain('Tłuszcze nasycone: 10 g / 100 g');
    expect(onSave).not.toHaveBeenCalled();
  });
});
