// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DirectNumberControl } from './DirectNumberControl';

const setNativeValue = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('DirectNumberControl committed editing', () => {
  let root: ReturnType<typeof createRoot> | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  const mount = async (props: { suffix: string; decimals: number; max?: number }) => {
    const onChange = vi.fn();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () =>
      root?.render(
        <DirectNumberControl
          value={1}
          step={props.decimals ? 0.1 : 1}
          min={0}
          max={props.max}
          decimals={props.decimals}
          suffix={props.suffix}
          ariaLabel={`Wartość ${props.suffix}`}
          onChange={onChange}
          testId="runtime-number-control"
        />,
      ),
    );
    const input = host.querySelector('input') as HTMLInputElement;
    return { input, onChange };
  };

  it('does not commit gram digits until blur and preserves the full 1 → 11 → 111 → 1111 draft', async () => {
    const { input, onChange } = await mount({ suffix: 'g', decimals: 0 });
    await act(async () => input.focus());
    for (const value of ['1', '11', '111', '1111']) {
      await act(async () => setNativeValue(input, value));
      expect(input.value).toBe(value);
      expect(onChange).not.toHaveBeenCalled();
    }
    await act(async () => input.blur());
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(1111);
  });

  it('keeps percent typing, backspace and paste local until Enter, then applies its canonical bound', async () => {
    const { input, onChange } = await mount({ suffix: '%', decimals: 1, max: 100 });
    await act(async () => input.focus());
    for (const value of ['1', '11', '111', '1111', '111', '', '12.5']) {
      await act(async () => setNativeValue(input, value));
      expect(input.value).toBe(value);
      expect(onChange).not.toHaveBeenCalled();
    }
    await act(async () =>
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
    );
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(12.5);

    onChange.mockClear();
    await act(async () => input.focus());
    await act(async () => setNativeValue(input, '2222'));
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => input.blur());
    expect(onChange).toHaveBeenCalledWith(100);
  });
});
