import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseINTIMPORT, type IntimportCandidate } from '@/data/products/intimport';
import type { SourceAuthorityClass } from '../sourceAuthority';
import type { EvidenceSource, ProductEvidenceField } from '../productEvidenceConfidence';
import {
  classifyIntimportFinalResult,
  runIntimportLocalIntelligence,
  type IntimportProductIntelligence,
} from '../intimportIntelligence';
import {
  reassessIntimportAfterEnrichment,
  runIntimportEnrichment,
  type EnrichmentFact,
  type EnrichmentProvider,
  type EnrichmentRequest,
  type EnrichedProduct,
} from '../intimportEnrichment';
import {
  runIntimportSemanticClassification,
  type SemanticClassificationProvider,
  type SemanticClassificationRequest,
  type SemanticClassificationResponse,
} from '../intimportSemanticClassification';
import {
  classifyProductSemantics,
  isProductSemanticResolvedForMapper,
  type ProductSemanticClassification,
  type ProductSemanticValidationError,
} from '../productRecognition';
import { buildMapperKnowledge } from '../mapperValueInference';
import { loadMapperKnowledgeRows, MAPPER_FILE } from '../__dryrun__/mapperFixture';

const POLAND_FILE = join(homedir(), 'Desktop', 'PL_Poland.csv');
const SCOPE = process.env.INTIMPORT_CLOSEOUT_SCOPE === '820' ? '820' : '100';
const LIMIT = SCOPE === '820' ? 820 : 100;
const OUTPUT_DIR =
  process.env.INTIMPORT_CLOSEOUT_OUTPUT_DIR ??
  join(homedir(), '.codex', 'outputs', 'intimport_final_closeout_20260826', SCOPE);
const EDGE_URL = (process.env.INTIMPORT_CLOSEOUT_EDGE_URL ?? '').replace(/\/$/, '');
const ACCESS_TOKEN = process.env.INTIMPORT_CLOSEOUT_ACCESS_TOKEN ?? '';
const ANON_KEY = process.env.INTIMPORT_CLOSEOUT_ANON_KEY ?? '';
const IMPORT_ID =
  process.env.INTIMPORT_CLOSEOUT_IMPORT_ID ?? `intimport-closeout-${SCOPE}-20260826`;
const LIVE =
  process.env.INTIMPORT_CLOSEOUT_LIVE === 'true' &&
  EDGE_URL !== '' &&
  ACCESS_TOKEN !== '' &&
  ANON_KEY !== '' &&
  existsSync(POLAND_FILE) &&
  existsSync(MAPPER_FILE);

interface RawServerFact {
  field: string;
  value: string;
  sourceUrl: string;
  sourceDomain: string | null;
  sourceTitle: string | null;
  sourceAuthorityClass: SourceAuthorityClass;
  evidenceSource: EvidenceSource;
  retrievedAt: string;
  exactProductIdentityProof?: { accepted?: boolean; reasonCodes?: string[] };
  observedProductIdentity?: Record<string, unknown>;
}

interface WebAttempt {
  rowIndex: number;
  sourceProductId: string | null;
  researchStepIndex: number;
  researchStep: IntimportProductIntelligence['researchPlan']['steps'][number] | null;
  requestedFields: readonly ProductEvidenceField[];
  httpStatus: number;
  cacheHit: boolean;
  calls: number;
  webCalls: number;
  inputTokens: number;
  outputTokens: number;
  model: string | null;
  sources: { url: string; title: string }[];
  facts: RawServerFact[];
  notFound: string[];
  researchOutcome: string | null;
  crossSkuRejections: { sourceUrl: string; reasonCodes: string[] }[];
  evidenceReceipt: string | null;
  error: string | null;
}

interface SemanticAttempt {
  rowIndex: number;
  httpStatus: number;
  calls: number;
  cacheHit: boolean;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  evidenceReceipt: string | null;
  error: string | null;
  validationErrors: ProductSemanticValidationError[];
  repairAttempted: boolean;
  repairAccepted: boolean;
  classification: ProductSemanticClassification;
}

const objectValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const edge = async (body: Record<string, unknown>): Promise<{
  status: number;
  payload: Record<string, unknown>;
}> => {
  const response = await fetch(`${EDGE_URL}/functions/v1/intimport-enrich`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      apikey: ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  let payload: Record<string, unknown> = {};
  try {
    payload = objectValue(await response.json());
  } catch {
    payload = { error: 'invalid_edge_json' };
  }
  return { status: response.status, payload };
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
  writeFileSync(path, `\uFEFF${body}\n`, 'utf8');
  return path;
};

const countBy = (values: readonly string[]): Record<string, number> =>
  values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});

