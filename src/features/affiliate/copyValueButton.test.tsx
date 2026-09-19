// @vitest-environment jsdom
/**
 * H-DASH-06 — the Partner area's copy button copies, says so, and changes
 * nothing when the clipboard refuses.
 */
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CopyValueButton } from './CopyValueButton';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const writeText = vi.fn<(text: string) => Promise<void>>();
let host: HTMLDivElement;
let root: Root;

const setClipboard = (clipboard: unknown) =>
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  writeText.mockReset().mockResolvedValue(undefined);
  setClipboard({ writeText });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

const render = (element: ReactElement) => act(() => root.render(element));
const button = () => host.querySelector('button') as HTMLButtonElement;
const click = () =>
  act(async () => {
    button().click();
  });

describe('CopyValueButton', () => {
  it('copies the value, says „Skopiowano", then shows its label again', async () => {
    render(<CopyValueButton value="KASIA1" label="Kopiuj kod" />);
    expect(button().textContent).toBe('Kopiuj kod');

    await click();
    expect(writeText).toHaveBeenCalledWith('KASIA1');
    expect(button().textContent).toBe('Skopiowano');

    act(() => {
      vi.advanceTimersByTime(1800);
    });
    expect(button().textContent).toBe('Kopiuj kod');
  });

  it('builds a function value at click time, never while rendering', async () => {
    const value = vi.fn(() => 'https://gellatti.com/kasia/kasia1');
    render(<CopyValueButton value={value} label="Kopiuj link" />);
    expect(value).not.toHaveBeenCalled();

    await click();
    expect(value).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('https://gellatti.com/kasia/kasia1');
  });

  it('a refused copy changes nothing', async () => {
    writeText.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    render(<CopyValueButton value="KASIA1" label="Kopiuj kod" />);

    await click();
    expect(button().textContent).toBe('Kopiuj kod');
  });

  it('no clipboard at all changes nothing either', async () => {
    setClipboard(undefined);
    render(<CopyValueButton value="KASIA1" label="Kopiuj kod" />);

    await click();
    expect(button().textContent).toBe('Kopiuj kod');
  });

  it('is a plain button, so it never submits a surrounding form', () => {
    render(<CopyValueButton value="KASIA1" label="Kopiuj kod" />);
    expect(button().type).toBe('button');
  });
});
