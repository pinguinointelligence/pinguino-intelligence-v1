/**
 * Field-level truth state — what a product value IS, and how much we may lean on it.
 *
 * Gellatti has always had two kinds of product value: measured, or absent. That
 * binary is what makes an imported catalogue useless — a product whose fat is
 * unknown cannot be formulated with, even when Gellatti's own Mapper already
 * describes its family precisely enough to work.
 *
 * This module introduces the third state. An ESTIMATED value is a REAL working
 * value: the Engine, Recipe, Monitor, Score, POD/PAC, nutrition, Etykieta and
 * Preview all read it exactly like a measured one. What differs is not its
 * usability but its provenance — every estimated field carries the Mapper rows
 * it was derived from, the algorithm that derived it, the Mapper fingerprint it
 * was derived against, and a confidence the owner can audit and override.
 *
 * Two rules hold everywhere and are enforced here rather than at call sites:
 *
 *   1. VERIFIED always replaces ESTIMATED. Never the other way round.
 *   2. Identity and legal facts are NEVER estimated. A barcode, a brand, an
 *      allergen declaration or a professional dosage is either read from the
 *      product or it stays UNKNOWN. Guessing any of those is a lie with legal
 *      consequences, not an estimate.
 *
 * Pure and deterministic: no DB, no network, no AI, no clock.
 */

/** Version stamped onto every value this layer derives. Bump on rule changes. */
export const MAPPER_FIRST_ALGORITHM_VERSION = 'mapper-first-v1';

export type FieldTruthState =
  /** Read from the product itself, or from an exact canonical identity. */
  | 'VERIFIED'
  /** Derived from Mapper knowledge. Real and usable, but not measured. */
  | 'ESTIMATED'
  /** Not known, and not safe to derive. */
  | 'UNKNOWN';

/** How a value was arrived at. Ordered weakest to strongest in `BASIS_RANK`. */
export type FieldBasis =
  | 'none'
  /** Consensus across a Mapper family cohort. */
  | 'mapper_family_consensus'
  /** Same brand and subcategory as existing Mapper rows. */
  | 'mapper_brand_sibling'
  /** The product is a pure commodity the Mapper defines outright. */
  | 'mapper_simple_profile'
  /** Computed from other fields on this same product (e.g. solids from water). */
  | 'derived'
  /** Declared on the product's own label / source row. */
  | 'product_declared'
  /** The product IS a known Mapper row. */
  | 'mapper_exact';

const BASIS_RANK: Readonly<Record<FieldBasis, number>> = Object.freeze({
  none: 0,
  mapper_family_consensus: 1,
  mapper_brand_sibling: 2,
  mapper_simple_profile: 3,
  derived: 4,
  product_declared: 5,
  mapper_exact: 6,
});

const STATE_RANK: Readonly<Record<FieldTruthState, number>> = Object.freeze({
  UNKNOWN: 0,
  ESTIMATED: 1,
  VERIFIED: 2,
});

/**
 * Numeric working fields this layer may populate. Deliberately the Engine's own
 * vocabulary — an estimated value lands in the SAME field a measured one would,
 * never in a parallel "guessed" column the rest of the system can ignore.
 */
export const WORKING_NUMERIC_FIELDS = [
  'water_percent',
  'total_solids_percent',
  'fat_percent',
  'protein_percent',
  'carbohydrate_percent',
  'total_sugars_percent',
  'fiber_percent',
  'salt_percent',
  'alcohol_percent',
  'kcal_per_100g',
  'pod_value',
  'pac_value',
  'sweetness_factor',
  'freezing_factor',
] as const;

export type WorkingNumericField = (typeof WORKING_NUMERIC_FIELDS)[number];

/**
 * Facts that may NEVER carry an ESTIMATED state, whatever the confidence.
 *
 * These are identity, legal and safety claims. A family consensus that "nut
 * pastes usually contain nuts" is not an allergen declaration, and a brand
 * sibling's dosage is not this product's dosage. Absence stays absence.
 */
export const NEVER_ESTIMATED_FACTS = Object.freeze([
  'barcode',
  'ean',
  'brand',
  'manufacturer',
  'ingredients',
  'allergens',
  'vegan',
  'dairy_free',
  'gluten_free',
  'contains_alcohol',
  'dosage',
  'countryOfOrigin',
  'shelf_life_days',
] as const);

export type NeverEstimatedFact = (typeof NEVER_ESTIMATED_FACTS)[number];

const NEVER_ESTIMATED = new Set<string>(NEVER_ESTIMATED_FACTS);

/** True when the named fact is identity/legal and must never be inferred. */
export const isNeverEstimated = (fact: string): boolean => NEVER_ESTIMATED.has(fact);

export interface FieldProvenance {
  state: FieldTruthState;
  /** 0–1. Meaningless for UNKNOWN, where it is always 0. */
  confidence: number;
  basis: FieldBasis;
  /** Mapper `ingredient_id`s this value was actually derived from. */
  mapperReferences: readonly string[];
  algorithmVersion: string;
  /** sha256 of the Mapper Base the derivation read. Pins reproducibility. */
  mapperFingerprint: string;
  /** Owner-readable reason. */
  note: string | null;
  /**
   * How the cohort behind an inferred value actually looked. Present only for
   * cohort-derived values, and carried so confidence can be AUDITED rather than
   * taken on trust: a weak score should be traceable to a wide real spread, not
   * to an arbitrary aggregation choice.
   */
  cohort: CohortEvidence | null;
}

