/**
 * Mapper-first value inference — turn what Gellatti already knows into real
 * working numbers for products it has never seen.
 *
 * The owner derived, by hand, that a large majority of an 820-row import is
 * already formulable from Mapper knowledge alone. This module is the systemic
 * form of that judgement. It reads ONLY the existing Mapper Base — it never
 * writes to it, never adds rows to it, and never treats an imported product as
 * Mapper knowledge.
 *
 * Four tiers, strongest first:
 *
 *   1. MAPPER EXACT       — the product's checksum-valid GTIN is a Mapper row's
 *                           `ean_code`. That is identity, so its values are
 *                           VERIFIED, not estimated.
 *   2. SIMPLE PROFILE     — the product's name IS a commodity the Mapper already
 *                           defines ("sacharoza", "woda", "cocoa butter"). Same
 *                           substance, different supplier: high-confidence
 *                           ESTIMATED.
 *   3. BRAND SIBLING      — the same brand's other rows in the same subcategory.
 *   4. FAMILY CONSENSUS   — the inferred Mapper family's cohort agrees tightly.
 *
 * Tiers 2–4 are all dispersion-gated per field. A cohort that disagrees produces
 * NOTHING for that field — never a midpoint of a wide spread, which would be a
 * number nobody measured dressed up as knowledge. This is the single most
 * important property here: the gate is on agreement, not on having an answer.
 *
 * Pure and deterministic: no DB, no network, no AI, no clock.
 */
import {
  foldLatin,
  inferMapperFamily,
  familySupportsCohort,
  type ProductFamilyId,
} from './mapperFamilyInference';
import {
  knownField,
  WORKING_NUMERIC_FIELDS,
  type FieldTruth,
  type WorkingNumericField,
} from './productFieldTruth';

/** Structural subset of the Mapper `IngredientRow` this module reads. */
export interface MapperKnowledgeRow {
  ingredient_id: string;
  ingredient_name_internal: string;
  ingredient_name_display?: string | null;
  brand?: string | null;
  ingredient_category?: string | null;
  ingredient_subcategory?: string | null;
  is_active?: boolean;
  ean_code?: string | null;
  water_percent: number | null;
  total_solids_percent: number | null;
  fat_percent: number | null;
  protein_percent: number | null;
  carbohydrate_percent: number | null;
  total_sugars_percent: number | null;
  fiber_percent: number | null;
  salt_percent: number | null;
  alcohol_percent: number | null;
  kcal_per_100g: number | null;
  pod_value: number | null;
  pac_value: number | null;
  sweetness_factor: number | null;
  freezing_factor: number | null;
}

/**
 * Maximum robust half-spread a cohort may show, in each field's own units,
 * before that field is refused.
 *
 * These are physical judgements, not fitted parameters: salt is declared to
 * 0.1 g so half a point of disagreement is already a different product, while
 * chocolate fat genuinely ranges several points inside one honest family.
 */
export const CONSENSUS_BANDS: Readonly<Record<WorkingNumericField, number>> = Object.freeze({
  water_percent: 6,
  total_solids_percent: 6,
  fat_percent: 4,
  protein_percent: 2.5,
  carbohydrate_percent: 6,
  total_sugars_percent: 6,
  fiber_percent: 2,
  salt_percent: 0.5,
  alcohol_percent: 3,
  kcal_per_100g: 45,
  pod_value: 12,
  pac_value: 12,
  sweetness_factor: 0.15,
  freezing_factor: 0.2,
});

/** Minimum cohort sizes. A "consensus" of one is not a consensus. */
export const MIN_FAMILY_COHORT = 3;
export const MIN_SIBLING_COHORT = 2;

/**
 * Ceiling confidence per tier, reached only by a cohort with no disagreement at
 * all. Each is a statement about the evidence, not a dial to hit a target.
 *
 * Every ceiling sits clearly ABOVE the working-value floor, which is the point:
 * a tier whose ceiling brushed the floor could never contribute a usable value
 * however unanimous its cohort, which would make the tier decorative. What
 * decides usability is therefore the cohort's agreement (below), not an accident
 * of where the ceiling was placed.
 */
