// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeferredNumberInput } from './DeferredNumberInput';

describe('DeferredNumberInput', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const onCommit = vi.fn();

  beforeEach(async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    onCommit.mockReset();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () =>
      root.render(
        <DeferredNumberInput
          value={1000}
          min={1}
          decimals={0}
          aria-label="Docelowa partia"
          onCommit={onCommit}
        />,
      ),
    );
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  const input = () => host.querySelector('input') as HTMLInputElement;
  const enter = async (value: string) => {
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input(), value);
      input().dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  it('keeps 1 → 11 → 111 → 1111 as a local draft and commits only on blur', async () => {
    await act(async () => input().focus());
    for (const value of ['1', '11', '111', '1111']) {
      await enter(value);
      expect(input().value).toBe(value);
      expect(onCommit).not.toHaveBeenCalled();
    }
    await act(async () => input().blur());
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith(1111);
  });

  it('supports paste-like replacement and Enter without committing intermediate digits', async () => {
    await act(async () => input().focus());
    await enter('2222');
    expect(onCommit).not.toHaveBeenCalled();
    await act(async () =>
      input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
    );
    expect(onCommit).toHaveBeenCalledWith(2222);
  });

  it('restores an empty draft and clamps zero to the canonical minimum', async () => {
    await act(async () => input().focus());
    await enter('');
    await act(async () => input().blur());
    expect(input().value).toBe('1000');
    expect(onCommit).not.toHaveBeenCalled();

    await act(async () => input().focus());
    await enter('0');
    await act(async () => input().blur());
    expect(onCommit).toHaveBeenCalledWith(1);
  });
});
