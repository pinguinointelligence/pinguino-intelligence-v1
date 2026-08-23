/**
 * Working values — one product's complete, usable numeric state.
 *
 * This is the layer the rest of Gellatti reads. It merges, in strength order:
 *
 *   declared on the product  →  Mapper inference  →  arithmetic closure
 *
 * and hands back canonical fields the Engine, Recipe, Monitor, Score, POD/PAC,
 * nutrition, Etykieta, Preview and Apply all consume identically, whether a
 * number was measured or estimated. The difference lives in the provenance
 * carried alongside each field, never in whether the field works.
 *
 * Readiness is decided here too, and it is decided from the SAME nine fields the
 * Mapper already calls engine-required — so an imported product and a Mapper row
 * are held to one standard, not two.
 *
 * Pure and deterministic: no DB, no network, no AI, no clock.
 */
import { MAPPER_ENGINE_REQUIRED_FIELDS } from './mapperRuntimeUsability';
import {
  REQUIRED_COMPOSITION_FIELDS,
  SUGAR_SPECTRUM_FIELDS,
} from './engineFieldContract';
import { validatePlausibility, type PlausibilityViolation } from './productPlausibility';
import type { CardContribution } from './productSourceCard';
import {
  CONSENSUS_BANDS,
  inferMapperValues,
  residualSolidsEstimate,
  type MapperInferenceInput,
  type MapperInferenceTier,
  type MapperKnowledge,
} from './mapperValueInference';
import {
  applyFieldTruth,
  emptyFieldTruthMap,
  knownField,
  WORKING_NUMERIC_FIELDS,
  workingValues,
  type FieldTruth,
  type ProductFieldTruthMap,
  type WorkingNumericField,
} from './productFieldTruth';

/**
 * What the Engine genuinely needs before it can compute with an ingredient.
 *
 * This is deliberately NOT `MAPPER_ENGINE_REQUIRED_FIELDS`. That list is the
 * Mapper's CURATION standard — what a hand-verified basement row owes the
 * catalogue — and it includes `pod_value` and `pac_value`. The Engine's own
 * contract is looser: its sweetening and freezing paths both treat a null stored
 * value as a documented fallback to the typed sugar spectrum (and, for freezing,
 * to `de_value`). Holding imported products to the curation standard would refuse
 * products the Engine can already formulate with.
 */
export const ENGINE_COMPOSITION_FIELDS = [
  'water_percent',
  'total_solids_percent',
  'fat_percent',
  'protein_percent',
  'carbohydrate_percent',
  'total_sugars_percent',
  'salt_percent',
] as const satisfies readonly WorkingNumericField[];

/**
 * The sweetening/freezing pair. The Engine DERIVES both when they are absent
 * through its own sweetening and freezing paths, so they are not
 * required of a commercial product — what readiness checks is that the
 * derivation can actually resolve. See `sweetnessPathOf` below.
 */
export const ENGINE_POWER_FIELDS = ['pod_value', 'pac_value'] as const satisfies
  readonly WorkingNumericField[];

/**
 * Fields readiness reports on. Water and solids appear once each for reporting,
 * but count as ONE unknown when the verdict is taken — they are complements.
 */
export const ENGINE_REQUIRED_WORKING_FIELDS: readonly WorkingNumericField[] = [
  ...ENGINE_COMPOSITION_FIELDS,
];

/** The Mapper's stricter curation standard, kept for comparison and reporting. */
export const MAPPER_CURATION_FIELDS = MAPPER_ENGINE_REQUIRED_FIELDS.filter(
  (field): field is WorkingNumericField =>
    (WORKING_NUMERIC_FIELDS as readonly string[]).includes(field),
);

/** Confidence at or above which an estimated product is fit to work with. */
export const ESTIMATED_READY_FLOOR = 0.85;

/**
 * How far a declared value may sit from the Mapper's expectation before the
 * disagreement is worth an owner's eyes. Generous on purpose: the declaration
 * still wins, this only decides whether to say so out loud.
 */
const CONFLICT_TOLERANCE_MULTIPLE = 3;

/**
 * Whether a product's NUMBERS are usable. Deliberately says nothing about
 * technical authority: a professional paste can have a complete, trustworthy
 * composition and still not be cleared for dosing.
 */
export type ValueReadiness =
  /** Every engine field measured. Formulate without caveat. */
  | 'READY'
  /** Every engine field present, some estimated, confidence above the floor. */
  | 'ESTIMATED_READY'
  /** Engine fields missing, or present but too weak to stand behind. */
  | 'REVIEW';

