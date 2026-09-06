import type { CatalogProductSearchHit } from '@/features/global-catalog/contracts';

export const PRODUCT_PICKER_SEGMENT_LABELS = {
  featured: 'ULUBIONE I OSTATNIO UŻYWANE',
  favorites: 'ULUBIONE',
  recent: 'OSTATNIO UŻYWANE',
  remaining: 'POZOSTAŁE SKŁADNIKI',
  ingredients: 'SKŁADNIKI',
  all: 'WSZYSTKIE SKŁADNIKI',
  otherContext: 'DOSTĘPNE W INNYM ZAKRESIE',
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
  /** Already-localized customer-visible title used only by the empty view. */
  sortTitle?: string;
  /** Exact private use event. Passive browsing never writes this value. */
  recentlyUsedAt?: string | null;
}

const naturalTitleCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

const naturalEmptyViewCompare = <T extends SegmentableCatalogProduct>(left: T, right: T): number =>
  naturalTitleCollator.compare(
    left.sortTitle ?? left.canonicalId,
    right.sortTitle ?? right.canonicalId,
  ) || left.canonicalId.localeCompare(right.canonicalId, 'en', { numeric: true });

const recentTimestamp = (product: SegmentableCatalogProduct): number => {
  if (!product.recentlyUsedAt) return Number.NEGATIVE_INFINITY;
  const value = Date.parse(product.recentlyUsedAt);
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
};

/** Primary customer-facing identity follows the entity, never its binding.
 * A commercial row owns its PR-ING code; a Mapper reference owns its PI-ING id. */
export function canonicalCatalogProductId(
  hit: Pick<CatalogProductSearchHit, 'id' | 'entityKind' | 'productCode' | 'mappedIngredientId'>,
): string {
  return hit.entityKind === 'commercial_product'
    ? hit.productCode?.trim() || hit.id
    : hit.mappedIngredientId?.trim() || hit.id;
}

/** Public search results already carry the Mapper confidence projection in
 * `publicData.sourceConfidence`. Status/provenance never invent a percentage. */
export function catalogDataConfidencePercent(
  hit: Pick<CatalogProductSearchHit, 'publicData'>,
): number {
  return (
    normalizeDataConfidencePercent(
      hit.publicData.productAccuracy ?? hit.publicData.sourceConfidence,
    ) ?? 0
  );
}

export function normalizeDataConfidencePercent(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function formatDataConfidencePercent(value: number | null): string {
  return `${value ?? 0}%`;
}

/**
 * Build the complete presentation model before rendering or pagination UI.
 * First occurrence wins so server relevance order remains stable. A product
 * can belong to the featured segment only once and is removed from the rest.
 */
export function buildProductPickerSegments<T extends SegmentableCatalogProduct>(
  products: readonly T[],
  { activeQuery = false }: { activeQuery?: boolean } = {},
): ProductPickerSegment<T>[] {
  const indexById = new Map<string, number>();
  const unique: T[] = [];
  for (const product of products) {
    const existingIndex = indexById.get(product.canonicalId);
    if (existingIndex !== undefined) {
      const existing = unique[existingIndex]!;
      const productHasNewerUse = recentTimestamp(product) > recentTimestamp(existing);
      if (
        (product.favorite && !existing.favorite) ||
        (product.recent && !existing.recent) ||
        productHasNewerUse
      ) {
        unique[existingIndex] = {
          ...existing,
          favorite: existing.favorite || product.favorite,
          recent: existing.recent || product.recent,
          recentlyUsedAt: productHasNewerUse ? product.recentlyUsedAt : existing.recentlyUsedAt,
        };
      }
      continue;
    }
    indexById.set(product.canonicalId, unique.length);
    unique.push(product);
  }

  // A non-empty query is already relevance-ordered by the canonical search
  // authority. Favorite/recent state is decoration only here; segmenting either
  // group above the first match would silently replace that deterministic order.
  if (activeQuery) {
    return unique.length === 0
      ? []
      : [
          {
            id: 'ingredients',
            label: PRODUCT_PICKER_SEGMENT_LABELS.ingredients,
            items: unique,
          },
        ];
  }

  // With an empty box there is no relevance to sort by, so the useful default is
  // what the user actually reaches for: recently used first, then the catalogue.
  // Recency is used rather than favourites because people reuse an ingredient
  // many times without ever marking it.
  const leadBy = (product: T) => product.recent;
  const leadLabel = PRODUCT_PICKER_SEGMENT_LABELS.recent;
  const leadId: ProductPickerSegmentId = 'recent';
  const restLabel = PRODUCT_PICKER_SEGMENT_LABELS.all;

  const lead = unique.filter(leadBy).sort((left, right) => {
    const timestampOrder = recentTimestamp(right) - recentTimestamp(left);
    return timestampOrder || naturalEmptyViewCompare(left, right);
  });
  const alphabetized = (items: T[]) => items.sort(naturalEmptyViewCompare);
  if (lead.length === 0) {
    return unique.length === 0
      ? []
      : [
          {
            id: 'ingredients',
            label: PRODUCT_PICKER_SEGMENT_LABELS.ingredients,
            items: alphabetized(unique),
          },
        ];
  }

  const leadIds = new Set(lead.map((product) => product.canonicalId));
  const remaining = alphabetized(unique.filter((product) => !leadIds.has(product.canonicalId)));
  return [
    { id: leadId, label: leadLabel, items: lead },
    ...(remaining.length > 0
      ? [
          {
            id: 'all' as ProductPickerSegmentId,
            label: restLabel,
            items: remaining,
          },
        ]
      : []),
  ];
}

export function uniqueCatalogProductCount<T extends SegmentableCatalogProduct>(
  segments: readonly ProductPickerSegment<T>[],
): number {
  return segments.reduce((count, segment) => count + segment.items.length, 0);
}
