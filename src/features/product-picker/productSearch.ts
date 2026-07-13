/**
 * PINGÜINO Product Picker — pure search + readiness ranking.
 *
 * Searches a set of `PickerCatalogueEntry` rows by product name, brand, EAN,
 * normalized name, internal product id/code, and category — reusing the canonical
 * `normalizeName` / `normalizeEan` helpers (no fuzzy scoring, no fabricated match
 * %). Each result carries a readiness verdict delegated to the reused
 * `evaluateProductReadiness` gate and a readable Polish status label.
 *
 * Pure: no IO, no engine math, no product mutation.
 */
import { evaluateProductReadiness, NOT_ENGINE_READY_MESSAGE } from '@/features/ingredient-resolution';
import { normalizeName } from '@/data/products/productMatcher';
import { normalizeEan } from '@/data/products/productIdentity';
import type { ProductStatus } from '@/data/products/productRow';
import type {
  PickerCatalogueEntry,
  PickerMatchedOn,
  PickerReadiness,
  ProductPickResult,
  ProductSearchQuery,
} from './productPickerContracts';

/** Raw lifecycle status → readable Polish label (never the raw enum). Internal states → null. */
const STATUS_LABEL_PL: Record<ProductStatus, string | null> = {
  draft: null,
  rejected: null,
  pi_calculated: 'Przeliczony przez PI',
  pi_generated: 'Wygenerowany przez PI',
  manual_adjusted: 'Skorygowany ręcznie',
  pi_verified: 'Zweryfikowany przez PI',
};

/** The readable Polish lifecycle label for a status, or null when internal-only. */
export function readableStatusLabel(status: ProductStatus): string | null {
  return STATUS_LABEL_PL[status];
}

/** Compute the readable readiness verdict for one entry (delegates to the reused gate). */
export function evaluatePickerReadiness(entry: PickerCatalogueEntry): PickerReadiness {
  const r = evaluateProductReadiness(entry.readiness, entry.reference);
  return {
    exactReady: r.readyForExact,
    badge: r.readyForExact ? 'Gotowy do przeliczenia' : 'Wymaga danych',
    message: r.readyForExact ? null : (r.message ?? NOT_ENGINE_READY_MESSAGE),
    referenceLinked: r.not_independently_measured,
  };
}

/** Ranking weight for the match kind (lower = stronger). */
const MATCH_RANK: Record<PickerMatchedOn, number> = {
  product_id: 0,
  ean: 1,
  exact_name: 2,
  brand: 3,
  name_contains: 4,
  category: 5,
};

/** The searchable normalized names for an entry (display + internal). */
function entryNames(entry: PickerCatalogueEntry): string[] {
  return [normalizeName(entry.displayName), normalizeName(entry.internalName)].filter((n) => n !== '');
}

/** Best (strongest) match kind for one entry against a query, or null when it does not match. */
function matchEntry(entry: PickerCatalogueEntry, textQuery: string, eanQuery: string): PickerMatchedOn | null {
  const q = normalizeName(textQuery);
  const idRaw = textQuery.trim().toLowerCase();

  // product id / code — exact only (an id search is intentional and precise).
  if (idRaw !== '') {
    if (entry.productId.toLowerCase() === idRaw) return 'product_id';
    if ((entry.productCode ?? '').toLowerCase() === idRaw) return 'product_id';
  }
  // EAN — normalized exact.
  if (eanQuery !== '' && normalizeEan(entry.ean) === eanQuery) return 'ean';

  if (q === '') return null;

  const names = entryNames(entry);
  if (names.includes(q)) return 'exact_name';

  const brand = normalizeName(entry.brand);
  if (brand !== '' && (brand === q || brand.includes(q) || q.includes(brand))) return 'brand';

  if (names.some((n) => n.includes(q) || q.includes(n))) return 'name_contains';

  const category = normalizeName(entry.category);
  if (category !== '' && (category === q || category.includes(q))) return 'category';

  return null;
}

/**
 * Search + rank a catalogue for a query. Text matches name/brand/EAN/normalized
 * name/id/category; an optional `category` narrows the set first. A blank text
 * query returns [] unless a category is given (then all rows in that category).
 * Deterministic: rank by match strength, then by normalized display name.
 */
export function searchPickerCatalogue(
  query: ProductSearchQuery,
  entries: readonly PickerCatalogueEntry[],
): ProductPickResult[] {
  const wantCategory = normalizeName(query.category ?? '');
  const inCategory = (e: PickerCatalogueEntry): boolean =>
    wantCategory === '' || normalizeName(e.category) === wantCategory;

  const text = query.text.trim();
  const eanQuery = normalizeEan(text);

  const rows: { entry: PickerCatalogueEntry; matchedOn: PickerMatchedOn }[] = [];
  for (const entry of entries) {
    if (!inCategory(entry)) continue;
    if (text === '') {
      // Category-only browse: include everything in the narrowed category.
      if (wantCategory !== '') rows.push({ entry, matchedOn: 'category' });
      continue;
    }
    const matchedOn = matchEntry(entry, text, eanQuery);
    if (matchedOn !== null) rows.push({ entry, matchedOn });
  }

  rows.sort(
    (a, b) =>
      MATCH_RANK[a.matchedOn] - MATCH_RANK[b.matchedOn] ||
      normalizeName(a.entry.displayName).localeCompare(normalizeName(b.entry.displayName)),
  );

  return rows.map(({ entry, matchedOn }) => ({
    entry,
    matchedOn,
    readiness: evaluatePickerReadiness(entry),
    statusLabel: readableStatusLabel(entry.status),
  }));
}
