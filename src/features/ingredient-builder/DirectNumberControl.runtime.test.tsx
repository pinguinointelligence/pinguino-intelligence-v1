// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DirectNumberControl } from './DirectNumberControl';

describe('DirectNumberControl integrated lock runtime', () => {
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

  it('disables numeric editing while keeping the pressed lock segment operable', async () => {
    const onChange = vi.fn();
    const onToggle = vi.fn();
    await act(async () => {
      root.render(
        <DirectNumberControl
          value={10000}
          step={1}
          decimals={0}
          suffix="g"
          ariaLabel="Gramatura toppingu"
          onChange={onChange}
          testId="locked-grams"
          widthPreset="grams"
          disabled
          lockSegment={{
            pressed: true,
            ariaLabel: 'Odblokuj gramaturę toppingu',
            title: 'Gramatura zablokowana: 10000 g',
            suffix: 'g',
            onToggle,
            testId: 'locked-grams-toggle',
          }}
        />,
      );
    });

    const numericButtons = Array.from(
      host.querySelectorAll<HTMLButtonElement>('[aria-label^="Gramatura toppingu —"]'),
    );
    const input = host.querySelector<HTMLInputElement>('[role="spinbutton"]');
    const lock = host.querySelector<HTMLButtonElement>('[data-testid="locked-grams-toggle"]');

    expect(numericButtons).toHaveLength(2);
    expect(numericButtons.every((button) => button.disabled)).toBe(true);
    expect(input?.disabled).toBe(true);
    expect(lock?.disabled).toBe(false);
    expect(lock?.getAttribute('aria-pressed')).toBe('true');

    await act(async () => lock?.click());
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the lock segment on the native keyboard activation path', async () => {
    const onToggle = vi.fn();
    await act(async () => {
      root.render(
        <DirectNumberControl
          value={130}
          step={1}
          decimals={0}
          suffix="g"
          ariaLabel="Cream — ilość w g"
          onChange={() => undefined}
          testId="keyboard-grams"
          widthPreset="grams"
          lockSegment={{
            pressed: false,
            ariaLabel: 'Zablokuj gramy',
            title: 'Gramy odblokowane',
            suffix: 'g',
            onToggle,
            testId: 'keyboard-grams-toggle',
          }}
        />,
      );
    });

    const lock = host.querySelector<HTMLButtonElement>('[data-testid="keyboard-grams-toggle"]')!;
    lock.focus();
    expect(document.activeElement).toBe(lock);
    expect(lock.type).toBe('button');
    const enter = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    expect(lock.dispatchEvent(enter)).toBe(true);
    expect(enter.defaultPrevented).toBe(false);

    // jsdom does not synthesize the browser's click from Enter; invoke the native
    // activation it would emit after proving the component did not intercept it.
    await act(async () => lock.click());
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('publishes each valid topping draft before blur so sibling views cannot stay stale', async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <DirectNumberControl
          value={27}
          step={1}
          decimals={0}
          suffix="g"
          ariaLabel="Gramatura toppingu"
          onChange={onChange}
          testId="live-topping-grams"
          widthPreset="grams"
          publishValidDraft
        />,
      );
    });

    const input = host.querySelector<HTMLInputElement>('[role="spinbutton"]')!;
    const enter = async (value: string) => {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };

    await act(async () => input.focus());
    await enter('18');
    expect(input.value).toBe('18');
    expect(onChange).toHaveBeenLastCalledWith(18);
    expect(host.innerHTML).toContain('data-publish-valid-draft="true"');

    const callsBeforeBlur = onChange.mock.calls.length;
    await act(async () => input.blur());
    expect(onChange).toHaveBeenCalledTimes(callsBeforeBlur);
  });
});