export interface CohortEvidence {
  /** Rows that actually contributed a value for this field. */
  size: number;
  /** Robust half-spread observed, in the field's own units. */
  spread: number;
  /** The band that spread was judged against. */
  band: number;
  /** 0–1 agreement: 1 means the cohort was unanimous. */
  tightness: number;
  /** The tier ceiling before the dispersion discount. */
  ceiling: number;
}

export interface FieldTruth {
  value: number | null;
  provenance: FieldProvenance;
}

/** The canonical "we do not know" value. Never carries a number. */
export function unknownField(reason: string | null = null): FieldTruth {
  return {
    value: null,
    provenance: {
      state: 'UNKNOWN',
      confidence: 0,
      basis: 'none',
      mapperReferences: [],
      algorithmVersion: MAPPER_FIRST_ALGORITHM_VERSION,
      mapperFingerprint: '',
      note: reason,
      cohort: null,
    },
  };
}

export interface KnownFieldInit {
  value: number;
  state: 'VERIFIED' | 'ESTIMATED';
  confidence: number;
  basis: FieldBasis;
  mapperReferences?: readonly string[];
  mapperFingerprint?: string;
  note?: string | null;
  cohort?: CohortEvidence | null;
}

/** Build a populated field. Non-finite values collapse to UNKNOWN, not NaN. */
export function knownField(init: KnownFieldInit): FieldTruth {
  if (!Number.isFinite(init.value)) return unknownField(init.note ?? 'value was not finite');
  return {
    value: init.value,
    provenance: {
      state: init.state,
      confidence: clamp01(init.confidence),
      basis: init.basis,
      mapperReferences: [...(init.mapperReferences ?? [])],
      algorithmVersion: MAPPER_FIRST_ALGORITHM_VERSION,
      mapperFingerprint: init.mapperFingerprint ?? '',
      note: init.note ?? null,
      cohort: init.cohort ?? null,
    },
  };
}

const clamp01 = (value: number): number =>
  !Number.isFinite(value) ? 0 : value < 0 ? 0 : value > 1 ? 1 : value;

/**
 * Choose between two candidate truths for the SAME field.
 *
 * Verified beats estimated beats unknown, always and regardless of confidence —
 * a 0.99-confidence family consensus still loses to a measured label value,
 * because confidence measures how good a guess is, not whether it is a guess.
 * Within one state, the stronger basis wins; within one basis, the higher
 * confidence wins; a genuine tie keeps `current`, so merges stay stable.
 */
export function preferStronger(current: FieldTruth, candidate: FieldTruth): FieldTruth {
  const currentState = STATE_RANK[current.provenance.state];
  const candidateState = STATE_RANK[candidate.provenance.state];
  if (candidateState !== currentState) return candidateState > currentState ? candidate : current;

  const currentBasis = BASIS_RANK[current.provenance.basis];
  const candidateBasis = BASIS_RANK[candidate.provenance.basis];
  if (candidateBasis !== currentBasis) return candidateBasis > currentBasis ? candidate : current;

  return candidate.provenance.confidence > current.provenance.confidence ? candidate : current;
}

/** A whole product's numeric working values, each with its own provenance. */
export type ProductFieldTruthMap = Record<WorkingNumericField, FieldTruth>;

export function emptyFieldTruthMap(): ProductFieldTruthMap {
  const map = {} as ProductFieldTruthMap;
  for (const field of WORKING_NUMERIC_FIELDS) map[field] = unknownField();
  return map;
}

/** Apply a candidate to a map under `preferStronger`. Returns a new map. */
export function applyFieldTruth(
  map: ProductFieldTruthMap,
  field: WorkingNumericField,
  candidate: FieldTruth,
): ProductFieldTruthMap {
  return { ...map, [field]: preferStronger(map[field], candidate) };
}

/** The plain numeric view the Engine consumes — estimates included, by design. */
export function workingValues(map: ProductFieldTruthMap): Record<WorkingNumericField, number | null> {
  const out = {} as Record<WorkingNumericField, number | null>;
  for (const field of WORKING_NUMERIC_FIELDS) out[field] = map[field].value;
  return out;
}

/** True when at least one populated field is an estimate rather than measured. */
export const hasEstimatedValues = (map: ProductFieldTruthMap): boolean =>
  WORKING_NUMERIC_FIELDS.some((field) => map[field].provenance.state === 'ESTIMATED');

/** Lowest confidence across populated fields — the product is only as good as its weakest working value. */
export function weakestPopulatedConfidence(map: ProductFieldTruthMap): number | null {
  const populated = WORKING_NUMERIC_FIELDS.map((field) => map[field]).filter(
    (truth) => truth.provenance.state !== 'UNKNOWN',
  );
  if (populated.length === 0) return null;
  return populated.reduce((min, truth) => Math.min(min, truth.provenance.confidence), 1);
}
