import type { ProductScanResult } from './contracts';

export type AutonomousScanAction =
  | { kind: 'existing_product' }
  | { kind: 'wait_for_image' }
  | { kind: 'ean_research' }
  | { kind: 'analyze_image'; accurateRetry: boolean; requestedFields?: string[] }
  | { kind: 'complete_profile' }
  | { kind: 'ready_for_customer' }
  | { kind: 'evidence_exhausted' };

export interface AutonomousScanState {
  exactProductFound: boolean;
  hasImage: boolean;
  barcode: string | null;
  eanLookupDone: boolean;
  visionCalls: number;
  missingCriticalFields: readonly string[];
  profilePreviewed: boolean;
  profileReady: boolean;
}

const PACKAGE_FIELDS = new Set([
  'barcode',
  'product_identity',
  'brand_or_unbranded',
  'nutrition',
  'nutrition_basis',
  'nutrition_energyKcal',
  'nutrition_fat',
  'nutrition_carbohydrate',
  'nutrition_sugars',
  'nutrition_protein',
  'nutrition_salt',
  'ingredientsText',
  'allergensText',
  'allergen_confirmation',
  'production_declarations',
]);

/** Only facts that can genuinely be re-read from the supplied package may spend
 * the single accurate pass. Engine/Mapper/ProductBehavior gaps never become a
 * photo loop. */
export function retryablePackageFields(fields: readonly string[]): string[] {
  return [...new Set(fields.filter((field) => PACKAGE_FIELDS.has(field)))];
}

/**
 * Pure goal-driven routing authority shared by the upload and camera paths.
 * Free exact identity work always wins, then one normal Vision pass, targeted
 * research, at most one precise re-read, and finally the shared product-owned
 * profile authority.
 */
export function nextAutonomousScanAction(state: AutonomousScanState): AutonomousScanAction {
  if (state.exactProductFound) return { kind: 'existing_product' };
  if (!state.hasImage) return { kind: 'wait_for_image' };
  if (state.barcode && !state.eanLookupDone) return { kind: 'ean_research' };
  if (state.visionCalls === 0) return { kind: 'analyze_image', accurateRetry: false };
  if (state.profilePreviewed) {
    return state.profileReady ? { kind: 'ready_for_customer' } : { kind: 'evidence_exhausted' };
  }
  const retryFields = retryablePackageFields(state.missingCriticalFields);
  if (state.visionCalls < 2 && retryFields.length > 0) {
    return { kind: 'analyze_image', accurateRetry: true, requestedFields: retryFields };
  }
  return { kind: 'complete_profile' };
}

/**
 * Pass only the locally validated exact identity into the finalizer. The rest
 * of the result is already server-owned session evidence. Re-sending Vision or
 * web values through `confirmations` would falsely relabel them as customer
 * confirmed and erase their real per-field provenance.
 */
export function productFieldsFromScanResult(
  _result: ProductScanResult,
  validatedBarcode: string,
): Record<string, unknown> {
  return { barcode: validatedBarcode };
}
