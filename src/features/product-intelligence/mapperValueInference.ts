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
} from './mapperFamilyInference.ts';
import {
  knownField,
  WORKING_NUMERIC_FIELDS,
  type FieldTruth,
  type WorkingNumericField,
} from './productFieldTruth.ts';
import {
  evaluateMapperSemanticCompatibility,
  type ProductSemanticClassification,
} from './productRecognition.ts';

/** Structural subset of the Mapper `IngredientRow` this module reads. */
export interface MapperKnowledgeRow {
  ingredient_id: string;
  ingredient_name_internal: string;
  ingredient_name_display?: string | null;
  brand?: string | null;
  ingredient_category?: string | null;
  ingredient_subcategory?: string | null;
  is_active?: boolean;
  /** ProductBehavior admission metadata. Optional only for legacy fixtures;
   * runtime and dry-run loaders project it from the immutable Mapper row. */
  approved_for_base?: boolean;
  approved_for_engines?: boolean;
  verification_status?: string | null;
  ean_code?: string | null;
  water_percent: number | null;
  total_solids_percent: number | null;
  fat_percent: number | null;
  protein_percent: number | null;
  carbohydrate_percent: number | null;
  total_sugars_percent: number | null;
  sucrose_percent: number | null;
  dextrose_percent: number | null;
  glucose_percent: number | null;
  fructose_percent: number | null;
  lactose_percent: number | null;
  polyol_percent: number | null;
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
  // A sugar's identity is far less forgiving than its total: two products with
  // the same sugars but different kinds freeze differently.
  sucrose_percent: 5,
  dextrose_percent: 3,
  glucose_percent: 3,
  fructose_percent: 3,
  lactose_percent: 2,
  polyol_percent: 3,
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
    (a, b) => b.score - a.score || a.row.ingredient_id.localeCompare(b.row.ingredient_id),
  );
  const best = ranked[0]?.score ?? 0;
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
  if (sorted.length === 0) return 0;
  const mid = sorted.length >> 1;
  const upper = sorted[mid] ?? 0;
  return sorted.length % 2 === 1 ? upper : ((sorted[mid - 1] ?? upper) + upper) / 2;
};

