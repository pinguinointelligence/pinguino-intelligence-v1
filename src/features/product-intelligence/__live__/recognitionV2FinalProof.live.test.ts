import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseINTIMPORT } from '@/data/products/intimport';
import {
  classifyIntimportFinalResult,
  runIntimportLocalIntelligence,
  type IntimportProductIntelligence,
} from '../intimportIntelligence';
import {
  runIntimportSemanticClassification,
  type SemanticClassificationRequest,
  type SemanticClassificationResponse,
} from '../intimportSemanticClassification';
import {
  classifyProductSemantics,
  type ProductSemanticClassification,
} from '../productRecognition';
import { buildMapperKnowledge } from '../mapperValueInference';
import { loadMapperKnowledgeRows, MAPPER_FILE } from '../__dryrun__/mapperFixture';

const POLAND_FILE = join(homedir(), 'Desktop', 'PL_Poland.csv');
const PRIOR_V2_TRACE =
  process.env.RECOGNITION_V2_PRIOR_TRACE ??
  join(
    homedir(),
    '.codex',
    'outputs',
    'product_recognition_v2_final_working',
    'POLAND_820_RECOGNITION_V2_TRACE.csv',
  );
const OUTPUT_DIR =
  process.env.RECOGNITION_V2_PROOF_OUTPUT_DIR ??
  join(homedir(), '.codex', 'outputs', 'recognition_v2_final_proof_20260825');
const EDGE_URL = process.env.RECOGNITION_V2_STAGING_EDGE_URL ?? '';
const ACCESS_TOKEN = process.env.RECOGNITION_V2_STAGING_ACCESS_TOKEN ?? '';
const ANON_KEY = process.env.RECOGNITION_V2_STAGING_ANON_KEY ?? '';
const IMPORT_ID = process.env.RECOGNITION_V2_PROOF_IMPORT_ID ?? '';
const LIVE =
  process.env.RECOGNITION_V2_LIVE_PROOF === 'true' &&
  EDGE_URL !== '' &&
  ACCESS_TOKEN !== '' &&
  ANON_KEY !== '' &&
  IMPORT_ID !== '' &&
  existsSync(POLAND_FILE) &&
  existsSync(PRIOR_V2_TRACE);

type ProofFocus =
  'CONFECTIONERY_BAR' | 'TEA_COFFEE' | 'CHOCOLATE' | 'FRUIT' | 'COMPRITAL' | 'DOSAGE';

interface ProofCase {
  id: string;
  focus: readonly ProofFocus[];
  modelExpected: boolean;
}

/**
 * Fixed source IDs make the proof reproducible; classifications are never
 * fixed. Every semantic result still comes from exact current evidence through
 * the deployed Edge validator.
 */