export type ProductReadiness =
  | ValueReadiness
  /**
   * The numbers are there, but this is a technical product and ProductBehavior
   * has not granted technical authority. Fail-closed: good composition is not
   * permission to dose.
   */
  | 'TECHNICAL_AUTHORITY_REQUIRED';

export interface EstimateConflict {
  field: WorkingNumericField;
  declared: number;
  mapperExpectation: number;
  /** Absolute difference, in the field's own units. */
  delta: number;
}

export interface ProductWorkingValuesInput {
  /** Values the product itself declares. Absent/null means not declared. */
  declared: Partial<Record<WorkingNumericField, number | null>>;
  /**
   * Confidence the declaration earns from its source (§9 source authority).
   * A manufacturer datasheet and a random blog do not declare equally.
   */
  declaredConfidence: number;
  /** Identity for the Mapper pass. */
  identity: MapperInferenceInput;
  /**
   * Evidence from an identity-confirmed source card. Already gated: the caller
   * decides authority per product, and per-100 ml values never arrive here.
   */
  sourceCard?: CardContribution | null;
  /** True for professional/technical products. */
  technical: boolean;
  /**
   * Whether resolved ProductBehavior technical authority exists. Technical
   * products stay fail-closed without it, however good their numbers are.
   */
  technicalAuthority: boolean;
}

export interface ProductWorkingValues {
  fields: ProductFieldTruthMap;
  /** Whether the numbers are usable, independent of technical authority. */
  valueReadiness: ValueReadiness;
  /** Plain numbers for the Engine. Estimated values are present, by design. */
  values: Record<WorkingNumericField, number | null>;
  readiness: ProductReadiness;
  /** Weakest confidence across the engine-required nine, or null if any missing. */
  engineConfidence: number | null;
  engineReady: boolean;
  /** Engine-required fields still holding no value. */
  missingEngineFields: WorkingNumericField[];
  /** How POD/PAC can be resolved for this product — Engine-derived, not stored. */
  sweetnessPath: SweetnessPath;
  /** Engine-required fields whose value is an estimate. */
  estimatedEngineFields: WorkingNumericField[];
  mapperTiersUsed: MapperInferenceTier[];
  mapperReferences: string[];
  /** Declared values the Mapper strongly disagrees with. Declaration still wins. */
  conflicts: EstimateConflict[];
  /** Joint impossibilities found in the assembled product. */
  plausibilityViolations: PlausibilityViolation[];
  /**
   * True when the product's OWN declared values contradict each other, so no
   * estimate could be withdrawn to resolve it. The owner's data needs a fix.
   */
  contradictedByDeclaration: boolean;
  trace: string[];
}

export type SweetnessPathKind = 'stored' | 'sugar_spectrum' | 'trivially_zero' | 'unresolved';

export interface SweetnessPath {
  kind: SweetnessPathKind;
  resolved: boolean;
  reason: string;
}

/**
 * How this product's sweetening and freezing power can be established.
 *
 * The Engine derives both from the typed sugar breakdown when they are not
 * stored, so a commercial product need not carry them. But that fallback
 * contributes ZERO for an unknown spectrum, so a sugary product with no spectrum
 * would formulate as if its sugars did nothing — which is the case this refuses.
 *
 * No POD/PAC arithmetic happens here. This only reports whether the Engine's own
 * calculation has what it needs.
 */
export function sweetnessPathOf(fields: ProductFieldTruthMap): SweetnessPath {
  if (fields.pod_value.value !== null && fields.pac_value.value !== null) {
    return { kind: 'stored', resolved: true, reason: 'produkt niesie POD i PAC' };
  }
  const sugars = fields.total_sugars_percent.value;
  const alcohol = fields.alcohol_percent.value ?? 0;
  const polyol = fields.polyol_percent.value ?? 0;
  if (sugars === 0 && alcohol === 0 && polyol === 0) {
    return {
      kind: 'trivially_zero',
      resolved: true,
      reason: 'brak cukrow, alkoholu i polioli — obie moce sa dokladnie zerowe',
    };
  }
  if (polyol > 0) {
    // The Engine's typed breakdown contributes zero for polyols; their only
    // correct path is a stored value or one of the five named polyols.
    return {
      kind: 'unresolved',
      resolved: false,
      reason: 'produkt zawiera poliole — Engine nie wyprowadzi dla nich POD/PAC bez wartosci zapisanej',
    };
  }
  const spectrum = SUGAR_SPECTRUM_FIELDS.map(
    (field) => (fields as Record<string, { value: number | null } | undefined>)[field]?.value ?? null,
  ).filter((entry): entry is number => entry !== null);
  if (sugars !== null && spectrum.length > 0) {
    const named = spectrum.reduce((total, entry) => total + entry, 0);
    if (named >= sugars - SUGAR_SPECTRUM_TOLERANCE) {
      return {
        kind: 'sugar_spectrum',
        resolved: true,
        reason: `widmo cukrow pokrywa ${named.toFixed(1)} z ${sugars.toFixed(1)} g`,
      };
    }
    return {
      kind: 'unresolved',
      resolved: false,
      reason: `widmo cukrow pokrywa tylko ${named.toFixed(1)} z ${sugars.toFixed(1)} g`,
    };
  }
  return {
    kind: 'unresolved',
    resolved: false,
    reason: 'produkt ma cukry, ale ich rodzaj jest nieznany — Engine policzylby zero',
  };
}

