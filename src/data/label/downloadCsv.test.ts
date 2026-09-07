// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { printLabelHtml } from './downloadCsv';

describe('same-document native label printing', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('never opens about:blank and waits for the isolated document before print', async () => {
    const open = vi.spyOn(window, 'open');
    const printing = printLabelHtml('<!doctype html><html><body>LOT-ONE</body></html>');
    const frame = document.querySelector<HTMLIFrameElement>(
      '[data-testid="label-native-print-frame"]',
    )!;
    expect(frame).not.toBeNull();
    const print = vi.fn();
    Object.defineProperty(frame.contentWindow, 'print', { configurable: true, value: print });
    expect(print).not.toHaveBeenCalled();

    frame.dispatchEvent(new Event('load'));
    await printing;

    expect(open).not.toHaveBeenCalled();
    expect(print).toHaveBeenCalledTimes(1);
    expect(frame.srcdoc).toContain('LOT-ONE');
    frame.contentWindow?.dispatchEvent(new Event('afterprint'));
    expect(document.body.contains(frame)).toBe(false);
  });
});
