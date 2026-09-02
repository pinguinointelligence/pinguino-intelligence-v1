/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeProductPickerForPointer } from './productPickerBackdrop';

describe('ProductPickerPopover backdrop interaction', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('closes the picker and replays one PI click when the pointer is over the workbar control', () => {
    const pi = document.createElement('button');
    pi.dataset.testid = 'pro-workbar-recalc';
    document.body.append(pi);
    const onPi = vi.fn();
    const close = vi.fn();
    pi.addEventListener('click', onPi);
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: () => [pi],
    });

    const replayed = closeProductPickerForPointer(
      { clientX: 10, clientY: 20 },
      close,
      (callback) => callback(),
    );

    expect(replayed).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
    expect(onPi).toHaveBeenCalledTimes(1);
  });

  it('keeps an ordinary backdrop pointer close-only and never replays a disabled PI control', () => {
    const backdrop = document.createElement('div');
    const pi = document.createElement('button');
    pi.dataset.testid = 'pro-workbar-recalc';
    pi.disabled = true;
    document.body.append(backdrop, pi);
    const onPi = vi.fn();
    const close = vi.fn();
    pi.addEventListener('click', onPi);

    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: () => [backdrop],
    });
    expect(closeProductPickerForPointer({ clientX: 0, clientY: 0 }, close)).toBe(false);

    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: () => [pi],
    });
    expect(closeProductPickerForPointer({ clientX: 1, clientY: 1 }, close)).toBe(false);
    expect(close).toHaveBeenCalledTimes(2);
    expect(onPi).not.toHaveBeenCalled();
  });
});