/** Quantile on the sorted sample, linear interpolation between neighbours. */
const quantile = (sorted: readonly number[], q: number): number => {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0] ?? 0;
  const pos = (sorted.length - 1) * q;
  const low = Math.floor(pos);
  const high = Math.ceil(pos);
  const lowValue = sorted[low] ?? 0;
  const highValue = sorted[high] ?? lowValue;
  return low === high ? lowValue : lowValue + (highValue - lowValue) * (pos - low);
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
  /**
   * Macros already established for THIS product, from its label or an exact
   * source card. When present they condition every cohort: a neighbour whose own
   * published macros are incompatible cannot be evidence about this product,
   * however similar its name reads.
   */
  knownMacros?: Partial<Record<'fat_percent' | 'protein_percent' | 'carbohydrate_percent', number>>;
  name: string | null;
  variant?: string | null;
  brand?: string | null;
  subcategory?: string | null;
  category?: string | null;
  /** Checksum-valid GTIN, when the row has one. */
  barcode?: string | null;
  /** Recognition V2 result. When present, every Mapper tier is narrowed before
   * it may contribute a value. */
  semantic?: ProductSemanticClassification | null;
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
  /** The most specific cohort selected, kept so the caller can complete solids
   * from THIS product's own macros rather than the cohort's median solids. */
  bestCohort: { rows: readonly MapperKnowledgeRow[]; minCohort: number; label: string } | null;
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
  let bestCohort: MapperInferenceResult['bestCohort'] = null;
  const claim = (field: WorkingNumericField, truth: FieldTruth): boolean => {
    if (fields[field]) return false;
    fields[field] = truth;
    return true;
  };

  /* 1. exact GTIN identity — verified, because it identifies the product */
  const code = canonicalCode(input.barcode);
  const exactCandidate = code ? (knowledge.byCode.get(code) ?? null) : null;
  const exactDecision = exactCandidate ? semanticDecisionFor(input.semantic, exactCandidate) : null;
  const exactRow = exactCandidate && exactDecision?.compatible !== false ? exactCandidate : null;
  if (exactCandidate && exactDecision?.compatible === false) {
    trace.push(
      `mapper_exact odrzucony semantycznie: ${exactCandidate.ingredient_id} (${exactDecision.reasonCodes.join(',')})`,
    );
  }
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
  const nameCohortUnfiltered =
    normalized && tokens > 0 && tokens <= MAX_SIMPLE_PROFILE_TOKENS
      ? (knowledge.byName.get(normalized) ?? null)
      : null;
  const nameFiltered = semanticFilterRows(input.semantic, nameCohortUnfiltered ?? []);
  const nameCohort = nameFiltered.rows;
  if (nameFiltered.rejected.length > 0) {
    trace.push(
      `mapper_simple_profile: ${nameFiltered.rejected.length} kandydatow odrzuconych semantycznie`,
    );
  }
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
  const similarConditionedUnfiltered = macroConditionedCohort(
    similar.rows,
    input.knownMacros,
    MIN_SIMILAR_COHORT,
  );
  const similarFiltered = semanticFilterRows(input.semantic, similarConditionedUnfiltered);
  const similarConditioned = similarFiltered.rows;
  if (similarFiltered.rejected.length > 0) {
    trace.push(
      `mapper_similar_profile: ${similarFiltered.rejected.length} kandydatow odrzuconych semantycznie`,
    );
  }
  if (similarConditioned.length >= MIN_SIMILAR_COHORT) {
    const claimed = applyCohort(
      claim,
      similarConditioned,
      MIN_SIMILAR_COHORT,
      'mapper_similar_profile',
      knowledge.fingerprint,
      `najbardziej podobne wiersze Mappera (${similar.rows.length}) wg tokenow: ${similar.tokens.join(', ')}`,
    );
    if (claimed > 0) tiersUsed.push('mapper_similar_profile');
    bestCohort ??= {
      rows: similarConditioned,
      minCohort: MIN_SIMILAR_COHORT,
      label: 'similar_profile',
    };
    trace.push(
      `mapper_similar_profile: ${similar.rows.length} wierszy (${similar.tokens.length} tokenow) → ${claimed} pol`,
    );
  }

  /* 4. same brand, same subcategory */
  const siblingCohortUnfiltered =
    normalizeName(input.brand) && normalizeName(input.subcategory)
      ? (knowledge.byBrandSubcategory.get(brandKey(input.brand, input.subcategory)) ?? null)
      : null;
  const siblingFiltered = semanticFilterRows(input.semantic, siblingCohortUnfiltered ?? []);
  const siblingCohort = siblingFiltered.rows;
  if (siblingFiltered.rejected.length > 0) {
    trace.push(
      `mapper_brand_sibling: ${siblingFiltered.rejected.length} kandydatow odrzuconych semantycznie`,
    );
  }
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
    const cohortUnfiltered = macroConditionedCohort(
      knowledge.byFamily.get(family) ?? [],
      input.knownMacros,
      MIN_FAMILY_COHORT,
    );
    const familyFiltered = semanticFilterRows(input.semantic, cohortUnfiltered);
    const cohort = familyFiltered.rows;
    if (familyFiltered.rejected.length > 0) {
      trace.push(
        `mapper_family_consensus: ${familyFiltered.rejected.length} kandydatow odrzuconych semantycznie`,
      );
    }
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
      bestCohort ??= { rows: cohort, minCohort: MIN_FAMILY_COHORT, label: `family:${family}` };
      trace.push(`mapper_family_consensus: ${family}, ${cohort.length} wierszy → ${claimed} pol`);
    } else {
      trace.push(`mapper_family_consensus: ${family} za mala kohorta (${cohort.length})`);
    }
  }

  return { fields, tiersUsed, exactRow, family, trace, bestCohort };
}

/**
 * Fields a COHORT may never speak for.
 *
 * POD and PAC are Engine-derived: the Engine's own sweetening and freezing
 * paths compute them from the product's own sugar spectrum. A cohort median for them would be a second, disagreeing physics —
 * a neighbouring product's freezing power says nothing about this product's,
 * beyond what its own sugars already say. An exact GTIN identity still carries
 * them, because there the row IS the product.
 */
const COHORT_FORBIDDEN_FIELDS = new Set<WorkingNumericField>(['pod_value', 'pac_value']);

/**
 * How far a neighbour's macro may sit from this product's before it stops being
 * evidence about it. Wide enough to keep a real family together, narrow enough
 * that a 2%-fat yoghurt cannot speak for a 30%-fat cream.
 */
export const MACRO_COMPATIBILITY: Readonly<Record<string, number>> = Object.freeze({
  fat_percent: 8,
  protein_percent: 5,
  carbohydrate_percent: 12,
});

/**
 * Keep only the cohort rows whose own published macros are compatible with what
 * this product is already known to be.
 *
 * A row that publishes nothing for a macro is kept — silence is not a
 * contradiction. A row that publishes an incompatible value is dropped, and if
 * conditioning would leave too few rows the ORIGINAL cohort is returned rather
 * than a thinner one, so this can tighten a cohort but never manufacture one.
 */
export function macroConditionedCohort(
  cohort: readonly MapperKnowledgeRow[],
  knownMacros: MapperInferenceInput['knownMacros'],
  minCohort: number,
): readonly MapperKnowledgeRow[] {
  const entries = Object.entries(knownMacros ?? {}).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number',
  );
  if (entries.length === 0) return cohort;

  const compatible = cohort.filter((row) =>
    entries.every(([field, target]) => {
      const observed = numeric(row[field as keyof MapperKnowledgeRow] as number | null);
      if (observed === null) return true;
      return Math.abs(observed - target) <= (MACRO_COMPATIBILITY[field] ?? Infinity);
    }),
  );
  return compatible.length >= minCohort ? compatible : cohort;
}