export const TIER_CONFIDENCE = Object.freeze({
  mapper_exact: 0.97,
  mapper_simple_profile: 0.95,
  // Nearest neighbours are more specific evidence than a whole family, and than
  // a brand's other products in a different flavour.
  mapper_similar_profile: 0.93,
  mapper_brand_sibling: 0.92,
  mapper_family_consensus: 0.9,
});

/**
 * How much of a tier's ceiling disagreement can consume. A cohort sitting right
 * at the edge of its band loses half its standing; a near-unanimous cohort loses
 * almost nothing. Combined with the 0.85 working floor this means a family
 * consensus only becomes a working value when its interquartile half-spread is
 * inside roughly a tenth of the field's band — a genuinely tight bar.
 */
const DISAGREEMENT_PENALTY = 0.5;

/** A name long enough to be marketing copy is not a commodity name. */
const MAX_SIMPLE_PROFILE_TOKENS = 4;

/** Minimum rows before a nearest-neighbour cohort is trusted. */
export const MIN_SIMILAR_COHORT = 3;

/**
 * A token appearing in more than this share of the Mapper says nothing about
 * which rows are similar — "pasta", "bio", "kg" and the like. Dropping them is
 * what stops a nearest-neighbour cohort collapsing back into the whole family.
 */
export const MAX_TOKEN_DOCUMENT_SHARE = 0.15;

/**
 * A token is never discarded for being common until it is common in absolute
 * terms too. Without this floor the share rule is scale-dependent: against a
 * small Mapper a perfectly discriminating token like "pistacjowa" appears in a
 * large FRACTION of rows and would be thrown away. Tokens that survive but
 * carry no information are handled anyway by their inverse-document-frequency
 * weight, which is exactly zero for a token present in every row.
 */
export const MIN_TOKEN_DISCARD_COUNT = 20;

/** Rows scoring at least this share of the best score join the cohort. */
const SIMILARITY_ADMISSION = 0.6;

const MIN_TOKEN_LENGTH = 3;

/** Identity tokens worth matching on: long enough, and not pure digits. */
export function identityTokens(...parts: (string | null | undefined)[]): string[] {
  const tokens = new Set<string>();
  for (const part of parts) {
    for (const token of normalizeName(part).split(' ')) {
      if (token.length < MIN_TOKEN_LENGTH) continue;
      if (/^\d+$/.test(token)) continue;
      tokens.add(token);
    }
  }
  return [...tokens];
}