const attemptsFor = <T extends { rowIndex: number }>(
  attempts: readonly T[],
  rowIndex: number,
): T[] => attempts.filter((attempt) => attempt.rowIndex === rowIndex);

const workingProfileComplete = (row: IntimportProductIntelligence): boolean =>
  row.workingValues !== null && row.workingValues.missingEngineFields.length === 0;

const firstUnresolved = (
  final: IntimportProductIntelligence,
  enriched: EnrichedProduct,
  semanticAttempt: SemanticAttempt | null,
): { step: number | null; reason: string | null } => {
  if (classifyIntimportFinalResult(final) === 'CONFLICT') {
    return { step: 2, reason: final.evidence.materialConflicts.join(' | ') || 'identity conflict' };
  }
  if (enriched.researchOutcome === 'SOURCE_CONFLICT') {
    return { step: 6, reason: 'SOURCE_CONFLICT' };
  }
  if (final.recognition.modelRequired) {
    return {
      step: 8,
      reason:
        semanticAttempt?.error ??
        final.recognition.modelReasonCodes.join(' | ') ??
        'product semantics unresolved',
    };
  }
  if (final.productBehaviorAuthority.classificationOutcome !== 'classified') {
    return {
      step: 9,
      reason: final.productBehaviorAuthority.classificationReasonCodes.join(' | '),
    };
  }
  const baseRole = ['BASE_ONLY', 'BASE_AND_TOPPING'].includes(final.recognition.intendedUsageRole);
  if (baseRole && !final.recognitionTrace.selectedMapperDonor && !workingProfileComplete(final)) {
    return {
      step: 10,
      reason:
        final.recognitionTrace.rejectedMapperCandidates
          .flatMap((candidate) => candidate.reasonCodes)
          .join(' | ') || 'no compatible Mapper donor',
    };
  }
  if ((final.workingValues?.missingEngineFields.length ?? 0) > 0) {
    return { step: 11, reason: final.workingValues!.missingEngineFields.join(' | ') };
  }
  if (final.workingValues?.sweetnessPath.resolved === false) {
    return { step: 14, reason: final.workingValues.sweetnessPath.reason };
  }
  if (final.productionAccuracy.criticalBlockers.length > 0) {
    return { step: 15, reason: final.productionAccuracy.criticalBlockers.join(' | ') };
  }
  if (final.productionAccuracy.productAccuracy < 85) {
    return { step: 13, reason: `Product Accuracy ${final.productionAccuracy.productAccuracy} < 85` };
  }
  return { step: null, reason: null };
};

