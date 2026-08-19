import type { CatalogProductSearchHit } from '@/features/global-catalog/contracts';

export const PRODUCT_PICKER_SEGMENT_LABELS = {
  featured: 'ULUBIONE I OSTATNIO UŻYWANE',
  remaining: 'POZOSTAŁE SKŁADNIKI',
  ingredients: 'SKŁADNIKI',
} as const;

export type ProductPickerSegmentId = keyof typeof PRODUCT_PICKER_SEGMENT_LABELS;

export interface ProductPickerSegment<T> {
  id: ProductPickerSegmentId;
  label: (typeof PRODUCT_PICKER_SEGMENT_LABELS)[ProductPickerSegmentId];
  items: T[];
}

export interface SegmentableCatalogProduct {
  canonicalId: string;
  favorite: boolean;
  recent: boolean;
}

/** The canonical Mapper identity wins when a commercial catalog row is bound
 * to one; otherwise the catalog's existing product root is the identity. */
export function canonicalCatalogProductId(
  hit: Pick<CatalogProductSearchHit, 'id' | 'mappedIngredientId'>,
): string {
  return hit.mappedIngredientId?.trim() || hit.id;
}

/** Public search results already carry the Mapper confidence projection in
 * `publicData.sourceConfidence`. Status/provenance never invent a percentage. */
export function catalogDataConfidencePercent(
  hit: Pick<CatalogProductSearchHit, 'publicData'>,
): number | null {
  return normalizeDataConfidencePercent(hit.publicData.sourceConfidence);
}

export function normalizeDataConfidencePercent(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function formatDataConfidencePercent(value: number | null): string {
  return value === null ? '—' : `${value}%`;
}

/**
 * Build the complete presentation model before rendering or pagination UI.
 * First occurrence wins so server relevance order remains stable. A product
 * can belong to the featured segment only once and is removed from the rest.
 */
export function buildProductPickerSegments<T extends SegmentableCatalogProduct>(
  products: readonly T[],
): ProductPickerSegment<T>[] {
  const indexById = new Map<string, number>();
  const unique: T[] = [];
  for (const product of products) {
    const existingIndex = indexById.get(product.canonicalId);
    if (existingIndex !== undefined) {
      const existing = unique[existingIndex]!;
      if (
        (product.favorite && !existing.favorite) ||
        (product.recent && !existing.recent)
      ) {
        unique[existingIndex] = {
          ...existing,
          favorite: existing.favorite || product.favorite,
          recent: existing.recent || product.recent,
        };
      }
      continue;
    }
    indexById.set(product.canonicalId, unique.length);
    unique.push(product);
  }

  const featured = unique.filter((product) => product.favorite || product.recent);
  if (featured.length === 0) {
    return unique.length === 0
      ? []
      : [{
          id: 'ingredients',
          label: PRODUCT_PICKER_SEGMENT_LABELS.ingredients,
          items: unique,
        }];
  }

  const featuredIds = new Set(featured.map((product) => product.canonicalId));
  const remaining = unique.filter((product) => !featuredIds.has(product.canonicalId));
  return [
    {
      id: 'featured',
      label: PRODUCT_PICKER_SEGMENT_LABELS.featured,
      items: featured,
    },
    ...(remaining.length > 0
      ? [{
          id: 'remaining' as const,
          label: PRODUCT_PICKER_SEGMENT_LABELS.remaining,
          items: remaining,
        }]
      : []),
  ];
}

export function uniqueCatalogProductCount<T extends SegmentableCatalogProduct>(
  segments: readonly ProductPickerSegment<T>[],
): number {
  return segments.reduce((count, segment) => count + segment.items.length, 0);
}
