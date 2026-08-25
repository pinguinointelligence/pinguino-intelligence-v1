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
import { MAPPER_ENGINE_REQUIRED_FIELDS } from './mapperRuntimeUsability.ts';
import { REQUIRED_COMPOSITION_FIELDS, SUGAR_SPECTRUM_FIELDS } from './engineFieldContract.ts';
import { validatePlausibility, type PlausibilityViolation } from './productPlausibility.ts';
import type { CardContribution } from './productSourceCard.ts';
import {
  CONSENSUS_BANDS,
  findProfileMatch,
  inferMapperValues,
  profileFieldValue,
  residualSolidsEstimate,
  PROFILE_MATCH_FLOOR,
  type ProfileMatch,
  type MapperInferenceInput,
  type MapperInferenceTier,
  type MapperKnowledge,
} from './mapperValueInference.ts';
import {
  applyFieldTruth,
  emptyFieldTruthMap,
  knownField,
  WORKING_NUMERIC_FIELDS,
  workingValues,
  type FieldTruth,
  type ProductFieldTruthMap,
  type WorkingNumericField,
} from './productFieldTruth.ts';
import {
  assessSweeteningFreezingMateriality,
  type SweeteningFreezingMateriality,
} from './sweeteningFreezingMateriality.ts';

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
export const ENGINE_POWER_FIELDS = [
  'pod_value',
  'pac_value',
] as const satisfies readonly WorkingNumericField[];

/**
 * Fields readiness reports on. Water and solids appear once each for reporting,
 * but count as ONE unknown when the verdict is taken — they are complements.
 */
export const ENGINE_REQUIRED_WORKING_FIELDS: readonly WorkingNumericField[] = [
  ...ENGINE_COMPOSITION_FIELDS,
];

/** The Mapper's stricter curation standard, kept for comparison and reporting. */
export const MAPPER_CURATION_FIELDS: readonly WorkingNumericField[] =
  MAPPER_ENGINE_REQUIRED_FIELDS.filter((field): boolean =>
    (WORKING_NUMERIC_FIELDS as readonly string[]).includes(field),
  ) as readonly WorkingNumericField[];

/** Confidence at or above which an estimated product is fit to work with. */
export const ESTIMATED_READY_FLOOR = 0.85;

/**
 * How far a declared value may sit from the Mapper's expectation before the
 * disagreement is worth an owner's eyes. Generous on purpose: the declaration
 * still wins, this only decides whether to say so out loud.
 */
const CONFLICT_TOLERANCE_MULTIPLE = 3;

/**
 * Whether a product's NUMBERS are usable. It says nothing about how the product
 * should be dosed or processed — those are the professional's decisions, and
 * Gellatti does not gate on them (owner decision, 2026-08-23).
 */
export type ValueReadiness =
  /** Every engine field measured. Formulate without caveat. */
  | 'READY'
  /**
   * Every engine field present, some of them supplied by a Mapper profile the
   * product is sufficiently represented by. Usable by the Engine normally.
   */
  | 'ESTIMATED_READY'
  /** Engine fields missing, or no defensible profile to supply them. */
  | 'REVIEW';

/**
 * Readiness is exactly the value verdict. The former
 * `TECHNICAL_AUTHORITY_REQUIRED` state has been retired: its only cause was a
 * missing manufacturer dosage/process authority, which is now informational.
 */
export type ProductReadiness = ValueReadiness;

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
  /** Per-field declaration provenance. Scanner/manual completion uses
   * `user_confirmed`; import/label declarations keep `product_declared`. */
  declaredBasis?: Partial<Record<WorkingNumericField, 'product_declared' | 'user_confirmed'>>;
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
  /** True for professional/technical products. Presentation/weighting only. */
  technical: boolean;
  /**
   * Whether a resolved dosage/handling authority exists for this professional
   * product. INFORMATIONAL ONLY: it is reported so the owner can see that a
   * product's dosage is unproven, and it never withholds anything.
   */
  technicalAuthority?: boolean;
}

