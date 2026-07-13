/**
 * Ingredient Resolution — honest catalogue SEARCH (pure).
 *
 * `Wyszukaj w katalogu` searches the EXISTING products catalogue by name. It reuses the
 * matcher's deterministic `normalizeName` (accent-preserving, no AI, no library) and returns
 * an HONEST candidate list: exact-name hits first, then name-contains hits — never a
 * fabricated match percentage, never an invented product.
 */
import { normalizeName } from '@/data/products/productMatcher';
import type { ProductCandidate } from './contracts';

/** The minimal catalogue shape searched (a structural subset of ProductRow). */
export interface CatalogueProduct {
  /** The product id / code attached to a line on selection. */
  productId: string;
  displayName: string;
  internalName?: string | null;
}

/** Normalized non-empty names for a catalogue product (display + internal). */
function namesOf(p: CatalogueProduct): string[] {
  return [normalizeName(p.displayName), normalizeName(p.internalName)].filter((n) => n !== '');
}

/**
 * Search the catalogue for a query string. Returns exact-name hits before name-contains
 * hits; within each tier, deterministic by normalized display name. A blank query returns
 * []. Pure — no IO, no fuzzy scoring, no fabricated confidence.
 */
export function searchProductCatalogue(
  query: string,
  catalogue: readonly CatalogueProduct[],
): ProductCandidate[] {
  const q = normalizeName(query);
  if (q === '') return [];

  const hits: ProductCandidate[] = [];
  for (const p of catalogue) {
    const names = namesOf(p);
    if (names.length === 0) continue;
    if (names.includes(q)) {
      hits.push({ productId: p.productId, displayName: p.displayName, matchedOn: 'exact_name' });
    } else if (names.some((n) => n.includes(q) || q.includes(n))) {
      hits.push({ productId: p.productId, displayName: p.displayName, matchedOn: 'name_contains' });
    }
  }

  const rank = (c: ProductCandidate): number => (c.matchedOn === 'exact_name' ? 0 : 1);
  return hits.sort(
    (a, b) => rank(a) - rank(b) || normalizeName(a.displayName).localeCompare(normalizeName(b.displayName)),
  );
}
