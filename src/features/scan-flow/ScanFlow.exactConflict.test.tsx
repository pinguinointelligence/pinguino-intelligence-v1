// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfirmedScan } from '@/scan-contract/confirmedScan';
import {
  continueDiscovery,
  identifyCode,
  startDiscovery,
  type ScanImportV2Ports,
} from '@/scan-import-v2';
import { createSupabaseDiscoveryPort } from '@/scan-import-v2/adapters/supabaseDiscoveryAdapter';
import { ctx, HACENDADO, ports } from '@/scan-import-v2/__tests__/fakes';
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
const productIds = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const conflict = { kind: 'EXACT_CONFLICT', error: 'exact_product_conflict', productIds };
const identity = (ean = EAN) => {
  const result = identifyCode(manualConfirmedScan(ean)!);
  if (!result.ok) throw new Error('invalid fixture');
  return result.identity;
};
const ok = (data: unknown) => ({ data, error: null });
const http = (body: unknown, status = 409) => ({
  data: null,
  error: { message: 'network timeout', context: new Response(JSON.stringify(body), { status }) },
});
const existing = {
  kind: 'existing_product',
  product: {
    id: HACENDADO.productId,
    productCode: 'PR-1',
    displayName: HACENDADO.displayName,
    brand: HACENDADO.brand,
    currentVersionId: 'version-current',
    engineReady: true,
  },
};
const analyzed = {
  kind: 'ean_lookup',
  result: { identity: { displayName: 'Clásica café soluble', brand: 'Hacendado' } },
  missingCriticalFields: [],
};
const notReady = {
  kind: 'customer_product_not_ready',
  criticalGaps: ['MISSING_TOTAL_SOLIDS_PERCENT'],
  reasons: ['NO_SAFE_RESULT'],
  assessmentHash: 'assessment-1',
};