/** How much of the declared sugars may stay unattributed and still resolve. */
export const SUGAR_SPECTRUM_TOLERANCE = 0.5;

const numeric = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const round4 = (value: number): number => Math.round(value * 1e4) / 1e4;

/**
 * Resolve one product's working values.
 *
 * Order matters and is deliberate: declarations are staged first so the Mapper
 * pass can only ever FILL gaps, never overwrite what the product said about
 * itself. `preferStronger` would enforce that anyway; doing it in this order
 * makes the intent legible at the call site too.
 */
export function resolveProductWorkingValues(
  input: ProductWorkingValuesInput,
  knowledge: MapperKnowledge,
): ProductWorkingValues {
  let fields = emptyFieldTruthMap();
  const trace: string[] = [];

  /* 1. what the product declares about itself — verified */
  let declaredCount = 0;
  for (const field of WORKING_NUMERIC_FIELDS) {
    const value = numeric(input.declared[field]);
    if (value === null) continue;
    fields = applyFieldTruth(
      fields,
      field,
      knownField({
        value,
        state: 'VERIFIED',
        confidence: input.declaredConfidence,
        basis: 'product_declared',
        note: 'wartosc zadeklarowana przez produkt',
      }),
    );
    declaredCount++;
  }
  trace.push(`product_declared: ${declaredCount} pol`);

  /* 2. an identity-confirmed source card — stronger than any estimate */
  let cardFields = 0;
  for (const [field, truth] of Object.entries(input.sourceCard?.fields ?? {})) {
    fields = applyFieldTruth(fields, field as WorkingNumericField, truth);
    cardFields++;
  }
  if (input.sourceCard) {
    trace.push(`source_card: ${cardFields} pol`, ...input.sourceCard.reasons);
  }

  /* 3. Mapper knowledge fills the gaps */
  const inference = inferMapperValues(input.identity, knowledge);
  for (const field of WORKING_NUMERIC_FIELDS) {
    const candidate = inference.fields[field];
    if (candidate) fields = applyFieldTruth(fields, field, candidate);
  }
  trace.push(...inference.trace);

  /* 4. arithmetic closure over what is now known */
  fields = closeArithmetic(fields, trace);

  /* 4b. solids from THIS product's own macros plus the cohort's unnamed residual */
  if (
    fields.total_solids_percent.value === null &&
    fields.water_percent.value === null &&
    inference.bestCohort
  ) {
    const named = (['fat_percent', 'protein_percent', 'carbohydrate_percent', 'fiber_percent',
      'salt_percent'] as const).map((field) => fields[field].value);
    // Only when the three that dominate dry matter are actually known.
    if (named[0] !== null && named[1] !== null && named[2] !== null) {
      const namedSolids = named.reduce((total, entry) => total + (entry ?? 0), 0);
      const estimate = residualSolidsEstimate(
        inference.bestCohort.rows,
        namedSolids,
        inference.bestCohort.minCohort,
      );
      if (estimate) {
        const weakest = (['fat_percent', 'protein_percent', 'carbohydrate_percent'] as const).reduce(
          (min, field) => Math.min(min, fields[field].provenance.confidence),
          1,
        );
        fields = applyFieldTruth(
          fields,
          'total_solids_percent',
          knownField({
            value: estimate.totalSolids,
            state: 'ESTIMATED',
            // Never stronger than the macros it was built from, and discounted
            // again for the residual the cohort had to supply.
            confidence: round4(weakest * 0.97),
            basis: 'mapper_similar_profile',
            mapperReferences: estimate.contributors,
            mapperFingerprint: knowledge.fingerprint,
            note: `sucha masa = makroskladniki ${round4(namedSolids)} + reszta niewymieniona ${estimate.residual} (${inference.bestCohort.label})`,
          }),
        );
        trace.push(
          `residual_solids: ${estimate.totalSolids} = ${round4(namedSolids)} + ${estimate.residual}`,
        );
        fields = closeArithmetic(fields, trace);
      }
    }
  }

  /* 5. reject whatever the assembled product cannot jointly be */
  const plausibility = validatePlausibility(fields);
  fields = plausibility.fields;
  for (const violation of plausibility.violations) {
    trace.push(
      `plausibility[${violation.rule}]: ${violation.detail}` +
        (violation.withdrawn.length > 0 ? ` → wycofano ${violation.withdrawn.join(', ')}` : ''),
    );
  }
  // A withdrawal can open a gap that closure could legitimately fill again from
  // the values that survived, so closure runs once more over the cleaned set.
  if (plausibility.violations.some((violation) => violation.withdrawn.length > 0)) {
    fields = closeArithmetic(fields, trace);
  }

  /* 6. record where the Mapper disagrees with the declaration, without acting on it */
  const conflicts = declaredConflicts(input.declared, inference.fields);

  // Water and solids are one degree of freedom: `closeArithmetic` has already
  // completed whichever was missing, so a product still lacking both counts as a
  // single gap rather than two.
  const massBalanceKnown =
    fields.water_percent.value !== null || fields.total_solids_percent.value !== null;
  const missingEngineFields = ENGINE_REQUIRED_WORKING_FIELDS.filter(
    (field) => fields[field].value === null,
  );
  const missingRequired = [
    ...REQUIRED_COMPOSITION_FIELDS.filter((field) => fields[field].value === null),
    ...(massBalanceKnown ? [] : (['water_percent'] as const)),
  ];
  const power = sweetnessPathOf(fields);
  const estimatedEngineFields = ENGINE_REQUIRED_WORKING_FIELDS.filter(
    (field) => fields[field].provenance.state === 'ESTIMATED',
  );
  // Confidence over the fields the verdict actually depends on. Water and solids
  // contribute once — penalising both would charge twice for one unknown.
  const confidenceFields: WorkingNumericField[] = [
    ...REQUIRED_COMPOSITION_FIELDS,
    ...(fields.water_percent.value !== null
      ? (['water_percent'] as const)
      : (['total_solids_percent'] as const)),
  ];
  const engineConfidence =
    missingRequired.length > 0
      ? null
      : round4(
          confidenceFields.reduce(
            (min, field) => Math.min(min, fields[field].provenance.confidence),
            1,
          ),
        );

  const valueReadiness = decideValueReadiness({
    missing: missingRequired.length,
    powerResolved: power.resolved,
    estimated: estimatedEngineFields.length,
    engineConfidence,
    // A product whose own declared values contradict each other is not ready,
    // however complete and confident those values look individually.
    selfContradictory: plausibility.contradictedByDeclaration,
  });
  // Technical authority gates USE, not truth. It is applied on top of the value
  // verdict so a professional product's composition stays visible and auditable
  // instead of being erased by the block.
  const technicalAuthorityRequired =
    input.technical && !input.technicalAuthority && valueReadiness !== 'REVIEW';
  const readiness: ProductReadiness = technicalAuthorityRequired
    ? 'TECHNICAL_AUTHORITY_REQUIRED'
    : valueReadiness;

  const mapperReferences = [
    ...new Set(
      ENGINE_REQUIRED_WORKING_FIELDS.flatMap((field) => fields[field].provenance.mapperReferences),
    ),
  ].sort();

  return {
    fields,
    valueReadiness,
    values: workingValues(fields),
    readiness,
    engineConfidence,
    // The Engine can compute with these numbers. Whether the product may be
    // USED is `readiness`, which additionally honours the technical gate.
    engineReady: valueReadiness === 'READY' || valueReadiness === 'ESTIMATED_READY',
    missingEngineFields,
    sweetnessPath: power,
    estimatedEngineFields,
    mapperTiersUsed: inference.tiersUsed,
    mapperReferences,
    conflicts,
    plausibilityViolations: plausibility.violations,
    contradictedByDeclaration: plausibility.contradictedByDeclaration,
    trace,
  };
}