const PROOF_CASES: readonly ProofCase[] = [
  { id: 'PL-BIE-00431', focus: ['CONFECTIONERY_BAR', 'CHOCOLATE'], modelExpected: true },
  {
    id: 'PL-AUC-AUCHAN-DARK-CHOC90-100G',
    focus: ['CHOCOLATE'],
    modelExpected: true,
  },
  { id: 'PL-BIE-00137', focus: ['FRUIT'], modelExpected: true },
  { id: 'PL-BIE-00135', focus: ['FRUIT'], modelExpected: true },
  { id: 'PL-BIE-00103', focus: ['FRUIT'], modelExpected: true },
  { id: 'PL-BIE-00111', focus: ['FRUIT'], modelExpected: true },
  { id: 'PL-BIE-00115', focus: ['FRUIT'], modelExpected: true },
  { id: 'PL-COM-PC308', focus: ['TEA_COFFEE', 'COMPRITAL', 'DOSAGE'], modelExpected: true },
  { id: 'PL-COM-PC305', focus: ['FRUIT', 'COMPRITAL', 'DOSAGE'], modelExpected: true },
  { id: 'PL-COM-P1192', focus: ['CHOCOLATE', 'COMPRITAL', 'DOSAGE'], modelExpected: true },
  { id: 'PL-COM-P394', focus: ['CHOCOLATE', 'COMPRITAL', 'DOSAGE'], modelExpected: true },
  { id: 'PL-COM-PC567', focus: ['CHOCOLATE', 'COMPRITAL', 'DOSAGE'], modelExpected: true },
  { id: 'PL-COM-PF026D', focus: ['CHOCOLATE', 'COMPRITAL', 'DOSAGE'], modelExpected: true },
  { id: 'PL-COM-B901', focus: ['COMPRITAL', 'DOSAGE'], modelExpected: true },
  { id: 'PL-COM-B908', focus: ['COMPRITAL', 'DOSAGE'], modelExpected: true },
  { id: 'PL-COM-P1312', focus: ['CONFECTIONERY_BAR', 'COMPRITAL', 'DOSAGE'], modelExpected: true },
  { id: 'PL-COM-B054A', focus: ['COMPRITAL', 'DOSAGE'], modelExpected: true },
  { id: 'PL-COM-B824', focus: ['COMPRITAL', 'DOSAGE'], modelExpected: true },
  { id: 'PL-COM-P322A', focus: ['COMPRITAL', 'DOSAGE'], modelExpected: true },
  { id: 'PL-COM-P006B', focus: ['COMPRITAL', 'DOSAGE'], modelExpected: true },
  { id: 'PL-COM-PF273', focus: ['FRUIT', 'COMPRITAL', 'DOSAGE'], modelExpected: true },
  { id: 'PL-COM-PC320', focus: ['FRUIT', 'COMPRITAL', 'DOSAGE'], modelExpected: true },
  { id: 'PL-COM-PC325', focus: ['FRUIT', 'COMPRITAL', 'DOSAGE'], modelExpected: true },
  { id: 'PL-COM-PC753', focus: ['CHOCOLATE', 'COMPRITAL', 'DOSAGE'], modelExpected: true },
  { id: 'PL-COM-PC795', focus: ['CHOCOLATE', 'COMPRITAL', 'DOSAGE'], modelExpected: true },
  { id: 'PL-COM-PC747', focus: ['CHOCOLATE', 'COMPRITAL', 'DOSAGE'], modelExpected: true },
  { id: 'PL-COM-P1308', focus: ['COMPRITAL', 'DOSAGE'], modelExpected: true },
  { id: 'PL-COM-B852', focus: ['COMPRITAL', 'DOSAGE'], modelExpected: true },
  { id: 'PL-COM-P1235', focus: ['TEA_COFFEE', 'COMPRITAL', 'DOSAGE'], modelExpected: true },
  { id: 'PL-COM-B848', focus: ['COMPRITAL', 'DOSAGE'], modelExpected: true },
  { id: 'PL-COM-P1103', focus: ['COMPRITAL', 'DOSAGE'], modelExpected: true },
  // Deterministic controls remain in the same product-by-product report. They
  // prove hard evidence wins and that ordinary routing does not spend a call.
  { id: 'PL-BIE-00222', focus: ['CONFECTIONERY_BAR'], modelExpected: false },
  { id: 'PL-BIE-00228', focus: ['CONFECTIONERY_BAR', 'CHOCOLATE'], modelExpected: false },
  { id: 'PL-BIE-00377', focus: ['TEA_COFFEE'], modelExpected: false },
  { id: 'PL-BIE-00396', focus: ['TEA_COFFEE'], modelExpected: false },
  { id: 'PL-BIE-00395', focus: ['TEA_COFFEE'], modelExpected: false },
  { id: 'PL-COM-PF032', focus: ['COMPRITAL', 'DOSAGE'], modelExpected: false },
  { id: 'PL-COM-PC791', focus: ['FRUIT', 'COMPRITAL', 'DOSAGE'], modelExpected: false },
] as const;

type CsvRecord = Record<string, string>;

const parseCsv = (text: string): string[][] => {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else field += character;
  }
  if (row.length > 0 || field !== '') {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
};

const csvRecords = (path: string): CsvRecord[] => {
  const [header = [], ...rows] = parseCsv(readFileSync(path, 'utf8'));
  return rows
    .filter((row) => row.some((entry) => entry !== ''))
    .map((row) => Object.fromEntries(header.map((column, index) => [column, row[index] ?? ''])));
};

