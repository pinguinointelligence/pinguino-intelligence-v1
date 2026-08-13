import type { CatalogSubmissionResult } from '@/features/global-catalog/contracts';
import { supabase } from '@/lib/supabase/client';
import type { ProductInsert, ProductSourceType } from '@/data/products/productRow';

const UNAVAILABLE = 'Product intake is not available in this build.';

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export async function productIngestIdempotencyKey(
  source: ProductIngestSource,
  input: Record<string, unknown>,
  scope = 'upsert',
): Promise<string> {
  const material = new TextEncoder().encode(stableJson({ source, scope, input }));
  const digest = await crypto.subtle.digest('SHA-256', material);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `product:${source}:${hex}`;
}

export type ProductIngestSource =
  | 'ocr'
  | 'barcode'
  | 'manual'
  | 'admin'
  | 'catalog_import'
  | 'spreadsheet'
  | 'retailer_feed'
  | 'supplier_specification'
  | 'shop'
  | 'franchise'
  | 'future_integration'
  | 'internal_subproduct';

export interface ProductIngestRequest {
  source: ProductIngestSource;
  idempotencyKey: string;
  /** Canonical public facts. The server normalizes and validates every field. */
  input: Record<string, unknown>;
  /** Evidence references or reviewed field evidence; never server permissions. */
  evidence?: Record<string, unknown>;
  /** Caller-private values. They are written only to the caller's relation row. */
  privateOverlay?: Record<string, unknown>;
  /** Existing canonical identity for an explicit correction/retirement. */
  productId?: string | null;
  operation?: 'upsert' | 'retire';
  ocrSessionId?: string | null;
  market?: string | null;
  retailer?: string | null;
  packageLanguage?: string | null;
  duplicateDecision?: 'same' | 'different' | null;
  distinguishingEvidence?: Record<string, unknown>;
  deviceSignal?: string | null;
  riskChallengeToken?: string | null;
  resumeBlocked?: boolean;
}

export interface ProductIngestResult extends CatalogSubmissionResult {
  productVersionId: string | null;
  behaviorBindingId: string | null;
  ingestEventId: string | null;
  productCode?: string | null;
}

const sourceFromLegacyProduct = (source: ProductSourceType | undefined): ProductIngestSource => {
  switch (source) {
    case 'label_scan': return 'ocr';
    case 'barcode_ean': return 'barcode';
    case 'catalog_import':
    case 'colin_catalog': return 'catalog_import';
    case 'mercadona': return 'retailer_feed';
    case 'api': return 'future_integration';
    case 'customer_upload': return 'spreadsheet';
    case 'manual':
    default: return 'manual';
  }
};

export function canonicalIngestFromLegacyProduct(input: ProductInsert): Pick<
  ProductIngestRequest,
  'source' | 'input' | 'privateOverlay'
> {
  const extracted = typeof input.extracted_json === 'object' && input.extracted_json !== null
    ? input.extracted_json as Record<string, unknown>
    : {};
  return {
    source: sourceFromLegacyProduct(input.source_type),
    input: {
      productKind: extracted.productKind === 'internal_subproduct' ? 'internal_subproduct' : 'commercial_product',
      displayName: input.product_name_display ?? null,
      originalName: input.product_name_internal ?? null,
      originalLanguage: extracted.originalLanguage ?? null,
      brand: input.brand ?? null,
      explicitlyUnbranded: extracted.explicitlyUnbranded === true,
      canonicalFamily: null,
      category: input.product_category ?? null,
      countryOfOrigin: input.country ?? null,
      ean: input.ean_code ?? null,
      barcode: input.barcode ?? null,
      provenance: input.source_type ?? 'manual',
      facts: {
        packageSize: input.package_size ?? null,
        waterPercent: input.water_percent ?? null,
        totalSolidsPercent: input.total_solids_percent ?? null,
        fatPercent: input.fat_percent ?? null,
        saturatedFatPercent: input.saturated_fat_percent ?? null,
        milkFatPercent: input.milk_fat_percent ?? null,
        nonFatMilkSolidsPercent: input.non_fat_milk_solids_percent ?? null,
        proteinPercent: input.protein_percent ?? null,
        aeratingProteinPercent: input.aerating_protein_percent ?? null,
        carbohydratePercent: input.carbohydrate_percent ?? null,
        sugarsPercent: input.total_sugars_percent ?? null,
        sucrosePercent: input.sucrose_percent ?? null,
        dextrosePercent: input.dextrose_percent ?? null,
        glucosePercent: input.glucose_percent ?? null,
        fructosePercent: input.fructose_percent ?? null,
        lactosePercent: input.lactose_percent ?? null,
        polyolPercent: input.polyol_percent ?? null,
        fibrePercent: input.fiber_percent ?? null,
        saltPercent: input.salt_percent ?? null,
        alcoholPercent: input.alcohol_percent ?? null,
        energyKcal: input.kcal_per_100g ?? null,
        allergensText: input.allergens ?? null,
        ingredientsText: extracted.ingredientsText ?? null,
        nutritionBasis: extracted.nutritionBasis ?? 'per_100g',
        vegan: input.vegan ?? null,
        dairyFree: input.dairy_free ?? null,
        glutenFree: input.gluten_free ?? null,
      },
    },
    privateOverlay: {
      privatePrice: input.cost_per_kg ?? null,
      currency: input.currency ?? null,
      supplier: input.supplier ?? null,
      notes: input.usage_notes ?? null,
    },
  };
}

/**
 * The only browser product-write adapter. `catalog-submit` authenticates the caller,
 * captures server-owned OCR evidence when applicable, and invokes exactly one
 * `ingest_product_v1` database transaction. Client code never chooses verification,
 * Mapper mapping, taxonomy, Main limits or behavior permissions.
 */
export async function ingestProduct(request: ProductIngestRequest): Promise<ProductIngestResult> {
  if (!supabase) throw new Error(UNAVAILABLE);
  if (!request.idempotencyKey.trim() || request.idempotencyKey.length > 160) {
    throw new Error('Invalid product ingest idempotency key.');
  }
  const { data, error } = await supabase.functions.invoke('catalog-submit', {
    body: {
      source: request.source,
      idempotencyKey: request.idempotencyKey,
      input: request.input,
      evidence: request.evidence ?? {},
      privateOverlay: request.privateOverlay ?? {},
      productId: request.productId ?? null,
      operation: request.operation ?? 'upsert',
      ocrSessionId: request.ocrSessionId ?? null,
      market: request.market ?? null,
      retailer: request.retailer ?? null,
      packageLanguage: request.packageLanguage ?? null,
      duplicateDecision: request.duplicateDecision ?? null,
      distinguishingEvidence: request.distinguishingEvidence ?? {},
      deviceSignal: request.deviceSignal ?? null,
      riskChallengeToken: request.riskChallengeToken ?? null,
      resumeBlocked: request.resumeBlocked === true,
    },
  });
  if (error) throw new Error(error.message);
  return data as ProductIngestResult;
}
