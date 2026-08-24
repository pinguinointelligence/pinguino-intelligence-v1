import { supabase } from '@/lib/supabase/client';
import { searchProducts } from '@/services/globalCatalog';
import { barcodeLookupCandidates, type ValidBarcode } from '@/features/product-scanner/barcode';
import {
  classifyScannerError,
  type ScannerError,
  type ScannerErrorCode,
  type ScannerStage,
} from '@/features/product-scanner/scannerErrors';
import type {
  ProductScanOverlayState,
  ProductScanResult,
} from '@/features/product-scanner/contracts';
import type { CarbonationStatus } from '@/data/products/carbonation';

const UNAVAILABLE = 'Skaner produktu nie jest dostępny w tej konfiguracji.';

/**
 * Every scanner failure leaves this module as a CLASSIFIED error (owner defect v1.4). `message` is
 * the Polish, actionable copy the UI renders; the transport/server text lives in `diagnostic` and
 * goes to the console only. `finalizeProductScan` used to `throw new Error(error.message)`, which
 * is how „Edge Function returned a non-2xx status code" reached the owner's screen.
 */
export class ProductScannerServiceError extends Error {
  readonly visionCalls: number;
  readonly code: ScannerErrorCode;
  readonly stage: ScannerStage;
  readonly analysisRetained: boolean;
  readonly diagnostic: string;
  constructor(scannerError: ScannerError, stage: ScannerStage, visionCalls = 0) {
    super(scannerError.messagePl);
    this.name = 'ProductScannerServiceError';
    this.visionCalls = visionCalls;
    this.code = scannerError.code;
    this.stage = stage;
    this.analysisRetained = scannerError.analysisRetained;
    this.diagnostic = scannerError.diagnostic;
  }
}

/** The function's own JSON body (typed `error` code + usage), when it returned one. */
async function readFunctionFailure(
  error: unknown,
): Promise<{ serverCode: string | null; visionCalls: number; networkFailure: boolean }> {
  const context = (error as { context?: unknown }).context;
  if (!(context instanceof Response)) {
    // No HTTP response at all → fetch/relay failure, not a server verdict.
    const name = (error as { name?: unknown }).name;
    return {
      serverCode: null,
      visionCalls: 0,
      networkFailure: name === 'FunctionsFetchError' || name === 'FunctionsRelayError',
    };
  }
  try {
    const payload = (await context.clone().json()) as Record<string, unknown>;
    const usage = payload.usage as { visionCalls?: unknown } | undefined;
    return {
      serverCode: typeof payload.error === 'string' ? payload.error : null,
      visionCalls: typeof usage?.visionCalls === 'number' ? usage.visionCalls : 0,
      networkFailure: false,
    };
  } catch {
    return { serverCode: null, visionCalls: 0, networkFailure: false };
  }
}

function reportScannerDiagnostic(scannerError: ScannerError): void {
  // Diagnostics stay in the console/telemetry boundary — never in user copy.
  console.warn(`[PINGÜINO] product scanner failure — ${scannerError.diagnostic}`);
}

export async function lookupExactBarcode(barcode: ValidBarcode) {
  const lookups = barcodeLookupCandidates(barcode);
  const rows = (
    await Promise.all(
      lookups.map((query) =>
        searchProducts({ query, context: 'TOPPING', marketScope: 'global', limit: 20 }),
      ),
    )
  ).flat();
  return rows.find((row) => row.eans.some((ean) => lookups.includes(ean))) ?? null;
}

export interface ScanAnalysisResponse {
  sessionId: string;
  result: ProductScanResult;
  overlayState: ProductScanOverlayState;
  missingCriticalFields: string[];
  usage: { visionCalls: number; webCalls: number; estimatedCostUsd: number };
}

export interface ScanEanLookupResponse {
  sessionId: string;
  kind: 'ean_lookup';
  /** The lookup ran and found nothing usable. Not an error — the scan continues. */
  resolvedNothing?: boolean;
  providerUnavailable?: boolean;
  /** Why the lookup was not run at all (already used this session, no barcode). */
  skipped?: string;
  result: ProductScanResult | null;
  overlayState: ProductScanOverlayState | null;
  missingCriticalFields: string[];
  usage: { visionCalls: number; webCalls: number; estimatedCostUsd: number };
}

export interface ScanExactMatchResponse {
  sessionId: string;
  kind: 'existing_product';
  product: ScanExactProduct;
  usage: { visionCalls: 0; webCalls: 0; estimatedCostUsd: 0 };
}

export interface ScanExactProduct {
  id: string;
  displayName: string;
  brand: string | null;
  entityKind: 'pi_base' | 'commercial_product';
  status: 'pi_base' | 'verified' | 'manual_unverified' | 'blocked';
  carbonationStatus?: CarbonationStatus;
}