/** Macro fields that together account for most of a product's dry matter. */
const NAMED_SOLID_FIELDS = [
  'fat_percent',
  'protein_percent',
  'carbohydrate_percent',
  'fiber_percent',
  'salt_percent',
] as const;

export interface ResidualSolidsEstimate {
  totalSolids: number;
  /** Unnamed dry matter (ash, minerals, organic acids) the cohort typically carries. */
  residual: number;
  contributors: string[];
  spread: number;
}

/**
 * Estimate total solids for a product whose macros are known but whose cohort
 * could not agree on solids directly.
 *
 * Writing `water = 100 − fat − protein − carbohydrate − fibre − salt` and calling
 * it measured would be wrong: that remainder still contains ash, minerals and
 * organic acids nobody listed. So the named macros are used as a LOWER BOUND on
 * dry matter, and the unnamed remainder is taken from the cohort's own observed
 * behaviour — for every neighbour that publishes both, how much dry matter sat
 * beyond its named macros. That residual is evidence, not an assumption.
 *
 * Refused when the cohort disagrees about its own residual, because then the
 * family genuinely does not predict this quantity.
 */
export function residualSolidsEstimate(
  cohort: readonly MapperKnowledgeRow[],
  namedSolids: number,
  minCohort: number,
): ResidualSolidsEstimate | null {
  const residuals: number[] = [];
  const contributors: string[] = [];
  for (const row of cohort) {
    const solids = numeric(row.total_solids_percent);
    if (solids === null) continue;
    const named = NAMED_SOLID_FIELDS.reduce(
      (total, field) => total + (numeric(row[field]) ?? 0),
      0,
    );
    const residual = solids - named;
    // A negative residual means the row's own numbers do not add up; it cannot
    // teach us anything about unnamed dry matter.
    if (residual < 0 || residual > 25) continue;
    residuals.push(residual);
    contributors.push(row.ingredient_id);
  }
  if (residuals.length < minCohort) return null;

  const sorted = [...residuals].sort((a, b) => a - b);
  const spread = (quantile(sorted, 0.75) - quantile(sorted, 0.25)) / 2;
  if (spread > MAX_RESIDUAL_SPREAD) return null;

  const residual = median(sorted);
  const totalSolids = namedSolids + residual;
  if (totalSolids < 0 || totalSolids > 100) return null;
  return {
    totalSolids: round4(totalSolids),
    residual: round4(residual),
    contributors,
    spread: round4(spread),
  };
}

/** How much the cohort's unnamed dry matter may vary and still be usable. */
export const MAX_RESIDUAL_SPREAD = 2.5;

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
    if (COHORT_FORBIDDEN_FIELDS.has(field)) continue;
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

/* ── moisture cohort profiling (evidence, not inference) ───────────────────── */

/**
 * Acceptance rules for treating a cohort's water as a physical statement.
 *
 * Derived from profiling the Mapper — see `moistureCohortAudit.dryrun.test.ts`,
 * which regenerates the evidence. The median absolute deviation separates
 * physically coherent cohorts from heterogeneous families with a clear empirical
 * gap: chocolate sits at 2.3, confectionery inclusions at 1.8, vegetables at 2.9
 * and nuts at 3.3, while fruit is already at 6.5, alcohol at 9.9, coconut at
 * 11.1 and dairy at 21.8. Nothing real lives between roughly 4.5 and 6.5, so the
 * bar sits at 4.
 *
 * The MAD is the primary test because a few odd rows cannot move it. The IQR is
 * a second guard against a bimodal cohort whose halves each cluster tightly — a
 * small MAD alone would call that narrow when it is really two families.
 *
 * These rules are currently used for AUDIT ONLY. Profiling the real data showed
 * no product in the Poland import can be served by them: of the products lacking
 * water and solids, most have no family at all, and every family the rest belong
 * to is empirically broad. Rather than ship an inference path that never fires
 * and so can never be verified, the measurement is kept and the inference is not
 * built until a dataset actually needs it.
 */
export const MOISTURE_COHORT_RULES = Object.freeze({
  /** Below this, dispersion itself is too noisy to trust. */
  minRows: 8,
  /** Half the cohort must sit within this many points of its median water. */
  maxMad: 4,
  /** Guards against a tight-but-bimodal cohort. */
  maxIqr: 12,
});

export interface MoistureCohortProfile {
  n: number;
  median: number;
  mad: number;
  iqr: number;
  p10: number;
  p90: number;
  min: number;
  max: number;
  narrow: boolean;
  reason: string;
}

