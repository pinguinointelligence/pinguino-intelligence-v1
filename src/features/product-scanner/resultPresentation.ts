/**
 * How a scan result is presented (owner defect v1.4) — PURE, no React, no SDK.
 *
 * Two display defects the owner screenshot showed:
 *
 *  1. „Opakowanie: PESO NETO 250 g" — the raw OCR label was rendered AS the package value. The
 *     analyzer already returns the structured pair (`netQuantity: 250`, `unit: 'g'`) alongside the
 *     verbatim `netQuantityText`, and `product-scan-finalize` already persists the normalized
 *     `facts.packageSize = "250 g"` with `facts.netQuantityText` kept separately. Only the screen
 *     conflated them, so the fix is presentational and provenance is not lost: the normalized value
 *     is the value, the label text stays visible as evidence.
 *
 *  2. The completeness badge printed the internal overlay enum (`USABLE_FOR_OWNER`, `SCAN_DRAFT`)
 *     at the user. Those states are the save contract, not product language.
 */
import type { ProductScanOverlayState, ProductScanResult } from './contracts';

export interface PackageDisplay {
  /** The normalized quantity a user reads: `250 g`. `Brak danych` when nothing was detected. */
  value: string;
  /** The verbatim label text, when it says more than the normalized value. Null otherwise. */
  evidence: string | null;
}

const formatQuantity = (quantity: number): string =>
  Number.isInteger(quantity) ? String(quantity) : String(Number(quantity.toFixed(3)));

export function packageDisplay(pkg: ProductScanResult['package']): PackageDisplay {
  const raw = pkg.netQuantityText?.trim() || null;
  if (pkg.netQuantity === null || !Number.isFinite(pkg.netQuantity) || !pkg.unit) {
    // Nothing structured to show — the raw label is better than „Brak danych", still marked as label
    // text by the caller rather than presented as a confirmed quantity.
    return { value: raw ?? 'Brak danych', evidence: null };
  }
  const value = `${formatQuantity(pkg.netQuantity)} ${pkg.unit}`;
  return { value, evidence: raw && raw !== value ? raw : null };
}

/**
 * Full success vs partial analysis, in product language. „Partial" is never dressed up as complete:
 * a result that still has a required field open says so and the save button stays gated.
 */
export function scanCompletenessLabel(
  overlayState: ProductScanOverlayState,
  missingCriticalFields: readonly string[],
): string {
  if (overlayState === 'BLOCKED') return 'Zablokowane';
  if (missingCriticalFields.length > 0) {
    return missingCriticalFields.length === 1 &&
      missingCriticalFields[0] === 'allergen_confirmation'
      ? 'Wymaga potwierdzenia'
      : 'Analiza niepełna';
  }
  return overlayState === 'SCAN_DRAFT' ? 'Wymaga potwierdzenia' : 'Analiza kompletna';
}
