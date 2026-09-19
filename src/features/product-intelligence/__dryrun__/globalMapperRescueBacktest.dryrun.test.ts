/**
 * Read-only leave-one-row/field-out backtest for Product Intelligence Rescue.
 * It reads the immutable Mapper CSV and writes only a deterministic audit
 * artifact. No product, Mapper row, database or network state is changed.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildMapperKnowledge,
  CONSENSUS_BANDS,
  inferMapperValues,
  MASS_BALANCE_RESCUE_POLICY,
  rescueMassBalanceFromCohort,
  type MapperInferenceResult,
  type MapperKnowledgeRow,
} from '../mapperValueInference';
import { classifyProductSemantics } from '../productRecognition';
import {
  applyFieldTruth,
  emptyFieldTruthMap,
  knownField,
  WORKING_NUMERIC_FIELDS,
  type ProductFieldTruthMap,
  type FieldBasis,
  type WorkingNumericField,
} from '../productFieldTruth';
import { ENGINE_ESTIMATE_READY_FLOORS } from '../productWorkingValues';
import { loadMapperKnowledgeRows, MAPPER_FILE } from './mapperFixture';

const REPORT = resolve(__dirname, '../../../../docs/products/global_mapper_rescue_backtest.json');
const MAJOR_FIELDS = [
  'fat_percent',
  'protein_percent',
  'carbohydrate_percent',
] as const satisfies readonly WorkingNumericField[];
const MASS_FIELDS = new Set<WorkingNumericField>(['water_percent', 'total_solids_percent']);

interface Observation {
  field: WorkingNumericField;
  familyForm: string;
  ingredientId: string;
  truth: number;
  predicted: number | null;
  confidence: number;
  error: number | null;
  references: readonly string[];
  fingerprint: string;
  reasonCodes: readonly string[];
  basis: FieldBasis | 'mapper_mass_balance_rescue';
}

interface MetricSummary {
  nTested: number;
  nResolved: number;
  resolutionRate: number;
  unresolvedRate: number;
  mae: number | null;
  medianAbsoluteError: number | null;
  p90AbsoluteError: number | null;
  maxAbsoluteError: number | null;
  withinToleranceRate: number | null;
  falseConfidenceCount: number;
  falseConfidenceCases: Array<{
    ingredientId: string;
    familyForm: string;
    truth: number;
    predicted: number;
    confidence: number;
    absoluteError: number;
  }>;
  unresolvedReasonCounts: Record<string, number>;
  confidenceCalibration: Array<{
    confidenceRange: string;
    n: number;
    meanConfidence: number | null;
    mae: number | null;
    withinToleranceRate: number | null;
  }>;
}

type CompactMetricSummary = Pick<
  MetricSummary,
  | 'nTested'
  | 'nResolved'
  | 'resolutionRate'
  | 'unresolvedRate'
  | 'mae'
  | 'medianAbsoluteError'
  | 'p90AbsoluteError'
  | 'maxAbsoluteError'
  | 'falseConfidenceCount'
>;

const finite = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const round4 = (value: number): number => Math.round(value * 1e4) / 1e4;

const quantile = (values: readonly number[], q: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  const lower = sorted[low] ?? 0;
  const upper = sorted[high] ?? lower;
  return round4(low === high ? lower : lower + (upper - lower) * (position - low));
};

const authorityRows = (rows: readonly MapperKnowledgeRow[]): MapperKnowledgeRow[] =>
  rows.filter(
    (row) =>
      row.is_active !== false &&
      row.approved_for_base === true &&
      row.approved_for_engines === true &&
      row.verification_status?.trim().toLocaleLowerCase('en-US').startsWith('verified') === true,
  );

const recognitionFor = (row: MapperKnowledgeRow) =>
  classifyProductSemantics({
    name: row.ingredient_name_display ?? row.ingredient_name_internal,
    brand: row.brand ?? null,
    manufacturer: row.brand ?? null,
    manufacturerCode: row.ingredient_id,
    gtin: null,
    productType: 'mapper_reference',
    category: row.ingredient_category ?? null,
    subcategory: row.ingredient_subcategory ?? null,
    variant: null,
    ingredients: null,
    nutrition: null,
    description: null,
    dosage: null,
    technicalParameters: null,
    sourceUrls: [],
  });

const exactMassFields = (row: MapperKnowledgeRow): ProductFieldTruthMap => {
  let fields = emptyFieldTruthMap();
  for (const field of [
    ...MAJOR_FIELDS,
    'fiber_percent',
    'salt_percent',
    'alcohol_percent',
  ] as const) {
    const value = row[field];
    if (!finite(value)) continue;
    fields = applyFieldTruth(
      fields,
      field,
      knownField({
        value,
        state: 'VERIFIED',
        confidence: 1,
        basis: 'mapper_exact',
        mapperReferences: [row.ingredient_id],
      }),
    );
  }
  return fields;
};

const inferenceFor = (
  row: MapperKnowledgeRow,
  hiddenMajor: (typeof MAJOR_FIELDS)[number] | null,
  knowledge: ReturnType<typeof buildMapperKnowledge>,
): MapperInferenceResult => {
  const knownMacros: NonNullable<Parameters<typeof inferMapperValues>[0]['knownMacros']> = {};
  for (const field of MAJOR_FIELDS) {
    if (field === hiddenMajor) continue;
    const value = row[field];
    if (finite(value)) knownMacros[field] = value;
  }
  return inferMapperValues(
    {
      name: row.ingredient_name_display ?? row.ingredient_name_internal,
      brand: row.brand ?? null,
      category: row.ingredient_category ?? null,
      subcategory: row.ingredient_subcategory ?? null,
      barcode: null,
      knownMacros,
      semantic: recognitionFor(row),
      excludedMapperIngredientIds: [row.ingredient_id],
    },
    knowledge,
  );
};

const acceptableError = (field: WorkingNumericField): number =>
  MASS_FIELDS.has(field) ? MASS_BALANCE_RESCUE_POLICY.maxRange / 2 : CONSENSUS_BANDS[field];

const summarize = (observations: readonly Observation[]): MetricSummary => {
  const resolved = observations.filter(
    (entry): entry is Observation & { predicted: number; error: number } =>
      entry.predicted !== null && entry.error !== null,
  );
  const errors = resolved.map((entry) => entry.error);
  const withinTolerance = resolved.filter(
    (entry) => entry.error <= acceptableError(entry.field),
  ).length;
  const falseConfidence = resolved
    .filter(
      (entry) =>
        entry.confidence >= (ENGINE_ESTIMATE_READY_FLOORS[entry.field] ?? 0.85) &&
        entry.error > acceptableError(entry.field),
    )
    .sort((a, b) => (b.error ?? 0) - (a.error ?? 0));
  const reasonCounts: Record<string, number> = {};
  for (const entry of observations.filter((candidate) => candidate.predicted === null)) {
    for (const reason of entry.reasonCodes) reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
  }
  const calibration = [
    [0, 0.85],
    [0.85, 0.9],
    [0.9, 0.95],
    [0.95, 1.01],
  ].map(([low, high]) => {
    const bucket = resolved.filter((entry) => entry.confidence >= low! && entry.confidence < high!);
    return {
      confidenceRange: `${low!.toFixed(2)}-${Math.min(1, high!).toFixed(2)}`,
      n: bucket.length,
      meanConfidence:
        bucket.length === 0
          ? null
          : round4(bucket.reduce((sum, entry) => sum + entry.confidence, 0) / bucket.length),
      mae:
        bucket.length === 0
          ? null
          : round4(bucket.reduce((sum, entry) => sum + (entry.error ?? 0), 0) / bucket.length),
      withinToleranceRate:
        bucket.length === 0
          ? null
          : round4(
              bucket.filter((entry) => entry.error <= acceptableError(entry.field)).length /
                bucket.length,
            ),
    };
  });
  return {
    nTested: observations.length,
    nResolved: resolved.length,
    resolutionRate: observations.length === 0 ? 0 : round4(resolved.length / observations.length),
    unresolvedRate:
      observations.length === 0
        ? 0
        : round4((observations.length - resolved.length) / observations.length),
    mae:
      errors.length === 0
        ? null
        : round4(errors.reduce((sum, error) => sum + error, 0) / errors.length),
    medianAbsoluteError: quantile(errors, 0.5),
    p90AbsoluteError: quantile(errors, 0.9),
    maxAbsoluteError: errors.length === 0 ? null : round4(Math.max(...errors)),
    withinToleranceRate: resolved.length === 0 ? null : round4(withinTolerance / resolved.length),
    falseConfidenceCount: falseConfidence.length,
    falseConfidenceCases: falseConfidence.slice(0, 10).map((entry) => ({
      ingredientId: entry.ingredientId,
      familyForm: entry.familyForm,
      truth: entry.truth,
      predicted: entry.predicted,
      confidence: entry.confidence,
      absoluteError: entry.error,
    })),
    unresolvedReasonCounts: reasonCounts,
    confidenceCalibration: calibration,
  };
};

const compactSummary = (observations: readonly Observation[]): CompactMetricSummary => {
  const summary = summarize(observations);
  return {
    nTested: summary.nTested,
    nResolved: summary.nResolved,
    resolutionRate: summary.resolutionRate,
    unresolvedRate: summary.unresolvedRate,
    mae: summary.mae,
    medianAbsoluteError: summary.medianAbsoluteError,
    p90AbsoluteError: summary.p90AbsoluteError,
    maxAbsoluteError: summary.maxAbsoluteError,
    falseConfidenceCount: summary.falseConfidenceCount,
  };
};

describe.runIf(existsSync(MAPPER_FILE))('global Mapper Rescue leave-one-out backtest', () => {
  it('WSA-BT-1578 measures every working field and every runtime family/form without mutating Mapper', () => {
    const beforeHash = createHash('sha256').update(readFileSync(MAPPER_FILE)).digest('hex');
    const loaded = loadMapperKnowledgeRows();
    const rows = authorityRows(loaded.rows);
    const knowledge = buildMapperKnowledge(rows, loaded.fingerprint);
    const observations: Observation[] = [];
    const inventory = new Map<string, { count: number; representativeIds: string[] }>();
    const representativeDiagnostics = new Map<string, unknown>();

    for (const row of rows) {
      const recognition = recognitionFor(row);
      const familyForm = `${recognition.ingredientFamily}|${recognition.physicalForm}`;
      const inventoryEntry = inventory.get(familyForm) ?? { count: 0, representativeIds: [] };
      inventoryEntry.count++;
      if (inventoryEntry.representativeIds.length < 3) {
        inventoryEntry.representativeIds.push(row.ingredient_id);
      }
      inventory.set(familyForm, inventoryEntry);

      const base = inferenceFor(row, null, knowledge);
      const major = new Map(
        MAJOR_FIELDS.map((field) => [field, inferenceFor(row, field, knowledge)] as const),
      );
      const mass = rescueMassBalanceFromCohort({
        cohort: base.bestCohort?.rows ?? [],
        fields: exactMassFields(row),
        semantic: recognition,
        targetEvidence: {
          exactProductIdentity: true,
          ingredientOrCompositionIdentity: true,
        },
        excludedMapperIngredientIds: [row.ingredient_id],
      });

      if (!representativeDiagnostics.has(familyForm)) {
        representativeDiagnostics.set(familyForm, {
          ingredientId: row.ingredient_id,
          recognition: {
            family: recognition.ingredientFamily,
            form: recognition.physicalForm,
            role: recognition.intendedUsageRole,
            confidence: recognition.confidence,
            modelRequired: recognition.modelRequired,
          },
          selectedCohort: base.bestCohort?.label ?? null,
          massBalance: {
            resolved: mass.resolved,
            candidatesBeforeFilter: {
              count: mass.candidatesBeforeFilter.length,
              ids: mass.candidatesBeforeFilter.slice(0, 20),
            },
            candidates: {
              count: mass.candidates.length,
              rows: mass.candidates.slice(0, 20),
            },
            rejectedCandidates: {
              count: mass.rejectedCandidates.length,
              rows: mass.rejectedCandidates.slice(0, 20),
            },
            estimate: { water: mass.water, totalSolids: mass.totalSolids },
            confidence: mass.confidence,
            dispersion: mass.dispersion,
            reasonCodes: mass.reasonCodes,
          },
        });
      }

      for (const field of WORKING_NUMERIC_FIELDS) {
        const truth = row[field];
        if (!finite(truth)) continue;
        let predicted: number | null;
        let confidence: number;
        let references: readonly string[];
        let fingerprint: string;
        let reasonCodes: readonly string[];
        let basis: Observation['basis'];
        if (field === 'water_percent' || field === 'total_solids_percent') {
          predicted = field === 'water_percent' ? mass.water : mass.totalSolids;
          confidence = mass.confidence;
          references = mass.candidates.map((candidate) => candidate.ingredientId);
          fingerprint = predicted === null ? '' : loaded.fingerprint;
          reasonCodes = mass.reasonCodes;
          basis = 'mapper_mass_balance_rescue';
        } else {
          const inference = major.get(field as (typeof MAJOR_FIELDS)[number]) ?? base;
          const estimate = inference.fields[field];
          predicted = estimate?.value ?? null;
          confidence = estimate?.provenance.confidence ?? 0;
          references = estimate?.provenance.mapperReferences ?? [];
          fingerprint = estimate?.provenance.mapperFingerprint ?? '';
          reasonCodes = estimate
            ? ['RESCUE_FIELD_CONSENSUS_SUCCESS']
            : ['RESCUE_FIELD_DISPERSION_OR_SUPPORT_FAILED'];
          basis = estimate?.provenance.basis ?? 'none';
        }
        observations.push({
          field,
          familyForm,
          ingredientId: row.ingredient_id,
          truth,
          predicted,
          confidence,
          error: predicted === null ? null : round4(Math.abs(predicted - truth)),
          references,
          fingerprint,
          reasonCodes,
          basis,
        });
      }
    }

    const fieldMetrics = {} as Record<WorkingNumericField, MetricSummary>;
    const familyFormMetrics: Record<string, Record<WorkingNumericField, CompactMetricSummary>> = {};
    const fieldBasisMetrics = {} as Record<WorkingNumericField, Record<string, MetricSummary>>;
    for (const field of WORKING_NUMERIC_FIELDS) {
      const fieldObservations = observations.filter((entry) => entry.field === field);
      fieldMetrics[field] = summarize(fieldObservations);
      fieldBasisMetrics[field] = {};
      for (const basis of [...new Set(fieldObservations.map((entry) => entry.basis))].sort()) {
        fieldBasisMetrics[field][basis] = summarize(
          fieldObservations.filter((entry) => entry.basis === basis),
        );
      }
    }
    for (const familyForm of [...inventory.keys()].sort()) {
      const metrics = {} as Record<WorkingNumericField, CompactMetricSummary>;
      for (const field of WORKING_NUMERIC_FIELDS) {
        metrics[field] = compactSummary(
          observations.filter((entry) => entry.familyForm === familyForm && entry.field === field),
        );
      }
      familyFormMetrics[familyForm] = metrics;
    }
    const report: Record<string, unknown> = {
      schemaVersion: 'GLOBAL_MAPPER_RESCUE_BACKTEST_V1',
      readOnly: true,
      mapperFile: 'docs/ingredients/validation/mapper_basement.csv',
      mapperFingerprint: loaded.fingerprint,
      eligibleRows: rows.length,
      method:
        'leave target row out of every cohort; hide tested field; preserve remaining exact macros; compare estimate with frozen Mapper truth',
      acceptanceTolerance: Object.fromEntries(
        WORKING_NUMERIC_FIELDS.map((field) => [field, acceptableError(field)]),
      ),
      policies: {
        massBalance: MASS_BALANCE_RESCUE_POLICY,
        fieldConsensusBands: CONSENSUS_BANDS,
        engineEstimateReadyFloors: ENGINE_ESTIMATE_READY_FLOORS,
      },
      runtimeFamilyFormInventory: Object.fromEntries([...inventory.entries()].sort()),
      fieldMetrics,
      fieldBasisMetrics,
      familyFormMetrics,
      representativeDiagnostics: Object.fromEntries(
        [...representativeDiagnostics.entries()].sort(),
      ),
    };
    mkdirSync(dirname(REPORT), { recursive: true });
    writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);

    const afterHash = createHash('sha256').update(readFileSync(MAPPER_FILE)).digest('hex');
    expect(afterHash).toBe(beforeHash);
    expect(loaded.fingerprint).toBe(beforeHash);
    expect(Object.keys(fieldMetrics)).toEqual([...WORKING_NUMERIC_FIELDS]);
    expect(inventory.size).toBeGreaterThan(10);
    for (const familyForm of [
      'dairy_liquid|LIQUID',
      'fruit|PUREE',
      'cocoa|POWDER',
      'chocolate|POWDER',
      'sugar_sucrose|LIQUID',
      'nut_paste|PASTE',
      'plant_beverage|LIQUID',
      'base_mix|POWDER',
      'stabilizer_hydrocolloid|POWDER',
    ]) {
      expect(inventory.has(familyForm), `${familyForm} runtime coverage`).toBe(true);
    }
    expect(fieldMetrics.water_percent).toMatchObject({
      nResolved: expect.any(Number),
      falseConfidenceCount: 0,
    });
    expect(fieldMetrics.water_percent.nResolved).toBeGreaterThan(0);
    expect(fieldMetrics.water_percent.maxAbsoluteError).toBeLessThanOrEqual(
      MASS_BALANCE_RESCUE_POLICY.maxRange,
    );
    for (const field of [
      'fat_percent',
      'protein_percent',
      'carbohydrate_percent',
      'total_sugars_percent',
    ] as const) {
      expect(fieldMetrics[field].falseConfidenceCount, `${field} Engine admission`).toBe(0);
    }
    expect(fieldMetrics.pod_value.nResolved).toBe(0);
    expect(fieldMetrics.pac_value.nResolved).toBe(0);
    for (const entry of observations.filter((candidate) => candidate.predicted !== null)) {
      expect(
        entry.references.length,
        `${entry.field}/${entry.ingredientId} provenance`,
      ).toBeGreaterThan(0);
      expect(entry.fingerprint, `${entry.field}/${entry.ingredientId} fingerprint`).toBe(
        loaded.fingerprint,
      );
      expect(Number.isFinite(entry.predicted)).toBe(true);
      if (entry.field === 'kcal_per_100g') {
        expect(entry.predicted).toBeGreaterThanOrEqual(0);
        expect(entry.predicted).toBeLessThanOrEqual(900);
      } else if (entry.field !== 'sweetness_factor' && entry.field !== 'freezing_factor') {
        expect(entry.predicted).toBeGreaterThanOrEqual(0);
        expect(entry.predicted).toBeLessThanOrEqual(
          entry.field === 'pod_value' || entry.field === 'pac_value' ? 400 : 100,
        );
      }
    }
  }, 120_000);
});