/** Profile a cohort's water. Pure statistics; decides nothing on its own. */
export function moistureCohortProfile(
  cohort: readonly MapperKnowledgeRow[],
): MoistureCohortProfile {
  const values = cohort
    .map((row) =>
      typeof row.water_percent === 'number' && Number.isFinite(row.water_percent)
        ? row.water_percent
        : null,
    )
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  if (values.length === 0) {
    return {
      n: 0,
      median: 0,
      mad: 0,
      iqr: 0,
      p10: 0,
      p90: 0,
      min: 0,
      max: 0,
      narrow: false,
      reason: 'Brak danych o wodzie',
    };
  }
  const mid = median(values);
  const deviations = values.map((value) => Math.abs(value - mid)).sort((a, b) => a - b);
  const mad = median(deviations);
  const iqr = quantile(values, 0.75) - quantile(values, 0.25);

  let narrow = true;
  let reason = 'kohorta waska fizycznie';
  if (values.length < MOISTURE_COHORT_RULES.minRows) {
    narrow = false;
    reason = `za malo wierszy (${values.length} < ${MOISTURE_COHORT_RULES.minRows})`;
  } else if (mad > MOISTURE_COHORT_RULES.maxMad) {
    narrow = false;
    reason = `rozrzut MAD ${round4(mad)} przekracza ${MOISTURE_COHORT_RULES.maxMad}`;
  } else if (iqr > MOISTURE_COHORT_RULES.maxIqr) {
    narrow = false;
    reason = `rozstep cwiartkowy ${round4(iqr)} przekracza ${MOISTURE_COHORT_RULES.maxIqr} — kohorta prawdopodobnie dwumodalna`;
  }

  return {
    n: values.length,
    median: round4(mid),
    mad: round4(mad),
    iqr: round4(iqr),
    p10: round4(quantile(values, 0.1)),
    p90: round4(quantile(values, 0.9)),
    min: values[0] ?? 0,
    max: values[values.length - 1] ?? 0,
    narrow,
    reason,
  };
}

/* ── product → profile match ───────────────────────────────────────────────── */

/**
 * How well one Mapper profile stands in for a commercial product.
 *
 * This is the question the importer actually needs answered. Asking instead
 * whether every individual number is independently defensible to 85% made the
 * importer unusable: nine good fields were being reduced to their weakest, and a
 * product with a strong, obvious proxy was refused because one estimate came
 * from a slightly looser cohort.
 *
 * So the score answers: IS THIS PRODUCT SUFFICIENTLY REPRESENTED BY THIS
 * PHYSICAL PROFILE? A profile that clears the bar may supply every missing
 * working value at once, as ESTIMATED. Values the product already states remain
 * exact and are never overwritten.
 *
 * Deterministic and inspectable — no model self-confidence anywhere.
 */
export interface ProfileMatchInput {
  name: string | null;
  variant?: string | null;
  brand?: string | null;
  category?: string | null;
  subcategory?: string | null;
  barcode?: string | null;
  /** Macros already established for this product, from label or source card. */
  knownMacros?: Partial<
    Record<
      | 'fat_percent'
      | 'protein_percent'
      | 'carbohydrate_percent'
      | 'total_sugars_percent'
      | 'fiber_percent'
      | 'salt_percent',
      number
    >
  >;
  /** True for professional/technical products. */
  technical?: boolean;
  /** Server-recomputable semantic constraints applied before similarity. */
  semantic?: ProductSemanticClassification | null;
}

export type ProfileMatchBasis =
  | 'gtin_identity'
  | 'commodity_name'
  | 'neighbour_set'
  | 'brand_sibling'
  | 'none';

export interface ProfileMatch {
  /** 0–1. The product/profile question, not a per-field probability. */
  confidence: number;
  basis: ProfileMatchBasis;
  /** Rows the profile was taken from. One for identity, several for a set. */
  rows: readonly MapperKnowledgeRow[];
  references: string[];
  family: ProductFamilyId | null;
  reasons: string[];
  /** Set when a candidate was refused outright rather than merely scored low. */
  rejected: string | null;
  /** Auditable candidate counts and rejection facts; never model chain-of-thought. */
  candidatesBeforeFilter: string[];
  candidatesAfterFilter: string[];
  rejectedCandidates: { ingredientId: string; reasonCodes: string[] }[];
  /** One internally coherent row chosen from the accepted top cohort. When a
   * product declares total sugars, a row whose verified named-sugar spectrum
   * covers that total wins over a marginally closer row that cannot complete
   * the Engine sweetening/freezing path. */
  donorReference?: string | null;
}

/** The bar a profile must clear to supply working values. Owner's rule. */
export const PROFILE_MATCH_FLOOR = 0.85;

/**
 * Families that may stand in for one another. Everything else is a hard
 * contradiction: tea is not dairy, an oil is not a cream, a powder is not a
 * liquid. Same brand never overrides this.
 */
const COMPATIBLE_FAMILIES: readonly (readonly ProductFamilyId[])[] = Object.freeze([
  ['dairy_liquid', 'dairy_protein'],
  ['coconut_fat', 'liquid_vegetable_oil'],
  ['sugar_sucrose', 'other_sugar'],
  ['glucose_dextrose', 'other_sugar'],
  ['chocolate', 'cocoa_butter'],
]);

const familiesCompatible = (a: ProductFamilyId | null, b: ProductFamilyId | null): boolean => {
  if (!a || !b) return true; // an unknown family cannot contradict anything
  if (a === b) return true;
  return COMPATIBLE_FAMILIES.some((group) => group.includes(a) && group.includes(b));
};

