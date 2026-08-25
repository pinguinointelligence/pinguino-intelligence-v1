/**
 * Product Accuracy for production use — one pure authority shared by PR and PM.
 *
 * The percentage measures whether Gellatti has trustworthy facts needed to use
 * the article in formulation. It does not reward research activity itself and
 * it deliberately excludes allergen status, which remains a separate safety and
 * label authority. Existing Engine and ProductBehavior verdicts supply the
 * critical gate; this module does not invent a parallel physics contract.
 */
import type {
  EvidenceSource,
  ProductEvidenceField,
  ProductEvidenceInput,
} from './productEvidenceConfidence.ts';
import {
  WORKING_NUMERIC_FIELDS,
  type FieldBasis,
  type FieldTruthState,
  type ProductFieldTruthMap,
  type WorkingNumericField,
} from './productFieldTruth.ts';
import type {
  ProductDosageInterpretation,
  ProductIntendedUsageRole,
  ProductSemanticClassification,
} from './productRecognition.ts';
import type { SweetnessPath } from './productWorkingValues.ts';
import { PROFILE_MATCH_FLOOR } from './mapperValueInference.ts';

export const PRODUCT_PRODUCTION_ACCURACY_VERSION = 'PRODUCT_PRODUCTION_ACCURACY_V1' as const;

export const PRODUCT_PRODUCTION_ACCURACY_WEIGHTS = Object.freeze({
  recognition: 7,
  nutrition: 45,
  enginePhysics: 25,
  ingredientsEvidence: 10,
  productBehavior: 8,
  ean: 2,
  manufacturer: 1,
  country: 1,
  package: 1,
});

export interface ProductionAccuracyFieldTruth {
  value: number;
  state: FieldTruthState;
  basis: FieldBasis;
}

export interface ProductProductionAccuracyBehavior {
  classificationOutcome: 'classified' | 'unknown_requires_review' | 'blocked';
  baseRecipeEligible: boolean;
  toppingEligible: boolean;
  intendedUsageRole: ProductIntendedUsageRole;
  dosageInterpretation: ProductDosageInterpretation | null;
  classificationReasonCodes: readonly string[];
}

export interface ProductionAccuracyEvidenceProvenance {
  source: EvidenceSource;
  sourceUrl?: string | null;
  sourceAuthorityClass?: string | null;
}

export interface ProductProductionAccuracyInput {
  evidence: ProductEvidenceInput;
  evidenceProvenance?: Partial<Record<ProductEvidenceField, ProductionAccuracyEvidenceProvenance>>;
  fieldTruth: Partial<Record<WorkingNumericField, ProductionAccuracyFieldTruth>>;
  /** Server-selected compatible whole-profile donor confidence. Per-field
   * cohort estimates do not earn the 80% credit without this >=0.85 gate. */
  mapperWholeProfileSimilarity: number | null;
  recognition: ProductSemanticClassification | null;
  engineUsable: boolean;
  criticalPhysicsBlockers: readonly string[];
  sweetnessPath: SweetnessPath;
  behavior: ProductProductionAccuracyBehavior;
}

export interface ProductionAccuracyComponent {
  earnedPoints: number;
  availablePoints: number;
}

export interface ProductionAccuracyFieldResult extends ProductionAccuracyComponent {
  creditFactor: number;
  state: FieldTruthState | 'EVIDENCE' | 'UNKNOWN';
  basis: FieldBasis | EvidenceSource | 'role_not_applicable' | 'none';
}

export type ProductProductionRoleReadiness =
  | 'BASE_READY'
  | 'TOPPING_READY'
  | 'REVIEW'
  | 'BLOCKED'
  | 'CONFLICT';

export interface ProductProductionAccuracyAssessment {
  authority: typeof PRODUCT_PRODUCTION_ACCURACY_VERSION;
  rawProductAccuracy: number;
  productAccuracy: number;
  criticalCapApplied: boolean;
  criticalCap: 84 | null;
  criticalBlockers: string[];
  roleReadiness: ProductProductionRoleReadiness;
  baseEngineReady: boolean;
  components: {
    recognition: ProductionAccuracyComponent;
    nutrition: ProductionAccuracyComponent;
    enginePhysics: ProductionAccuracyComponent;
    ingredientsEvidence: ProductionAccuracyComponent;
    productBehavior: ProductionAccuracyComponent;
    ean: ProductionAccuracyComponent;
    manufacturer: ProductionAccuracyComponent;
    country: ProductionAccuracyComponent;
    package: ProductionAccuracyComponent;
  };
  fields: Partial<
    Record<WorkingNumericField | ProductEvidenceField, ProductionAccuracyFieldResult>
  >;
}

