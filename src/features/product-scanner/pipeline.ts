import type { CatalogProductSearchHit } from '@/features/global-catalog/contracts';
import { barcodeLookupCandidates, type ValidBarcode } from './barcode';
import type { ProductScanBudget, ProductScanResult } from './contracts';

export const DEFAULT_PRODUCT_SCAN_BUDGET: ProductScanBudget = {
  maxImages: 4,
  maxVisionCalls: 2,
  maxWebCalls: 1,
};

export type ProductScanNextStep =
  | { kind: 'existing_product'; product: CatalogProductSearchHit }
  | { kind: 'vision'; accurateRetryAllowed: boolean }
  | { kind: 'request_evidence'; fields: string[] }
  | { kind: 'review'; result: ProductScanResult }
  | { kind: 'blocked'; reason: string };

export function exactBarcodeMatch(
  barcode: ValidBarcode,
  candidates: readonly CatalogProductSearchHit[],
): CatalogProductSearchHit | null {
  const lookups = new Set(barcodeLookupCandidates(barcode));
  return candidates.find((candidate) => candidate.eans.some((ean) => lookups.has(ean))) ?? null;
}

export function nextProductScanStep(input: {
  barcode: ValidBarcode | null;
  barcodeCandidates: readonly CatalogProductSearchHit[];
  imageCount: number;
  visionCalls: number;
  result: ProductScanResult | null;
  missingCriticalFields: readonly string[];
  budget?: ProductScanBudget;
}): ProductScanNextStep {
  const budget = input.budget ?? DEFAULT_PRODUCT_SCAN_BUDGET;
  if (input.imageCount > budget.maxImages)
    return { kind: 'blocked', reason: 'image_limit_exceeded' };
  if (input.barcode) {
    const exact = exactBarcodeMatch(input.barcode, input.barcodeCandidates);
    if (exact) return { kind: 'existing_product', product: exact };
  }
  if (!input.result && input.imageCount > 0 && input.visionCalls < budget.maxVisionCalls) {
    return { kind: 'vision', accurateRetryAllowed: input.visionCalls + 1 < budget.maxVisionCalls };
  }
  if (input.result && input.missingCriticalFields.length > 0) {
    return { kind: 'request_evidence', fields: [...input.missingCriticalFields] };
  }
  if (input.result) return { kind: 'review', result: input.result };
  return { kind: 'blocked', reason: 'evidence_required' };
}

export function nextEvidencePrompt(missing: readonly string[]): string {
  const fields = new Set(missing);
  if (fields.has('allergen_confirmation'))
    return 'Nie udało się potwierdzić osobnej deklaracji alergenów.';
  if ([...fields].some((field) => field.startsWith('nutrition')))
    return 'Dodaj wyraźne zdjęcie tabeli odżywczej.';
  if (fields.has('ingredientsText') || fields.has('allergensText'))
    return 'Dodaj wyraźne zdjęcie składu i alergenów.';
  if (fields.has('product_identity') || fields.has('brand_or_unbranded'))
    return 'Dodaj zdjęcie przodu opakowania.';
  if (fields.has('barcode')) return 'Dodaj zdjęcie kodu kreskowego.';
  return 'Dodaj wyraźniejsze zdjęcie brakującej części etykiety.';
}