/**
 * Mapper categories a family may draw a proxy from.
 *
 * Family inference on a Mapper row can fail or land oddly, and when it does the
 * family check alone lets a yoghurt take a cream soda's profile — the macros of
 * a drinking yoghurt and a soft drink really are near-identical. The Mapper's
 * own category is a second, independent axis that does not depend on inference
 * succeeding, so §7's hard contradictions are enforced here directly.
 */
const ALLOWED_CATEGORIES: Readonly<Partial<Record<ProductFamilyId, readonly string[]>>> =
  Object.freeze({
    dairy_liquid: ['dairy', 'specialty'],
    dairy_protein: ['dairy', 'protein', 'specialty'],
    plant_beverage: ['beverage', 'plant_beverage'],
    fruit: ['fruit', 'vegetable'],
    chocolate: ['chocolate', 'cocoa', 'confectionery_inclusion'],
    cocoa_butter: ['chocolate', 'cocoa', 'fat'],
    nut_paste: ['nut', 'flavor_paste'],
    coconut_fat: ['coconut', 'fat'],
    liquid_vegetable_oil: ['fat', 'coconut'],
    sugar_sucrose: ['sweetener'],
    other_sugar: ['sweetener'],
    glucose_dextrose: ['sweetener'],
    alcohol: ['alcohol'],
    stabilizer_hydrocolloid: ['stabilizer', 'fiber'],
    emulsifier: ['stabilizer', 'emulsifier'],
    flavor_paste: ['flavor_paste', 'flavor_powder', 'flavor_syrup', 'flavor_concentrate', 'nut'],
    base_mix: ['base_mix'],
    starch: ['starch', 'fiber', 'base_mix'],
    fibre_inulin: ['fiber', 'stabilizer'],
    plant_protein_isolate: ['protein'],
  });

/** True when this candidate's Mapper category is one the family may draw from. */
function categoryAllowed(family: ProductFamilyId | null, row: MapperKnowledgeRow): boolean {
  if (!family) return true;
  const allowed = ALLOWED_CATEGORIES[family];
  if (!allowed) return true;
  const category = normalizeName(row.ingredient_category).replace(/\s+/g, '_');
  if (!category) return false;
  return allowed.some((entry) => category === entry || category.startsWith(entry));
}

/** Per-macro tolerance for judging how alike two profiles are. */
const MACRO_SIMILARITY_BAND: Readonly<Record<string, number>> = Object.freeze({
  fat_percent: 10,
  protein_percent: 6,
  carbohydrate_percent: 15,
  total_sugars_percent: 15,
  fiber_percent: 5,
  salt_percent: 1.5,
});

/**
 * Similarity of a candidate row to the product's known macros: 1 when every
 * known macro matches, falling to 0 as they diverge past their band. Returns
 * null when the product states no macros — then macros neither help nor hurt.
 */
function macroSimilarity(
  row: MapperKnowledgeRow,
  known: ProfileMatchInput['knownMacros'],
): number | null {
  const entries = Object.entries(known ?? {}).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number',
  );
  if (entries.length === 0) return null;
  let total = 0;
  let counted = 0;
  for (const [field, target] of entries) {
    const observed = numeric(row[field as keyof MapperKnowledgeRow] as number | null);
    if (observed === null) continue;
    const band = MACRO_SIMILARITY_BAND[field] ?? 10;
    total += Math.max(0, 1 - Math.abs(observed - target) / band);
    counted += 1;
  }
  return counted === 0 ? null : total / counted;
}

/** How complete a candidate's own profile is — a sparse row is a poor proxy. */
function profileCompleteness(row: MapperKnowledgeRow): number {
  const wanted: (keyof MapperKnowledgeRow)[] = [
    'water_percent',
    'total_solids_percent',
    'fat_percent',
    'protein_percent',
    'carbohydrate_percent',
    'total_sugars_percent',
  ];
  const present = wanted.filter((field) => numeric(row[field] as number | null) !== null).length;
  return present / wanted.length;
}

const SUGAR_SPECTRUM_PROFILE_FIELDS = [
  'sucrose_percent',
  'dextrose_percent',
  'glucose_percent',
  'fructose_percent',
  'lactose_percent',
] as const satisfies readonly (keyof MapperKnowledgeRow)[];

function donorSugarSpectrumCoversDeclaredTotal(
  row: MapperKnowledgeRow,
  known: ProfileMatchInput['knownMacros'],
): boolean | null {
  const declaredTotal = numeric(known?.total_sugars_percent);
  if (declaredTotal === null || declaredTotal <= 0) return null;
  const values = SUGAR_SPECTRUM_PROFILE_FIELDS.map((field) => numeric(row[field]));
  const knownValues = values.filter((value): value is number => value !== null);
  if (knownValues.length === 0) return null;
  return knownValues.reduce((total, value) => total + value, 0) + Number.EPSILON >= declaredTotal;
}

