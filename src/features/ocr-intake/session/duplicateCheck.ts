/**
 * PURE duplicate assessment for OCR product intake (spec §10). The caller fetches the
 * user's EXISTING product rows (owner-scoped by RLS at the data layer — owner scoping
 * simply passes through this module untouched); this module performs NO IO.
 *
 * Checks run IN ORDER — the first family that fires decides the verdict:
 *   1. normalized-EAN exact match (manual EAN and/or reviewed ean evidence)
 *        → exact_duplicate;
 *   2. identity-hash match — the SAME `productIdentityKey`/`productInsertToIdentityInput`
 *      the D5B import dedupe uses (REUSED, never reimplemented)
 *        → exact_duplicate;
 *   3. normalized brand + name + package-size (+ country when both present) similarity
 *      via the EXISTING matcher normalization (`normalizeName`) plus a deterministic
 *      Levenshtein ratio, so OCR spelling wobble ("Danome" ≈ "Danone") is caught
 *        → likely_duplicate with a 0–100 score;
 *   else → new_product.
 *
 * allowedActions follow the LOCKED identity rules:
 *   exact  → [open_existing, update_existing_with_review]           (never create_new)
 *   likely → [open_existing, update_existing_with_review, create_new]
 *   new    → [create_new]
 */
import { normalizeEan, productIdentityKey, productInsertToIdentityInput } from '@/data/products/productIdentity';
import { normalizeName } from '@/data/products/productMatcher';
import type { ProductInsert } from '@/data/products/productRow';
import type { DuplicateAssessment, DuplicateVerdict } from '../intakeContracts';

/* ── tuning constants (deterministic; pinned by tests) ───────────────────── */

/** Minimum normalized-name similarity for a likely duplicate when BRAND matches too. */
export const NAME_SIMILARITY_THRESHOLD = 0.8;
/** Minimum normalized-brand similarity for the brand+name rule. */
export const BRAND_SIMILARITY_THRESHOLD = 0.8;
/** When a brand is missing on either side, the name alone must be near-identical. */
export const STRICT_NAME_SIMILARITY_THRESHOLD = 0.9;
/** Package sizes (when BOTH present) must be at least this similar. */
export const SIZE_SIMILARITY_THRESHOLD = 0.8;

/** Structural subset of a ProductRow the assessment reads. Real `ProductRow`s satisfy
 * this directly — the caller passes the rows it fetched, nothing is re-shaped. */
export interface ExistingProductForDedup {
  id: string;
  brand?: string | null;
  product_name_display?: string | null;
  product_name_internal?: string | null;
  package_size?: string | null;
  country?: string | null;
  ean_code?: string | null;
  barcode?: string | null;
  /** DB GENERATED columns when the row came from the database. */
  ean_code_normalized?: string | null;
  barcode_normalized?: string | null;
  /** service-computed hash when the row came from the database. */
  product_identity_hash?: string | null;
  // identity-key recompute inputs (used only when the stored hash is absent)
  fat_percent?: number | null;
  total_sugars_percent?: number | null;
  protein_percent?: number | null;
  total_solids_percent?: number | null;
  source_url?: string | null;
  catalog_source?: string | null;
  source_type?: string | null;
}

export interface DuplicateCheckInput {
  /** The candidate insert built from the reviewed fields (chosen/edited/confirmed
   * values only — the save flow builds it via the EXISTING mapRowToProductInsert). */
  insert: ProductInsert;
  /** Manually entered EAN — a DISTINCT candidate source next to OCR ean evidence. */
  manualEan: string | null;
}

/* ── deterministic similarity (no AI, no library) ────────────────────────── */

/** Classic Levenshtein distance (iterative two-row; deterministic). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1);
      current.push(Math.min(previous[j]! + 1, current[j - 1]! + 1, substitution));
    }
    previous = current;
  }
  return previous[b.length]!;
}

/** Similarity ratio 0..1 over ALREADY-normalized strings; both empty → 0 (no evidence). */
export function similarityRatio(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 0;
  return 1 - levenshtein(a, b) / longest;
}

/* ── the three checks ────────────────────────────────────────────────────── */

const nonEmpty = (s: string | null | undefined): s is string => typeof s === 'string' && s !== '';

/** Every normalized EAN/barcode the CANDIDATE carries (manual entry + evidence). */
function candidateEans(input: DuplicateCheckInput): string[] {
  return [normalizeEan(input.manualEan), normalizeEan(input.insert.ean_code), normalizeEan(input.insert.barcode)]
    .filter((e) => e !== '')
    .filter((e, i, all) => all.indexOf(e) === i);
}

/** Every normalized EAN/barcode of an EXISTING row (stored normalized column first,
 * else normalized from the raw value with the SAME digit rule). */
function existingEans(row: ExistingProductForDedup): string[] {
  const ean = nonEmpty(row.ean_code_normalized) ? row.ean_code_normalized : normalizeEan(row.ean_code);
  const barcode = nonEmpty(row.barcode_normalized) ? row.barcode_normalized : normalizeEan(row.barcode);
  return [ean, barcode].filter((e) => e !== '');
}

/** The identity key of an existing row: the stored hash when present, else recomputed
 * with the SAME reused key functions (never a different algorithm). */
