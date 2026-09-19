// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfirmedScan } from '@/scan-contract/confirmedScan';
import { NetworkError, type ScanImportV2Ports } from '@/scan-import-v2';
import { createSupabaseDiscoveryPort } from '@/scan-import-v2/adapters/supabaseDiscoveryAdapter';
import { ports, HACENDADO } from '@/scan-import-v2/__tests__/fakes';
import { manualConfirmedScan } from './scanFlowLogic';
import { scannerConnectionMessage } from './scannerStatusCopy';

const app = vi.hoisted(() => ({
  ports: null as ScanImportV2Ports | null,
  capture: null as ((scan: ConfirmedScan) => void) | null,
}));
vi.mock('@/services/scanImportV2', () => ({
  createScanImportV2AppPorts: () => app.ports,
  getScanImportV2AccountId: async () => 'user-1',
}));
vi.mock('./scanCoreCapture', () => ({
  ScanCoreCapture: class {
    static supported() {
      return true;
    }
    constructor(handlers: { onConfirmed(scan: ConfirmedScan): void }) {
      app.capture = handlers.onConfirmed;
    }
    async start() {}
    stop() {}
  },
  describeCaptureError: () => 'camera unavailable',
}));
import { ScanFlow } from './ScanFlow';

const EAN = '8480000110435';
const analyzed = {
  kind: 'ean_lookup',
  result: {
    identity: { displayName: 'Clásica café soluble', brand: 'Hacendado' },
    externalSources: [
      {
        sourceType: 'barcode_registry',
        sourceAuthorityClass: 'STRUCTURED_PRODUCT_DATABASE',
        sourceStatedEan: EAN,
        sourceEanConfirmationMethod: 'url',
        confidence: 0.95,
        url: `https://world.openfoodfacts.org/api/v2/product/${EAN}.json`,
        fieldsUsed: ['identity.displayName', 'identity.brand'],
      },
    ],
  },
  missingCriticalFields: [],
};
const notReady = {
  kind: 'customer_product_not_ready',
  criticalGaps: ['MISSING_TOTAL_SOLIDS_PERCENT'],
  reasons: ['NO_SAFE_RESULT'],
  assessmentHash: 'assessment-1',
};
const httpError = (status: number, body: unknown) => ({
  // Deliberately misleading text: a response status must win over message matching.
  message: 'network timeout',
  context: new Response(JSON.stringify(body), { status }),
});
const ok = (data: unknown) => ({ data, error: null });
const rejected = (error: { message: string }) => ({ data: null, error });