function mostCompleteProfileDonor(
  rows: readonly MapperKnowledgeRow[],
): MapperKnowledgeRow | null {
  let best: MapperKnowledgeRow | null = null;
  let bestCompleteness = -1;
  for (const row of rows) {
    const completeness = profileCompleteness(row);
    if (completeness > bestCompleteness) {
      bestCompleteness = completeness;
      best = row;
    }
  }
  return best;
}

function preferredProfileDonorReference(
  rows: readonly MapperKnowledgeRow[],
  known: ProfileMatchInput['knownMacros'],
): string | null {
  const defaultDonor = mostCompleteProfileDonor(rows);
  if (!defaultDonor) return null;
  if (
    donorSugarSpectrumCoversDeclaredTotal(defaultDonor, known) !== false ||
    familyOf(defaultDonor) !== 'dairy_liquid'
  ) {
    return defaultDonor.ingredient_id;
  }
  const sugarCompatible = rows.filter(
    (row) =>
      familyOf(row) === 'dairy_liquid' &&
      donorSugarSpectrumCoversDeclaredTotal(row, known) === true,
  );
  return (mostCompleteProfileDonor(sugarCompatible) ?? defaultDonor).ingredient_id;
}

const familyOf = (row: MapperKnowledgeRow): ProductFamilyId | null => {
  const match = inferMapperFamily({
    name: row.ingredient_name_internal,
    variant: row.ingredient_name_display ?? null,
    sourceCategory: row.ingredient_category ?? null,
    sourceSubcategory: row.ingredient_subcategory ?? null,
  });
  return familySupportsCohort(match) && match ? match.family : null;
};

const semanticDecisionFor = (
  semantic: ProductSemanticClassification | null | undefined,
  row: MapperKnowledgeRow,
) =>
  semantic
    ? evaluateMapperSemanticCompatibility(semantic, {
        ingredientId: row.ingredient_id,
        name: row.ingredient_name_display ?? row.ingredient_name_internal,
        category: row.ingredient_category ?? null,
        subcategory: row.ingredient_subcategory ?? null,
        brand: row.brand ?? null,
        gtin: row.ean_code ?? null,
      })
    : { compatible: true as const, reasonCodes: [] as string[] };

function semanticFilterRows(
  semantic: ProductSemanticClassification | null | undefined,
  rows: readonly MapperKnowledgeRow[],
): {
  rows: MapperKnowledgeRow[];
  rejected: { ingredientId: string; reasonCodes: string[] }[];
} {
  const accepted: MapperKnowledgeRow[] = [];
  const rejected: { ingredientId: string; reasonCodes: string[] }[] = [];
  for (const row of rows) {
    const decision = semanticDecisionFor(semantic, row);
    if (decision.compatible) accepted.push(row);
    else rejected.push({ ingredientId: row.ingredient_id, reasonCodes: decision.reasonCodes });
  }
  return { rows: accepted, rejected };
}

/**
 * Find the best profile that can stand in for this product.
 *
 * Candidates are drawn from the evidence tiers that already exist: GTIN
 * identity, commodity-name identity, macro-conditioned nearest neighbours and
 * brand siblings. Text similarity only ever supports — it never carries a match
 * on its own.
 */
