/**
 * The scanner service never lets transport vocabulary out (owner v1.4).
 *
 * Replays the exact staging failure: `product-scan-finalize` answers HTTP 400 with
 * `{"error":"product_ingest_failed"}` and @supabase/supabase-js surfaces it as a
 * `FunctionsHttpError` whose `.message` is „Edge Function returned a non-2xx status code".
 * Before v1.4 that string was thrown verbatim and rendered under the owner's scan result.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@/lib/supabase/client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
  isSupabaseConfigured: true,
}));

const { analyzeProductImages, finalizeProductScan, ProductScannerServiceError } =
  await import('./productScanner');
const { SCANNER_ERROR_COPY } = await import('@/features/product-scanner/scannerErrors');
const { isRawInfrastructureMessage } = await import('./scannerErrorGuard');

const OWNER_LEAK = 'Edge Function returned a non-2xx status code';

/** What supabase-js hands back for a non-2xx function response. */
const httpError = (status: number, body: unknown) => ({
  data: null,
  error: Object.assign(new Error(OWNER_LEAK), {
    name: 'FunctionsHttpError',
    context: new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  }),
});

const FINALIZE_INPUT = {
  sessionId: '4c969b3f-fa89-46de-90fc-7802e66a21ed',
  idempotencyKey: '4c969b3f-fa89-46de-90fc-7802e66a21ed:create-v1',
  confirmations: { noAdditionalAllergenStatementVisible: true },
  privateOverlay: {},
};

beforeEach(() => {
  invoke.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('finalizeProductScan — the owner Cacao Puro failure', () => {
  it('throws user-safe Polish copy, never the SDK message', async () => {
    invoke.mockResolvedValue(httpError(400, { error: 'product_ingest_failed' }));

    await expect(finalizeProductScan(FINALIZE_INPUT)).rejects.toMatchObject({
      code: 'save_failed',
      message: SCANNER_ERROR_COPY.save_failed,
      analysisRetained: true,
    });
  });

  it('the thrown message contains no infrastructure vocabulary at all', async () => {
    invoke.mockResolvedValue(httpError(400, { error: 'product_ingest_failed' }));
    const caught = await finalizeProductScan(FINALIZE_INPUT).catch((error: unknown) => error);
    expect(caught).toBeInstanceOf(ProductScannerServiceError);
    const { message, diagnostic } = caught as InstanceType<typeof ProductScannerServiceError>;
    expect(message).not.toContain(OWNER_LEAK);
    expect(isRawInfrastructureMessage(message)).toBe(false);
    // …while the real cause is still recoverable for support.
    expect(diagnostic).toContain('product_ingest_failed');
    expect(diagnostic).toContain(OWNER_LEAK);
  });

  it('classifies a quota answer as a quota, not as a generic save failure', async () => {
    invoke.mockResolvedValue(
      httpError(429, { error: 'scanner_product_quota_reached', retryAt: null }),
    );
    await expect(finalizeProductScan(FINALIZE_INPUT)).rejects.toMatchObject({
      code: 'quota_reached',
    });
  });

  it('classifies a not-ready save as a state the user can resolve', async () => {
    invoke.mockResolvedValue(httpError(409, { error: 'scan_not_ready_for_creation' }));
    await expect(finalizeProductScan(FINALIZE_INPUT)).rejects.toMatchObject({
      code: 'save_not_ready',
      analysisRetained: true,
    });
  });

  it('stays safe when the function body is not JSON at all', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error(OWNER_LEAK), {
        name: 'FunctionsHttpError',
        context: new Response('<html>502 Bad Gateway</html>', { status: 502 }),
      }),
    });
    const caught = (await finalizeProductScan(FINALIZE_INPUT).catch(
      (error: unknown) => error,
    )) as Error;
    expect(isRawInfrastructureMessage(caught.message)).toBe(false);
    expect(caught.message).toBe(SCANNER_ERROR_COPY.save_failed);
  });

  it('reports a transport failure as a connection problem', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Failed to send a request to the Edge Function'), {
        name: 'FunctionsFetchError',
      }),
    });
    await expect(finalizeProductScan(FINALIZE_INPUT)).rejects.toMatchObject({
      code: 'connection',
    });
  });

  it('a successful save returns the payload untouched', async () => {
    invoke.mockResolvedValue({
      data: { kind: 'created', productId: 'p1', productCode: 'PR-ING-000001' },
      error: null,
    });
    await expect(finalizeProductScan(FINALIZE_INPUT)).resolves.toMatchObject({ kind: 'created' });
  });
});

describe('analyzeProductImages — the same gate on the analysis call', () => {
  const ANALYZE_INPUT = {
    sessionId: '4c969b3f-fa89-46de-90fc-7802e66a21ed',
    images: [],
    barcode: null,
    missingFields: [],
  };

  it('never surfaces the SDK message', async () => {
    invoke.mockResolvedValue(
      httpError(503, { error: 'scanner_provider_unavailable', usage: { visionCalls: 1 } }),
    );
    const caught = (await analyzeProductImages(ANALYZE_INPUT).catch(
      (error: unknown) => error,
    )) as InstanceType<typeof ProductScannerServiceError>;
    expect(caught.message).toBe(SCANNER_ERROR_COPY.analysis_failed);
    expect(isRawInfrastructureMessage(caught.message)).toBe(false);
    // The vision-call budget the server already spent is still reported back to the UI.
    expect(caught.visionCalls).toBe(1);
  });

  it('marks a failed analysis as NOT retaining analysis data', async () => {
    invoke.mockResolvedValue(httpError(503, { error: 'scanner_provider_unavailable' }));
    await expect(analyzeProductImages(ANALYZE_INPUT)).rejects.toMatchObject({
      analysisRetained: false,
    });
  });
});