describe('Scanner explicit network attempt', () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let p: ReturnType<typeof ports>;
  let invoke: ReturnType<
    typeof vi.fn<
      (
        name: string,
        options: { body: unknown },
      ) => Promise<{
        data: unknown;
        error: { message: string } | null;
      }>
    >
  >;
  let newSessionId: ReturnType<typeof vi.fn<() => string>>;
  const button = (label: string) =>
    [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!;
  const settle = async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  };
  const capture = async (ean = EAN) => {
    await act(async () => {
      app.capture!(manualConfirmedScan(ean)!);
    });
    await settle();
  };
  const calls = (name: string) =>
    invoke.mock.calls.filter(([n]) => n === name).map(([, options]) => options.body);
  const typeValue = async (input: HTMLInputElement, value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    p = ports();
    newSessionId = vi.fn(() => 'network-session');
    invoke = vi.fn(async (name) =>
      name === 'product-scan-analyze' ? ok(analyzed) : rejected(httpError(409, notReady)),
    );
    p.discovery = createSupabaseDiscoveryPort(
      { functions: { invoke }, rpc: async () => ok([]) },
      { newSessionId },
    );
    app.ports = p;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root.render(<ScanFlow mode="catalog" />));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it.each(['manual', 'camera'])(
    'NET-01 %s: false browser hint still permits a successful exact request',
    async (entry) => {
      p.discovery = null;
      // The mounted component owns the same ports object.
      if (entry === 'camera') await capture(HACENDADO.ean);
      else {
        await typeValue(
          host.querySelector('input[aria-label="Kod kreskowy z opakowania"]')!,
          HACENDADO.ean,
        );
        await act(async () => button('Sprawdź').click());
        await settle();
      }
      expect(p.catalog.calls).toBe(1);
      expect(host.textContent).toContain('Hacendado');
      expect(host.textContent).not.toContain('Brak połączenia');
      expect(p.importer.calls).toBe(1);
    },
  );

  it('NET-02/NET-07: authoritative absence reaches one research and automatic finalize; missing data stays business data', async () => {
    await capture();
    expect(p.catalog.calls).toBe(1);
    expect(calls('product-scan-analyze')).toHaveLength(1);
    expect(calls('product-scan-finalize')).toHaveLength(1);
    expect(host.textContent).toContain('Sucha masa produktu');
    expect(host.textContent).not.toContain('Brak połączenia');
    expect(host.textContent).not.toContain(scannerConnectionMessage);
    expect(p.importer.calls).toBe(0);
  });

  it('NET-03: actual transport failure is neither absence nor success; retry retains the captured barcode', async () => {
    p.discovery = null;
    p.catalog.offline = true;
    await capture(HACENDADO.ean);
    expect(host.textContent).toContain(scannerConnectionMessage);
    expect(p.importer.calls).toBe(0);
    expect(invoke).not.toHaveBeenCalled();
    p.catalog.offline = false;
    await act(async () => button('Spróbuj ponownie').click());
    await settle();
    expect(host.textContent).toContain('Hacendado');
    expect(p.catalog.calls).toBe(2);
    expect(p.importer.calls).toBe(1);
  });

  it.each([401, 403, 500, 546])(
    'NET-04/NET-06: HTTP %s is a service response even with network text and a business-shaped body',
    async (status) => {
      invoke.mockImplementation(async () => rejected(httpError(status, notReady)));
      await capture();
      expect(host.textContent).toContain(
        status < 500 ? 'nie potwierdziła dostępu' : 'Usługa skanera nie mogła',
      );
      expect(host.textContent).not.toContain(scannerConnectionMessage);
      expect(host.textContent).not.toContain('Brak połączenia');
      expect(calls('product-scan-analyze')).toHaveLength(1);
      expect(calls('product-scan-finalize')).toHaveLength(0);
      expect(p.importer.calls).toBe(0);
    },
  );

  it.each(['customer_product_not_ready', 'scan_assessment_stale'])(
    'NET-05: HTTP 409 %s retains its structured contract',
    async (kind) => {
      invoke.mockImplementation(async (name) =>
        name === 'product-scan-analyze'
          ? ok(analyzed)
          : rejected(httpError(409, { ...notReady, kind })),
      );
      await capture();
      expect(calls('product-scan-finalize')).toHaveLength(1);
      expect(host.querySelector('form')).not.toBeNull();
      expect(host.textContent).not.toContain(scannerConnectionMessage);
      expect(host.textContent).not.toContain('Usługa skanera nie mogła');
      expect(p.importer.calls).toBe(0);
    },
  );

  it.each([null, [], 'not JSON', {}, { error: 'provider_network_timeout' }])(
    'NET-06 malformed payload %j is a service error, never absence or offline',
    async (data) => {
      invoke.mockResolvedValue(ok(data));
      await capture();
      expect(host.textContent).toContain('Usługa skanera nie mogła');
      expect(host.textContent).not.toContain(scannerConnectionMessage);
      expect(calls('product-scan-finalize')).toHaveLength(0);
      expect(p.importer.calls).toBe(0);
    },
  );

  it('NET-09a: an explicit retry resumes failed research in the same session; prefetch and pipeline share each attempt', async () => {
    invoke.mockResolvedValueOnce(rejected(new NetworkError('Failed to fetch')));
    await capture();
    expect(calls('product-scan-analyze')).toHaveLength(1);
    expect(calls('product-scan-finalize')).toHaveLength(0);
    await act(async () => button('Spróbuj ponownie').click());
    await settle();
    expect(calls('product-scan-analyze')).toHaveLength(2);
    expect(calls('product-scan-analyze')[1]).toEqual(calls('product-scan-analyze')[0]);
    expect(newSessionId).toHaveBeenCalledTimes(1);
    expect(calls('product-scan-finalize')).toHaveLength(1);
    expect(host.textContent).toContain('Sucha masa produktu');
  });

  it('NET-09b: finalize retry preserves session, entered values and assessment input without replaying research', async () => {
    await capture();
    const solids = [...host.querySelectorAll('label')]
      .find((l) => l.textContent?.includes('Sucha masa produktu'))!
      .querySelector('input')!;
    await typeValue(solids, '95');
    invoke.mockResolvedValueOnce(rejected(new NetworkError('Failed to fetch')));
    await act(async () => button('Zapisz jako mój produkt').click());
    await settle();
    expect(host.textContent).toContain(scannerConnectionMessage);
    await act(async () => {
      const retry = button('Spróbuj ponownie');
      retry.click();
      retry.click();
    });
    await settle();
    expect(calls('product-scan-analyze')).toHaveLength(1);
    expect(calls('product-scan-finalize')).toHaveLength(3); // initial assessment, failed save, one explicit retry
    expect(calls('product-scan-finalize')[2]).toEqual(calls('product-scan-finalize')[1]);
    expect(newSessionId).toHaveBeenCalledTimes(1);
    const restored = [...host.querySelectorAll('label')]
      .find((l) => l.textContent?.includes('Sucha masa produktu'))!
      .querySelector('input')!;
    expect(restored.value).toBe('95');
    expect(host.textContent).toContain('Clásica café soluble');
  });
});