/**
 * Water and total solids are the same fact stated twice, so knowing either is
 * knowing both. Energy follows Atwater from macros already established.
 *
 * Nothing else is closed here. POD, PAC and the sweetness/freezing factors
 * depend on the sugar spectrum, which this layer never estimates — deriving
 * them from macros alone would invent Engine coefficients.
 */
function closeArithmetic(fields: ProductFieldTruthMap, trace: string[]): ProductFieldTruthMap {
  let next = fields;

  const complement = (from: WorkingNumericField, to: WorkingNumericField): void => {
    const source = next[from];
    if (source.value === null || next[to].value !== null) return;
    const value = round4(100 - source.value);
    if (value < 0 || value > 100) return;
    next = applyFieldTruth(
      next,
      to,
      knownField({
        value,
        state: source.provenance.state === 'VERIFIED' ? 'VERIFIED' : 'ESTIMATED',
        // The complement is exact arithmetic, so it inherits its source's standing.
        confidence: source.provenance.confidence,
        basis: 'derived',
        mapperReferences: source.provenance.mapperReferences,
        mapperFingerprint: source.provenance.mapperFingerprint,
        note: `100 − ${from}`,
      }),
    );
    trace.push(`derived: ${to} = 100 − ${from}`);
  };

  complement('water_percent', 'total_solids_percent');
  complement('total_solids_percent', 'water_percent');

  // A product with no sugars and no alcohol has EXACTLY zero sweetening and
  // freezing power — that is arithmetic, not an estimate of one. Both inputs
  // must be known: vodka has no sugar and a very large PAC.
  const sugars = next.total_sugars_percent;
  const alcohol = next.alcohol_percent;
  const polyols = next.polyol_percent;
  // Polyols must be zero too: the Engine's typed breakdown contributes nothing
  // for them, so a polyol-bearing product's powers are emphatically NOT zero.
  if (sugars.value === 0 && alcohol.value === 0 && polyols.value === 0) {
    for (const field of ['pod_value', 'pac_value'] as const) {
      if (next[field].value !== null) continue;
      next = applyFieldTruth(
        next,
        field,
        knownField({
          value: 0,
          state:
            sugars.provenance.state === 'VERIFIED' && alcohol.provenance.state === 'VERIFIED'
              ? 'VERIFIED'
              : 'ESTIMATED',
          confidence: Math.min(sugars.provenance.confidence, alcohol.provenance.confidence),
          basis: 'derived',
          mapperReferences: [
            ...new Set([
              ...sugars.provenance.mapperReferences,
              ...alcohol.provenance.mapperReferences,
            ]),
          ],
          mapperFingerprint: sugars.provenance.mapperFingerprint,
          note: 'brak cukrow, alkoholu i polioli → moc slodzaca i zamrazajaca rowna zero',
        }),
      );
      trace.push(`derived: ${field} = 0 (brak cukrow i alkoholu)`);
    }
  }

  // Energy is NOT derived here. `nutrition.ts` owns the Atwater convention —
  // including charging polyols at 2.4 against carbohydrate-minus-polyol — and a
  // second copy in this layer would disagree with the Engine on any
  // polyol-bearing product. kcal is `derived_by_engine` in the field contract,
  // so a missing value is not a gap to fill; the Engine computes it.

  return next;
}

