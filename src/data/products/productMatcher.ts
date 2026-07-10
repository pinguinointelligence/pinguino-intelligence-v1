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
import { conceptsFromName, rankCandidatesByName } from '@/data/products/productNameTiebreak';
import { milkBandCandidateIds } from '@/data/products/productMilkFatBand';
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

/**
 * Composition fields compared as percentage points — the MEASURED nutrition fields
 * populated on BOTH a (Mercadona) product and the reference base. Slice 1 moved this from
 * 3 effective dimensions to 5 by adding carbohydrate + salt.
 *
 * Deliberately EXCLUDED:
 *   • water_percent / total_solids_percent — products carry no measured value (not on EU
 *     nutrition labels), so comparing them would always be a non-shared no-op;
 *   • saturated_fat_percent — the reference base stores it as 0 for EVERY row (an
 *     unpopulated placeholder), so comparing a product's real saturated fat against 0 would
 *     add a large spurious distance and wrongly reject true matches.
 */
export const COMPOSITION_FIELDS = [
  'fat_percent',
  'carbohydrate_percent',
  'total_sugars_percent',
  'protein_percent',
  'salt_percent',
] as const;

/** Need at least this many fields present in BOTH rows to trust a composition match.
 * Real products and reference rows both carry all 5 measured fields, so a genuine
 * in-category comparison always shares 5; requiring 4 stops a thin overlap from matching. */
