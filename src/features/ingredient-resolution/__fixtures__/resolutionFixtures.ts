/**
 * Ingredient Resolution — repository-safe TEST fixtures (NOT real product records).
 *
 * These drive the unit tests and the DEV harness only. They are deliberately synthetic
 * ("PR-FIX-…" / "ING-FIX-…" ids) and honest: engine values on the references are plain
 * illustrative numbers, unknown fields stay null, and nothing here claims a verified real
 * product. No number is ever presented to a customer from this file.
 */
import type { ReferenceEngineValues } from '@/data/products/productEngineResolver';
import type { CatalogueProduct } from '../catalogueSearch';
import type { PickProductInput, RequirementLineSeed } from '../ingredientResolution';
import type { ProductCandidate } from '../contracts';

/* ── requirement lines (a "chocolate + whisky + basil" style recipe) ─────── */

export const RESOLUTION_LINE_SEEDS: readonly RequirementLineSeed[] = [
  {
    lineId: 'flavor:chocolate',
    ingredientName: 'Czekolada',
    role: 'flavor',
    requirementKind: 'needs_ingredient',
    candidateProductIds: ['PR-FIX-CHOC-DARK', 'PR-FIX-CHOC-MILK'],
  },
  {
    lineId: 'flavor:whisky',
    ingredientName: 'Whisky',
    role: 'flavor',
    requirementKind: 'needs_ingredient',
  },
  {
    lineId: 'flavor:raspberry-puree',
    ingredientName: 'Puree malinowe',
    role: 'flavor',
    requirementKind: 'needs_ingredient',
  },
  {
    // fresh/herb — must pick a form (świeża / suszona / …) first
    lineId: 'flavor:basil',
    ingredientName: 'Bazylia',
    role: 'flavor',
    requirementKind: 'needs_ingredient',
  },
];

/* ── the existing products catalogue (searchable by name) ────────────────── */

export const CATALOGUE_FIXTURES: readonly CatalogueProduct[] = [
  { productId: 'PR-FIX-CHOC-DARK', displayName: 'Ciemna czekolada 70%' },
  { productId: 'PR-FIX-CHOC-MILK', displayName: 'Czekolada mleczna' },
  { productId: 'PR-FIX-WHISKY', displayName: 'Whisky single malt' },
  { productId: 'PR-FIX-SYRUP-0', displayName: 'Syrop bez cukru' },
  { productId: 'PR-FIX-RASPBERRY', displayName: 'Puree malinowe 100%' },
  { productId: 'PR-FIX-BASIL', displayName: 'Bazylia' },
];

/* ── the matched reference rows (engine values live here, never on products) ── */

const REFERENCES: Readonly<Record<string, ReferenceEngineValues>> = {
  'ING-FIX-CHOC-DARK': { ingredient_id: 'ING-FIX-CHOC-DARK', ingredient_name_display: 'Czekolada ciemna (ref.)', pac_value: 30, pod_value: 20 },
  'ING-FIX-CHOC-MILK': { ingredient_id: 'ING-FIX-CHOC-MILK', ingredient_name_display: 'Czekolada mleczna (ref.)', pac_value: 28, pod_value: 24 },
  'ING-FIX-RASPBERRY': { ingredient_id: 'ING-FIX-RASPBERRY', ingredient_name_display: 'Puree malinowe (ref.)', pac_value: 22, pod_value: 12 },
  'ING-FIX-BASIL': { ingredient_id: 'ING-FIX-BASIL', ingredient_name_display: 'Bazylia (ref.)', pac_value: 5, pod_value: 1 },
  // a reference that itself lacks pac/pod — cannot make a product engine-ready
  'ING-FIX-WHISKY': { ingredient_id: 'ING-FIX-WHISKY', ingredient_name_display: 'Whisky (ref.)', pac_value: null, pod_value: null },
};

/**
 * The pickable products keyed by productId. Each carries the readiness-gate input
 * (engine values + red-flag text) and the matched reference the caller looked up.
 *
 *  - CHOC-DARK / CHOC-MILK / RASPBERRY / BASIL → confirmed match, reference supplies pac/pod
 *    → ENGINE-READY (resolves);
 *  - WHISKY → confirmed match but the reference lacks pac/pod → NOT ready (needs data);
 *  - SYRUP-0 → confirmed match with pac/pod, but a polyol red flag → NOT ready (needs review).
 */
export const PICKABLE_PRODUCTS: Readonly<Record<string, PickProductInput>> = {
  'PR-FIX-CHOC-DARK': {
    productId: 'PR-FIX-CHOC-DARK',
    product: { product_name_display: 'Ciemna czekolada 70%', mapper_status: 'matched', matched_basement_id: 'ING-FIX-CHOC-DARK', pac_value: null, pod_value: null },
    reference: REFERENCES['ING-FIX-CHOC-DARK']!,
  },
  'PR-FIX-CHOC-MILK': {
    productId: 'PR-FIX-CHOC-MILK',
    product: { product_name_display: 'Czekolada mleczna', mapper_status: 'matched', matched_basement_id: 'ING-FIX-CHOC-MILK', pac_value: null, pod_value: null },
    reference: REFERENCES['ING-FIX-CHOC-MILK']!,
  },
  'PR-FIX-RASPBERRY': {
    productId: 'PR-FIX-RASPBERRY',
    product: { product_name_display: 'Puree malinowe 100%', mapper_status: 'matched', matched_basement_id: 'ING-FIX-RASPBERRY', pac_value: null, pod_value: null },
    reference: REFERENCES['ING-FIX-RASPBERRY']!,
  },
  'PR-FIX-BASIL': {
    productId: 'PR-FIX-BASIL',
    product: { product_name_display: 'Bazylia', mapper_status: 'matched', matched_basement_id: 'ING-FIX-BASIL', pac_value: null, pod_value: null },
    reference: REFERENCES['ING-FIX-BASIL']!,
  },
  'PR-FIX-WHISKY': {
    productId: 'PR-FIX-WHISKY',
    product: { product_name_display: 'Whisky single malt', mapper_status: 'matched', matched_basement_id: 'ING-FIX-WHISKY', pac_value: null, pod_value: null },
    reference: REFERENCES['ING-FIX-WHISKY']!,
  },
  'PR-FIX-SYRUP-0': {
    productId: 'PR-FIX-SYRUP-0',
    product: {
      product_name_display: 'Syrop bez cukru',
      mapper_status: 'matched',
      matched_basement_id: 'ING-FIX-RASPBERRY',
      pac_value: null,
      pod_value: null,
      // polyol keyword → red flag from the reused detector → NOT auto-usable for exact calc
      detected_text: 'bez cukru, zawiera maltitol',
    },
    reference: REFERENCES['ING-FIX-RASPBERRY']!,
  },
};

/** Look up a pickable product fixture (throws in tests if an id is unknown). */
export function pickableProduct(productId: string): PickProductInput {
  const p = PICKABLE_PRODUCTS[productId];
  if (!p) throw new Error(`no pickable fixture for ${productId}`);
  return p;
}

/** Build honest `ProductCandidate`s for a line's attached candidate ids from the catalogue. */
export function candidatesFromCatalogue(
  ids: readonly string[],
  catalogue: readonly CatalogueProduct[] = CATALOGUE_FIXTURES,
): ProductCandidate[] {
  return ids
    .map((id) => catalogue.find((c) => c.productId === id))
    .filter((c): c is CatalogueProduct => c !== undefined)
    .map((c) => ({ productId: c.productId, displayName: c.displayName, matchedOn: 'exact_name' as const }));
}