/** Note, without acting on, declared values the Mapper would not have predicted. */
function declaredConflicts(
  declared: Partial<Record<WorkingNumericField, number | null>>,
  inferred: Partial<Record<WorkingNumericField, FieldTruth>>,
): EstimateConflict[] {
  const conflicts: EstimateConflict[] = [];
  for (const field of WORKING_NUMERIC_FIELDS) {
    const declaredValue = numeric(declared[field]);
    const expectation = inferred[field]?.value ?? null;
    if (declaredValue === null || expectation === null) continue;
    const delta = Math.abs(declaredValue - expectation);
    if (delta > CONSENSUS_TOLERANCE[field]) {
      conflicts.push({
        field,
        declared: declaredValue,
        mapperExpectation: expectation,
        delta: round4(delta),
      });
    }
  }
  return conflicts;
}

/** Per-field tolerance for flagging a declaration/Mapper disagreement. */
const CONSENSUS_TOLERANCE: Readonly<Record<WorkingNumericField, number>> = Object.freeze(
  Object.fromEntries(
    WORKING_NUMERIC_FIELDS.map((field) => [
      field,
      CONFLICT_TOLERANCE_MULTIPLE * CONSENSUS_BANDS[field],
    ]),
  ) as Record<WorkingNumericField, number>,
);

function decideValueReadiness(input: {
  missing: number;
  powerResolved: boolean;
  estimated: number;
  engineConfidence: number | null;
  selfContradictory: boolean;
}): ValueReadiness {
  if (input.selfContradictory) return 'REVIEW';
  if (input.missing > 0 || input.engineConfidence === null) return 'REVIEW';
  // Sugars of an unknown kind would formulate as if they did nothing.
  if (!input.powerResolved) return 'REVIEW';
  if (input.estimated === 0) return 'READY';
  return input.engineConfidence >= ESTIMATED_READY_FLOOR ? 'ESTIMATED_READY' : 'REVIEW';
}