export const MIN_SHARED_COMPOSITION_FIELDS = 4;
/** Mean absolute per-field difference (pp) at/under which composition is "similar".
 * Kept at 2: real good-match mean distances span ~0.3–1.3 pp, and the two known
 * same-category macro-twins (stracciatella-yogurt≈condensed-milk, protein-drink≈yogurt)
 * fall in that SAME band — so lowering this would drop legitimate matches too. Twins are
 * handled by the missing-pac/pod → needs_review routing + human review, never by this number. */
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
      // v1.0 vocabulary: the whole 'Verified*' status family counts as verified
      return matched?.verification_status.startsWith('Verified') ? 'exact' : 'high';
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
  //
  // ── narrow special-case: COFFEE ─────────────────────────────────────────────
  // Coffee references live in the dataset category `coffee_tea`, which maps to the engine
  // `flavor` bucket only APPROXIMATELY (exact:false) — so the exact-category pool can never
  // surface them and a coffee product could not reach the coffee references at all. When the
  // PRODUCT is an exact-`flavor` item whose NAME carries the coffee concept (deterministic
  // "café"/"coffee" synonym), we ADDITIONALLY pool `coffee_tea` references whose NAME also
  // carries the coffee concept. BOTH sides need explicit coffee name evidence, so tea
  // references and generic flavor products stay excluded; no other approximate category is
  // affected. (Ranking within the pool is still the name tiebreaker below — note the
  // "Grain Coffee" cereal-substitute false friend documented in productNameTiebreak.)
  const productConcepts = conceptsFromName(product.product_name_display ?? '');
  const coffeeRefs: IngredientRow[] =
    normalized_category === 'flavor' && categoryMatch?.exact && productConcepts.has('coffee')
      ? basement.filter((b) => {
          if ((b.ingredient_category ?? '').trim().toLowerCase() !== 'coffee_tea') return false;
          const name = (b.ingredient_name_display ?? '').trim() || (b.ingredient_name_internal ?? '');
          return conceptsFromName(name).has('coffee');
        })
      : [];

  const sameCategory = (): IngredientRow[] => {
    if (!normalized_category || !categoryMatch?.exact) return [];
    const pool = basement.filter((b) => {
      const bcat = mapDatasetCategory(b.ingredient_category);
      return bcat.exact && bcat.category === normalized_category;
    });
    return coffeeRefs.length > 0 ? [...pool, ...coffeeRefs] : pool;
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
  const specialPoolNote =
    coffeeRefs.length > 0
      ? `coffee special-case pool: +${coffeeRefs.length} coffee_tea reference(s) (coffee name evidence on both sides)`
      : null;

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
  const poolCount = candidates.length;

  // ── deterministic NAME-CONCEPT tiebreaker over the winning pool ────────────
  // Rank the pool by Spanish/English concept overlap with the product name, then NARROW to a
  // single candidate ONLY when exactly one candidate holds the unique-maximum score (> 0). This
  // never creates a match from a vague term (it only reorders/narrows an existing composition/
  // category pool) and never narrows when there is no distinguishing name evidence (all 0, or a
  // tie). A narrowed single still routes through the same missing-pac/pod logic below — so for
  // products without their own pac/pod it becomes a needs_review SUGGESTION, never an auto-match.
  let effective = candidates;
  let tiebreakNote: string | null = null;
  let bandNote: string | null = null;
  let orderedIds = candidates.map((c) => c.ingredient_id);

  // ── deterministic MILK FAT-BAND narrowing (before the name tiebreak) ───────
  // A milk product whose name declares its fat level (entera/semidesnatada/desnatada) narrows to
  // the milk-named reference whose STORED fat sits inside that band — ONLY when exactly one fits.
  // Lactose-free and protein-fortified milks never band (see productMilkFatBand); zero in-band
  // refs means a reference gap, never a narrow onto an out-of-band ref.
  if (poolCount > 1) {
    const bandIds = milkBandCandidateIds(
      product.product_name_display ?? '',
      candidates.map((c) => ({
        id: c.ingredient_id,
        name: (c.ingredient_name_display?.trim() || c.ingredient_name_internal) ?? '',
        fat: numField(c, 'fat_percent'),
      })),
    );
    if (bandIds !== null && bandIds.length === 1) {
      const winner = candidates.find((c) => c.ingredient_id === bandIds[0]);
      if (winner) {
        effective = [winner];
        bandNote = `milk fat-band narrowed ${poolCount}→1 to ${bandIds[0]} (declared fat level matches the reference's stored fat)`;
      }
    } else if (bandIds !== null && bandIds.length === 0) {
      bandNote = 'milk fat-band: no milk reference inside the declared fat band (reference gap — not narrowed)';
    }
  }

  if (effective.length > 1) {
    const ranked = rankCandidatesByName(
      product.product_name_display ?? '',
      candidates.map((c) => ({
        id: c.ingredient_id,
        name: (c.ingredient_name_display?.trim() || c.ingredient_name_internal) ?? '',
      })),
    );
    orderedIds = ranked.map((r) => r.id);
    const top = ranked[0];
    const topCount = top ? ranked.filter((r) => r.score === top.score).length : 0;
    const nextScore = ranked.length > 1 ? ranked[1]!.score : 0;
    if (top && top.score > 0 && topCount === 1) {
      const winner = candidates.find((c) => c.ingredient_id === top.id);
      if (winner) {
        effective = [winner];
        tiebreakNote = `name tiebreaker narrowed ${poolCount}→1 to ${top.id} (concept score ${top.score} > next ${nextScore})`;
      }
    } else if (top && top.score > 0) {
      tiebreakNote = `name tiebreaker ranked shortlist (top score ${top.score}, ${topCount}-way tie)`;
    }
  }

  const candidate_ids = orderedIds.slice(0, MAX_CANDIDATE_IDS);

  // ── ambiguous (still more than one candidate; no unique name winner) ───────
  if (effective.length > 1) {
    return {
      mapper_status: 'ambiguous',
      match_method: method,
      match_confidence: 'needs_review',
      matched_basement_id: null,
      normalized_name,
      normalized_category,
      needs_review_reason: `${effective.length} candidates tie at ${method}`,
      mapper_notes: [categoryNote, specialPoolNote, bandNote, tiebreakNote, `candidates: ${candidate_ids.join(', ')}`].filter(Boolean).join('; '),
      missing_fields,
      candidate_count: poolCount,
      candidate_ids,
    };
  }

  // ── exactly one candidate (natural single, or name-narrowed from the pool) ─
  const matched = effective[0]!;
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
        mapper_notes: [categoryNote, specialPoolNote, bandNote, tiebreakNote].filter(Boolean).join('; ') || null,
        missing_fields,
        candidate_count: poolCount,
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
    mapper_notes: [categoryNote, specialPoolNote, bandNote, tiebreakNote].filter(Boolean).join('; ') || null,
    missing_fields,
    candidate_count: poolCount,
    candidate_ids,
  };
}
