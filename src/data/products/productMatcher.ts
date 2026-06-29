/**
 * Pure deterministic product matcher (Mapper Slice D2).
 *
 * Compares a `ProductRow` (the growing `products` layer) against reference rows
 * from the locked `mapper_basement` (typed as `IngredientRow`) and returns an
 * IN-MEMORY `ProductMatchResult`. It is the Mapper's "compare" core only:
 *
 *   • PURE — no DB access, no data-layer client, no services, no engine calc, no
 *     AI/fuzzy library, no IO. Same input always yields the same output.
 *   • READ-ONLY — it never writes anything and never names a live table as a
 *     write target; it cannot touch `mapper_basement` or `products`.
 *   • HONEST — unknown numeric values stay missing (never coerced to 0); it never
 *     invents pac_value / pod_value; there is no `npac_value` anywhere.
 *
 * Write-back of these results to `public.products` is Slice D3 (gated on a future
 * 0008 migration). NONE of these result fields exist in the database yet.
 */
import { mapDatasetCategory } from '@/data/ingredients/categoryMapping';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import type { ProductRow } from '@/data/products/productRow';

export type MapperStatus = 'unmatched' | 'matched' | 'ambiguous' | 'needs_review' | 'rejected';

export type MatchMethod =
  | 'exact_ean'
  | 'exact_normalized_name'
  | 'brand_name'
  | 'category_composition_similarity'
  | 'ingredient_type'
  | 'fuzzy_name'
  | 'no_confident_match';

export type MatchConfidence = 'exact' | 'high' | 'medium' | 'low' | 'needs_review' | 'rejected';

export interface ProductMatchResult {
  mapper_status: MapperStatus;
  match_method: MatchMethod;
  match_confidence: MatchConfidence;
  matched_basement_id: string | null;
  normalized_name: string;
  normalized_category: string | null;
  needs_review_reason: string | null;
  mapper_notes: string | null;
  /** Product engine-source values that are unknown (NULL) — never invented. */
  missing_fields: string[];
  candidate_count?: number;
  candidate_ids?: string[];
}

/* ── tuning constants (deterministic; named so tests pin them) ─────────────── */

/** Composition fields shared by products + basement, compared as percentage points. */
export const COMPOSITION_FIELDS = [
  'water_percent',
  'fat_percent',
  'protein_percent',
  'total_sugars_percent',
  'total_solids_percent',
] as const;

/** Need at least this many fields present in BOTH rows to trust a composition match. */
export const MIN_SHARED_COMPOSITION_FIELDS = 3;
/** Mean absolute per-field difference (pp) at/under which composition is "similar". */
export const COMPOSITION_AVG_DISTANCE_THRESHOLD = 2;
/** A normalized product name must be at least this long to fuzzy/substring match. */
export const MIN_FUZZY_NAME_LENGTH = 3;
/** Engine source values that make a product engine-ready; missing -> review. */
export const ENGINE_SOURCE_VALUE_FIELDS = ['pac_value', 'pod_value'] as const;
/** Cap on how many candidate ids we surface on an ambiguous result. */
const MAX_CANDIDATE_IDS = 20;

/* ── pure helpers ──────────────────────────────────────────────────────────── */

/** trim → lowercase → keep only letters/digits → collapse the rest to single
 * spaces → trim. Deterministic; no AI, no external library. Accents preserved. */
