/**
 * Pure product-identity helpers (Mapper Slice D5A).
 *
 *   • PURE — no DB access, no data-layer client, no services, no engine, no IO, no AI,
 *     no internet. Deterministic: same input always yields the same key.
 *   • normalizeEan REUSES the matcher's canonicalEan, so there is ONE digit-normalization
 *     definition — identical to the 0009 `normalize_to_digits` generated column: strip
 *     every non-digit, PRESERVE leading zeros.
 *   • productIdentityKey builds a deterministic, readable/debuggable, collision-safe
 *     canonical identity key for no-EAN duplicate detection. HONEST: a real numeric 0
 *     stays "0"; a null/undefined field stays an EMPTY segment — never a fake 0. No
 *     npac_value. Package size is string-normalized only (no unit conversion yet:
 *     "1kg" and "1000g" are NOT considered equal — that is future work).
 */
import { canonicalEan, normalizeName } from '@/data/products/productMatcher';
import type { ProductInsert } from '@/data/products/productRow';

/** Canonical EAN/barcode for lookup keys — identical to the DB `normalize_to_digits`
 * generated column (strip non-digits, preserve leading zeros). Reuses canonicalEan. */
export function normalizeEan(raw: string | null | undefined): string {
  return canonicalEan(raw);
}

/** Simple deterministic package-size normalization (trim, lowercase, collapse
 * punctuation/whitespace). String-level only — it does NOT convert units. */
function normalizePackageSize(raw: string | null | undefined): string {
  return normalizeName(raw);
}

/** One numeric segment: a REAL finite number (including 0) becomes its string form; an
 * unknown value (null/undefined/NaN) becomes an EMPTY segment — never coerced to 0. */
function numSegment(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

export interface ProductIdentityInput {
  brand: string | null | undefined;
  product_name: string | null | undefined;
  package_size: string | null | undefined;
  // key identity-defining nutrition fields (per 100 g)
  fat_percent: number | null | undefined;
  total_sugars_percent: number | null | undefined;
  protein_percent: number | null | undefined;
  total_solids_percent: number | null | undefined;
  // a source identifier (e.g. source_url / catalog_source)
  source: string | null | undefined;
}

/** Field order in the canonical key — STABLE. Changing it changes every key. */
const IDENTITY_FIELD_ORDER = [
  'brand',
  'name',
  'size',
  'fat',
  'sugars',
  'protein',
  'solids',
  'source',
] as const;

/**
 * Deterministic canonical identity key. Readable + debuggable (pipe-joined normalized
 * segments) and collision-safe (the literal normalized identity, not a lossy hash). Two
 * products with the same brand / name / package size / key nutrition / source produce the
 * same key; any difference produces a different key.
 */
export function productIdentityKey(input: ProductIdentityInput): string {
  const segments: Record<(typeof IDENTITY_FIELD_ORDER)[number], string> = {
    brand: normalizeName(input.brand),
    name: normalizeName(input.product_name),
    size: normalizePackageSize(input.package_size),
    fat: numSegment(input.fat_percent),
    sugars: numSegment(input.total_sugars_percent),
    protein: numSegment(input.protein_percent),
    solids: numSegment(input.total_solids_percent),
    source: normalizeName(input.source),
  };
  return IDENTITY_FIELD_ORDER.map((k) => segments[k]).join('|');
}

/**
 * Map a ProductInsert payload to the pure ProductIdentityInput, resolving the
 * dual / enum ProductRow columns: product_name from product_name_display then
 * product_name_internal; source from source_url then catalog_source then source_type.
 * brand, package_size, and the nutrition fields pass through verbatim — a real numeric
 * 0 stays 0, and null/undefined stays missing (no fake zero). No IO, no DB, no engine.
 */
export function productInsertToIdentityInput(payload: ProductInsert): ProductIdentityInput {
  return {
    brand: payload.brand,
    product_name: payload.product_name_display ?? payload.product_name_internal,
    package_size: payload.package_size,
    fat_percent: payload.fat_percent,
    total_sugars_percent: payload.total_sugars_percent,
    protein_percent: payload.protein_percent,
    total_solids_percent: payload.total_solids_percent,
    source: payload.source_url ?? payload.catalog_source ?? payload.source_type,
  };
}