const csvCell = (value: unknown): string => {
  const text =
    value === null || value === undefined
      ? ''
      : typeof value === 'string'
        ? value
        : JSON.stringify(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const writeCsv = (name: string, rows: readonly Record<string, unknown>[]): string => {
  const path = join(OUTPUT_DIR, name);
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const body = [
    headers.map(csvCell).join(','),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
  ].join('\n');
  writeFileSync(path, `\uFEFF${body}\n`);
  return path;
};

const countBy = (values: readonly string[]): Record<string, number> =>
  values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});

const summarizeRejections = (
  rejected: readonly { ingredientId: string; reasonCodes: string[] }[],
): Record<string, number> => countBy(rejected.flatMap((entry) => entry.reasonCodes));

const evidenceSummary = (row: IntimportProductIntelligence): string =>
  [
    row.recognitionEvidence.name,
    row.recognitionEvidence.category,
    row.recognitionEvidence.subcategory,
    row.recognitionEvidence.description,
    row.recognitionEvidence.dosage,
  ]
    .filter(Boolean)
    .join(' | ');

interface Telemetry {
  phase: 'INITIAL' | 'CACHE_REPEAT';
  rowIndex: number;
  calls: number;
  cacheHit: boolean;
  model: string | null;
  evidenceReceipt: string | null;
  error: string | null;
  classification: ProductSemanticClassification;
  httpStatus: number;
}

const finalStatus = (row: IntimportProductIntelligence): string => row.recognitionTrace.finalStatus;

const transitionFor = (row: IntimportProductIntelligence): string => {
  if (finalStatus(row) === 'ENGINE_READY') return 'BECAME_READY';
  if (classifyIntimportFinalResult(row) === 'TOPPING_ONLY') return 'BECAME_TOPPING_ONLY';
  if (finalStatus(row) === 'BLOCKED' && row.recognition.isTechnicalProduct) {
    return 'REMAINS_TECHNICAL_BLOCKED';
  }
  const reasons = row.recognitionTrace.finalReasonCodes.join(' ').toLowerCase();
  if (reasons.includes('contradict') || reasons.includes('conflict')) {
    return 'REMAINS_REVIEW_SOURCE_CONTRADICTION';
  }
  if (
    row.recognition.dosage.semantics === 'UNKNOWN' ||
    row.recognition.modelReasonCodes.includes('DOSAGE_SEMANTICS_UNKNOWN')
  ) {
    return 'REMAINS_REVIEW_DOSAGE_UNCERTAINTY';
  }
  if (row.recognition.modelRequired) return 'REMAINS_REVIEW_SEMANTIC_UNCERTAINTY';
  return 'REMAINS_REVIEW_INSUFFICIENT_SOURCE_PHYSICS';
};

