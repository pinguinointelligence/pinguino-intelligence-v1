import { validateBarcode } from '@/features/product-scanner/barcode';
import type {
  ProductScanExternalSource,
  ProductScanResult,
} from '@/features/product-scanner/contracts';
import type { TextImportAdapterOutput } from './textImportAdapter';
import {
  TEXTIMPORT_EAN_RESOLVER_VERSION,
  type TextImportEanAuthority,
  type TextImportEanResolverQuery,
  type TextImportEanResolverResult,
} from './eanResolverContract';

export interface TextImportScannerHandoff {
  sourceRowId: string | null;
  resolverSkipped: boolean;
  resolverResult: Extract<TextImportEanResolverResult, { status: 'EAN_RESOLVED' }> | null;
  scannerInput: ProductScanResult;
}

const firstHttpsSource = (
  sources: readonly ProductScanExternalSource[],
): TextImportEanResolverQuery['source'] => {
  const source = sources.find((item) => {
    try {
      return item.url !== null && new URL(item.url).protocol === 'https:';
    } catch {
      return false;
    }
  });
  return source?.url ? { url: source.url, title: source.title } : null;
};

/** A valid existing barcode is the explicit skip seam: no resolver call is made. */
export function textImportEanQuery(
  adapter: TextImportAdapterOutput,
): TextImportEanResolverQuery | null {
  if (adapter.scannerInput.barcodes.some((barcode) => validateBarcode(barcode.value))) return null;
  const exactProductName =
    adapter.scannerInput.identity.displayName ?? adapter.scannerInput.identity.originalName;
  if (!exactProductName) return null;
  return {
    resolverVersion: TEXTIMPORT_EAN_RESOLVER_VERSION,
    sourceRowId: adapter.sourceRowId,
    identity: {
      exactProductName,
      brand: adapter.scannerInput.identity.brand,
      manufacturer: adapter.scannerInput.manufacturer,
      variant: adapter.scannerInput.identity.variant,
      packageText: adapter.scannerInput.package.netQuantityText,
    },
    source: firstHttpsSource(adapter.scannerInput.externalSources),
  };
}

const sourceTypeForAuthority = (
  authority: TextImportEanAuthority,
): ProductScanExternalSource['sourceType'] => {
  if (authority === 'STRUCTURED_PRODUCT_DATABASE') return 'barcode_registry';
  if (
    authority === 'OFFICIAL_MANUFACTURER' ||
    authority === 'OFFICIAL_BRAND' ||
    authority === 'OFFICIAL_TECHNICAL_PDF'
  )
    return 'manufacturer';
  return 'retailer';
};

export function existingEanHandoff(
  adapter: TextImportAdapterOutput,
): TextImportScannerHandoff | null {
  if (textImportEanQuery(adapter) !== null) return null;
  const present = adapter.scannerInput.barcodes.some((barcode) => validateBarcode(barcode.value));
  return present
    ? {
        sourceRowId: adapter.sourceRowId,
        resolverSkipped: true,
        resolverResult: null,
        scannerInput: adapter.scannerInput,
      }
    : null;
}

/**
 * Adds only the resolved identifier and its provenance to the adapter output.
 * All other row evidence is retained byte-for-byte by reference values.
 */
export function resolvedEanHandoff(
  adapter: TextImportAdapterOutput,
  resolution: TextImportEanResolverResult,
): TextImportScannerHandoff | null {
  if (resolution.status !== 'EAN_RESOLVED') return null;
  const expectedQuery = textImportEanQuery(adapter);
  if (!expectedQuery || JSON.stringify(expectedQuery) !== JSON.stringify(resolution.query))
    return null;
  const validated = validateBarcode(resolution.ean);
  if (!validated || resolution.evidence.length === 0) return null;

  const externalSources = adapter.scannerInput.externalSources.map((source) => ({
    ...source,
    fieldsUsed: [...source.fieldsUsed],
  }));
  for (const evidence of resolution.evidence) {
    const sourceType = sourceTypeForAuthority(evidence.sourceAuthorityClass);
    const existing = externalSources.find(
      (source) => source.sourceType === sourceType && source.url === evidence.sourceUrl,
    );
    if (existing) {
      if (!existing.fieldsUsed.includes('barcodes'))
        existing.fieldsUsed = [...existing.fieldsUsed, 'barcodes'];
    } else {
      externalSources.push({
        sourceType,
        url: evidence.sourceUrl,
        title: evidence.sourceTitle,
        fieldsUsed: ['barcodes'],
      });
    }
  }

  return {
    sourceRowId: adapter.sourceRowId,
    resolverSkipped: false,
    resolverResult: resolution,
    scannerInput: {
      ...adapter.scannerInput,
      barcodes: [{ value: validated.value, format: validated.format }],
      externalSources,
    },
  };
}
