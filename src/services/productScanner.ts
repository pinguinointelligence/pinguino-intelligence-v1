import { supabase } from '@/lib/supabase/client';
import { searchProducts } from '@/services/globalCatalog';
import { barcodeLookupCandidates, type ValidBarcode } from '@/features/product-scanner/barcode';
import type {
  ProductScanOverlayState,
  ProductScanResult,
} from '@/features/product-scanner/contracts';

const UNAVAILABLE = 'Skaner produktu nie jest dostępny w tej konfiguracji.';

export class ProductScannerServiceError extends Error {
  readonly visionCalls: number;
  constructor(message: string, visionCalls = 0) {
    super(message);
    this.name = 'ProductScannerServiceError';
    this.visionCalls = visionCalls;
  }
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
  allowWeb?: boolean;
}): Promise<ScanAnalysisResponse | ScanExactMatchResponse> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const { data, error } = await supabase.functions.invoke('product-scan-analyze', { body: input });
  if (error) {
    const context = (error as { context?: unknown }).context;
    let payload: Record<string, unknown> = {};
    if (context instanceof Response) {
      try {
        payload = (await context.clone().json()) as Record<string, unknown>;
      } catch {
        payload = {};
      }
    }
    const usage = payload.usage as { visionCalls?: unknown } | undefined;
    throw new ProductScannerServiceError(
      typeof payload.error === 'string' ? payload.error : error.message,
      typeof usage?.visionCalls === 'number' ? usage.visionCalls : 0,
    );
  }
  if (!data || typeof data !== 'object' || data.error) {
    throw new ProductScannerServiceError(
      typeof data?.error === 'string' ? data.error : 'Nie udało się przeanalizować etykiety.',
      typeof data?.usage?.visionCalls === 'number' ? data.usage.visionCalls : 0,
    );
  }
  return data as ScanAnalysisResponse | ScanExactMatchResponse;
}

export async function finalizeProductScan(input: {
  sessionId: string;
  idempotencyKey: string;
  privateOverlay: {
    price?: number | null;
    currency?: string | null;
    supplier?: string | null;
    notes?: string | null;
  };
}): Promise<Record<string, unknown>> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const { data, error } = await supabase.functions.invoke('product-scan-finalize', { body: input });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== 'object' || data.error) {
    throw new Error(
      typeof data?.error === 'string' ? data.error : 'Nie udało się zapisać produktu.',
    );
  }
  return data as Record<string, unknown>;
}