export interface ProductWorkingValues {
  fields: ProductFieldTruthMap;
  /** Whether the numbers are usable. */
  valueReadiness: ValueReadiness;
  /** Plain numbers for the Engine. Estimated values are present, by design. */
  values: Record<WorkingNumericField, number | null>;
  readiness: ProductReadiness;
  /** Informational only: a professional product whose dosage/process authority is
   * absent. It never gates use — process and dosage describe handling, not
   * composition. */
  technicalAuthorityRequired: boolean;
  /** Weakest confidence across the engine-required nine, or null if any missing. */
  engineConfidence: number | null;
  engineReady: boolean;
  /** Engine-required fields still holding no value. */
  missingEngineFields: WorkingNumericField[];
  /** How POD/PAC can be resolved for this product — Engine-derived, not stored. */
  sweetnessPath: SweetnessPath;
  /** Canonical blockers derived from the same Engine requirements and
   * readiness verdict above. Product Accuracy consumes these; it never owns a
   * second critical-field list. */
  criticalPhysicsBlockers: string[];
  /** The Mapper profile this product is judged to be represented by, if any. */
  profileMatch: ProfileMatch | null;
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

export type SweetnessPathKind =
  | 'stored'
  | 'sugar_spectrum'
  | 'trivially_zero'
  | 'unknown_non_material'
  | 'unresolved';

export interface SweetnessPath {
  kind: SweetnessPathKind;
  resolved: boolean;
  reason: string;
  /** Present only when exact/derived/profile evidence left a real uncertainty
   * for the Engine materiality authority to evaluate. */
  materiality?: SweeteningFreezingMateriality;
}

/**
 * How this product's sweetening and freezing power can be established.
 *
 * The Engine derives both from the typed sugar breakdown when they are not
 * stored, so a commercial product need not carry them. But that fallback
 * contributes ZERO for an unknown spectrum, so a sugary product with no spectrum
 * would formulate as if its sugars did nothing — which is the case this refuses.
 *
 * Exact/derived/profile authority resolves first. Any remaining uncertainty is
 * delegated to the Engine-based materiality authority below.
 */
export function sweetnessPathOf(
  fields: ProductFieldTruthMap,
  semantic?: ProductWorkingValuesInput['identity']['semantic'],
): SweetnessPath {
  const powersVerified =
    fields.pod_value.value !== null &&
    fields.pac_value.value !== null &&
    fields.pod_value.provenance.state === 'VERIFIED' &&
    fields.pac_value.provenance.state === 'VERIFIED';
  if (powersVerified) {
    return { kind: 'stored', resolved: true, reason: 'produkt niesie POD i PAC' };
  }
  const sugars = fields.total_sugars_percent.value;
  const alcohol = fields.alcohol_percent.value;
  const polyol = fields.polyol_percent.value;
  const alcoholSemanticallyRelevant =
    semantic?.ingredientFamily === 'alcohol' || semantic?.flavorDomain === 'ALCOHOL';
  if (
    sugars === null &&
    !(alcohol === null && alcoholSemanticallyRelevant) &&
    !(polyol !== null && polyol > 0) &&
    semantic?.ingredientFamily !== 'other_sugar'
  ) {
    return {
      kind: 'unknown_non_material',
      resolved: true,
      reason:
        'cukry ogolem nieznane — brak ilosci jest osobnym blockerem skladu, nie automatycznym blockerem widma',
    };
  }
  if (
    sugars === 0 &&
    (alcohol === 0 || (alcohol === null && !alcoholSemanticallyRelevant)) &&
    (polyol === 0 || polyol === null)
  ) {
    return {
      kind: 'trivially_zero',
      resolved: true,
      reason: 'brak cukrow i polioli oraz brak semantycznej przeslanki alkoholu — moce sa zerowe',
    };
  }
  const verifiedSpectrum = SUGAR_SPECTRUM_FIELDS.map((field) => fields[field]).filter(
    (truth) => truth.provenance.state === 'VERIFIED' && truth.value !== null,
  );
  if (sugars !== null && verifiedSpectrum.length > 0 && (polyol ?? 0) === 0) {
    const named = verifiedSpectrum.reduce((total, truth) => total + (truth.value ?? 0), 0);
    if (named + Number.EPSILON >= sugars) {
      return {
        kind: 'sugar_spectrum',
        resolved: true,
        reason: `zweryfikowane widmo cukrow pokrywa ${named.toFixed(1)} z ${sugars.toFixed(1)} g`,
      };
    }
  }
  if (sugars === 0 && alcohol !== null && alcohol > 0 && (polyol ?? 0) === 0) {
    return {
      kind: 'sugar_spectrum',
      resolved: true,
      reason: 'cukry sa zerowe, a znana zawartosc alkoholu zasila deterministyczny NPAC Engine',
    };
  }

  const profilePowers =
    fields.pod_value.value !== null &&
    fields.pac_value.value !== null &&
    fields.pod_value.provenance.state === 'ESTIMATED' &&
    fields.pac_value.provenance.state === 'ESTIMATED';
  const profileNamedSugar = SUGAR_SPECTRUM_FIELDS.reduce((total, field) => {
    const truth = fields[field];
    return (
      total +
      (truth.value !== null &&
      (truth.provenance.state === 'VERIFIED' || truth.provenance.basis === 'mapper_similar_profile')
        ? truth.value
        : 0)
    );
  }, 0);
  if (
    profilePowers &&
    sugars !== null &&
    (polyol ?? 0) === 0 &&
    profileNamedSugar + Number.EPSILON >= sugars
  ) {
    return {
      kind: 'stored',
      resolved: true,
      reason:
        `zgodny profil Mappera uzupelnil widmo ${profileNamedSugar.toFixed(1)} z ` +
        `${sugars.toFixed(1)} g oraz POD/PAC jako ESTIMATED`,
    };
  }
  // When total sugar and both powers come from one accepted whole profile, the
  // profile is already the compatible Mapper completion authority. A verified
  // product sugar total, however, is stronger and leaves a real split question
  // that must proceed to materiality rather than being hidden by the proxy.
  if (profilePowers && fields.total_sugars_percent.provenance.state !== 'VERIFIED') {
    return {
      kind: 'stored',
      resolved: true,
      reason: 'zgodny profil Mappera dostarczyl komplet POD/PAC jako ESTIMATED',
    };
  }

  const materiality = assessSweeteningFreezingMateriality({ fields, semantic });
  if (materiality.verdict === 'NON_MATERIAL') {
    return {
      kind: profilePowers ? 'stored' : 'unknown_non_material',
      resolved: true,
      reason:
        `pozostala niepewnosc nie jest materialna: POD Δmax ${materiality.maxPodEffect}, ` +
        `NPAC Δmax ${materiality.maxNpacEffect}, tolerancja Engine ` +
        `${materiality.engineAcceptanceTolerance}`,
      materiality,
    };
  }
  return {
    kind: 'unresolved',
    resolved: false,
    reason:
      `pozostala niepewnosc jest materialna: POD Δmax ${materiality.maxPodEffect}, ` +
      `NPAC Δmax ${materiality.maxNpacEffect}, tolerancja Engine ` +
      `${materiality.engineAcceptanceTolerance}`,
    materiality,
  };
}

/** Macros the product itself states, used to validate a candidate profile. */
function verifiedMacros(fields: ProductFieldTruthMap): Partial<Record<string, number>> {
  const known: Partial<Record<string, number>> = {};
  for (const field of [
    'fat_percent',
    'protein_percent',
    'carbohydrate_percent',
    'total_sugars_percent',
    'fiber_percent',
    'salt_percent',
  ] as const) {
    const truth = fields[field];
    if (truth.value !== null && truth.provenance.state === 'VERIFIED') known[field] = truth.value;
  }
  return known;
}

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
        basis: input.declaredBasis?.[field] ?? 'product_declared',
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

