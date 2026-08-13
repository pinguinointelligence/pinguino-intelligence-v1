import type { ExistingProductForDedup } from '@/features/ocr-intake/session/duplicateCheck';

export interface DuplicateComparisonFacts {
  name: string | null;
  brand: string | null;
  package: string | null;
  market: string | null;
  ean: string | null;
}

const clean = (value: string | null | undefined): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const comparable = (value: string | null): string =>
  (value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();

export function existingDuplicateFacts(product: ExistingProductForDedup): DuplicateComparisonFacts {
  return {
    name: clean(product.product_name_display ?? product.product_name_internal),
    brand: clean(product.brand),
    package: clean(product.package_size),
    // The private legacy product row exposes country of origin, not market of
    // sale. Never relabel origin as market in the duplicate comparison.
    market: null,
    ean: clean(product.ean_code_normalized ?? product.ean_code ?? product.barcode_normalized ?? product.barcode),
  };
}

export function duplicateSimilarityPercent(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function duplicateFactDifferences(
  scanned: DuplicateComparisonFacts,
  existing: DuplicateComparisonFacts,
): string[] {
  const labels: Array<[keyof DuplicateComparisonFacts, string]> = [
    ['name', 'nazwa'],
    ['brand', 'marka'],
    ['package', 'opakowanie'],
    ['market', 'rynek'],
    ['ean', 'EAN/GTIN'],
  ];
  return labels.flatMap(([key, label]) => {
    const next = clean(scanned[key]);
    const current = clean(existing[key]);
    if (!next && !current) return [];
    if (comparable(next) === comparable(current)) return [];
    return [`${label}: ${current ?? 'brak danych'} -> ${next ?? 'brak danych'}`];
  });
}
