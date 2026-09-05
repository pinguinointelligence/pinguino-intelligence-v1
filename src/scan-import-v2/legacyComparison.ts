/**
 * DIAGNOSTIC ONLY — runs the legacy pure resolution pieces (read-only imports; legacy is not modified)
 * next to Scan Import 2.0 for the same confirmed code and reports the differences. A disagreement does
 * not mean V2 is wrong; the audit evidence decides.
 */
import { validateBarcode } from '@/features/product-scanner/barcode';
import { exactBarcodeMatch } from '@/features/product-scanner/pipeline';
import { routeScan } from '@/features/product-scanner/scanRouting';
import type { CatalogProductSearchHit } from '@/features/global-catalog/contracts';
import type { ExactCandidate, ScanImportV2Result } from './contracts';

export interface LegacyComparison {
  code: string;
  legacy: {
    valid: boolean;
    format: string | null;
    lookupValue: string | null;
    exactProductId: string | null;
    route: string;
  };
  v2: {
    kind: ScanImportV2Result['kind'];
    productId: string | null;
    provenance: string | null;
    reason: string | null;
  };
  differences: string[];
}

export function compareWithLegacy(
  code: string,
  legacyHint: string,
  candidates: readonly ExactCandidate[],
  v2: ScanImportV2Result,
): LegacyComparison {
  const barcode = validateBarcode(code, legacyHint);
  const hits = candidates.map(
    (c) =>
      ({
        id: c.productId,
        eans: [c.ean],
        displayName: c.displayName,
        brand: c.brand,
      }) as unknown as CatalogProductSearchHit,
  );
  const exact = barcode ? exactBarcodeMatch(barcode, hits) : null;
  const route = barcode
    ? routeScan({
        catalogMatch: exact !== null,
        barcode: barcode.value,
        eanLookupDone: false,
        frameCount: 0,
        analyzedFrameCount: 0,
        liveBarcodeSearchActive: false,
        visionCalls: 0,
        maxVisionCalls: 2,
        evidence: { complete: false, requestView: null, requestMessage: null } as never,
      }).kind
    : 'invalid';
  const v2ProductId =
    v2.kind === 'resolved_exact' || v2.kind === 'needs_confirmation'
      ? (v2.product?.productId ?? null)
      : null;
  const differences: string[] = [];
  if (Boolean(barcode) !== (v2.kind !== 'invalid_code')) differences.push('validity');
  if (exact && v2.kind === 'ambiguous')
    differences.push('legacy picks the first ranked row; V2 reports AMBIGUOUS');
  if (exact && v2ProductId && exact.id !== v2ProductId)
    differences.push(`exact product: legacy ${exact.id} vs V2 ${v2ProductId}`);
  if (!exact && v2ProductId)
    differences.push('V2 resolved (cache/disambiguation) where legacy would look up');
  return {
    code,
    legacy: {
      valid: barcode !== null,
      format: barcode?.format ?? null,
      lookupValue: barcode?.lookupValue ?? null,
      exactProductId: exact?.id ?? null,
      route,
    },
    v2: {
      kind: v2.kind,
      productId: v2ProductId,
      provenance:
        v2.kind === 'resolved_exact' || v2.kind === 'needs_confirmation' ? v2.provenance : null,
      reason:
        v2.kind === 'invalid_code'
          ? v2.reason
          : v2.kind === 'needs_confirmation'
            ? v2.reason
            : null,
    },
    differences,
  };
}