export const normalizeName = (value: string | null | undefined): string =>
  // Same fold as the family classifier: "masło" must reduce to "maslo", not to
  // the two fragments a naive strip-non-ASCII pass would leave behind.
  foldLatin(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const digitsOnly = (value: string | null | undefined): string => (value ?? '').replace(/\D+/g, '');

/** GTIN forms compare equal only once padded to 14 — UPC-A and EAN-13 alias. */
const canonicalCode = (value: string | null | undefined): string | null => {
  const digits = digitsOnly(value);
  if (digits.length < 8 || digits.length > 14) return null;
  return digits.padStart(14, '0');
};

const numeric = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/* ── knowledge base ────────────────────────────────────────────────────────── */

/**
 * Deterministic fingerprint of a loaded Mapper set.
 *
 * The dry runs hash the CSV file itself, which the browser never sees. At
 * runtime the Mapper arrives as rows from the database, so the fingerprint is
 * derived from their identities instead: same rows in any order produce the
 * same value, and a single added, removed or renumbered row changes it. That is
 * all the fingerprint has to do — pin which Mapper an estimate was derived
 * against, so a value can be re-checked later or invalidated when the Mapper
 * moves.
 *
 * FNV-1a rather than sha256 because this must be synchronous: the Web Crypto
 * digest is async, and a fingerprint that arrives after the values it stamps is
 * worse than useless.
 */
export function fingerprintMapperRows(rows: readonly MapperKnowledgeRow[]): string {
  const ids = rows
    .filter((row) => row.is_active !== false)
    .map((row) => row.ingredient_id)
    .sort();
  let hash = 0x811c9dc5;
  for (const id of ids) {
    for (let index = 0; index < id.length; index++) {
      hash ^= id.charCodeAt(index);
      // The 32-bit FNV prime, applied with shifts so this stays exact in JS.
      hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
    }
    hash = (hash ^ 0x2f) >>> 0;
  }
  return `runtime-${ids.length}-${hash.toString(16).padStart(8, '0')}`;
}

export interface MapperKnowledge {
  /** sha256 of the Mapper Base these cohorts were built from. */
  fingerprint: string;
  rows: readonly MapperKnowledgeRow[];
  byCode: ReadonlyMap<string, MapperKnowledgeRow>;
  byName: ReadonlyMap<string, readonly MapperKnowledgeRow[]>;
  byFamily: ReadonlyMap<ProductFamilyId, readonly MapperKnowledgeRow[]>;
  byBrandSubcategory: ReadonlyMap<string, readonly MapperKnowledgeRow[]>;
  /** Rows containing each identity token, for nearest-neighbour cohorts. */
  byToken: ReadonlyMap<string, readonly MapperKnowledgeRow[]>;
  /** How many rows each token appears in — the basis for its weight. */
  documentFrequency: ReadonlyMap<string, number>;
  indexedRows: number;
}

const brandKey = (
  brand: string | null | undefined,
  subcategory: string | null | undefined,
): string => `${normalizeName(brand)} ${normalizeName(subcategory)}`;

function push<K>(map: Map<K, MapperKnowledgeRow[]>, key: K, row: MapperKnowledgeRow): void {
  const existing = map.get(key);
  if (existing) existing.push(row);
  else map.set(key, [row]);
}

/**
 * Index the Mapper once per import. Families are inferred for Mapper rows using
 * the SAME classifier the imported product goes through, so a cohort is always
 * "rows Gellatti would have called this family too" — never a hand-drawn list.
 */
export function buildMapperKnowledge(
  rows: readonly MapperKnowledgeRow[],
  fingerprint: string,
): MapperKnowledge {
  const byCode = new Map<string, MapperKnowledgeRow>();
  const byName = new Map<string, MapperKnowledgeRow[]>();
  const byFamily = new Map<ProductFamilyId, MapperKnowledgeRow[]>();
  const byBrandSubcategory = new Map<string, MapperKnowledgeRow[]>();
  const byToken = new Map<string, MapperKnowledgeRow[]>();
  let indexedRows = 0;

  for (const row of rows) {
    if (row.is_active === false) continue;
    indexedRows++;

    for (const token of identityTokens(
      row.ingredient_name_internal,
      row.ingredient_name_display,
      row.ingredient_subcategory,
    )) {
      push(byToken, token, row);
    }

    const code = canonicalCode(row.ean_code);
    // First row wins, so a duplicated code cannot silently reassign identity.
    if (code && !byCode.has(code)) byCode.set(code, row);

    for (const name of [row.ingredient_name_internal, row.ingredient_name_display]) {
      const normalized = normalizeName(name);
      if (normalized) push(byName, normalized, row);
    }

    const family = inferMapperFamily({
      name: row.ingredient_name_internal,
      variant: row.ingredient_name_display ?? null,
      sourceCategory: row.ingredient_category ?? null,
      sourceSubcategory: row.ingredient_subcategory ?? null,
    });
    if (familySupportsCohort(family) && family) push(byFamily, family.family, row);

    if (normalizeName(row.brand) && normalizeName(row.ingredient_subcategory)) {
      push(byBrandSubcategory, brandKey(row.brand, row.ingredient_subcategory), row);
    }
  }

  // De-duplicate name cohorts: internal and display names often coincide.
  for (const [name, cohort] of byName) {
    const seen = new Set<string>();
    byName.set(
      name,
      cohort.filter((row) =>
        seen.has(row.ingredient_id) ? false : (seen.add(row.ingredient_id), true),
      ),
    );
  }

  const documentFrequency = new Map<string, number>(
    [...byToken].map(([token, cohort]) => [token, cohort.length]),
  );

  return {
    fingerprint,
    rows,
    byCode,
    byName,
    byFamily,
    byBrandSubcategory,
    byToken,
    documentFrequency,
    indexedRows,
  };
}

/**
 * Find the Mapper rows most like this product, by weighted identity-token
 * overlap.
 *
 * This is what makes consensus usable at all. A 618-row `flavor_paste` family
 * spans pistachio to strawberry, so its dispersion is enormous and every field
 * is correctly refused — the family is real, but it is not a cohort. The rows
 * that actually predict a pistachio paste are the other pistachio pastes, and
 * that is what this selects.
 *
 * Tokens are weighted by inverse document frequency computed from the Mapper
 * itself, so "pistacjowa" counts and "pasta" does not, without a hand-written
 * stop-list to maintain.
 */
export function similarCohort(
  input: MapperInferenceInput,
  knowledge: MapperKnowledge,
): { rows: MapperKnowledgeRow[]; tokens: string[] } {
  const ceiling = Math.max(
    MIN_TOKEN_DISCARD_COUNT,
    knowledge.indexedRows * MAX_TOKEN_DOCUMENT_SHARE,
  );
  // A brand name must never make a product resemble a substance. "Adalbert's
  // Tea Herbata zielona" is green tea sold by a company with "Tea" in its name;
  // letting that token select the cohort pulled black-tea rows onto green tea —
  // precisely the class of mapping this architecture exists to refuse.
  const brandTokens = new Set(identityTokens(input.brand));
  const tokens = identityTokens(input.name, input.variant).filter((token) => {
    if (brandTokens.has(token)) return false;
    const frequency = knowledge.documentFrequency.get(token) ?? 0;
    return frequency > 0 && frequency <= ceiling;
  });
  if (tokens.length === 0) return { rows: [], tokens: [] };

  const scores = new Map<string, { row: MapperKnowledgeRow; score: number }>();
  for (const token of tokens) {
    const frequency = knowledge.documentFrequency.get(token) ?? 0;
    const weight = Math.log(knowledge.indexedRows / frequency);
    for (const row of knowledge.byToken.get(token) ?? []) {
      const entry = scores.get(row.ingredient_id);
      if (entry) entry.score += weight;
      else scores.set(row.ingredient_id, { row, score: weight });
    }
  }
  if (scores.size === 0) return { rows: [], tokens };

  const ranked = [...scores.values()].sort(
    (a, b) =>
      b.score - a.score || a.row.ingredient_id.localeCompare(b.row.ingredient_id),
  );
  const best = ranked[0].score;
  // Every candidate scoring zero means the query shared only tokens that appear
  // in every row — no evidence at all. Admitting them would quietly select the
  // entire Mapper as a "cohort".
  if (best <= 0) return { rows: [], tokens };
  return {
    rows: ranked
      .filter((entry) => entry.score >= best * SIMILARITY_ADMISSION)
      .map((entry) => entry.row),
    tokens,
  };
}

/* ── consensus statistics ──────────────────────────────────────────────────── */

export interface FieldConsensus {
  value: number;
  /** Robust half-spread actually observed, in the field's units. */
  spread: number;
  /** 0–1: how far inside its band the cohort sat. 1 means perfect agreement. */
  tightness: number;
  contributors: string[];
}

const round4 = (value: number): number => Math.round(value * 1e4) / 1e4;

const median = (sorted: readonly number[]): number => {
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Quantile on the sorted sample, linear interpolation between neighbours. */
const quantile = (sorted: readonly number[], q: number): number => {
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const low = Math.floor(pos);
  const high = Math.ceil(pos);
  return low === high ? sorted[low] : sorted[low] + (sorted[high] - sorted[low]) * (pos - low);
};

/**
 * Agree a single field across a cohort, or refuse.
 *
 * The interquartile spread is used rather than the full range so one mislabelled
 * Mapper row cannot veto an otherwise unanimous family — but it is still a
 * spread, so a genuinely bimodal cohort is refused rather than averaged.
 */
export function fieldConsensus(
  cohort: readonly MapperKnowledgeRow[],
  field: WorkingNumericField,
  minCohort: number,
): FieldConsensus | null {
  const contributors: string[] = [];
  const values: number[] = [];
  for (const row of cohort) {
    const value = numeric(row[field]);
    if (value === null) continue;
    values.push(value);
    contributors.push(row.ingredient_id);
  }
  if (values.length < minCohort) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const spread = (quantile(sorted, 0.75) - quantile(sorted, 0.25)) / 2;
  const band = CONSENSUS_BANDS[field];
  if (spread > band) return null;

  return {
    value: round4(median(sorted)),
    spread: round4(spread),
    tightness: band === 0 ? 1 : 1 - Math.min(1, spread / band),
    contributors,
  };
}

/** Confidence a cohort earns: the tier ceiling, discounted by its disagreement. */
const cohortConfidence = (ceiling: number, tightness: number): number =>
  round4(ceiling * (1 - DISAGREEMENT_PENALTY * (1 - tightness)));

/* ── inference ─────────────────────────────────────────────────────────────── */

export type MapperInferenceTier =
  | 'mapper_exact'
  | 'mapper_simple_profile'
  | 'mapper_similar_profile'
  | 'mapper_brand_sibling'
  | 'mapper_family_consensus';

export interface MapperInferenceInput {
  name: string | null;
  variant?: string | null;
  brand?: string | null;
  subcategory?: string | null;
  category?: string | null;
  /** Checksum-valid GTIN, when the row has one. */
  barcode?: string | null;
}

export interface MapperInferenceResult {
  /** Every field this Mapper pass could stand behind, strongest tier first. */
  fields: Partial<Record<WorkingNumericField, FieldTruth>>;
  /** Tiers that actually contributed at least one field. */
  tiersUsed: MapperInferenceTier[];
  /** The exact Mapper row, when GTIN identity matched. */
  exactRow: MapperKnowledgeRow | null;
  family: ProductFamilyId | null;
  /** Owner-readable trace of what was consulted and what it yielded. */
  trace: string[];
}

/**
 * Infer every safe working value for one product.
 *
 * Tiers are applied strongest-first and a stronger tier's field is never
 * overwritten by a weaker one, so a GTIN-identified row's measured fat always
 * beats its family's opinion about fat.
 */
export function inferMapperValues(
  input: MapperInferenceInput,
  knowledge: MapperKnowledge,
): MapperInferenceResult {
  const fields: Partial<Record<WorkingNumericField, FieldTruth>> = {};
  const tiersUsed: MapperInferenceTier[] = [];
  const trace: string[] = [];
  const claim = (field: WorkingNumericField, truth: FieldTruth): boolean => {
    if (fields[field]) return false;
    fields[field] = truth;
    return true;
  };

  /* 1. exact GTIN identity — verified, because it identifies the product */
  const code = canonicalCode(input.barcode);
  const exactRow = code ? (knowledge.byCode.get(code) ?? null) : null;
  if (exactRow) {
    let claimed = 0;
    for (const field of WORKING_NUMERIC_FIELDS) {
      const value = numeric(exactRow[field]);
      if (value === null) continue;
      const truth = knownField({
        value,
        state: 'VERIFIED',
        confidence: TIER_CONFIDENCE.mapper_exact,
        basis: 'mapper_exact',
        mapperReferences: [exactRow.ingredient_id],
        mapperFingerprint: knowledge.fingerprint,
        note: `GTIN ${code} to wiersz Mappera ${exactRow.ingredient_id}`,
      });
      if (claim(field, truth)) claimed++;
    }
    if (claimed > 0) tiersUsed.push('mapper_exact');
    trace.push(`mapper_exact: ${exactRow.ingredient_id} → ${claimed} pol`);
  }

  /* 2. simple profile — the product name IS a commodity the Mapper defines */
  const normalized = normalizeName(input.name);
  const tokens = normalized ? normalized.split(' ').length : 0;
  const nameCohort =
    normalized && tokens > 0 && tokens <= MAX_SIMPLE_PROFILE_TOKENS
      ? (knowledge.byName.get(normalized) ?? null)
      : null;
  if (nameCohort && nameCohort.length > 0) {
    const claimed = applyCohort(
      claim,
      nameCohort,
      1,
      'mapper_simple_profile',
      knowledge.fingerprint,
      `nazwa produktu jest surowcem znanym Mapperowi ("${normalized}")`,
    );
    if (claimed > 0) tiersUsed.push('mapper_simple_profile');
    trace.push(`mapper_simple_profile: ${nameCohort.length} wierszy → ${claimed} pol`);
  }

  /* 3. nearest neighbours by weighted identity-token overlap */
  const similar = similarCohort(input, knowledge);
  if (similar.rows.length >= MIN_SIMILAR_COHORT) {
    const claimed = applyCohort(
      claim,
      similar.rows,
      MIN_SIMILAR_COHORT,
      'mapper_similar_profile',
      knowledge.fingerprint,
      `najbardziej podobne wiersze Mappera (${similar.rows.length}) wg tokenow: ${similar.tokens.join(', ')}`,
    );
    if (claimed > 0) tiersUsed.push('mapper_similar_profile');
    trace.push(
      `mapper_similar_profile: ${similar.rows.length} wierszy (${similar.tokens.length} tokenow) → ${claimed} pol`,
    );
  }

  /* 4. same brand, same subcategory */
  const siblingCohort =
    normalizeName(input.brand) && normalizeName(input.subcategory)
      ? (knowledge.byBrandSubcategory.get(brandKey(input.brand, input.subcategory)) ?? null)
      : null;
  if (siblingCohort && siblingCohort.length >= MIN_SIBLING_COHORT) {
    const claimed = applyCohort(
      claim,
      siblingCohort,
      MIN_SIBLING_COHORT,
      'mapper_brand_sibling',
      knowledge.fingerprint,
      `zgodne wiersze tej samej marki i podkategorii (${siblingCohort.length})`,
    );
    if (claimed > 0) tiersUsed.push('mapper_brand_sibling');
    trace.push(`mapper_brand_sibling: ${siblingCohort.length} wierszy → ${claimed} pol`);
  }

  /* 5. family consensus */
  const familyMatch = inferMapperFamily({
    name: input.name,
    variant: input.variant ?? null,
    sourceCategory: input.category ?? null,
    sourceSubcategory: input.subcategory ?? null,
  });
  const family = familySupportsCohort(familyMatch) && familyMatch ? familyMatch.family : null;
  if (family) {
    const cohort = knowledge.byFamily.get(family) ?? [];
    if (cohort.length >= MIN_FAMILY_COHORT) {
      const claimed = applyCohort(
        claim,
        cohort,
        MIN_FAMILY_COHORT,
        'mapper_family_consensus',
        knowledge.fingerprint,
        `zgodna rodzina Mappera "${family}" (${cohort.length} wierszy)`,
      );
      if (claimed > 0) tiersUsed.push('mapper_family_consensus');
      trace.push(`mapper_family_consensus: ${family}, ${cohort.length} wierszy → ${claimed} pol`);
    } else {
      trace.push(`mapper_family_consensus: ${family} za mala kohorta (${cohort.length})`);
    }
  }

  return { fields, tiersUsed, exactRow, family, trace };
}

/** Run the consensus over one cohort and claim whatever it can stand behind. */
function applyCohort(
  claim: (field: WorkingNumericField, truth: FieldTruth) => boolean,
  cohort: readonly MapperKnowledgeRow[],
  minCohort: number,
  tier: Exclude<MapperInferenceTier, 'mapper_exact'>,
  fingerprint: string,
  reason: string,
): number {
  let claimed = 0;
  for (const field of WORKING_NUMERIC_FIELDS) {
    const consensus = fieldConsensus(cohort, field, minCohort);
    if (!consensus) continue;
    const ceiling = TIER_CONFIDENCE[tier];
    const truth = knownField({
      value: consensus.value,
      state: 'ESTIMATED',
      confidence: cohortConfidence(ceiling, consensus.tightness),
      basis: tier,
      mapperReferences: consensus.contributors,
      mapperFingerprint: fingerprint,
      note: `${reason}; rozrzut ±${consensus.spread}`,
      cohort: {
        size: consensus.contributors.length,
        spread: consensus.spread,
        band: CONSENSUS_BANDS[field],
        tightness: round4(consensus.tightness),
        ceiling,
      },
    });
    if (claim(field, truth)) claimed++;
  }
  return claimed;
}