export function normalizeName(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Canonical barcode/EAN: strip everything that is not a digit. Leading zeros are
 * PRESERVED (they can be meaningful for EAN/UPC); we never strip them. */
export function canonicalEan(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.replace(/\D+/g, '');
}

/**
 * Coerce a value to a finite number, or null. Accepts a finite `number` and a CLEARLY
 * numeric string ("3.5", "0", or a single EU decimal comma "3,5"); rejects blank,
 * null/undefined, NaN/Infinity, ambiguous values ("1,234" thousands, "1.2.3", mixed
 * "1.234,5"), and any non-numeric text. A real 0 is preserved.
 *
 * This makes the matcher robust to numeric DB columns: PostgREST returns Postgres
 * `numeric` as JSON STRINGS, so without coercion every composition + pac/pod read
 * would be treated as missing and `category_composition_similarity` would be inert.
 */
export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (s === '') return null;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) return null; // ambiguous mixed separators
  if (hasComma) {
    if (!/^[+-]?\d+,\d{1,2}$/.test(s)) return null; // only a single, clear EU decimal comma
    const n = Number(s.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return null; // integer or dot-decimal only
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** A finite number, or null. Never invents 0 for unknown/blank/NaN. Coerces numeric
 * strings (DB `numeric` columns deserialize as strings) so composition isn't inert. */
function numField(row: object, field: string): number | null {
  return toFiniteNumber((row as Record<string, unknown>)[field]);
}

/** Both basement names (internal + display), normalized + non-empty. */
function basementNames(row: IngredientRow): string[] {
  return [normalizeName(row.ingredient_name_internal), normalizeName(row.ingredient_name_display)].filter(
    (n) => n !== '',
  );
}

const contains = (a: string, b: string): boolean =>
  a !== '' && b !== '' && (a.includes(b) || b.includes(a));

const confidenceForLevel = (method: MatchMethod, matched: IngredientRow | null): MatchConfidence => {
  switch (method) {
    case 'exact_ean':
      return 'exact';
    case 'exact_normalized_name':
      return matched?.verification_status === 'verified' ? 'exact' : 'high';
    case 'brand_name':
      return 'high';
    case 'category_composition_similarity':
      return 'medium';
    case 'ingredient_type':
    case 'fuzzy_name':
      return 'low';
    case 'no_confident_match':
      return 'needs_review';
  }
};

interface LevelHit {
  method: Exclude<MatchMethod, 'no_confident_match'>;
  candidates: IngredientRow[];
}

/* ── the matcher ───────────────────────────────────────────────────────────── */

export function matchProduct(
  product: ProductRow,
  basement: readonly IngredientRow[],
): ProductMatchResult {
  // Prefer the display name; fall back to the internal name when display is blank or
  // whitespace-only (`??` would keep a present-but-empty string and skip the fallback).
  const displayName = normalizeName(product.product_name_display);
  const normalized_name = displayName !== '' ? displayName : normalizeName(product.product_name_internal);
  // A blank/whitespace category is treated exactly like an absent one — never coerced
  // into a bogus "other" classification with a misleading approximate-mapping note.
  const rawCategory = product.product_category?.trim();
  const categoryMatch = rawCategory ? mapDatasetCategory(rawCategory) : null;
  const normalized_category = categoryMatch ? categoryMatch.category : null;

  const missing_fields = ENGINE_SOURCE_VALUE_FIELDS.filter(
    (f) => numField(product, f) === null,
  ) as string[];

  // ── candidate computation per level (first level with >=1 candidate wins) ──
  const productEans = [canonicalEan(product.ean_code), canonicalEan(product.barcode)].filter(
    (e) => e !== '',
  );
  const byEan = (): IngredientRow[] =>
    productEans.length === 0
      ? []
      : basement.filter((b) => {
          const be = canonicalEan(b.ean_code);
          return be !== '' && productEans.includes(be);
        });

  const byExactName = (): IngredientRow[] =>
    normalized_name === '' ? [] : basement.filter((b) => basementNames(b).includes(normalized_name));

  const productBrand = normalizeName(product.brand);
  const byBrandName = (): IngredientRow[] =>
    productBrand === '' || normalized_name === ''
      ? []
      : basement.filter(
          (b) =>
            normalizeName(b.brand) === productBrand &&
            basementNames(b).some((bn) => contains(bn, normalized_name)),
        );

  // The composition + ingredient-type levels only ever pool rows whose category maps
  // EXACTLY on BOTH sides — never an approximate bucket. Without the basement-side
  // `.exact` guard, distinct dataset categories that collapse to the same engine bucket
  // (e.g. emulsifier/fiber -> stabilizer, or the heterogeneous "other" bucket) would be
  // pooled with structurally unrelated products. Approximate-category products therefore
  // never match via composition/ingredient_type — only via EAN/exact-name/brand/fuzzy.
  const sameCategory = (): IngredientRow[] => {
    if (!normalized_category || !categoryMatch?.exact) return [];
    return basement.filter((b) => {
      const bcat = mapDatasetCategory(b.ingredient_category);
      return bcat.exact && bcat.category === normalized_category;
    });
  };

  const byComposition = (): IngredientRow[] => {
    const pool = sameCategory();
    if (pool.length === 0) return [];
    return pool.filter((b) => {
      let shared = 0;
      let sum = 0;
      for (const f of COMPOSITION_FIELDS) {
        const pv = numField(product, f);
        const bv = numField(b, f);
        if (pv !== null && bv !== null) {
          shared += 1;
          sum += Math.abs(pv - bv);
        }
      }
      return shared >= MIN_SHARED_COMPOSITION_FIELDS && sum / shared <= COMPOSITION_AVG_DISTANCE_THRESHOLD;
    });
  };

  const byIngredientType = (): IngredientRow[] => sameCategory();

  const byFuzzyName = (): IngredientRow[] =>
    normalized_name.length < MIN_FUZZY_NAME_LENGTH
      ? []
      : basement.filter((b) => basementNames(b).some((bn) => contains(bn, normalized_name)));

  const levels: Array<{ method: LevelHit['method']; run: () => IngredientRow[] }> = [
    { method: 'exact_ean', run: byEan },
    { method: 'exact_normalized_name', run: byExactName },
    { method: 'brand_name', run: byBrandName },
    { method: 'category_composition_similarity', run: byComposition },
    { method: 'ingredient_type', run: byIngredientType },
    { method: 'fuzzy_name', run: byFuzzyName },
  ];

  let hit: LevelHit | null = null;
  for (const level of levels) {
    const candidates = level.run();
    if (candidates.length >= 1) {
      hit = { method: level.method, candidates };
      break;
    }
  }

  const categoryNote =
    categoryMatch && !categoryMatch.exact ? `category mapping approximate: ${categoryMatch.reason}` : null;

  // ── no confident match ────────────────────────────────────────────────────
  if (!hit) {
    const reasons = ['no confident match against the reference base'];
    if (missing_fields.length > 0) reasons.push(`missing engine source values: ${missing_fields.join(', ')}`);
    return {
      mapper_status: 'unmatched',
      match_method: 'no_confident_match',
      match_confidence: 'needs_review',
      matched_basement_id: null,
      normalized_name,
      normalized_category,
      needs_review_reason: reasons.join('; '),
      mapper_notes: categoryNote,
      missing_fields,
      candidate_count: 0,
      candidate_ids: [],
    };
  }

  const { method, candidates } = hit;
  const candidate_ids = candidates.slice(0, MAX_CANDIDATE_IDS).map((c) => c.ingredient_id);

  // ── ambiguous (more than one candidate at the winning level) ───────────────
  if (candidates.length > 1) {
    return {
      mapper_status: 'ambiguous',
      match_method: method,
      match_confidence: 'needs_review',
      matched_basement_id: null,
      normalized_name,
      normalized_category,
      needs_review_reason: `${candidates.length} candidates tie at ${method}`,
      mapper_notes: [categoryNote, `candidates: ${candidate_ids.join(', ')}`].filter(Boolean).join('; '),
      missing_fields,
      candidate_count: candidates.length,
      candidate_ids,
    };
  }

  // ── exactly one candidate ──────────────────────────────────────────────────
  const matched = candidates[0]!;
  const levelConfidence = confidenceForLevel(method, matched);

  // A single candidate, but the product is missing engine source values (pac/pod).
  // Route to review UNLESS the match is exact AND the matched reference can actually
  // supply every missing value. An exact match to a reference that ALSO lacks them
  // cannot make the product engine-ready, so it must not be reported as a clean match.
  if (missing_fields.length > 0) {
    const unfillable = missing_fields.filter((f) => numField(matched, f) === null);
    if (levelConfidence !== 'exact' || unfillable.length > 0) {
      const reason =
        levelConfidence === 'exact'
          ? `matched reference also lacks engine source values: ${unfillable.join(', ')}`
          : `missing engine source values: ${missing_fields.join(', ')}`;
      return {
        mapper_status: 'needs_review',
        match_method: method,
        match_confidence: 'needs_review',
        matched_basement_id: matched.ingredient_id,
        normalized_name,
        normalized_category,
        needs_review_reason: reason,
        mapper_notes: categoryNote,
        missing_fields,
        candidate_count: 1,
        candidate_ids,
      };
    }
  }

  return {
    mapper_status: 'matched',
    match_method: method,
    match_confidence: levelConfidence,
    matched_basement_id: matched.ingredient_id,
    normalized_name,
    normalized_category,
    needs_review_reason: null,
    mapper_notes: categoryNote,
    missing_fields,
    candidate_count: 1,
    candidate_ids,
  };
}
