/**
 * PRODUCT DOSE PROVENANCE — INFORMATIONAL ONLY (owner decision, 2026-08-23).
 *
 * Gellatti no longer derives an automatic dose from a manufacturer's
 * recommended dosage. A newly selected product starts UNKNOWN and the
 * professional enters the amount; `ProductDoseMeta` records only whether that
 * amount came from the user. The former `verifiedProductDoseSuggestion` /
 * `allocateAutomaticDoseGroup` pair has been removed, not disabled.
 */

export type ProductDoseProvenance = 'NONE' | 'AUTO_SUGGESTED' | 'USER_SET' | 'UNKNOWN';

export interface ProductDoseMeta {
  provenance: ProductDoseProvenance;
  groupId: string | null;
  suggestedPercent: number | null;
  suggestedTotalGrams: number | null;
}

export const EMPTY_PRODUCT_DOSE_META: ProductDoseMeta = Object.freeze({
  provenance: 'NONE',
  groupId: null,
  suggestedPercent: null,
  suggestedTotalGrams: null,
});

export function missingProductDoseMessage(names: readonly string[]): string {
  return `Podaj gramaturę dla:\n${names.join(', ')}.\n\nMinimalna ilość to 1 g.`;
}
