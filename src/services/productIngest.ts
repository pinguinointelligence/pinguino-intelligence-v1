import type { CatalogSubmissionResult } from '@/features/global-catalog/contracts';
import { supabase } from '@/lib/supabase/client';
import type { ProductInsert, ProductSourceType } from '@/data/products/productRow';

const UNAVAILABLE = 'Product intake is not available in this build.';

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
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
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
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
  operation?: 'upsert' | 'retire' | 'bind_intimport_mapper';
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
  /**
   * The server replayed a previous ingest for this idempotency key rather than
   * doing the work again. The snapshot it returns is the ORIGINAL one, so its
   * `kind` still says `created` — this flag is the only thing that distinguishes
   * "created now" from "created earlier and returned again". Ignoring it makes a
   * re-import look like fresh creation when nothing was created.
   */
  idempotent?: boolean;
  productVersionId: string | null;
  behaviorBindingId: string | null;
  ingestEventId: string | null;
  productCode?: string | null;
}

const sourceFromLegacyProduct = (source: ProductSourceType | undefined): ProductIngestSource => {
  switch (source) {
    case 'label_scan':
      return 'ocr';
    case 'barcode_ean':
      return 'barcode';
    case 'catalog_import':
    case 'colin_catalog':
      return 'catalog_import';
    case 'mercadona':
      return 'retailer_feed';
    case 'api':
      return 'future_integration';
    case 'customer_upload':
      return 'spreadsheet';
    case 'manual':
    default:
      return 'manual';
  }
};

function reviewedAuditValue(extracted: Record<string, unknown>, key: string): string | null {
  if (!Array.isArray(extracted.fields)) return null;
  const field = extracted.fields.find(
    (entry): entry is Record<string, unknown> =>
      typeof entry === 'object' &&
      entry !== null &&
      (entry as Record<string, unknown>).fieldKey === key,
  );
  if (!field || field.reviewStatus === 'marked_unknown') return null;
  if (field.reviewStatus === 'edited') {
    return typeof field.editedValue === 'string' && field.editedValue.trim() !== ''
      ? field.editedValue.trim()
      : null;
  }
  if (field.reviewStatus !== 'confirmed' && field.reviewStatus !== 'auto_accepted') return null;
  if (!Array.isArray(field.candidates)) return null;
  const selected =
    typeof field.chosenCandidate === 'number'
      ? field.candidates[field.chosenCandidate]
      : field.candidates.length === 1
        ? field.candidates[0]
        : null;
  if (!selected || typeof selected !== 'object') return null;
  const candidate = selected as Record<string, unknown>;
  const value = candidate.normalized ?? candidate.extractedRaw;
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function textArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
    : [];
}