describe.runIf(LIVE)(`INTIMPORT final closeout — live staging ${SCOPE}`, () => {
  it('runs enrichment → semantic → ProductBehavior → Mapper → Product Accuracy with a complete trace', async () => {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const polandRaw = readFileSync(POLAND_FILE);
    const mapperRaw = readFileSync(MAPPER_FILE);
    const polandSha256 = createHash('sha256').update(polandRaw).digest('hex');
    const mapperSha256 = createHash('sha256').update(mapperRaw).digest('hex');
    const parsed = parseINTIMPORT(polandRaw.toString('utf8'));
    const candidates = parsed.candidates.slice(0, LIMIT);
    expect(candidates, 'the requested source scope must exist exactly').toHaveLength(LIMIT);
    const { rows: mapperRows, fingerprint } = loadMapperKnowledgeRows();
    const mapper = buildMapperKnowledge(mapperRows, fingerprint);
    const initial = runIntimportLocalIntelligence(candidates, {}, mapper);
    expect(initial.rows).toHaveLength(LIMIT);

    const initialByRow = new Map(initial.rows.map((row) => [row.rowIndex, row] as const));
    const webAttempts: WebAttempt[] = [];
    const webProvider: EnrichmentProvider = async (request: EnrichmentRequest) => {
      const row = initialByRow.get(request.rowIndex)!;
      const researchStep = row.researchPlan.steps[request.researchStepIndex] ?? null;
      const { status, payload } = await edge({
        importId: IMPORT_ID,
        product: row.researchIdentity,
        researchStep,
        fields: request.fields,
      });
      const rawFacts = (Array.isArray(payload.facts) ? payload.facts : [])
        .map((fact) => objectValue(fact) as unknown as RawServerFact);
      const sources = (Array.isArray(payload.sources) ? payload.sources : []).map((source) => {
        const value = objectValue(source);
        return { url: String(value.url ?? ''), title: String(value.title ?? '') };
      });
      const crossSkuRejections = (Array.isArray(payload.crossSkuRejections)
        ? payload.crossSkuRejections
        : []).map((rejection) => {
          const value = objectValue(rejection);
          return {
            sourceUrl: String(value.sourceUrl ?? ''),
            reasonCodes: Array.isArray(value.reasonCodes) ? value.reasonCodes.map(String) : [],
          };
        });
      const cacheHit = payload.cacheHit === true;
      const attempt: WebAttempt = {
        rowIndex: request.rowIndex,
        sourceProductId: row.sourceProductId,
        researchStepIndex: request.researchStepIndex,
        researchStep,
        requestedFields: [...request.fields],
        httpStatus: status,
        cacheHit,
        calls: Number(payload.calls ?? 0),
        webCalls: Number(payload.webCalls ?? 0),
        inputTokens: Number(payload.inputTokens ?? 0),
        outputTokens: Number(payload.outputTokens ?? 0),
        model: typeof payload.model === 'string' ? payload.model : null,
        sources,
        facts: rawFacts,
        notFound: Array.isArray(payload.notFound) ? payload.notFound.map(String) : [],
        researchOutcome:
          typeof payload.researchOutcome === 'string' ? payload.researchOutcome : null,
        crossSkuRejections,
        evidenceReceipt:
          typeof payload.evidenceReceipt === 'string' ? payload.evidenceReceipt : null,
        error: typeof payload.error === 'string' ? payload.error : status >= 400 ? `HTTP_${status}` : null,
      };
      webAttempts.push(attempt);
      const facts: EnrichmentFact[] = rawFacts.map((fact) => ({
        field: fact.field as ProductEvidenceField,
        value: fact.value,
        source: fact.evidenceSource,
        sourceUrl: fact.sourceUrl,
        sourceDomain: fact.sourceDomain,
        sourceTitle: fact.sourceTitle,
        sourceAuthorityClass: fact.sourceAuthorityClass,
        retrievedAt: fact.retrievedAt,
      }));
      return {
        facts,
        calls: cacheHit ? 0 : Number(payload.calls ?? 0),
        evidenceReceipt:
          typeof payload.evidenceReceipt === 'string' ? payload.evidenceReceipt : undefined,
        capReached: status === 429 || payload.capReached === true,
        researchOutcome:
          payload.researchOutcome === 'ENRICHED' ||
          payload.researchOutcome === 'SEARCH_EXHAUSTED' ||
          payload.researchOutcome === 'SOURCE_CONFLICT'
            ? payload.researchOutcome
            : 'STEP_COMPLETE',
        crossSkuRejections,
      };
    };

    const enrichment = await runIntimportEnrichment(
      initial.rows.map((intelligence) => ({
        intelligence,
        barcode: intelligence.researchIdentity.barcode,
      })),
      webProvider,
      { maxCallsPerImport: 100_000, maxSpendUsd: 100_000, concurrency: 1 },
    );
    expect(enrichment.summary.runStatus).toBe('COMPLETED');
    expect(enrichment.summary.pending).toBe(0);
    expect(enrichment.products).toHaveLength(LIMIT);

    const semanticAttempts: SemanticAttempt[] = [];
    const semanticProvider: SemanticClassificationProvider = async (
      request: SemanticClassificationRequest,
    ): Promise<SemanticClassificationResponse> => {
      const deterministic = classifyProductSemantics(request.evidence);
      const { status, payload } = await edge({
        action: 'semantic_classification',
        importId: IMPORT_ID,
        evidence: request.evidence,
      });
      const classification =
        objectValue(payload.classification).authority === 'PRODUCT_RECOGNITION_V2'
          ? (payload.classification as unknown as ProductSemanticClassification)
          : deterministic;
      const validationErrors = (Array.isArray(payload.validationErrors)
        ? payload.validationErrors
        : []) as ProductSemanticValidationError[];
      const attempt: SemanticAttempt = {
        rowIndex: request.rowIndex,
        httpStatus: status,
        calls: Number(payload.calls ?? 0),
        cacheHit: payload.cacheHit === true,
        model: typeof payload.model === 'string' ? payload.model : null,
        inputTokens: Number(payload.inputTokens ?? 0),
        outputTokens: Number(payload.outputTokens ?? 0),
        evidenceReceipt:
          typeof payload.evidenceReceipt === 'string' ? payload.evidenceReceipt : null,
        error: typeof payload.error === 'string' ? payload.error : status >= 400 ? `HTTP_${status}` : null,
        validationErrors,
        repairAttempted: payload.repairAttempted === true,
        repairAccepted: payload.repairAccepted === true,
        classification,
      };
      semanticAttempts.push(attempt);
      return {
        classification,
        calls: attempt.calls,
        cacheHit: attempt.cacheHit,
        evidenceReceipt: attempt.evidenceReceipt,
        model: attempt.model,
        capReached: status === 429 || payload.capReached === true,
        error: attempt.error,
        validationErrors,
        repairAttempted: attempt.repairAttempted,
        repairAccepted: attempt.repairAccepted,
      };
    };

    const semantic = await runIntimportSemanticClassification(
      enrichment.products,
      semanticProvider,
      1,
    );
    expect(semantic.summary.runStatus).toBe('COMPLETED');
    expect(semantic.summary.pending).toBe(0);

    const finalPass = reassessIntimportAfterEnrichment({
      candidates,
      enrichedProducts: enrichment.products,
      mapper,
      semanticClassifications: semantic.classifications,
      semanticEvidenceReceipts: semantic.evidenceReceipts,
    });
    expect(finalPass.rows).toHaveLength(LIMIT);
    const candidateByRow = new Map(candidates.map((candidate) => [candidate.rowIndex, candidate]));
    const enrichedByRow = new Map(
      enrichment.products.map((product) => [product.rowIndex, product] as const),
    );
    const semanticAttemptByRow = new Map(
      semanticAttempts.map((attempt) => [attempt.rowIndex, attempt] as const),
    );

    const traces = finalPass.rows.map((final) => {
      const candidate = candidateByRow.get(final.rowIndex)!;
      const initialRow = initialByRow.get(final.rowIndex)!;
      const enriched = enrichedByRow.get(final.rowIndex)!;
      const semanticAttempt = semanticAttemptByRow.get(final.rowIndex) ?? null;
      const unresolved = firstUnresolved(final, enriched, semanticAttempt);
      return {
        sourceIndex: final.rowIndex,
        sourceProductId: final.sourceProductId,
        name: final.displayName,
        steps: {
          1: { sourceRow: candidate.source },
          2: { normalizedIdentity: initialRow.researchIdentity, package: candidate.package },
          3: { preliminaryRecognition: initialRow.recognition },
          4: { completeEnrichmentPlan: initialRow.researchPlan, fields: initialRow.enrichmentTargets },
          5: { actualSourceAttempts: attemptsFor(webAttempts, final.rowIndex) },
          6: {
            exactEvidenceMerged: enriched.evidence,
            appliedFacts: enriched.appliedFacts,
            researchOutcome: enriched.researchOutcome,
            crossSkuRejections: enriched.crossSkuRejections,
          },
          7: { postEnrichmentRecognition: enriched.recognition },
          8: {
            semanticModel: semanticAttempt,
            acceptedClassification: final.recognition,
            evidenceReceipt: final.semanticEvidenceReceipt,
          },
          9: {
            input: {
              kind: final.kind,
              recognition: final.recognition,
              engineUsable: final.workingValues?.engineReady ?? false,
              profileMatch: final.workingValues?.profileMatch ?? null,
              criticalPhysicsBlockers: final.workingValues?.criticalPhysicsBlockers ?? [],
            },
            output: final.productBehaviorAuthority,
          },
          10: {
            candidatesBeforeFilter: final.recognitionTrace.mapperCandidatesBeforeFilter,
            candidatesAfterFilter: final.recognitionTrace.mapperCandidatesAfterFilter,
            selectedDonor: final.recognitionTrace.selectedMapperDonor,
            similarity: final.recognitionTrace.mapperSimilarity,
            rejectedCandidates: final.recognitionTrace.rejectedMapperCandidates,
          },
          11: {
            workingProfileComplete: workingProfileComplete(final),
            values: final.workingValues?.values ?? null,
            readiness: final.workingValues?.readiness ?? null,
            engineReady: final.workingValues?.engineReady ?? false,
            missingEngineFields: final.workingValues?.missingEngineFields ?? [],
          },
          12: {
            workingFieldProvenance: final.workingValues?.fields ?? null,
            evidenceProvenance: final.evidence.fields,
            carbonation: final.carbonation,
          },
          13: { productAccuracy: final.productionAccuracy },
          14: {
            sweetnessPath: final.workingValues?.sweetnessPath ?? null,
            materiality: final.workingValues?.sweetnessPath.materiality ?? null,
          },
          15: {
            capApplied: final.productionAccuracy.criticalCapApplied,
            cap: final.productionAccuracy.criticalCap,
            blockers: final.productionAccuracy.criticalBlockers,
          },
          16: {
            baseEngineReady: final.productionAccuracy.baseEngineReady,
            toppingReady: final.productionAccuracy.roleReadiness === 'TOPPING_READY',
            roleReadiness: final.productionAccuracy.roleReadiness,
            finalStatus: classifyIntimportFinalResult(final),
          },
          17: { firstGenuineUnresolvedStep: unresolved.step, exactReason: unresolved.reason },
        },
      };
    });

    const factsWithoutProof = webAttempts.flatMap((attempt) =>
      attempt.facts.filter((fact) => fact.exactProductIdentityProof?.accepted !== true),
    );
    const donorsWithUnresolvedSemantics = finalPass.rows.filter(
      (row) =>
        row.recognitionTrace.selectedMapperDonor !== null &&
        !isProductSemanticResolvedForMapper(row.recognition),
    );
    const invalidTopping = finalPass.rows.filter(
      (row) =>
        classifyIntimportFinalResult(row) === 'TOPPING_ONLY' &&
        row.productBehaviorAuthority.toppingEligible !== true,
    );
    const familyFormHandoffLoss = finalPass.rows.filter(
      (row) =>
        row.recognition.ingredientFamily !== 'unknown' &&
        row.recognition.physicalForm !== 'UNKNOWN' &&
        row.productBehaviorAuthority.classificationReasonCodes.includes(
          'family_and_form_evidence_missing',
        ),
    );
    const provisionalToppingExemptions = finalPass.rows.filter(
      (row) =>
        row.recognition.intendedUsageRole === 'TOPPING_ONLY' &&
        row.productBehaviorAuthority.toppingEligible !== true &&
        row.workingValues?.engineReady !== true &&
        row.productionAccuracy.components.enginePhysics.earnedPoints === 25,
    );
    const genericSemanticRejections = semanticAttempts.filter(
      (attempt) =>
        attempt.error === 'semantic_output_rejected' && attempt.validationErrors.length === 0,
    );
    const invariants = {
      productsSkippedByImportWideNormalFlowCap:
        enrichment.summary.runStatus === 'COMPLETED' ? LIMIT - enrichment.products.length : LIMIT,
      creditedFactsWithoutExactProductIdentityProof: factsWithoutProof.length,
      donorsAcceptedWithUnresolvedFamilyFormRole: donorsWithUnresolvedSemantics.length,
      toppingOnlyWithToppingEligibleFalse: invalidTopping.length,
      familyAndFormLostBetweenRecognitionAndProductBehavior: familyFormHandoffLoss.length,
      provisionalToppingPhysicsExemptions: provisionalToppingExemptions.length,
      genericSemanticRejectionsWithoutFieldReason: genericSemanticRejections.length,
    };

    const statuses = finalPass.rows.map(classifyIntimportFinalResult);
    const validatorReasonCounts = countBy(
      semanticAttempts.flatMap((attempt) => attempt.validationErrors.map((error) => error.issue)),
    );
    const mapperRejectionCounts = countBy(
      finalPass.rows.flatMap((row) =>
        row.recognitionTrace.rejectedMapperCandidates.flatMap((candidate) => candidate.reasonCodes),
      ),
    );
    const aggregate = {
      scope: SCOPE,
      products: LIMIT,
      fingerprints: { polandSha256, mapperSha256, mapperKnowledgeFingerprint: fingerprint },
      importStarted: false,
      productsRequiringEnrichment: initial.rows.filter(
        (row) => row.enrichmentTargets.length > 0,
      ).length,
      productsActuallyProcessed: enrichment.summary.processed,
      productsActuallyResearched: enrichment.summary.webAttempted,
      searchExhausted: enrichment.products.filter(
        (product) => product.researchOutcome === 'SEARCH_EXHAUSTED',
      ).length,
      runPausedBudgetCount: Number(enrichment.summary.runStatus === 'PAUSED_BUDGET') +
        Number(semantic.summary.runStatus === 'PAUSED_BUDGET'),
      webCalls: webAttempts.reduce((sum, attempt) => sum + attempt.webCalls, 0),
      webCallsByProduct: Object.fromEntries(
        finalPass.rows.map((row) => [
          row.sourceProductId ?? String(row.rowIndex),
          attemptsFor(webAttempts, row.rowIndex).reduce(
            (sum, attempt) => sum + attempt.webCalls,
            0,
          ),
        ]),
      ),
      webCacheHits: webAttempts.filter((attempt) => attempt.cacheHit).length,
      openFoodFactsExactEanHits: webAttempts.filter(
        (attempt) =>
          attempt.researchStep?.kind === 'OPEN_FOOD_FACTS_EXACT_GTIN' && attempt.facts.length > 0,
      ).length,
      semanticCalls: semanticAttempts.reduce((sum, attempt) => sum + attempt.calls, 0),
      semanticCacheHits: semanticAttempts.filter((attempt) => attempt.cacheHit).length,
      semanticAcceptedOutputs: finalPass.rows.filter(
        (row) => row.recognition.classificationSource === 'SERVER_MODEL',
      ).length,
      semanticRejectedOutputs: semanticAttempts.filter(
        (attempt) => attempt.error === 'semantic_output_rejected',
      ).length,
      semanticRejectionsByExactReason: validatorReasonCounts,
      semanticRepairAttempted: semanticAttempts.filter((attempt) => attempt.repairAttempted).length,
      semanticRepairAccepted: semanticAttempts.filter((attempt) => attempt.repairAccepted).length,
      crossSkuEvidenceRejections: webAttempts.reduce(
        (sum, attempt) => sum + attempt.crossSkuRejections.length,
        0,
      ),
      mapperDonorsAccepted: finalPass.rows.filter(
        (row) => row.recognitionTrace.selectedMapperDonor !== null,
      ).length,
      mapperDonorsRejectedByReason: mapperRejectionCounts,
      workingProfileComplete: finalPass.rows.filter(workingProfileComplete).length,
      baseEngineReady: finalPass.rows.filter((row) => row.productionAccuracy.baseEngineReady).length,
      toppingReady: finalPass.rows.filter(
        (row) => row.productionAccuracy.roleReadiness === 'TOPPING_READY',
      ).length,
      finalStates: countBy(statuses),
      usage: {
        webInputTokens: webAttempts.reduce((sum, attempt) => sum + attempt.inputTokens, 0),
        webOutputTokens: webAttempts.reduce((sum, attempt) => sum + attempt.outputTokens, 0),
        semanticInputTokens: semanticAttempts.reduce((sum, attempt) => sum + attempt.inputTokens, 0),
        semanticOutputTokens: semanticAttempts.reduce((sum, attempt) => sum + attempt.outputTokens, 0),
      },
      invariants,
    };

    const csvRows = finalPass.rows.map((final) => {
      const candidate: IntimportCandidate = candidateByRow.get(final.rowIndex)!;
      const enriched = enrichedByRow.get(final.rowIndex)!;
      const attempts = attemptsFor(webAttempts, final.rowIndex);
      const semanticAttempt = semanticAttemptByRow.get(final.rowIndex) ?? null;
      const unresolved = firstUnresolved(final, enriched, semanticAttempt);
      const finalStatus = classifyIntimportFinalResult(final);
      const completedFields = Object.entries(final.workingValues?.fields ?? {})
        .filter(([, truth]) => truth.value !== null)
        .map(([field, truth]) => `${field}:${truth.provenance.state}`);
      const missingFields = [
        ...new Set([
          ...(final.workingValues?.missingEngineFields ?? []),
          ...final.enrichmentTargets,
        ]),
      ];
      const sources = [...new Set(attempts.flatMap((attempt) => attempt.sources.map((source) => source.url)))];
      const off = attempts.filter(
        (attempt) => attempt.researchStep?.kind === 'OPEN_FOOD_FACTS_EXACT_GTIN',
      );
      return {
        source_index: final.rowIndex,
        source_product_id: final.sourceProductId,
        exact_commercial_identity: final.researchIdentity,
        ean: final.researchIdentity.barcode,
        name: final.displayName,
        brand: final.researchIdentity.brand,
        variant: final.researchIdentity.variant,
        package: candidate.package,
        whole_product_subject: final.recognition.productArchetype,
        family: final.recognition.ingredientFamily,
        form: final.recognition.physicalForm,
        accepted_role: final.recognition.intendedUsageRole,
        product_behavior_outcome: final.productBehaviorAuthority.classificationOutcome,
        base_recipe_eligible: final.productBehaviorAuthority.baseRecipeEligible,
        topping_eligible: final.productBehaviorAuthority.toppingEligible,
        technical_dosage_status: {
          technical: final.recognition.isTechnicalProduct,
          dosageDependent: final.recognition.isDosageDependent,
          dosage: final.recognition.dosage,
        },
        carbonation_status: final.carbonation.status,
        carbonation_provenance: final.carbonation,
        raw_product_accuracy: final.productionAccuracy.rawProductAccuracy,
        final_product_accuracy: final.productionAccuracy.productAccuracy,
        cap: final.productionAccuracy.criticalCap,
        exact_critical_blockers: final.productionAccuracy.criticalBlockers,
        working_profile_complete: workingProfileComplete(final),
        base_engine_ready: final.productionAccuracy.baseEngineReady,
        topping_ready: final.productionAccuracy.roleReadiness === 'TOPPING_READY',
        final_status: finalStatus,
        source_urls: sources,
        source_authority: final.sourceAuthority,
        web_result: enriched.researchOutcome,
        open_food_facts_result: off.map((attempt) => ({
          status: attempt.httpStatus,
          cacheHit: attempt.cacheHit,
          facts: attempt.facts.map((fact) => fact.field),
          error: attempt.error,
        })),
        semantic_result: final.recognition.classificationSource,
        semantic_rejection_repair_reason: semanticAttempt
          ? {
              error: semanticAttempt.error,
              validationErrors: semanticAttempt.validationErrors,
              repairAttempted: semanticAttempt.repairAttempted,
              repairAccepted: semanticAttempt.repairAccepted,
            }
          : null,
        mapper_donor: final.recognitionTrace.selectedMapperDonor,
        mapper_similarity: final.recognitionTrace.mapperSimilarity,
        completed_fields: completedFields,
        missing_fields: missingFields,
        conflicts: [
          ...final.evidence.materialConflicts,
          ...(final.workingValues?.conflicts ?? []),
          ...(final.workingValues?.plausibilityViolations ?? []),
        ],
        owner_action_required:
          finalStatus === 'READY' || finalStatus === 'TOPPING_ONLY'
            ? null
            : unresolved.reason,
      };
    });

    const tracePath = join(OUTPUT_DIR, `POLAND_${SCOPE}_FULL_17_STEP_TRACE.json`);
    const summaryPath = join(OUTPUT_DIR, `POLAND_${SCOPE}_CLOSEOUT_SUMMARY.json`);
    writeFileSync(tracePath, `${JSON.stringify(traces, null, 2)}\n`, 'utf8');
    writeFileSync(summaryPath, `${JSON.stringify(aggregate, null, 2)}\n`, 'utf8');
    const csvPath = writeCsv(`POLAND_${SCOPE}_FINAL_CLOSEOUT.csv`, csvRows);
    writeFileSync(
      join(OUTPUT_DIR, 'ARTIFACTS.json'),
      `${JSON.stringify({ tracePath, summaryPath, csvPath }, null, 2)}\n`,
      'utf8',
    );

    expect(invariants).toEqual({
      productsSkippedByImportWideNormalFlowCap: 0,
      creditedFactsWithoutExactProductIdentityProof: 0,
      donorsAcceptedWithUnresolvedFamilyFormRole: 0,
      toppingOnlyWithToppingEligibleFalse: 0,
      familyAndFormLostBetweenRecognitionAndProductBehavior: 0,
      provisionalToppingPhysicsExemptions: 0,
      genericSemanticRejectionsWithoutFieldReason: 0,
    });
    expect(Object.values(aggregate.finalStates).reduce((sum, value) => sum + value, 0)).toBe(LIMIT);
    expect(createHash('sha256').update(readFileSync(POLAND_FILE)).digest('hex')).toBe(polandSha256);
    expect(createHash('sha256').update(readFileSync(MAPPER_FILE)).digest('hex')).toBe(mapperSha256);
    console.log('INTIMPORT_FINAL_CLOSEOUT', JSON.stringify(aggregate, null, 2));
  }, 8 * 60 * 60 * 1_000);
});