function existingIdentityKey(row: ExistingProductForDedup): string {
  if (nonEmpty(row.product_identity_hash)) return row.product_identity_hash;
  return productIdentityKey(productInsertToIdentityInput(row as ProductInsert));
}

/** Mirror of the import service's "meaningful key" guard: an identity key with neither
 * a brand nor a name segment is too weak to dedupe on (nutrition-only would over-match). */
function identityKeyIsMeaningful(key: string): boolean {
  const parts = key.split('|');
  return (parts[0] ?? '') !== '' || (parts[1] ?? '') !== '';
}

interface SimilarityHit {
  existingProductId: string;
  score: number;
}

/** Normalized brand+name+size(+country) similarity for ONE existing row, or null. */
function similarityHit(input: DuplicateCheckInput, row: ExistingProductForDedup): SimilarityHit | null {
  const candidateName = normalizeName(input.insert.product_name_display ?? input.insert.product_name_internal);
  const rowName = normalizeName(
    nonEmpty(row.product_name_display?.trim() ?? null) ? row.product_name_display : row.product_name_internal,
  );
  if (candidateName === '' || rowName === '') return null; // no name → no similarity claim

  const sims: number[] = [];
  const nameSim = similarityRatio(candidateName, rowName);
  sims.push(nameSim);

  const candidateBrand = normalizeName(input.insert.brand);
  const rowBrand = normalizeName(row.brand);
  const bothBrands = candidateBrand !== '' && rowBrand !== '';
  if (bothBrands) {
    const brandSim = similarityRatio(candidateBrand, rowBrand);
    if (brandSim < BRAND_SIMILARITY_THRESHOLD || nameSim < NAME_SIMILARITY_THRESHOLD) return null;
    sims.push(brandSim);
  } else if (nameSim < STRICT_NAME_SIMILARITY_THRESHOLD) {
    return null; // without a brand on both sides the name alone must be near-identical
  }

  const candidateSize = normalizeName(input.insert.package_size);
  const rowSize = normalizeName(row.package_size);
  if (candidateSize !== '' && rowSize !== '') {
    const sizeSim = similarityRatio(candidateSize, rowSize);
    if (sizeSim < SIZE_SIMILARITY_THRESHOLD) return null; // both declared and different → distinct
    sims.push(sizeSim);
  }

  const candidateCountry = normalizeName(input.insert.country);
  const rowCountry = normalizeName(row.country);
  if (candidateCountry !== '' && rowCountry !== '' && candidateCountry !== rowCountry) {
    return null; // both declared and different → distinct market products
  }

  const score = Math.round((100 * sims.reduce((a, b) => a + b, 0)) / sims.length);
  return { existingProductId: row.id, score };
}

/* ── the assessment ──────────────────────────────────────────────────────── */

const ALLOWED_ACTIONS: Record<DuplicateVerdict, DuplicateAssessment['allowedActions']> = {
  exact_duplicate: ['open_existing', 'update_existing_with_review'],
  likely_duplicate: ['open_existing', 'update_existing_with_review', 'create_new'],
  new_product: ['create_new'],
};

/**
 * Assess the candidate against the caller-fetched existing rows. Pure + deterministic;
 * collects EVERY reason that fired (EAN matches first, then identity-hash, then
 * normalized-similarity) and derives the verdict from the strongest family.
 */
export function assessDuplicate(
  input: DuplicateCheckInput,
  existing: readonly ExistingProductForDedup[],
): DuplicateAssessment {
  const reasons: DuplicateAssessment['reasons'] = [];

  // 1. normalized EAN exact match
  const eans = candidateEans(input);
  if (eans.length > 0) {
    for (const row of existing) {
      if (existingEans(row).some((e) => eans.includes(e))) {
        reasons.push({ check: 'ean_match', existingProductId: row.id });
      }
    }
  }

  // 2. identity-hash match (REUSED productIdentityKey — the import's own dedupe key)
  const candidateKey = productIdentityKey(productInsertToIdentityInput(input.insert));
  if (identityKeyIsMeaningful(candidateKey)) {
    for (const row of existing) {
      if (reasons.some((r) => r.existingProductId === row.id && r.check === 'ean_match')) continue;
      if (existingIdentityKey(row) === candidateKey) {
        reasons.push({ check: 'identity_hash_match', existingProductId: row.id });
      }
    }
  }

  // 3. normalized brand+name+size(+country) similarity → likely
  const exactIds = new Set(reasons.map((r) => r.existingProductId));
  const likelyHits: SimilarityHit[] = [];
  for (const row of existing) {
    if (exactIds.has(row.id)) continue; // already an exact family hit
    const hit = similarityHit(input, row);
    if (hit) likelyHits.push(hit);
  }
  likelyHits.sort((a, b) => b.score - a.score);
  for (const hit of likelyHits) {
    reasons.push({ check: 'normalized_identity_match', existingProductId: hit.existingProductId, score: hit.score });
  }

  const verdict: DuplicateVerdict = reasons.some((r) => r.check === 'ean_match' || r.check === 'identity_hash_match')
    ? 'exact_duplicate'
    : reasons.length > 0
      ? 'likely_duplicate'
      : 'new_product';

  return { verdict, reasons, allowedActions: [...ALLOWED_ACTIONS[verdict]] };
}
