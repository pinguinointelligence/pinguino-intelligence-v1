/**
 * PINGÜINO Product Picker — the BUNDLED real catalogue.
 *
 * Owner decision (2026-07-17, „wire the 69 staging products now"): the customer
 * Product Picker reads a real, verified SAMPLE of the canonical products catalogue,
 * bundled as a static snapshot (`customerCatalogueSnapshot.ts`, exported from staging)
 * so it works everywhere — including the public build, which has no live database. Every
 * entry is mapped through the ONE canonical `productRowToPickerEntry` mapper (no
 * duplication); nothing is invented — the 23 products matched to a `mapper_basement`
 * reference resolve to an exact „Gotowy do przeliczenia" verdict, the rest to an honest
 * „Wymaga danych". The source is labelled honestly as a sample.
 */
import { evaluateProductReadiness } from '@/features/ingredient-resolution';
import { CUSTOMER_CATALOGUE_SNAPSHOT } from '@/data/products/customerCatalogueSnapshot';
import { normalizeName } from '@/data/products/productMatcher';
import type { CatalogueSource, PickerCatalogueEntry } from './productPickerContracts';
import { productRowToPickerEntry } from './productRowMapper';

/** The bundled catalogue, mapped once through the canonical mapper. */
export const BUNDLED_CATALOGUE_ENTRIES: readonly PickerCatalogueEntry[] =
  CUSTOMER_CATALOGUE_SNAPSHOT.map((e) => productRowToPickerEntry(e.row, e.reference));

/**
 * How many bundled products the reused readiness gate deems EXACT-ready — matched to a
 * reference AND no red flag. This is the conservative, honest „gotowy do przeliczenia"
 * count (a matched product with a blocking red flag is deliberately NOT counted), so it
 * can be ≤ the number of matched references.
 */
export const BUNDLED_CATALOGUE_READY_COUNT = BUNDLED_CATALOGUE_ENTRIES.filter(
  (e) => evaluateProductReadiness(e.readiness, e.reference).readyForExact,
).length;

/** Honest source note — this is a real but SAMPLE slice of the catalogue, never „live". */
export const BUNDLED_CATALOGUE_SOURCE: CatalogueSource = {
  kind: 'sample',
  note: `Próbka prawdziwego katalogu — ${CUSTOMER_CATALOGUE_SNAPSHOT.length} produktów, ${BUNDLED_CATALOGUE_READY_COUNT} gotowych do przeliczenia.`,
};

/**
 * Map a generic requirement name („Czekolada", „Malina", „Pistacja", „Kawa") to the
 * REAL products-catalogue category (`product_category`), so opening the picker pre-lists
 * the right candidates. Distinct from the sample catalogue's Polish taxonomy — these are
 * the actual DB category values (chocolate_cocoa / dairy / flavor / fruit / nut_paste /
 * sugar). Unknown → null (the picker then browses nothing until the customer types).
 */
export function bundledCategoryForIngredient(ingredientName: string): string | null {
  const n = normalizeName(ingredientName);
  if (n === '') return null;
  const has = (...ks: string[]) => ks.some((k) => n.includes(k));
  if (has('czekolad', 'chocolate', 'kakao', 'cocoa', 'kuwertur')) return 'chocolate_cocoa';
  if (has('mlek', 'milk', 'smietan', 'krem', 'cream', 'mascarpone', 'ser', 'nabial', 'dairy', 'nata'))
    return 'dairy';
  if (has('malin', 'raspberry', 'owoc', 'fruit', 'truskaw', 'mango', 'jagod', 'wisni', 'cytryn', 'banan'))
    return 'fruit';
  if (has('pistacj', 'orzech', 'nut', 'pasta', 'migdal', 'laskow', 'nerkowc')) return 'nut_paste';
  if (has('cukier', 'sugar', 'syrop', 'glukoz', 'dekstroz')) return 'sugar';
  // Vanilla, coffee, herbs and other aromatics live under the DB „flavor" category.
  if (has('wanili', 'vanilla', 'kaw', 'coffee', 'espresso', 'bazyli', 'miet', 'ziol', 'herb', 'aromat', 'smak'))
    return 'flavor';
  return null;
}