export function findProfileMatch(
  input: ProfileMatchInput,
  knowledge: MapperKnowledge,
): ProfileMatch {
  const none: ProfileMatch = {
    confidence: 0,
    basis: 'none',
    rows: [],
    references: [],
    family: null,
    reasons: ['brak zgodnego profilu'],
    rejected: null,
    candidatesBeforeFilter: [],
    candidatesAfterFilter: [],
    rejectedCandidates: [],
    donorReference: null,
  };
  const rejectedById = new Map<string, Set<string>>();
  const reject = (row: MapperKnowledgeRow, reasonCodes: readonly string[]) => {
    const reasons = rejectedById.get(row.ingredient_id) ?? new Set<string>();
    for (const reason of reasonCodes) reasons.add(reason);
    rejectedById.set(row.ingredient_id, reasons);
  };
  const rejectedCandidates = () =>
    [...rejectedById.entries()].map(([ingredientId, reasons]) => ({
      ingredientId,
      reasonCodes: [...reasons],
    }));

  const productFamilyMatch = inferMapperFamily({
    name: input.name,
    variant: input.variant ?? null,
    sourceCategory: input.category ?? null,
    sourceSubcategory: input.subcategory ?? null,
  });
  const productFamily =
    familySupportsCohort(productFamilyMatch) && productFamilyMatch
      ? productFamilyMatch.family
      : null;

  /* 1. GTIN identity — the row IS the product */
  const code = (() => {
    const digits = (input.barcode ?? '').replace(/\D+/g, '');
    return digits.length >= 8 && digits.length <= 14 ? digits.padStart(14, '0') : null;
  })();
  const exact = code ? knowledge.byCode.get(code) : undefined;
  if (exact) {
    const semantic = semanticDecisionFor(input.semantic, exact);
    if (!semantic.compatible) {
      reject(exact, semantic.reasonCodes);
      return {
        ...none,
        rejected: 'GTIN identity conflicts with exact semantic evidence',
        candidatesBeforeFilter: [exact.ingredient_id],
        rejectedCandidates: rejectedCandidates(),
      };
    }
    return {
      confidence: 0.97,
      basis: 'gtin_identity',
      rows: [exact],
      references: [exact.ingredient_id],
      family: familyOf(exact),
      reasons: [`GTIN ${code} to wiersz Mappera ${exact.ingredient_id}`],
      rejected: null,
      candidatesBeforeFilter: [exact.ingredient_id],
      candidatesAfterFilter: [exact.ingredient_id],
      rejectedCandidates: [],
      donorReference: exact.ingredient_id,
    };
  }

  /* 2. commodity name — the product IS a substance the Mapper defines */
  const normalized = normalizeName(input.name);
  const commodity =
    normalized && normalized.split(' ').length <= MAX_SIMPLE_PROFILE_TOKENS
      ? knowledge.byName.get(normalized)
      : undefined;
  if (commodity && commodity.length > 0) {
    const compatible = commodity.filter((row) => {
      if (!familiesCompatible(productFamily, familyOf(row))) {
        reject(row, ['SEMANTIC_FAMILY_CONTRADICTION']);
        return false;
      }
      const semantic = semanticDecisionFor(input.semantic, row);
      if (!semantic.compatible) {
        reject(row, semantic.reasonCodes);
        return false;
      }
      return true;
    });
    if (compatible.length > 0) {
      return {
        confidence: 0.93,
        basis: 'commodity_name',
        rows: compatible,
        references: compatible.map((row) => row.ingredient_id),
        family: productFamily,
        reasons: [`nazwa produktu jest surowcem znanym Mapperowi ("${normalized}")`],
        rejected: null,
        candidatesBeforeFilter: commodity.map((row) => row.ingredient_id),
        candidatesAfterFilter: compatible.map((row) => row.ingredient_id),
        rejectedCandidates: rejectedCandidates(),
        donorReference: preferredProfileDonorReference(compatible, input.knownMacros),
      };
    }
  }

  /* 3. nearest compatible neighbours, validated against known macros */
  const similar = similarCohort(
    {
      name: input.name,
      variant: input.variant,
      brand: input.brand,
      category: input.category,
      subcategory: input.subcategory,
    },
    knowledge,
  );
  // Brand by itself is intentionally absent from `similarCohort`: a company
  // name can contain a food word and must not pull unrelated substances into a
  // cohort. It becomes useful again when the source taxonomy and Mapper
  // taxonomy share a concrete token (for example `gummy candy` ↔
  // `gummy_candy_inclusion`). Semantic/form/role gates below still apply.
  const productTaxonomyTokens = new Set(identityTokens(input.category, input.subcategory));
  const brandTaxonomyRows =
    similar.rows.length === 0 && normalizeName(input.brand) && productTaxonomyTokens.size > 0
      ? knowledge.rows.filter((row) => {
          if (normalizeName(row.brand) !== normalizeName(input.brand)) return false;
          const rowTokens = identityTokens(row.ingredient_category, row.ingredient_subcategory);
          return rowTokens.some((token) => productTaxonomyTokens.has(token));
        })
      : [];
  // Product Recognition is the semantic authority when a public product page
  // uses market-specific wording that has no literal token overlap with the
  // Mapper taxonomy (for example German "Fruchtgummi" versus
  // `confectionery_inclusion`). This opens only the categories explicitly
  // authorized by Recognition; every candidate still passes the independent
  // family/form/role contradiction gate and macro similarity below.
  const semanticCategories = new Set(
    (input.semantic?.compatibleMapperCategories ?? []).map((entry) =>
      normalizeName(entry).replace(/\s+/g, '_'),
    ),
  );
  const semanticCategoryRows =
    similar.rows.length === 0 && semanticCategories.size > 0
      ? knowledge.rows.filter((row) => {
          const category = normalizeName(row.ingredient_category).replace(/\s+/g, '_');
          return [...semanticCategories].some(
            (allowed) => category === allowed || category.startsWith(`${allowed}_`),
          );
        })
      : [];
  const brandSemanticRows =
    normalizeName(input.brand) && semanticCategoryRows.length > 0
      ? semanticCategoryRows.filter(
          (row) => normalizeName(row.brand) === normalizeName(input.brand),
        )
      : [];
  const pool =
    similar.rows.length > 0
      ? similar.rows
      : brandTaxonomyRows.length > 0
        ? brandTaxonomyRows
        : brandSemanticRows.length > 0
          ? brandSemanticRows
          : semanticCategoryRows.length > 0
            ? semanticCategoryRows
            : productFamily
              ? (knowledge.byFamily.get(productFamily) ?? [])
              : [];
  const candidatesBeforeFilter = pool.map((row) => row.ingredient_id);

  const scored = pool
    .map((row) => {
      const rowFamily = familyOf(row);

      // HARD CONTRADICTIONS ONLY. Family is one signal among several, not a
      // passport: an unknown family lowers what a candidate can score, but it
      // never bars a match that other evidence carries. What IS barred is a
      // known kind meeting an incompatible one — a yoghurt cannot take a soft
      // drink's profile however close their macros read.
      if (!familiesCompatible(productFamily, rowFamily)) {
        reject(row, ['SEMANTIC_FAMILY_CONTRADICTION']);
        return null;
      }
      if (!categoryAllowed(productFamily, row)) {
        reject(row, ['SEMANTIC_CATEGORY_CONTRADICTION']);
        return null;
      }
      const semantic = semanticDecisionFor(input.semantic, row);
      if (!semantic.compatible) {
        reject(row, semantic.reasonCodes);
        return null;
      }

      const completeness = profileCompleteness(row);
      if (completeness === 0) return null;
      const similarity = macroSimilarity(row, input.knownMacros);

      // How much the kind of thing is actually established on both sides.
      const familySignal =
        productFamily !== null && rowFamily !== null
          ? 1
          : productFamily !== null || rowFamily !== null
            ? 0.6
            : 0.4;

      // Declared macros are the strongest validation available, so they dominate
      // when present. Without them a strong identity match against a complete,
      // compatible profile can still carry a product — which is the whole point
      // of a proxy — while two unknown kinds together cannot reach the floor.
      const score =
        similarity === null
          ? 0.62 + 0.22 * familySignal + 0.1 * completeness
          : 0.5 + 0.3 * similarity + 0.12 * familySignal + 0.08 * completeness;

      return { row, score, similarity, completeness };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return productFamily || pool.length > 0
      ? {
          ...none,
          rejected: 'wszyscy kandydaci niezgodni semantycznie/rodzinowo lub bez profilu',
          candidatesBeforeFilter,
          rejectedCandidates: rejectedCandidates(),
        }
      : { ...none, rejectedCandidates: rejectedCandidates() };
  }

  // A small set of the closest compatible rows is steadier than a single row,
  // so the top group is kept when several agree closely.
  const best = scored[0]!;
  const set = scored.filter((entry) => entry.score >= best.score - 0.04).slice(0, 5);
  const rows = set.map((entry) => entry.row);
  const donorReference = preferredProfileDonorReference(rows, input.knownMacros);
  const confidence = round4(
    set.reduce((total, entry) => total + entry.score, 0) / set.length +
      (set.length >= 3 ? 0.02 : 0),
  );

  return {
    confidence: Math.min(0.94, confidence),
    basis: set.length > 1 ? 'neighbour_set' : 'brand_sibling',
    rows,
    references: rows.map((row) => row.ingredient_id),
    family: productFamily,
    reasons: [
      `${set.length} zgodnych profili`,
      best.similarity === null
        ? 'brak makroskladnikow produktu do walidacji'
        : `podobienstwo makro ${round4(best.similarity)}`,
    ],
    rejected: null,
    candidatesBeforeFilter,
    candidatesAfterFilter: scored.map((entry) => entry.row.ingredient_id),
    rejectedCandidates: rejectedCandidates(),
    donorReference,
  };
}

/**
 * The single row a matched profile actually lends its numbers from.
 *
 * Taking each field's median independently across a neighbour set looked
 * reasonable and is not: every field's median may come from a different subset,
 * so the assembled vector need not satisfy the physical relations any single
 * product obeys. In practice it produced named sugars of 40.7 against a total of
 * 40, and components of 98.31 inside 96.225 of dry matter — breaches of a
 * fraction of a point that then made the consistency gate withdraw the entire
 * profile, so an accepted 87% proxy supplied nothing at all.
 *
 * One real product is internally coherent by construction. The donor is the most
 * complete row in the set, ties broken by rank, so the profile that is lent is a
 * profile that actually exists.
 */
export function profileDonor(match: ProfileMatch): MapperKnowledgeRow | null {
  const preferred = match.donorReference
    ? match.rows.find((row) => row.ingredient_id === match.donorReference)
    : null;
  if (preferred) return preferred;
  return mostCompleteProfileDonor(match.rows);
}

/**
 * One field's value from the profile.
 *
 * The donor row answers first, so the bulk of a product's vector comes from one
 * coherent product rather than a blend. Only where the donor is silent does the
 * next-ranked row that states the field answer instead — a real value from a
 * compatible neighbour beats leaving the field unknown, and the assembled result
 * still faces the consistency gate.
 */
export function profileFieldValue(
  match: ProfileMatch,
  field: WorkingNumericField,
): { value: number; contributors: string[] } | null {
  const donor = profileDonor(match);
  const ordered = donor ? [donor, ...match.rows.filter((row) => row !== donor)] : match.rows;
  for (const row of ordered) {
    const value = numeric(row[field as keyof MapperKnowledgeRow] as number | null);
    if (value !== null) return { value: round4(value), contributors: [row.ingredient_id] };
  }
  return null;
}