/** Adapter for the pre-ingest INTIMPORT census. It changes representation only;
 * all weights, credits and gates remain inside the scorer above. */
export function productionAccuracyTruthFromWorkingFields(
  fields: ProductFieldTruthMap,
): Partial<Record<WorkingNumericField, ProductionAccuracyFieldTruth>> {
  return Object.fromEntries(
    WORKING_NUMERIC_FIELDS.flatMap((field) => {
      const truth = fields[field];
      return truth.value === null
        ? []
        : [
            [
              field,
              {
                value: truth.value,
                state: truth.provenance.state,
                basis: truth.provenance.basis,
              },
            ],
          ];
    }),
  );
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

const trustedWebAuthority = (value: string | null | undefined): boolean =>
  /OFFICIAL|MANUFACTURER|EAN|BARCODE|AUTHORITATIVE_RETAILER|STRUCTURED_PRODUCT_DATABASE|TRUSTED/i.test(
    value ?? '',
  );

function evidenceCredit(
  input: ProductProductionAccuracyInput,
  field: ProductEvidenceField,
): number {
  const source = input.evidence.fields[field];
  if (!source) return 0;
  if (source === 'mapper_family') {
    return (input.mapperWholeProfileSimilarity ?? 0) >= PROFILE_MATCH_FLOOR ? 0.8 : 0;
  }
  if (source === 'web_search' || source === 'retailer') {
    return trustedWebAuthority(input.evidenceProvenance?.[field]?.sourceAuthorityClass) ? 1 : 0;
  }
  return 1;
}

const conflictAliases: Partial<Record<WorkingNumericField | ProductEvidenceField, string[]>> = {
  identity: ['identity', 'name', 'product'],
  ingredients: ['ingredient', 'skład', 'sklad'],
  fat_percent: ['fat', 'tłuszcz', 'tluszcz'],
  protein_percent: ['protein', 'białko', 'bialko'],
  carbohydrate_percent: ['carbohydrate', 'węglowodan', 'weglowodan'],
  total_sugars_percent: ['sugar', 'cukr'],
  salt_percent: ['salt', 'sól', 'sol'],
  kcal_per_100g: ['kcal', 'energy', 'energia'],
  water_percent: ['water', 'woda'],
  total_solids_percent: ['solid', 'sucha masa'],
};

function fieldHasConflict(
  input: ProductProductionAccuracyInput,
  field: WorkingNumericField | ProductEvidenceField,
): boolean {
  const aliases = conflictAliases[field] ?? [field.replace(/_percent$/, '')];
  return input.evidence.materialConflicts.some((conflict) => {
    const normalized = conflict.toLocaleLowerCase('en-US');
    return aliases.some((alias) => normalized.includes(alias.toLocaleLowerCase('en-US')));
  });
}

function truthCredit(input: ProductProductionAccuracyInput, field: WorkingNumericField): number {
  if (fieldHasConflict(input, field)) return 0;
  const truth = input.fieldTruth[field];
  if (!truth || !Number.isFinite(truth.value) || truth.state === 'UNKNOWN') return 0;
  return truth.state === 'ESTIMATED'
    ? (input.mapperWholeProfileSimilarity ?? 0) >= PROFILE_MATCH_FLOOR
      ? 0.8
      : 0
    : 1;
}

const component = (earnedPoints: number, availablePoints: number): ProductionAccuracyComponent => ({
  earnedPoints: round2(Math.max(0, Math.min(availablePoints, earnedPoints))),
  availablePoints,
});

export function assessProductProductionAccuracy(
  input: ProductProductionAccuracyInput,
): ProductProductionAccuracyAssessment {
  const fields: ProductProductionAccuracyAssessment['fields'] = {};
  const componentEarned: Record<keyof typeof PRODUCT_PRODUCTION_ACCURACY_WEIGHTS, number> = {
    recognition: 0,
    nutrition: 0,
    enginePhysics: 0,
    ingredientsEvidence: 0,
    productBehavior: 0,
    ean: 0,
    manufacturer: 0,
    country: 0,
    package: 0,
  };

  const addTruth = (
    componentName: keyof typeof PRODUCT_PRODUCTION_ACCURACY_WEIGHTS,
    field: WorkingNumericField,
    availablePoints: number,
  ): number => {
    const creditFactor = truthCredit(input, field);
    const truthValue = input.fieldTruth[field];
    const earnedPoints = availablePoints * creditFactor;
    componentEarned[componentName] += earnedPoints;
    const prior = fields[field];
    fields[field] = {
      availablePoints: round2((prior?.availablePoints ?? 0) + availablePoints),
      earnedPoints: round2((prior?.earnedPoints ?? 0) + earnedPoints),
      creditFactor,
      state: truthValue?.state ?? 'UNKNOWN',
      basis: truthValue?.basis ?? 'none',
    };
    return creditFactor;
  };

  const addEvidence = (
    componentName: keyof typeof PRODUCT_PRODUCTION_ACCURACY_WEIGHTS,
    field: ProductEvidenceField,
    availablePoints: number,
  ): number => {
    const creditFactor = fieldHasConflict(input, field) ? 0 : evidenceCredit(input, field);
    const earnedPoints = availablePoints * creditFactor;
    componentEarned[componentName] += earnedPoints;
    fields[field] = {
      availablePoints,
      earnedPoints: round2(earnedPoints),
      creditFactor,
      state: creditFactor > 0 ? 'EVIDENCE' : 'UNKNOWN',
      basis: input.evidence.fields[field] ?? 'none',
    };
    return creditFactor;
  };

  // Recognition / family / form / role — 7.
  addEvidence('recognition', 'identity', 1);
  const recognition = input.recognition;
  if (recognition?.productArchetype && recognition.productArchetype !== 'UNKNOWN') {
    componentEarned.recognition += 1.5;
  }
  if (recognition?.ingredientFamily && recognition.ingredientFamily !== 'unknown') {
    componentEarned.recognition += 1.5;
  }
  if (recognition?.physicalForm && recognition.physicalForm !== 'UNKNOWN') {
    componentEarned.recognition += 1.5;
  }
  if (recognition?.intendedUsageRole && recognition.intendedUsageRole !== 'NEITHER_REVIEW') {
    componentEarned.recognition += 1.5;
  }

  // Nutrition useful for formulation — 45.
  const nutritionWeights: readonly [WorkingNumericField, number][] = [
    ['fat_percent', 8],
    ['protein_percent', 8],
    ['carbohydrate_percent', 8],
    ['total_sugars_percent', 8],
    ['fiber_percent', 4],
    ['salt_percent', 4],
    ['kcal_per_100g', 5],
  ];
  for (const [field, weight] of nutritionWeights) addTruth('nutrition', field, weight);

  const role = recognition?.intendedUsageRole ?? input.behavior.intendedUsageRole;
  // A semantic role is a request, not permission. The topping-only exemption
  // from base freezing physics exists only after the shared ProductBehavior
  // authority has accepted that exact role. Otherwise provisional recognition
  // would receive 25/25 before the role gate that is meant to authorize it.
  const toppingOnly =
    role === 'TOPPING_ONLY' &&
    input.behavior.classificationOutcome === 'classified' &&
    input.behavior.toppingEligible === true &&
    input.behavior.baseRecipeEligible === false;

  // Engine physics — 25. For a true topping, base-freezing physics is outside
  // the accepted role and therefore not a missing requirement.
  if (toppingOnly) {
    componentEarned.enginePhysics = 25;
  } else {
    const waterCredit = Math.max(
      truthCredit(input, 'water_percent'),
      truthCredit(input, 'total_solids_percent'),
    );
    componentEarned.enginePhysics += 6 * waterCredit;
    for (const field of [
      'water_percent',
      'total_solids_percent',
    ] as const satisfies readonly WorkingNumericField[]) {
      const truthValue = input.fieldTruth[field];
      fields[field] = {
        availablePoints: round2((fields[field]?.availablePoints ?? 0) + 3),
        earnedPoints: round2((fields[field]?.earnedPoints ?? 0) + 3 * waterCredit),
        creditFactor: waterCredit,
        state: truthValue?.state ?? 'UNKNOWN',
        basis: truthValue?.basis ?? 'none',
      };
    }
    for (const field of [
      'fat_percent',
      'protein_percent',
      'carbohydrate_percent',
      'total_sugars_percent',
      'salt_percent',
    ] as const) {
      addTruth('enginePhysics', field, 1.4);
    }

    let sweetnessCredit = 0;
    if (input.sweetnessPath.resolved) {
      if (input.sweetnessPath.kind === 'stored') {
        sweetnessCredit = Math.min(
          truthCredit(input, 'pod_value'),
          truthCredit(input, 'pac_value'),
        );
        // POD/PAC are one paired 8-point authority. Record the pair explicitly
        // without adding a second score: the weaker field decides both halves,
        // exactly as the existing aggregate credit did.
        for (const field of ['pod_value', 'pac_value'] as const) {
          const truthValue = input.fieldTruth[field];
          fields[field] = {
            availablePoints: 4,
            earnedPoints: round2(4 * sweetnessCredit),
            creditFactor: sweetnessCredit,
            state: truthValue?.state ?? 'UNKNOWN',
            basis: truthValue?.basis ?? 'none',
          };
        }
      } else if (input.sweetnessPath.kind === 'trivially_zero') {
        sweetnessCredit = Math.min(
          truthCredit(input, 'total_sugars_percent'),
          truthCredit(input, 'alcohol_percent'),
          truthCredit(input, 'polyol_percent'),
        );
      } else {
        const sugarCredits = [
          'sucrose_percent',
          'dextrose_percent',
          'glucose_percent',
          'fructose_percent',
          'lactose_percent',
        ].map((field) => truthCredit(input, field as WorkingNumericField));
        sweetnessCredit = Math.min(
          truthCredit(input, 'total_sugars_percent'),
          Math.max(...sugarCredits),
        );
      }
    }
    componentEarned.enginePhysics += 8 * sweetnessCredit;
    addTruth('enginePhysics', 'alcohol_percent', 1);
    addTruth('enginePhysics', 'polyol_percent', 1);
    componentEarned.enginePhysics += input.engineUsable ? 2 : 0;
  }

  // Ingredients/evidence consistency — 10. Allergens intentionally absent.
  addEvidence('ingredientsEvidence', 'ingredients', 6);
  componentEarned.ingredientsEvidence += input.evidence.materialConflicts.length === 0 ? 4 : 0;

  // ProductBehavior / dosage / usage — 8.
  const roleKnown = role !== 'NEITHER_REVIEW';
  componentEarned.productBehavior += roleKnown ? 2 : 0;
  const acceptedForRole =
    input.behavior.classificationOutcome === 'classified' &&
    (toppingOnly
      ? input.behavior.toppingEligible
      : input.behavior.baseRecipeEligible &&
        (role !== 'BASE_AND_TOPPING' || input.behavior.toppingEligible));
  const behaviorWithheldOnlyByPhysics =
    input.behavior.classificationOutcome === 'unknown_requires_review' &&
    input.behavior.classificationReasonCodes.length > 0 &&
    input.behavior.classificationReasonCodes.every((reason) =>
      input.criticalPhysicsBlockers.includes(reason),
    );
  componentEarned.productBehavior += acceptedForRole || behaviorWithheldOnlyByPhysics ? 4 : 0;
  const dosageRequired =
    recognition?.isTechnicalProduct === true || recognition?.isDosageDependent === true;
  const dosage = input.behavior.dosageInterpretation ?? recognition?.dosage ?? null;
  const dosageResolved =
    !dosageRequired || dosage?.semantics === 'FIXED' || dosage?.semantics === 'AS_DESIRED';
  componentEarned.productBehavior += dosageResolved ? 2 : 0;

  // Minor metadata — 5 total.
  if (input.evidence.validatedBarcode) addEvidence('ean', 'barcode', 2);
  else
    fields.barcode = {
      availablePoints: 2,
      earnedPoints: 0,
      creditFactor: 0,
      state: 'UNKNOWN',
      basis: 'none',
    };
  addEvidence('manufacturer', 'manufacturer', 1);
  addEvidence('country', 'countryOfOrigin', 1);
  addEvidence('package', 'netQuantity', 1);

  const criticalBlockers = new Set<string>();
  for (const conflict of input.evidence.materialConflicts) {
    criticalBlockers.add(`MATERIAL_CONFLICT:${conflict}`);
  }
  if (
    !recognition ||
    recognition.modelRequired ||
    recognition.productArchetype === 'UNKNOWN' ||
    recognition.ingredientFamily === 'unknown' ||
    recognition.physicalForm === 'UNKNOWN' ||
    role === 'NEITHER_REVIEW'
  ) {
    criticalBlockers.add('PRODUCT_SEMANTICS_UNRESOLVED');
  }
  if (dosageRequired && !dosageResolved) {
    criticalBlockers.add('TECHNICAL_DOSAGE_AUTHORITY_REQUIRED');
  }
  if (recognition?.isTechnicalProduct && input.behavior.classificationOutcome !== 'classified') {
    criticalBlockers.add('TECHNICAL_DOSAGE_AUTHORITY_REQUIRED');
  }
  if (toppingOnly) {
    if (!acceptedForRole) {
      for (const reason of input.behavior.classificationReasonCodes) criticalBlockers.add(reason);
      if (input.behavior.classificationReasonCodes.length === 0) {
        criticalBlockers.add('TOPPING_BEHAVIOR_AUTHORITY_REQUIRED');
      }
    }
  } else {
    for (const blocker of input.criticalPhysicsBlockers) criticalBlockers.add(blocker);
    if (!input.engineUsable && input.criticalPhysicsBlockers.length === 0) {
      criticalBlockers.add('PRODUCT_ENGINE_NOT_READY');
    }
    if (!acceptedForRole) {
      for (const reason of input.behavior.classificationReasonCodes) criticalBlockers.add(reason);
      if (input.behavior.classificationReasonCodes.length === 0) {
        criticalBlockers.add('PRODUCT_BEHAVIOR_AUTHORITY_REQUIRED');
      }
    }
  }

  const components = {
    recognition: component(
      componentEarned.recognition,
      PRODUCT_PRODUCTION_ACCURACY_WEIGHTS.recognition,
    ),
    nutrition: component(componentEarned.nutrition, PRODUCT_PRODUCTION_ACCURACY_WEIGHTS.nutrition),
    enginePhysics: component(
      componentEarned.enginePhysics,
      PRODUCT_PRODUCTION_ACCURACY_WEIGHTS.enginePhysics,
    ),
    ingredientsEvidence: component(
      componentEarned.ingredientsEvidence,
      PRODUCT_PRODUCTION_ACCURACY_WEIGHTS.ingredientsEvidence,
    ),
    productBehavior: component(
      componentEarned.productBehavior,
      PRODUCT_PRODUCTION_ACCURACY_WEIGHTS.productBehavior,
    ),
    ean: component(componentEarned.ean, PRODUCT_PRODUCTION_ACCURACY_WEIGHTS.ean),
    manufacturer: component(
      componentEarned.manufacturer,
      PRODUCT_PRODUCTION_ACCURACY_WEIGHTS.manufacturer,
    ),
    country: component(componentEarned.country, PRODUCT_PRODUCTION_ACCURACY_WEIGHTS.country),
    package: component(componentEarned.package, PRODUCT_PRODUCTION_ACCURACY_WEIGHTS.package),
  };
  const rawProductAccuracy = round2(
    Object.values(components).reduce((sum, value) => sum + value.earnedPoints, 0),
  );
  const blockerList = [...criticalBlockers].sort();
  const criticalCapApplied = blockerList.length > 0 && rawProductAccuracy > 84;
  const productAccuracy = criticalCapApplied ? 84 : rawProductAccuracy;
  const baseEngineReady =
    !toppingOnly &&
    input.engineUsable &&
    input.behavior.baseRecipeEligible &&
    blockerList.length === 0;
  const roleReadiness: ProductProductionRoleReadiness =
    input.evidence.materialConflicts.length > 0
      ? 'CONFLICT'
      : blockerList.length === 0 && toppingOnly && input.behavior.toppingEligible
        ? 'TOPPING_READY'
        : blockerList.length === 0 && baseEngineReady
          ? 'BASE_READY'
          : input.behavior.classificationOutcome === 'blocked'
            ? 'BLOCKED'
            : 'REVIEW';

  return {
    authority: PRODUCT_PRODUCTION_ACCURACY_VERSION,
    rawProductAccuracy,
    productAccuracy,
    criticalCapApplied,
    criticalCap: blockerList.length > 0 ? 84 : null,
    criticalBlockers: blockerList,
    roleReadiness,
    baseEngineReady,
    components,
    fields,
  };
}
