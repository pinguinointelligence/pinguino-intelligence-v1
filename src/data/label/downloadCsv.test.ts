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

  /**
   * The saved PDF is named after the batch. Which title the browser reads depends on the
   * engine — Chrome takes the top document's, WebKit and the macOS print panel take the
   * printed frame's — and a label came out as the application's name under one and „bez
   * tytułu" under the other. Both are set, and the host's own title is given back.
   */
  it('names the printout on both documents and restores the host title', async () => {
    const hostTitle = 'GELLATTI — FRIENDLY LAB';
    document.title = hostTitle;
    const name = 'LOT 20260919-B14E0C9B5A — Banana · Fresh Fruit Gelato — 2026-09-19';

    const printing = printLabelHtml('<!doctype html><html><body>LOT-ONE</body></html>', name);
    const frame = document.querySelector<HTMLIFrameElement>(
      '[data-testid="label-native-print-frame"]',
    )!;
    const seen: { host: string; frame: string | undefined } = { host: '', frame: undefined };
    Object.defineProperty(frame.contentWindow, 'print', {
      configurable: true,
      value: () => {
        seen.host = document.title;
        seen.frame = frame.contentDocument?.title;
      },
    });
    frame.dispatchEvent(new Event('load'));
    await printing;

    expect(seen.host).toBe(name);
    expect(seen.frame).toBe(name);

    frame.contentWindow?.dispatchEvent(new Event('afterprint'));
    expect(document.title).toBe(hostTitle);
  });

  it('gives the host title back even when printing throws', async () => {
    const hostTitle = 'GELLATTI — FRIENDLY LAB';
    document.title = hostTitle;

    const printing = printLabelHtml('<!doctype html><html><body>LOT-ONE</body></html>', 'LOT 1');
    const frame = document.querySelector<HTMLIFrameElement>(
      '[data-testid="label-native-print-frame"]',
    )!;
    Object.defineProperty(frame.contentWindow, 'print', {
      configurable: true,
      value: () => {
        throw new Error('no printer');
      },
    });
    frame.dispatchEvent(new Event('load'));

    await expect(printing).rejects.toThrow('no printer');
    expect(document.title).toBe(hostTitle);
    expect(document.body.contains(frame)).toBe(false);
  });

  it('leaves both titles alone when the caller names nothing', async () => {
    const hostTitle = 'GELLATTI — FRIENDLY LAB';
    document.title = hostTitle;

    const printing = printLabelHtml('<!doctype html><html><body>LOT-ONE</body></html>');
    const frame = document.querySelector<HTMLIFrameElement>(
      '[data-testid="label-native-print-frame"]',
    )!;
    let seenHost = '';
    Object.defineProperty(frame.contentWindow, 'print', {
      configurable: true,
      value: () => {
        seenHost = document.title;
      },
    });
    frame.dispatchEvent(new Event('load'));
    await printing;

    expect(seenHost).toBe(hostTitle);
    expect(document.title).toBe(hostTitle);
  });
});