  /* 3. Mapper knowledge fills the gaps — conditioned on what is already known */
  // Macros established by the label or an exact source card are the strongest
  // filter available on which neighbours can speak for this product at all. A
  // row whose own published fat sits far from this product's is not evidence
  // about it, however closely its name reads.
  const knownMacros: MapperInferenceInput['knownMacros'] = {};
  for (const field of ['fat_percent', 'protein_percent', 'carbohydrate_percent'] as const) {
    const known = fields[field];
    if (known.value !== null && known.provenance.state === 'VERIFIED') {
      knownMacros[field] = known.value;
    }
  }
  const inference = inferMapperValues({ ...input.identity, knownMacros }, knowledge);
  for (const field of WORKING_NUMERIC_FIELDS) {
    const candidate = inference.fields[field];
    if (candidate) fields = applyFieldTruth(fields, field, candidate);
  }
  trace.push(...inference.trace);

  /* 3b. one compatible Mapper profile may supply every remaining working value */
  // The owner's rule: readiness asks whether this product is sufficiently
  // represented by a physical profile, not whether each number is independently
  // provable. A profile clearing the floor fills what is still missing at once,
  // as ESTIMATED. Nothing the product already states is touched.
  const profileMatch = findProfileMatch(
    {
      name: input.identity.name,
      variant: input.identity.variant,
      brand: input.identity.brand,
      category: input.identity.category,
      subcategory: input.identity.subcategory,
      barcode: input.identity.barcode,
      knownMacros: verifiedMacros(fields),
      technical: input.technical,
      semantic: input.identity.semantic,
    },
    knowledge,
  );
  if (profileMatch.confidence >= PROFILE_MATCH_FLOOR) {
    let filled = 0;
    for (const field of WORKING_NUMERIC_FIELDS) {
      // The accepted profile is the AUTHORITY for the formulation vector, so it
      // replaces per-field cohort estimates rather than merely filling their
      // gaps. Those medians are drawn field by field from different subsets, so
      // together they need not satisfy the relations any real product obeys —
      // and a vector that cannot hold together is then withdrawn wholesale by
      // the consistency gate, leaving an accepted proxy supplying nothing.
      // Anything the product itself states is untouchable.
      if (fields[field].provenance.state === 'VERIFIED') continue;
      const supplied = profileFieldValue(profileMatch, field);
      if (!supplied) continue;
      fields = {
        ...fields,
        [field]: knownField({
          value: supplied.value,
          state: 'ESTIMATED',
          // The product/profile question has one answer, so every field it
          // supplies carries that same confidence rather than a per-field one.
          confidence: profileMatch.confidence,
          basis: 'mapper_similar_profile',
          mapperReferences: supplied.contributors,
          mapperFingerprint: knowledge.fingerprint,
          note: `profil zgodny (${profileMatch.basis}, ${Math.round(profileMatch.confidence * 100)}%)`,
        }),
      };
      filled++;
    }
    trace.push(
      `profile_match: ${profileMatch.basis} ${Math.round(profileMatch.confidence * 100)}% → ${filled} pol`,
      ...profileMatch.reasons,
    );
  } else if (profileMatch.rejected) {
    trace.push(`profile_match odrzucony: ${profileMatch.rejected}`);
  }