describe.runIf(LIVE)('Recognition V2 final real staging proof', () => {
  it('uses real OpenAI, server validation and cache, then recalculates 820 read-only', async () => {
    const polandBefore = createHash('sha256').update(readFileSync(POLAND_FILE)).digest('hex');
    const mapperBefore = createHash('sha256').update(readFileSync(MAPPER_FILE)).digest('hex');
    const parsed = parseINTIMPORT(readFileSync(POLAND_FILE, 'utf8'));
    const priorRows = csvRecords(PRIOR_V2_TRACE);
    const { rows: mapperRows, fingerprint } = loadMapperKnowledgeRows();
    const mapper = buildMapperKnowledge(mapperRows, fingerprint);
    const initial = runIntimportLocalIntelligence(parsed.candidates, {}, mapper);
    const byId = new Map(initial.rows.map((row) => [row.sourceProductId, row]));
    const selected = PROOF_CASES.map((entry) => {
      const row = byId.get(entry.id);
      expect(row, `missing proof source ${entry.id}`).toBeDefined();
      expect(row!.recognition.modelRequired, `${entry.id} modelRequired`).toBe(entry.modelExpected);
      return row!;
    });

    expect(initial.rows).toHaveLength(820);
    expect(mapperRows).toHaveLength(2088);
    expect(priorRows).toHaveLength(820);
    expect(countBy(priorRows.map((row) => row.final_status ?? ''))).toMatchObject({
      ENGINE_READY: 140,
      REVIEW: 612,
      BLOCKED: 65,
      IDENTITY_CONFLICT: 3,
    });
    expect(PROOF_CASES.filter((entry) => entry.modelExpected).length).toBeGreaterThanOrEqual(24);
    for (const focus of [
      'CONFECTIONERY_BAR',
      'TEA_COFFEE',
      'CHOCOLATE',
      'FRUIT',
      'COMPRITAL',
      'DOSAGE',
    ] satisfies ProofFocus[]) {
      expect(PROOF_CASES.some((entry) => entry.focus.includes(focus))).toBe(true);
    }

    const telemetry: Telemetry[] = [];
    const requestSemantic = async (
      request: SemanticClassificationRequest,
      phase: Telemetry['phase'],
    ): Promise<SemanticClassificationResponse> => {
      const deterministic = classifyProductSemantics(request.evidence);
      const response = await fetch(EDGE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          apikey: ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'semantic_classification',
          importId: IMPORT_ID,
          evidence: request.evidence,
        }),
      });
      const raw: unknown = await response.json();
      const payload =
        raw && typeof raw === 'object' && !Array.isArray(raw)
          ? (raw as Record<string, unknown>)
          : {};
      const candidate = payload.classification as ProductSemanticClassification | undefined;
      const classification =
        candidate?.authority === 'PRODUCT_RECOGNITION_V2' &&
        candidate.evidenceFingerprint === deterministic.evidenceFingerprint
          ? candidate
          : deterministic;
      const result: SemanticClassificationResponse = {
        classification,
        calls: typeof payload.calls === 'number' ? payload.calls : 0,
        cacheHit: payload.cacheHit === true,
        evidenceReceipt:
          typeof payload.evidenceReceipt === 'string' ? payload.evidenceReceipt : null,
        model: typeof payload.model === 'string' ? payload.model : null,
        capReached: response.status === 429 || payload.capReached === true,
        error: typeof payload.error === 'string' ? payload.error : null,
      };
      telemetry.push({
        phase,
        rowIndex: request.rowIndex,
        calls: result.calls,
        cacheHit: result.cacheHit,
        model: result.model,
        evidenceReceipt: result.evidenceReceipt,
        error: result.error ?? null,
        classification,
        httpStatus: response.status,
      });
      return result;
    };

    const semantic = await runIntimportSemanticClassification(
      selected,
      (request) => requestSemantic(request, 'INITIAL'),
      4,
    );
    const initialTelemetry = telemetry.filter((entry) => entry.phase === 'INITIAL');
    const acceptedInitial = initialTelemetry.filter(
      (entry) => entry.classification.classificationSource === 'SERVER_MODEL',
    );
    expect(initialTelemetry).toHaveLength(
      PROOF_CASES.filter((entry) => entry.modelExpected).length,
    );
    expect(semantic.summary.modelCalls).toBeGreaterThan(0);
    expect(semantic.summary.capReached).toBe(false);
    expect(initialTelemetry.reduce((sum, entry) => sum + entry.calls, 0)).toBeGreaterThan(0);
    expect(acceptedInitial.length).toBeGreaterThan(0);

    const acceptedByRow = new Map(acceptedInitial.map((entry) => [entry.rowIndex, entry]));
    const repeatRows = selected.filter((row) => acceptedByRow.has(row.rowIndex)).slice(0, 3);
    expect(repeatRows).toHaveLength(3);
    for (const row of repeatRows) {
      const before = acceptedByRow.get(row.rowIndex)!;
      const repeated = await requestSemantic(
        { rowIndex: row.rowIndex, evidence: row.recognitionEvidence },
        'CACHE_REPEAT',
      );
      expect(repeated.cacheHit).toBe(true);
      expect(repeated.calls).toBe(0);
      expect(repeated.evidenceReceipt).toBe(before.evidenceReceipt);
      expect(repeated.classification).toEqual(before.classification);
    }

    const recalculated = runIntimportLocalIntelligence(
      parsed.candidates,
      {},
      mapper,
      semantic.classifications,
    );
    const recalculatedById = new Map(recalculated.rows.map((row) => [row.sourceProductId, row]));
    expect(recalculated.rows).toHaveLength(820);
    for (const row of recalculated.rows) {
      expect(row.productBehaviorAuthority.dosageInterpretation).toEqual(row.recognition.dosage);
    }

    const telemetryByRow = new Map(
      initialTelemetry.map((entry) => [entry.rowIndex, entry] as const),
    );
    const proofRows = PROOF_CASES.map((proofCase) => {
      const before = byId.get(proofCase.id)!;
      const after = recalculatedById.get(proofCase.id)!;
      const call = telemetryByRow.get(before.rowIndex);
      const serverAccepted = after.recognition.classificationSource === 'SERVER_MODEL';
      return {
        source_product_id: after.sourceProductId,
        product_name: after.displayName,
        brand: after.recognitionEvidence.brand,
        proof_focus: proofCase.focus,
        deterministic_state_before_ai: {
          archetype: before.recognition.productArchetype,
          family: before.recognition.ingredientFamily,
          form: before.recognition.physicalForm,
          role: before.recognition.intendedUsageRole,
        },
        why_ai_was_needed: before.recognition.modelReasonCodes,
        evidence_summary: evidenceSummary(after),
        openai_called: (call?.calls ?? 0) > 0,
        openai_model: call?.model ?? null,
        openai_classification: call?.classification ?? null,
        product_archetype: after.recognition.productArchetype,
        family: after.recognition.ingredientFamily,
        form: after.recognition.physicalForm,
        role: after.recognition.intendedUsageRole,
        is_professional_product: after.recognition.isProfessionalProduct,
        technical: after.recognition.isTechnicalProduct,
        dosage_dependent: after.recognition.isDosageDependent,
        manufacturer_category: after.recognition.manufacturerCategory,
        manufacturer_subcategory: after.recognition.manufacturerSubcategory,
        dosage_semantics: after.recognition.dosage.semantics,
        dosage_value: after.recognition.dosage.value,
        dosage_unit: after.recognition.dosage.unit,
        dosage_raw: after.recognition.dosage.evidence,
        dosage_normalized_percent: after.recognition.dosage.normalizedMassPercent,
        dosage_normalization_basis: after.recognition.dosage.normalizationBasis,
        compatible_mapper_categories: after.recognition.compatibleMapperCategories,
        forbidden_mapper_categories: after.recognition.forbiddenMapperCategories,
        mapper_candidates_before_semantic_filter:
          after.recognitionTrace.mapperCandidatesBeforeFilter.length,
        mapper_candidates_after_semantic_filter:
          after.recognitionTrace.mapperCandidatesAfterFilter.length,
        rejected_candidate_reason_summary: summarizeRejections(
          after.recognitionTrace.rejectedMapperCandidates,
        ),
        selected_mapper_donor: after.recognitionTrace.selectedMapperDonor,
        mapper_similarity: after.recognitionTrace.mapperSimilarity,
        base_eligible_candidate: after.productBehaviorAuthority.baseRecipeEligible,
        topping_eligible_candidate: after.productBehaviorAuthority.toppingEligible,
        final_product_behavior: after.productBehaviorAuthority.classificationOutcome,
        final_status: finalStatus(after),
        classification_confidence: after.recognition.confidence,
        reason_codes: after.recognition.reasonCodes,
        evidence_refs: after.recognition.evidenceRefs,
        server_validation_result: !proofCase.modelExpected
          ? 'NOT_CALLED_DETERMINISTIC_CONTROL'
          : serverAccepted
            ? 'ACCEPTED_STRUCTURED_OUTPUT'
            : `REJECTED_OR_UNRESOLVED:${call?.error ?? 'NO_SERVER_MODEL_RESULT'}`,
        cache_written:
          serverAccepted &&
          typeof call?.evidenceReceipt === 'string' &&
          call.evidenceReceipt !== '',
      };
    });

    const categoryFirstProof = proofRows.filter(
      (row) =>
        row.openai_called === true &&
        row.mapper_candidates_before_semantic_filter > row.mapper_candidates_after_semantic_filter,
    );
    expect(categoryFirstProof.length).toBeGreaterThanOrEqual(10);

    const ownerRows = PROOF_CASES.map((proofCase) => {
      const row = recalculatedById.get(proofCase.id)!;
      const call = telemetryByRow.get(row.rowIndex);
      const unresolved = row.recognition.modelRequired;
      const hardConflict =
        call?.error !== null && call?.error !== undefined
          ? call.error
          : row.recognitionTrace.selectedMapperDonor &&
              (row.recognitionTrace.mapperSimilarity ?? 0) < 0.85
            ? 'DONOR_BELOW_0_85'
            : null;
      return {
        Produkt: row.displayName,
        'Co system rozpoznał': `${row.recognition.productArchetype} / ${row.recognition.ingredientFamily} / ${row.recognition.physicalForm}`,
        Dlaczego: row.recognition.reasonCodes,
        Rola: row.recognition.intendedUsageRole,
        Dawkowanie: {
          raw: row.recognition.dosage.evidence,
          procent_Gellatti: row.recognition.dosage.normalizedMassPercent,
          podstawa: row.recognition.dosage.normalizationBasis,
        },
        'Mapper donor': row.recognitionTrace.selectedMapperDonor,
        'Czy wynik wygląda bezpiecznie': hardConflict
          ? `TWARDY KONFLIKT: ${hardConflict}`
          : unresolved
            ? 'WYMAGA REVIEW — semantyka nadal nierozstrzygnięta'
            : 'BRAK TWARDYCH SPRZECZNOŚCI — wymaga oceny ownera',
      };
    });

    const priorReview = priorRows.filter((row) => row.final_status === 'REVIEW');
    const transitionRows = priorReview.map((prior) => {
      const current = recalculatedById.get(prior.source_product_id ?? '');
      expect(current, `missing previous REVIEW ${prior.source_product_id}`).toBeDefined();
      return {
        source_product_id: prior.source_product_id,
        product_name: current!.displayName,
        old_status: prior.final_status,
        new_status: finalStatus(current!),
        transition: transitionFor(current!),
        role: current!.recognition.intendedUsageRole,
        dosage_semantics: current!.recognition.dosage.semantics,
        model_required: current!.recognition.modelRequired,
        reason_codes: current!.recognitionTrace.finalReasonCodes,
      };
    });
    expect(transitionRows).toHaveLength(612);

    const finalTraceRows = recalculated.rows.map((row) => ({
      source_row: row.rowIndex,
      source_product_id: row.sourceProductId,
      product_name: row.displayName,
      final_status: finalStatus(row),
      classification_source: row.recognition.classificationSource,
      product_archetype: row.recognition.productArchetype,
      ingredient_family: row.recognition.ingredientFamily,
      physical_form: row.recognition.physicalForm,
      role: row.recognition.intendedUsageRole,
      technical: row.recognition.isTechnicalProduct,
      dosage_semantics: row.recognition.dosage.semantics,
      dosage_raw: row.recognition.dosage.evidence,
      dosage_value: row.recognition.dosage.value,
      dosage_value_max: row.recognition.dosage.valueMax,
      dosage_unit: row.recognition.dosage.unit,
      dosage_normalized_percent: row.recognition.dosage.normalizedMassPercent,
      dosage_normalized_percent_max: row.recognition.dosage.normalizedMassPercentMax,
      dosage_normalization_basis: row.recognition.dosage.normalizationBasis,
      mapper_candidates_before_filter: row.recognitionTrace.mapperCandidatesBeforeFilter,
      mapper_candidates_after_filter: row.recognitionTrace.mapperCandidatesAfterFilter,
      rejected_mapper_candidates: row.recognitionTrace.rejectedMapperCandidates,
      selected_mapper_donor: row.recognitionTrace.selectedMapperDonor,
      mapper_similarity: row.recognitionTrace.mapperSimilarity,
      final_product_behavior: row.productBehaviorAuthority.classificationOutcome,
      final_reason_codes: row.recognitionTrace.finalReasonCodes,
    }));

    const dosage = {
      gPerLFound: recalculated.rows.filter((row) => row.recognition.dosage.unit === 'G_PER_L')
        .length,
      gPerLSuccessfullyNormalized: recalculated.rows.filter(
        (row) =>
          row.recognition.dosage.unit === 'G_PER_L' &&
          row.recognition.dosage.normalizedMassPercent !== null &&
          row.recognition.dosage.normalizationBasis === 'GELLATTI_BASE_1000G',
      ).length,
      asDesired: recalculated.rows.filter(
        (row) => row.recognition.dosage.semantics === 'AS_DESIRED',
      ).length,
      otherNumericUnits: recalculated.rows.filter((row) =>
        ['G_PER_KG', 'G_PER_10_KG', 'PERCENT'].includes(row.recognition.dosage.unit),
      ).length,
      unresolvedMlPerL: recalculated.rows.filter(
        (row) => row.recognition.dosage.unit === 'ML_PER_L',
      ).length,
      unknownOrNotStated: recalculated.rows.filter(
        (row) => row.recognition.dosage.unit === 'UNKNOWN',
      ).length,
      sourceBasisUnknownButNormalized: recalculated.rows.filter(
        (row) =>
          row.recognition.dosage.unit === 'G_PER_L' &&
          row.recognition.dosage.basis === 'UNKNOWN' &&
          row.recognition.dosage.normalizedMassPercent !== null,
      ).length,
    };
    expect(dosage.gPerLFound).toBe(dosage.gPerLSuccessfullyNormalized);
    expect(
      recalculated.rows.find((row) => row.sourceProductId === 'PL-COM-PF032')?.recognition.dosage,
    ).toMatchObject({ normalizedMassPercent: 0.3, normalizationBasis: 'GELLATTI_BASE_1000G' });
    expect(
      recalculated.rows.find((row) => row.sourceProductId === 'PL-COM-P1312')?.recognition.dosage,
    ).toMatchObject({ normalizedMassPercent: 45, normalizationBasis: 'GELLATTI_BASE_1000G' });
    expect(
      recalculated.rows.find((row) => row.sourceProductId === 'PL-COM-B901')?.recognition.dosage,
    ).toMatchObject({ normalizedMassPercent: 10, normalizationBasis: 'GELLATTI_BASE_1000G' });
    expect(
      recalculated.rows.find((row) => row.sourceProductId === 'PL-COM-PC791')?.recognition.dosage,
    ).toMatchObject({ semantics: 'AS_DESIRED', normalizedMassPercent: null });

    const baitz = recalculatedById.get('PL-BIE-00222')!;
    const base50 = recalculatedById.get('PL-COM-B054A')!;
    const baitzRejected = baitz.recognitionTrace.rejectedMapperCandidates.some(
      (entry) => entry.ingredientId === 'PI-ING-000091',
    );
    const base50Rejected = base50.recognitionTrace.rejectedMapperCandidates.some(
      (entry) => entry.ingredientId === 'PI-ING-000048',
    );
    expect(baitzRejected).toBe(true);
    expect(baitz.recognitionTrace.selectedMapperDonor).not.toBe('PI-ING-000091');
    expect(base50Rejected).toBe(true);
    expect(base50.recognitionTrace.selectedMapperDonor).not.toBe('PI-ING-000048');

    const suspiciousReady = recalculated.rows.filter(
      (row) =>
        finalStatus(row) === 'ENGINE_READY' &&
        ((row.recognitionTrace.selectedMapperDonor !== null &&
          (row.recognitionTrace.mapperSimilarity ?? 0) < 0.85) ||
          row.recognition.modelRequired),
    );
    expect(suspiciousReady).toHaveLength(0);

    const initialCalls = initialTelemetry.reduce((sum, entry) => sum + entry.calls, 0);
    const repeatTelemetry = telemetry.filter((entry) => entry.phase === 'CACHE_REPEAT');
    const finalCounts = countBy(recalculated.rows.map(finalStatus));
    const transitionCounts = countBy(transitionRows.map((row) => row.transition));
    const metrics = {
      selectedProofProducts: selected.length,
      realOpenAiModelCalls: initialCalls,
      successfulStructuredResponses: acceptedInitial.length,
      serverAccepted: acceptedInitial.length,
      serverRejected: initialTelemetry.filter((entry) => entry.error === 'semantic_output_rejected')
        .length,
      otherProviderFailures: initialTelemetry.filter(
        (entry) => entry.error && entry.error !== 'semantic_output_rejected',
      ).length,
      unknownOrReviewResults: selected.filter((row) => {
        const classification = semantic.classifications.get(row.rowIndex) ?? row.recognition;
        return (
          classification.modelRequired || classification.intendedUsageRole === 'NEITHER_REVIEW'
        );
      }).length,
      cacheWrites: acceptedInitial.filter((entry) => entry.evidenceReceipt !== null).length,
      repeatedEvidenceCacheHits: repeatTelemetry.filter(
        (entry) => entry.cacheHit && entry.calls === 0,
      ).length,
    };
    expect(metrics.realOpenAiModelCalls).toBeGreaterThan(0);
    expect(metrics.repeatedEvidenceCacheHits).toBe(3);

    // Read the user's own RLS-visible ledger before the temporary proof user is
    // removed. This proves persistence, not only a successful HTTP response.
    const ledgerUrl = new URL('/rest/v1/intimport_semantic_classification_usage', EDGE_URL);
    ledgerUrl.searchParams.set('import_id', `eq.${IMPORT_ID}`);
    ledgerUrl.searchParams.set(
      'select',
      'id,import_id,idempotency_key,classifier_version,model,evidence_fingerprint,input_tokens,output_tokens,latency_ms,result_json,created_at',
    );
    const ledgerResponse = await fetch(ledgerUrl, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, apikey: ANON_KEY },
    });
    expect(ledgerResponse.ok).toBe(true);
    const ledgerRows = (await ledgerResponse.json()) as Array<{
      result_json?: { status?: string };
    }>;
    const expectedPersistedAttempts = initialTelemetry.filter(
      (entry) => entry.calls > 0 || entry.evidenceReceipt !== null,
    ).length;
    expect(ledgerRows).toHaveLength(expectedPersistedAttempts);
    const ledgerMetrics = {
      persistedRows: ledgerRows.length,
      classifiedRows: ledgerRows.filter((row) => row.result_json?.status === 'CLASSIFIED').length,
      errorRows: ledgerRows.filter((row) => row.result_json?.status === 'ERROR').length,
    };

    mkdirSync(OUTPUT_DIR, { recursive: true });
    const artifacts = {
      proof: writeCsv('OPENAI_SEMANTIC_CLASSIFIER_PROOF.csv', proofRows),
      ownerReview: writeCsv('OPENAI_CLASSIFIER_OWNER_REVIEW.csv', ownerRows),
      final820: writeCsv('POLAND_820_RECOGNITION_V2_FINAL_TRACE.csv', finalTraceRows),
      previous612: writeCsv('POLAND_612_REVIEW_TRANSITIONS.csv', transitionRows),
      categoryFirst: writeCsv('OPENAI_CATEGORY_FIRST_MAPPER_PROOF.csv', categoryFirstProof),
      semanticLedger: join(OUTPUT_DIR, 'OPENAI_SEMANTIC_LEDGER_PROOF.json'),
    };
    writeFileSync(artifacts.semanticLedger, `${JSON.stringify(ledgerRows, null, 2)}\n`);
    const summary = {
      generatedAt: new Date().toISOString(),
      execution: {
        environment: 'STAGING',
        mode: 'REAL_OPENAI_READ_ONLY_PROOF',
        polandImportStarted: false,
        mapperMutated: false,
        productionTouched: false,
        importId: IMPORT_ID,
      },
      fingerprints: {
        polandCsvSha256: polandBefore,
        mapperCsvSha256: mapperBefore,
        mapperKnowledgeFingerprint: fingerprint,
      },
      metrics,
      ledger: ledgerMetrics,
      before: { ENGINE_READY: 140, REVIEW: 612, BLOCKED: 65, IDENTITY_CONFLICT: 3 },
      after: finalCounts,
      toppingOnly: recalculated.rows.filter(
        (row) => row.recognition.intendedUsageRole === 'TOPPING_ONLY',
      ).length,
      previous612Transitions: transitionCounts,
      dosage,
      donorSafety: {
        baitzOldDonorRejected: baitzRejected,
        base50AlcoholicDonorRejected: base50Rejected,
        suspiciousReadyDonors: suspiciousReady.length,
      },
      categoryFirstProofRows: categoryFirstProof.length,
      carbonation: countBy(recalculated.rows.map((row) => row.carbonation.status)),
      artifacts,
    };
    writeFileSync(
      join(OUTPUT_DIR, 'RECOGNITION_V2_FINAL_PROOF_SUMMARY.json'),
      `${JSON.stringify(summary, null, 2)}\n`,
    );

    expect(createHash('sha256').update(readFileSync(POLAND_FILE)).digest('hex')).toBe(polandBefore);
    expect(createHash('sha256').update(readFileSync(MAPPER_FILE)).digest('hex')).toBe(mapperBefore);
    console.log(`RECOGNITION_V2_FINAL_PROOF ${JSON.stringify(summary)}`);
  }, 300_000);
});
