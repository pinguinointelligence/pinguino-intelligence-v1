// @vitest-environment jsdom
/**
 * Scanner feedback as rendered (owner QA, 2026-09-05): the customer must see what the scanner is doing.
 * The capture is replaced by a stub that replays the engine's per-frame decisions; the flow's overlay
 * must turn them into plain guidance, a position hint, progress and a green confirmation state.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptureFrame, CaptureStatus, ScanCoreCaptureHandlers } from './scanCoreCapture';

vi.mock('@/services/scanImportV2', () => ({
  createScanImportV2AppPorts: () => null,
  getScanImportV2AccountId: async () => null,
}));
vi.mock('./scanCoreCapture', () => {
  class StubCapture {
    static supported() {
      return true;
    }
    static last: StubCapture | null = null;
    handlers: ScanCoreCaptureHandlers;
    constructor(handlers: ScanCoreCaptureHandlers) {
      this.handlers = handlers;
      StubCapture.last = this;
    }
    async start() {
      this.handlers.onStatus?.('live');
    }
    stop() {
      /* stub */
    }
  }
  return { ScanCoreCapture: StubCapture, describeCaptureError: () => 'no camera' };
});

import { ScanFlow } from './ScanFlow';

function frame(over: Partial<CaptureFrame>): CaptureFrame {
  return {
    state: 'SEARCHING',
    guidance: 'none',
    progress: 0,
    timedOut: false,
    sourceW: 1080,
    sourceH: 1920,
    roi: null,
    readingAxis: null,
    sharpRel: null,
    digits: null,
    zoomLevel: 1,
    torchOn: false,
    focusControl: 'unknown',
    formFactor: 'mobile',
    ...over,
  };
}

describe('ScanFlow — scanner feedback overlay', () => {
  let host: HTMLDivElement;
  let root: Root;
  const feedback = () =>
    host.querySelector('[data-testid="scan-flow-feedback"]')?.textContent ?? '';
  const capture = async () => {
    const mod = (await import('./scanCoreCapture')) as unknown as {
      ScanCoreCapture: { last: { handlers: ScanCoreCaptureHandlers } | null };
    };
    return mod.ScanCoreCapture.last!.handlers;
  };
  const emit = async (f: CaptureFrame) => {
    const h = await capture();
    await act(async () => {
      h.onFrame?.(f);
    });
  };
  const status = async (s: CaptureStatus) => {
    const h = await capture();
    await act(async () => {
      h.onStatus?.(s);
    });
  };

  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root.render(<ScanFlow mode="catalog" />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('tells the customer what the engine sees and asks for the right move', async () => {
    expect(feedback()).toContain('Szukam kodu…');
    await emit(frame({ state: 'FOUND', guidance: 'move_closer', progress: 0.1 }));
    expect(feedback()).toContain('Przybliż telefon do kodu');
    await emit(frame({ state: 'READING', guidance: 'move_away', progress: 0.4 }));
    expect(feedback()).toContain('Odsuń telefon od kodu');
    await emit(frame({ state: 'READING', guidance: 'improve_light', progress: 0.4 }));
    expect(feedback()).toContain('Potrzeba więcej światła');
    await emit(
      frame({
        state: 'READING',
        guidance: 'none',
        progress: 0.5,
        roi: { x: 0, y: 900, w: 200, h: 100 },
      }),
    );
    expect(feedback()).toContain('Przesuń telefon w lewo');
    await emit(frame({ state: 'HOLD', guidance: 'hold_steady', progress: 0.8, zoomLevel: 1.5 }));
    expect(feedback()).toContain('Trzymaj telefon nieruchomo');
    expect(feedback()).toContain('×1.5');
    await emit(frame({ state: 'READING', guidance: 'none', progress: 0.6, timedOut: true }));
    expect(feedback()).toMatch(/spróbuj bliżej/);
    await emit(frame({ state: 'LOST', guidance: 'none', progress: 0 }));
    expect(feedback()).toMatch(/Zgubiłem kod/);
  });

  it('shows a green confirmation with the code the moment Scan Core confirms it', async () => {
    await emit(frame({ state: 'COMPLETE', guidance: 'none', progress: 1 }));
    await status('confirmed');
    const h = await capture();
    await act(async () => {
      h.onConfirmed({
        symbology: 'EAN-13',
        value: '7340222800464',
        confirmation: { lane: 'fast', agreeingFrames: 2, sources: ['native'] },
        evidence: { moduleNative: 3, fill: 0.4, mixedFormats: false },
        timing: { firstSeenAt: 0, completedAt: 1 },
        provenance: { trackId: 't1', harnessBuild: null },
      });
    });
    const el = host.querySelector('[data-testid="scan-flow-feedback"]')!;
    expect(el.textContent).toContain('Odczytano ✓');
    expect(el.textContent).toContain('7340222800464');
    expect(el.className).toContain('bg-emerald-600');
  });

  it('desktop, fixed-focus camera: blur guidance says to move the product back and offers the photo fallback', async () => {
    await emit(
      frame({
        state: 'FOUND',
        guidance: 'hold_steady',
        progress: 0.1,
        sharpRel: 0.2,
        focusControl: 'unknown',
        formFactor: 'desktop',
        roi: { x: 300, y: 800, w: 500, h: 200 },
      }),
    );
    expect(feedback()).toContain('Obraz jest nieostry — odsuń produkt');
    await emit(
      frame({
        state: 'FOUND',
        guidance: 'move_closer',
        progress: 0.1,
        sharpRel: 0.2,
        focusControl: 'none',
        formFactor: 'desktop',
      }),
    );
    expect(feedback()).toContain('przybliżaj powoli');
  });

  it('a code held sideways for a while gets the rotation hint, and read digits are shown masked', async () => {
    await emit(
      frame({ state: 'READING', guidance: 'none', progress: 0.3, readingAxis: 'vertical' }),
    );
    await new Promise((r) => setTimeout(r, 1600));
    await emit(
      frame({ state: 'READING', guidance: 'none', progress: 0.3, readingAxis: 'vertical' }),
    );
    expect(feedback()).toContain('Obróć produkt lub telefon');
    await emit(
      frame({
        state: 'READING',
        guidance: 'none',
        progress: 0.5,
        digits: {
          digits: ['7', '3', null, null, null, null, null, null, '0', '0', '4', '6', '4'],
          stable: [
            true,
            true,
            false,
            false,
            false,
            false,
            false,
            false,
            true,
            true,
            true,
            true,
            true,
          ],
          reads: 2,
        },
      }),
    );
    expect(host.querySelector('[data-testid="scan-flow-digits"]')?.textContent).toBe(
      '73••••••00464',
    );
  });
});