  /* 4. arithmetic closure over what is now known */
  fields = closeArithmetic(fields, trace);

  /* 4b. solids from THIS product's own macros plus the cohort's unnamed residual */
  if (
    fields.total_solids_percent.value === null &&
    fields.water_percent.value === null &&
    inference.bestCohort
  ) {
    const majorFields = ['fat_percent', 'protein_percent', 'carbohydrate_percent'] as const;
    const minorFields = ['fiber_percent', 'salt_percent'] as const;
    // Only when the three that dominate dry matter are actually known.
    if (majorFields.every((field) => fields[field].value !== null)) {
      const namedSolids = [...majorFields, ...minorFields].reduce(
        (total, field) => total + (fields[field].value ?? 0),
        0,
      );
      const estimate = residualSolidsEstimate(
        inference.bestCohort.rows,
        namedSolids,
        inference.bestCohort.minCohort,
      );
      if (estimate) {
        const weakest = majorFields.reduce(
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
  const power = sweetnessPathOf(fields, input.identity.semantic);
  if (power.materiality) {
    trace.push(
      `sweetening_materiality: ${power.materiality.verdict}`,
      ...power.materiality.reasonCodes,
    );
  }
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
  // A product whose values are all measured is judged on those measurements.
  // A product leaning on a Mapper profile is judged on how well that profile
  // represents it — one question with one answer, never nine multiplied.
  const leansOnProfile = confidenceFields.some(
    (field) => fields[field].provenance.state === 'ESTIMATED',
  );
  const engineConfidence =
    missingRequired.length > 0
      ? null
      : leansOnProfile
        ? Math.max(
            profileMatch.confidence,
            round4(
              confidenceFields.reduce(
                (min, field) => Math.min(min, fields[field].provenance.confidence),
                1,
              ),
            ),
          )
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
  // Process (HEAT / COLD / BOTH / UNKNOWN) and professional dosage are
  // INFORMATIONAL. They describe how a product is worked with; they are not
  // evidence about its composition, and by owner decision they carry no
  // authority over whether it may be used. A professional product is therefore
  // judged on the same footing as any other — on what is known about what is in
  // it. The flag is still reported, so the missing authority stays visible.
  const technicalAuthorityRequired =
    input.technical && !input.technicalAuthority && valueReadiness !== 'REVIEW';
  const readiness: ProductReadiness = valueReadiness;
  const criticalPhysicsBlockers = [
    ...missingEngineFields.map((field) => `MISSING_${field.toUpperCase()}`),
    ...(power.resolved ? [] : ['UNRESOLVED_SWEETENING_FREEZING_PATH']),
    ...(plausibility.contradictedByDeclaration ? ['SELF_CONTRADICTORY_DECLARATION'] : []),
    ...(readiness === 'REVIEW' &&
    missingEngineFields.length === 0 &&
    power.resolved &&
    !plausibility.contradictedByDeclaration
      ? ['PROFILE_CONFIDENCE_BELOW_ENGINE_READY_FLOOR']
      : []),
  ];

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
    technicalAuthorityRequired,
    engineConfidence,
    // The Engine can compute with these numbers.
    engineReady: valueReadiness === 'READY' || valueReadiness === 'ESTIMATED_READY',
    missingEngineFields,
    sweetnessPath: power,
    criticalPhysicsBlockers,
    profileMatch,
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