describe('Scanner 1.4 server conflict handoff (no live services)', () => {
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
  let rpc: ReturnType<
    typeof vi.fn<(name: string, args?: Record<string, unknown>) => Promise<ReturnType<typeof ok>>>
  >;
  let externalResearch: ReturnType<typeof vi.fn<() => Promise<unknown>>>;
  const capture = async (ean = EAN) => {
    await act(async () => {
      app.capture!(manualConfirmedScan(ean)!);
    });
  };
  const calls = (name: string) => invoke.mock.calls.filter(([n]) => n === name);
  const noFinalize = () => {
    expect(calls('product-scan-finalize')).toHaveLength(0);
    expect(p.importer.calls).toBe(0);
    expect(externalResearch).not.toHaveBeenCalled();
  };

  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    // Closed network-hint correction must remain effective for this path too.
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    p = ports();
    externalResearch = vi.fn(async () => null);
    p.external = { research: externalResearch };
    invoke = vi.fn(async () => http(conflict));
    rpc = vi.fn(async () => ok([]));
    p.discovery = createSupabaseDiscoveryPort(
      { functions: { invoke }, rpc },
      { newSessionId: () => '33333333-3333-4333-8333-333333333333' },
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

  it('S14-CONFLICT-01: HTTP 409 conflict is ambiguous, never researched', async () => {
    const result = await p.discovery!.research(identity(), ctx());
    expect(result.kind).toBe('ambiguous');
    expect(result).not.toHaveProperty('session');
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
    noFinalize();
  });

  it('S14-CONFLICT-02: adapter → discovery preserves candidate IDs and canonical identity without invented metadata', async () => {
    const code = identity();
    const result = await startDiscovery(code, ctx(), p.discovery!);
    expect(result).toEqual({
      kind: 'ambiguous',
      identity: code,
      candidates: productIds.map((productId) => ({ productId })),
    });
    expect(result).toMatchObject({ identity: { canonicalGtin13: EAN } });
    noFinalize();
  });

  it.each(['none', 'earlier_exact'])(
    'S14-CONFLICT-03: ScanFlow renders conflict after %s, without finalize or selecting/importing a candidate',
    async (prior) => {
      if (prior === 'earlier_exact') p.catalog.rows = [{ ...HACENDADO, ean: EAN }];
      await capture();
      expect(host.textContent).toContain('Kilka produktów ma ten sam kod');
      expect(host.textContent).not.toContain('Usługa skanera nie mogła');
      expect(host.textContent).not.toContain(scannerConnectionMessage);
      expect(host.querySelector('form')).toBeNull();
      expect(calls('product-scan-analyze')).toHaveLength(1);
      noFinalize();
    },
  );

  it('S14-CONFLICT-04: conflict needs no server session or session lookup', async () => {
    const result = await startDiscovery(identity(), ctx(), p.discovery!);
    expect(result.kind).toBe('ambiguous');
    expect(result).not.toHaveProperty('sessionId');
    expect(result).not.toHaveProperty('next');
    expect(invoke.mock.calls.map(([name]) => name)).toEqual(['product-scan-analyze']);
    // Only pre-existing request continuity, never a candidate/session query.
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['gellatti_my_product_requests_v1']);
    noFinalize();
  });

  it('S14-CONFLICT-02: label analyze preserves the same terminal conflict contract', async () => {
    const result = await continueDiscovery(
      {
        sessionId: 'existing-session',
        identity: identity(),
        result: analyzed.result,
        missingCritical: [],
        overlayState: null,
        usage: { visionCalls: 0, webCalls: 0 },
      },
      { type: 'label', images: [] },
      ctx(),
      p.discovery!,
    );
    expect(result).toEqual({
      kind: 'ambiguous',
      identity: identity(),
      candidates: productIds.map((productId) => ({ productId })),
    });
    noFinalize();
  });

  it('S14-CONFLICT-08: an existing skipped ean_lookup response retains its session and notice', async () => {
    invoke.mockResolvedValue(
      ok({
        ...analyzed,
        result: null,
        skipped: 'session_lookup_already_used',
        notice: 'Sprawdziliśmy już dostępne źródła.',
      }),
    );
    const result = await p.discovery!.research(identity(), ctx());
    expect(result).toMatchObject({
      kind: 'skipped',
      reason: 'session_lookup_already_used',
      notice: 'Sprawdziliśmy już dostępne źródła.',
      session: { result: null },
    });
    noFinalize();
  });

  it.each([
    undefined,
    null,
    [],
    [productIds[0]],
    [productIds[0], productIds[0]],
    [productIds[0], 'not-an-id'],
    [productIds[0], null],
  ])('S14-CONFLICT-05: malformed candidate identity %j fails closed', async (ids) => {
    invoke.mockImplementation(async () => http({ ...conflict, productIds: ids }));
    await expect(p.discovery!.research(identity(), ctx())).rejects.toMatchObject({
      kind: 'service',
      message: 'product-scan-analyze: malformed_exact_conflict',
    });
    await capture();
    expect(host.textContent).toContain('Usługa skanera nie mogła');
    expect(host.textContent).not.toContain(scannerConnectionMessage);
    noFinalize();
  });

  it.each([
    { kind: 'future_kind', result: {} },
    { kind: 'customer_product_not_ready', result: {} },
    { kind: 'family_confirmation_required' },
    { ...analyzed, error: 'unexpected_error' },
    { kind: 'ean_lookup' },
    { result: 'malformed' },
  ])(
    'S14-CONFLICT-06: analyze never accepts unknown/cross-endpoint/error/malformed bodies %j',
    async (body) => {
      for (const response of [http(body), ok(body)]) {
        invoke.mockResolvedValue(response);
        await capture();
        expect(host.textContent).toContain('Usługa skanera nie mogła');
        expect(host.textContent).not.toContain(scannerConnectionMessage);
        noFinalize();
      }
    },
  );

  it('S14-CONFLICT-05/06: malformed conflict cannot fall back to an earlier exact candidate', async () => {
    p.catalog.rows = [{ ...HACENDADO, ean: EAN }];
    invoke.mockImplementation(async () => http({ ...conflict, productIds: [] }));
    await capture();
    expect(host.textContent).toContain('Usługa skanera nie mogła');
    noFinalize();
  });

  it.each([
    ['customer_product_not_ready', 'not_ready'],
    ['scan_assessment_stale', 'assessment_stale'],
    ['assessment_stale', 'assessment_stale'],
    ['family_confirmation_required', 'family_confirmation_required'],
    ['profile_preview', 'not_ready'],
  ])('S14-CONFLICT-07: finalize HTTP 409 %s retains %s', async (kind, expected) => {
    invoke.mockImplementation(async () => http({ ...notReady, kind }));
    const result = await p.discovery!.finalize(
      {
        sessionId: 'existing-session',
        identity: identity(),
        result: analyzed.result,
        missingCritical: [],
        overlayState: null,
        usage: { visionCalls: 0, webCalls: 0 },
      },
      {},
      ctx(),
    );
    expect(result.kind).toBe(expected);
    expect(calls('product-scan-analyze')).toHaveLength(0);
    expect(calls('product-scan-finalize')).toHaveLength(1);
  });

  it('S14-CONFLICT-07: analyze conflict is not a finalize business response', async () => {
    await expect(
      p.discovery!.finalize(
        {
          sessionId: 'existing-session',
          identity: identity(),
          result: analyzed.result,
          missingCritical: [],
          overlayState: null,
          usage: { visionCalls: 0, webCalls: 0 },
        },
        {},
        ctx(),
      ),
    ).rejects.toThrow('exact_product_conflict');
  });

  it('S14-CONFLICT-08: authoritative absence/analyze ean_lookup still reaches research and automatic finalize', async () => {
    invoke.mockImplementation(async (name) =>
      name === 'product-scan-analyze' ? ok(analyzed) : http(notReady),
    );
    await capture();
    expect(host.textContent).toContain('Sucha masa produktu');
    expect(calls('product-scan-analyze')).toHaveLength(1);
    expect(calls('product-scan-finalize')).toHaveLength(1);
    expect(externalResearch).not.toHaveBeenCalled();
    expect(p.importer.calls).toBe(0);
  });

  it.each(['none', 'earlier_exact'])(
    'S14-CONFLICT-09: existing_product after %s retains current exact identity',
    async (prior) => {
      if (prior === 'earlier_exact') p.catalog.rows = [{ ...HACENDADO, ean: EAN }];
      invoke.mockResolvedValue(ok(existing));
      await capture();
      expect(host.textContent).toContain(HACENDADO.displayName);
      expect(host.textContent).not.toContain('Kilka produktów');
      expect(calls('product-scan-finalize')).toHaveLength(0);
      expect(calls('product-scan-analyze')).toHaveLength(1);
      expect(p.importer.calls).toBe(1);
    },
  );

  it.each(['same_ean', 'different_ean'])(
    'S14-CONFLICT-10: late conflict cannot replace a newer %s run',
    async (variant) => {
      let release!: (value: ReturnType<typeof http>) => void;
      invoke.mockReturnValueOnce(
        new Promise((resolve) => {
          release = resolve;
        }),
      );
      await capture();
      invoke.mockResolvedValue(ok(existing));
      await capture(variant === 'same_ean' ? EAN : HACENDADO.ean);
      expect(host.textContent).toContain(HACENDADO.displayName);
      await act(async () => {
        release(http(conflict));
      });
      expect(host.textContent).toContain(HACENDADO.displayName);
      expect(host.textContent).not.toContain('Kilka produktów');
      expect(calls('product-scan-finalize')).toHaveLength(0);
      expect(p.importer.calls).toBe(1);
    },
  );
});