/**
 * Ask the barcode's own source BEFORE asking the owner to turn the package around.
 *
 * This is a distinct server mode, not a flag on the analysis: it reads no photograph,
 * spends no analysis allowance, and reaches the external source through the dedicated
 * server-side provider path with its own caps. The Scanner's general web search stays
 * off (§6).
 */
export async function lookupExactBarcodeFacts(input: {
  sessionId: string;
  barcode: ValidBarcode;
}): Promise<ScanEanLookupResponse | ScanExactMatchResponse> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const { data, error } = await supabase.functions.invoke('product-scan-analyze', {
    body: { sessionId: input.sessionId, mode: 'ean_lookup', images: [], barcode: input.barcode },
  });
  if (error || !data || typeof data !== 'object' || data.error) {
    const failure = error
      ? await readFunctionFailure(error)
      : { serverCode: null, visionCalls: 0, networkFailure: false };
    const scannerError = classifyScannerError({
      stage: 'analysis',
      serverCode: failure.serverCode ?? (typeof data?.error === 'string' ? data.error : null),
      rawMessage: error?.message ?? null,
      networkFailure: failure.networkFailure,
    });
    reportScannerDiagnostic(scannerError);
    // An unreachable source must never stop the scan; the caller continues locally.
    throw new ProductScannerServiceError(scannerError, 'analysis', failure.visionCalls);
  }
  return data as ScanEanLookupResponse | ScanExactMatchResponse;
}

export async function analyzeProductImages(input: {
  sessionId: string;
  images: Array<{
    assetId: string;
    mime: string;
    base64: string;
    source: 'camera_auto' | 'camera_manual' | 'gallery' | 'drop' | 'paste';
    originalMime: string;
    transformations: string[];
    qualityScore: number | null;
  }>;
  barcode: ValidBarcode | null;
  accurateRetry?: boolean;
  missingFields: string[];
}): Promise<ScanAnalysisResponse | ScanExactMatchResponse> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const { data, error } = await supabase.functions.invoke('product-scan-analyze', { body: input });
  if (error) {
    const failure = await readFunctionFailure(error);
    const scannerError = classifyScannerError({
      stage: 'analysis',
      serverCode: failure.serverCode,
      rawMessage: error.message,
      networkFailure: failure.networkFailure,
    });
    reportScannerDiagnostic(scannerError);
    throw new ProductScannerServiceError(scannerError, 'analysis', failure.visionCalls);
  }
  if (!data || typeof data !== 'object' || data.error) {
    const scannerError = classifyScannerError({
      stage: 'analysis',
      serverCode: typeof data?.error === 'string' ? data.error : null,
      rawMessage: null,
    });
    reportScannerDiagnostic(scannerError);
    throw new ProductScannerServiceError(
      scannerError,
      'analysis',
      typeof data?.usage?.visionCalls === 'number' ? data.usage.visionCalls : 0,
    );
  }
  return data as ScanAnalysisResponse | ScanExactMatchResponse;
}

export async function finalizeProductScan(input: {
  sessionId: string;
  idempotencyKey: string;
  confirmations?: {
    noAdditionalAllergenStatementVisible?: boolean;
    notOnLabelFields?: string[];
    productFields?: {
      nutrition: Record<string, number>;
      nutritionBasis: 'per_100g' | 'per_100ml' | null;
      ingredientsText: string | null;
      allergensText: string | null;
    };
  };
  privateOverlay: {
    price?: number | null;
    currency?: string | null;
    supplier?: string | null;
    notes?: string | null;
  };
}): Promise<Record<string, unknown>> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const { data, error } = await supabase.functions.invoke('product-scan-finalize', { body: input });
  if (error) {
    // THE owner leak: this branch used to be `throw new Error(error.message)`, and for a
    // FunctionsHttpError that message is literally „Edge Function returned a non-2xx status code".
    const failure = await readFunctionFailure(error);
    const scannerError = classifyScannerError({
      stage: 'save',
      serverCode: failure.serverCode,
      rawMessage: error.message,
      networkFailure: failure.networkFailure,
    });
    reportScannerDiagnostic(scannerError);
    throw new ProductScannerServiceError(scannerError, 'save');
  }
  if (!data || typeof data !== 'object' || data.error) {
    const scannerError = classifyScannerError({
      stage: 'save',
      serverCode: typeof data?.error === 'string' ? data.error : null,
      rawMessage: null,
    });
    reportScannerDiagnostic(scannerError);
    throw new ProductScannerServiceError(scannerError, 'save');
  }
  return data as Record<string, unknown>;
}
