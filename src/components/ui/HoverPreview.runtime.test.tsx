// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HoverPreview } from './HoverPreview';

describe('HoverPreview edge alignment', () => {
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

  it('anchors an end-aligned compact preview inward from the trigger', async () => {
    await act(async () => {
      root.render(
        <HoverPreview text="Moja cena · Bazowa: 0,97 EUR/kg" focusable align="end" maxWidthPx={224}>
          <span>●</span>
        </HoverPreview>,
      );
    });
    const trigger = host.querySelector<HTMLElement>('[data-hover-preview="true"]')!;
    trigger.getBoundingClientRect = () =>
      ({ left: 732, right: 748, top: 90, bottom: 106, width: 16, height: 16 }) as DOMRect;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });

    await act(async () => trigger.focus());

    const tooltip = document.querySelector<HTMLElement>('[role="tooltip"]');
    expect(tooltip?.textContent).toBe('Moja cena · Bazowa: 0,97 EUR/kg');
    expect(tooltip?.style.right).toBe('532px');
    expect(tooltip?.style.left).toBe('');
    expect(tooltip?.style.maxWidth).toContain('224px');
  });
});