export function canonicalIngestFromLegacyProduct(
  input: ProductInsert,
): Pick<ProductIngestRequest, 'source' | 'input' | 'privateOverlay'> {
  const extracted =
    typeof input.extracted_json === 'object' && input.extracted_json !== null
      ? (input.extracted_json as Record<string, unknown>)
      : {};
  const nutritionBasis =
    extracted.basis === 'per_100g' || extracted.basis === 'per_100ml' ? extracted.basis : null;
  const nutritionValues = {
    energyKcal: input.kcal_per_100g ?? null,
    fat: input.fat_percent ?? null,
    saturatedFat: input.saturated_fat_percent ?? null,
    carbohydrate: input.carbohydrate_percent ?? null,
    sugars: input.total_sugars_percent ?? null,
    protein: input.protein_percent ?? null,
    salt: input.salt_percent ?? null,
    fibre: input.fiber_percent ?? null,
  };
  const nutrition =
    nutritionBasis !== null && Object.values(nutritionValues).some((value) => value !== null)
      ? { basis: nutritionBasis, ...nutritionValues }
      : null;
  const ingredientsText =
    typeof extracted.ingredientsText === 'string'
      ? extracted.ingredientsText
      : reviewedAuditValue(extracted, 'ingredients_text');
  const allergensText =
    input.allergens ??
    (typeof extracted.allergensText === 'string'
      ? extracted.allergensText
      : reviewedAuditValue(extracted, 'allergens_text'));
  const mayContainText =
    typeof extracted.mayContainText === 'string'
      ? extracted.mayContainText
      : reviewedAuditValue(extracted, 'may_contain_text');
  const labelLanguages = textArray(extracted.labelLanguages);
  const productIntelligence =
    typeof extracted.productIntelligence === 'object' && extracted.productIntelligence !== null
      ? (extracted.productIntelligence as Record<string, unknown>)
      : {};
  const intimportProposal =
    typeof productIntelligence.intimportWholeProfileProposal === 'object' &&
    productIntelligence.intimportWholeProfileProposal !== null
      ? (productIntelligence.intimportWholeProfileProposal as Record<string, unknown>)
      : {};
  const proposedMapperIngredientId =
    typeof intimportProposal.mapperIngredientId === 'string'
      ? intimportProposal.mapperIngredientId
      : null;
  const intimportMatchInput =
    typeof intimportProposal.matchInput === 'object' && intimportProposal.matchInput !== null
      ? intimportProposal.matchInput
      : null;
  const isIntimport = input.source_type === 'catalog_import' && input.catalog_source === 'INTIMPORT';
  const catalogImportIdentity =
    isIntimport && intimportMatchInput
      ? {
          system: 'INTIMPORT',
          sourceProductId:
            typeof intimportProposal.sourceProductId === 'string'
              ? intimportProposal.sourceProductId
              : null,
          matchInput: intimportMatchInput,
        }
      : null;
  return {
    source: sourceFromLegacyProduct(input.source_type),
    input: {
      productKind:
        extracted.productKind === 'internal_subproduct'
          ? 'internal_subproduct'
          : 'commercial_product',
      displayName: input.product_name_display ?? null,
      originalName: input.product_name_internal ?? null,
      originalLanguage: extracted.originalLanguage ?? labelLanguages[0] ?? null,
      brand: input.brand ?? null,
      explicitlyUnbranded: extracted.explicitlyUnbranded === true,
      canonicalFamily: null,
      category: input.product_category ?? null,
      countryOfOrigin: input.country ?? null,
      ean: input.ean_code ?? null,
      barcode: input.barcode ?? null,
      provenance: input.source_type ?? 'manual',
      ...(isIntimport && proposedMapperIngredientId
        ? {
            intimportWholeProfileProposal: {
              mapperIngredientId: proposedMapperIngredientId,
            },
          }
        : {}),
      facts: {
        packageSize: input.package_size ?? null,
        allergensText,
        ingredientsText,
        mayContainAllergens: mayContainText
          ? [
              ...new Set(
                mayContainText
                  .split(/[,;/]/)
                  .map((entry) => entry.trim())
                  .filter(Boolean),
              ),
            ]
          : [],
        labelLanguages,
        nutrition,
        technicalComposition: {
          water: input.water_percent ?? null,
          totalSolids: input.total_solids_percent ?? null,
          fat: input.fat_percent ?? null,
          saturatedFat: input.saturated_fat_percent ?? null,
          milkFat: input.milk_fat_percent ?? null,
          nonFatMilkSolids: input.non_fat_milk_solids_percent ?? null,
          protein: input.protein_percent ?? null,
          aeratingProtein: input.aerating_protein_percent ?? null,
          carbohydrate: input.carbohydrate_percent ?? null,
          sugars: input.total_sugars_percent ?? null,
          sucrose: input.sucrose_percent ?? null,
          dextrose: input.dextrose_percent ?? null,
          glucose: input.glucose_percent ?? null,
          fructose: input.fructose_percent ?? null,
          lactose: input.lactose_percent ?? null,
          polyols: input.polyol_percent ?? null,
          fibre: input.fiber_percent ?? null,
          salt: input.salt_percent ?? null,
          alcohol: input.alcohol_percent ?? null,
        },
        vegan: input.vegan ?? null,
        dairyFree: input.dairy_free ?? null,
        glutenFree: input.gluten_free ?? null,
        ...(catalogImportIdentity ? { catalogImportIdentity } : {}),
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
  if (error) throw new Error(await functionErrorDetail(error));
  return data as ProductIngestResult;
}

/**
 * What the server actually said.
 *
 * supabase-js reports a refused Edge Function as „Edge Function returned a
 * non-2xx status code" and keeps the response on the error. That sentence names
 * neither the reason nor the fix, and it is the only thing the owner saw while
 * an import stopped on row 6 — the body underneath said
 * `product_ingest_preflight_failed`, which is an entirely different
 * conversation. Read the body; fall back only when there genuinely isn't one.
 */
export async function functionErrorDetail(error: unknown): Promise<string> {
  const fallback = error instanceof Error ? error.message : String(error);
  const context = (error as { context?: unknown }).context;
  if (!context || typeof (context as Response).clone !== 'function') return fallback;
  try {
    const body = await (context as Response).clone().json();
    const reason =
      typeof body === 'object' && body !== null
        ? ((body as Record<string, unknown>).error ??
          (body as Record<string, unknown>).message ??
          null)
        : null;
    const status = (context as Response).status;
    if (typeof reason === 'string' && reason !== '') return `${reason} (HTTP ${status})`;
    return fallback;
  } catch {
    return fallback;
  }
}
