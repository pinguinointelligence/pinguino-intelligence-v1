// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfirmedScan } from '@/scan-contract/confirmedScan';

vi.mock('@/services/scanImportV2', async () => {
  const fakes = await import('@/scan-import-v2/__tests__/fakes');
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let releaseSameFirst!: () => void;
  const sameFirstGate = new Promise<void>((resolve) => {
    releaseSameFirst = resolve;
  });
  const p = fakes.ports();
  p.discovery = null;
  let sameEanCalls = 0;
  const sameEan = '8480000205599';
  const sameFirst = { ...fakes.HACENDADO, ean: sameEan, displayName: 'Pierwszy ten sam EAN' };
  const sameSecond = { ...fakes.HACENDADO, ean: sameEan, displayName: 'Drugi ten sam EAN' };
  p.catalog.exactByKeys = vi.fn(async (keys: readonly string[]) => {
    if (keys.includes(sameEan)) {
      sameEanCalls += 1;
      if (sameEanCalls === 1) await sameFirstGate;
      return [sameEanCalls === 1 ? sameFirst : sameSecond];
    }
    if (keys.includes(fakes.HACENDADO.ean)) {
      await firstGate;
      return [fakes.HACENDADO];
    }
    if (keys.includes(fakes.LACIATE.ean)) return [fakes.LACIATE];
    return [];
  });
  (globalThis as Record<string, unknown>)['__step17CrossEan'] = {
    releaseFirst,
    first: fakes.HACENDADO.ean,
    second: fakes.LACIATE.ean,
    sameEan,
    releaseSameFirst,
  };
  return {
    createScanImportV2AppPorts: () => p,
    getScanImportV2AccountId: async () => 'user-1',
  };
});

vi.mock('./scanCoreCapture', () => {
  class FakeCapture {
    static supported() {
      return true;
    }

    constructor(handlers: unknown) {
      (globalThis as Record<string, unknown>)['__step17CaptureHandlers'] = handlers;
    }

    async start() {}
    stop() {}
  }
  return { ScanCoreCapture: FakeCapture, describeCaptureError: () => 'camera error' };
});

import { ScanFlow } from './ScanFlow';

const scan = (value: string): ConfirmedScan => ({
  symbology: 'EAN-13',
  value,
  rawValue: value,
  confirmation: { lane: 'consensus', agreeingFrames: 2, sources: ['native'] },
  evidence: { moduleNative: null, fill: null, mixedFormats: false },
  timing: { firstSeenAt: 1, completedAt: 2 },
  provenance: { trackId: value, harnessBuild: null },
});

const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
};

describe('Scanner Runtime Step 1.7 current-scan authority', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('ST17-CROSS-EAN: EAN-1 completion cannot overwrite state after EAN-2 becomes current', async () => {
    await act(async () => root.render(<ScanFlow mode="catalog" />));
    await flush();
    const handlers = (globalThis as Record<string, unknown>)['__step17CaptureHandlers'] as {
      onConfirmed(scan: ConfirmedScan): void;
    };
    const state = (globalThis as Record<string, unknown>)['__step17CrossEan'] as {
      releaseFirst(): void;
      first: string;
      second: string;
    };

    await act(async () => {
      handlers.onConfirmed(scan(state.first));
      await Promise.resolve();
    });
    expect(host.textContent).toContain('Mamy to. Sprawdzam, co to za jeden.');
    expect(
      host.querySelector('[data-testid="scanner-status-story"]')?.getAttribute('data-gelato-level'),
    ).toBe('0');

    await act(async () => handlers.onConfirmed(scan(state.second)));
    await flush();
    expect(host.textContent).toContain('Łaciate');
    expect(host.textContent).not.toContain('Hacendado');

    state.releaseFirst();
    await flush();
    expect(host.textContent).toContain('Łaciate');
    expect(host.textContent).not.toContain('Hacendado');
  });

  it('ST17-SAME-EAN: a late completion cannot overwrite a newer run with the same barcode', async () => {
    await act(async () => root.render(<ScanFlow mode="catalog" />));
    await flush();
    const handlers = (globalThis as Record<string, unknown>)['__step17CaptureHandlers'] as {
      onConfirmed(scan: ConfirmedScan): void;
    };
    const state = (globalThis as Record<string, unknown>)['__step17CrossEan'] as {
      sameEan: string;
      releaseSameFirst(): void;
    };

    await act(async () => {
      handlers.onConfirmed(scan(state.sameEan));
      await Promise.resolve();
    });
    await act(async () => handlers.onConfirmed(scan(state.sameEan)));
    await flush();
    expect(host.textContent).toContain('Drugi ten sam EAN');

    state.releaseSameFirst();
    await flush();
    expect(host.textContent).toContain('Drugi ten sam EAN');
    expect(host.textContent).not.toContain('Pierwszy ten sam EAN');
  });
});
