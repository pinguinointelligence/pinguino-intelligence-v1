/**
 * PINGÜINO Product Picker — HONEST in-memory SAMPLE catalogue.
 *
 * This is a small, clearly-labelled REFERENCE sample — NOT the production catalogue
 * and NEVER presented as such (the picker always shows the sample source note). It
 * exists so the tap → search → pick → readiness flow is fully exercisable before an
 * approved live products environment is connected.
 *
 * HONESTY (hard rules):
 *  - NO pac/pod is invented. No sample entry carries fabricated engine values, and
 *    none is linked to a fabricated reference. In this environment there is no
 *    connected verified reference base, so every sample product resolves — through
 *    the reused readiness gate — to an honest "Wymaga danych" verdict (varied real
 *    reasons: unmatched / needs-review / matched-but-reference-unavailable). The
 *    "Ready → exact engine" branch lights up only with real matched+referenced data.
 *  - display fields (name/brand/EAN/package/category) are realistic but illustrative.
 *  - `id`s are `PSAMPLE-…` so a sample product can never be mistaken for a real
 *    `public.products` row.
 */
import { normalizeName } from '@/data/products/productMatcher';
import type { PickerCatalogueEntry } from './productPickerContracts';

/** Build a sample entry with sensible defaults (unknown stays null; no invented pac/pod). */
function sample(
  e: Pick<PickerCatalogueEntry, 'productId' | 'displayName' | 'category'> &
    Partial<PickerCatalogueEntry> & {
      mapperStatus?: string | null;
      matchedBasementId?: string | null;
    },
): PickerCatalogueEntry {
  return {
    productId: e.productId,
    productCode: e.productCode ?? e.productId,
    displayName: e.displayName,
    internalName: e.internalName ?? null,
    brand: e.brand ?? null,
    ean: e.ean ?? null,
    category: e.category,
    packageSize: e.packageSize ?? null,
    imageUrl: e.imageUrl ?? null,
    status: e.status ?? 'draft',
    readiness: {
      // NO pac/pod — unknown stays null (never invented).
      pac_value: null,
      pod_value: null,
      mapper_status: e.mapperStatus ?? null,
      matched_basement_id: e.matchedBasementId ?? null,
      product_name_display: e.displayName,
      product_name_internal: e.internalName ?? null,
      detected_text: null,
      allergens: null,
      polyol_percent: null,
      total_sugars_percent: null,
      source_type: 'catalog_import',
    },
    // No reference is available in this environment → matched rows stay "needs data".
    reference: null,
  };
}

/** The honest sample catalogue. Every row resolves to an actionable "Wymaga danych". */
export const SAMPLE_CATALOGUE: readonly PickerCatalogueEntry[] = [
  // — Czekolada —
  sample({ productId: 'PSAMPLE-choc-1', displayName: 'Hacendado Chocolate Negro 70%', brand: 'Hacendado', category: 'czekolada', packageSize: '125 g', ean: '8480000123456', status: 'pi_generated', mapperStatus: 'needs_review' }),
  sample({ productId: 'PSAMPLE-choc-2', displayName: 'Lindt Excellence 70% Cacao', brand: 'Lindt', category: 'czekolada', packageSize: '100 g', ean: '3046920022606', status: 'draft', mapperStatus: 'matched', matchedBasementId: 'REF-COCOA-70' }),
  sample({ productId: 'PSAMPLE-choc-3', displayName: 'Valrhona Guanaja 70%', brand: 'Valrhona', category: 'czekolada', packageSize: '250 g', status: 'draft', mapperStatus: null }),
  // — Whisky —
  sample({ productId: 'PSAMPLE-whisky-1', displayName: 'Jameson Irish Whiskey', brand: 'Jameson', category: 'whisky', packageSize: '700 ml', ean: '5011007003234', status: 'draft', mapperStatus: 'needs_review' }),
  sample({ productId: 'PSAMPLE-whisky-2', displayName: "Ballantine's Finest", brand: "Ballantine's", category: 'whisky', packageSize: '700 ml', status: 'draft', mapperStatus: null }),
  // — Rum —
  sample({ productId: 'PSAMPLE-rum-1', displayName: 'Bacardi Carta Blanca', brand: 'Bacardi', category: 'rum', packageSize: '700 ml', status: 'draft', mapperStatus: null }),
  sample({ productId: 'PSAMPLE-rum-2', displayName: 'Havana Club Añejo 3 Años', brand: 'Havana Club', category: 'rum', packageSize: '700 ml', status: 'draft', mapperStatus: 'needs_review' }),
  // — Malina / puree —
  sample({ productId: 'PSAMPLE-rasp-1', displayName: 'Puree malinowe 100% (Boiron)', brand: 'Boiron', category: 'owoce', packageSize: '1 kg', status: 'draft', mapperStatus: 'needs_review' }),
  sample({ productId: 'PSAMPLE-rasp-2', displayName: 'Malina mrożona', category: 'owoce', packageSize: '1 kg', status: 'draft', mapperStatus: null }),
  // — Pasta pistacjowa —
  sample({ productId: 'PSAMPLE-pist-1', displayName: 'Pasta pistacjowa 100%', category: 'pasta orzechowa', packageSize: '200 g', status: 'draft', mapperStatus: 'needs_review' }),
  // — Zioła (fresh) —
  sample({ productId: 'PSAMPLE-herb-1', displayName: 'Bazylia świeża', category: 'zioła', packageSize: 'pęczek', status: 'draft', mapperStatus: null }),
  sample({ productId: 'PSAMPLE-herb-2', displayName: 'Mięta świeża', category: 'zioła', packageSize: 'pęczek', status: 'draft', mapperStatus: null }),
  // — Stabilizator —
  sample({ productId: 'PSAMPLE-stab-1', displayName: 'PI Stabilizer', brand: 'PINGÜINO', category: 'stabilizator', packageSize: '1 kg', status: 'draft', mapperStatus: 'needs_review' }),
];

/**
 * Map a generic requirement name ("Czekolada", "Puree malinowe", "Bazylia") to the
 * sample catalogue category used to pre-list candidates when the picker opens.
 * Sample-only seeding (a real catalogue would search its own category taxonomy).
 */
export function sampleCategoryForIngredient(ingredientName: string): string | null {
  const n = normalizeName(ingredientName);
  if (n === '') return null;
  const has = (...ks: string[]) => ks.some((k) => n.includes(k));
  if (has('czekolad', 'chocolate', 'kakao', 'cocoa')) return 'czekolada';
  if (has('whisky', 'whiskey')) return 'whisky';
  if (has('rum')) return 'rum';
  if (has('malin', 'raspberry', 'puree', 'owoc', 'truskaw', 'mango')) return 'owoce';
  if (has('pistacj', 'pasta', 'orzech', 'nut')) return 'pasta orzechowa';
  if (has('bazyli', 'basil', 'miet', 'mint', 'ziol', 'herb', 'melis', 'tymianek')) return 'zioła';
  if (has('stabiliz')) return 'stabilizator';
  return null;
}
