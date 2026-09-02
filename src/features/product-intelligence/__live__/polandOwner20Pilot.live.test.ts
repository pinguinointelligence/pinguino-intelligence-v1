import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseINTIMPORT, type IntimportCandidate } from '@/data/products/intimport';
import {
  intimportWorkbookToCsv,
  OWNER_SEMANTIC_POPULATION,
  OWNER_SEMANTIC_SHEET,
} from '@/data/products/intimportWorkbook';
import type { ProductIntakeCandidate } from '@/data/products/productTableParser';
import { planIntimportDedup } from '@/features/product-intelligence/intimportDedup';
import {
  reassessIntimportAfterEnrichment,
  runIntimportEnrichment,
  type EnrichedProduct,
} from '@/features/product-intelligence/intimportEnrichment';
import {
  classifyIntimportFinalResult,
  planIntimportImport,
  runIntimportLocalIntelligence,
  type IntimportProductIntelligence,
} from '@/features/product-intelligence/intimportIntelligence';
import { runIntimportSemanticClassification } from '@/features/product-intelligence/intimportSemanticClassification';
import type { OwnerProductClassification } from '@/features/product-intelligence/ownerProductClassification';
import { supabase } from '@/lib/supabase/client';
import { loadIntimportCanonicalExactMatches } from '@/services/intimportCanonicalLookup';
import {
  createIntimportSemanticProvider,
  createIntimportWebProvider,
} from '@/services/intimportEnrichment';
import { loadMapperKnowledge, resetMapperKnowledgeCache } from '@/services/mapperKnowledge';
import { importProductCatalog, type ProductImportSummary } from '@/services/productCatalogImport';
import {
  finishProductImportRun,
  productImportSourceFingerprint,
  recordProductImportRowOutcome,
  startIntimportRun,
} from '@/services/productImportRuns';
import { getProduct } from '@/services/products';

const WORKBOOK = '/Users/tomaszboro22/Desktop/PL_POLAND_GELLATTI_SEMANTIC_CLASSIFIED.xlsx';
const SELECTION = resolve(process.cwd(), 'reports/poland-intimport-pilot/selection.json');
const STAGING_REF = 'tunabqqrwabacxjcxxkz';
const LIVE =
  process.env.RUN_POLAND_OWNER_20_LIVE === 'true' &&
  process.env.POLAND_OWNER_20_STAGING_REF === STAGING_REF &&
  existsSync(WORKBOOK) &&
  existsSync(SELECTION);

interface Selection {
  seed: string;
  population: number;
  selected: Array<{
    ordinal: number;
    sourceProductId: string;
    productName: string;
    ean: string | null;
    ownerRoleCode: 'S' | 'T' | 'O';
    usageRole: 'BASE_ONLY' | 'TOPPING_ONLY' | 'BASE_AND_TOPPING';
  }>;
}

interface PipelineRun {
  initial: IntimportProductIntelligence[];
  enriched: EnrichedProduct[];
  finalRows: IntimportProductIntelligence[];
  summary: ProductImportSummary;
  researchCalls: number;
}

const fieldStateCount = (row: IntimportProductIntelligence, state: string): number =>
  Object.values(row.workingValues?.fields ?? {}).filter((field) => field.provenance.state === state)
    .length;

describe.runIf(LIVE)('Poland owner-classified 20-product real staging pilot', () => {
  afterAll(async () => {
    await supabase?.auth.signOut();
  });

  it(
    'runs exactly the recorded 20 twice through the shared Product Intelligence and canonical PR path',
    async () => {
      expect(supabase, 'staging Supabase client must be configured').not.toBeNull();
      expect(process.env.PINGUINO_STAGING_FIXTURE_PASSWORD).toBeTruthy();
      const { data: signedIn, error: signInError } = await supabase!.auth.signInWithPassword({
        email: 'admin@admin.com',
        password: process.env.PINGUINO_STAGING_FIXTURE_PASSWORD!,
      });
      expect(signInError).toBeNull();
      expect(signedIn.user).toBeTruthy();

      const selection = JSON.parse(readFileSync(SELECTION, 'utf8')) as Selection;
      expect(selection.population).toBe(OWNER_SEMANTIC_POPULATION);
      expect(selection.selected).toHaveLength(20);
      const workbookBefore = createHash('sha256').update(readFileSync(WORKBOOK)).digest('hex');
      const converted = intimportWorkbookToCsv(readFileSync(WORKBOOK));
      expect(converted.sheet).toBe(OWNER_SEMANTIC_SHEET);
      expect(converted.ownerClassifications).toHaveLength(OWNER_SEMANTIC_POPULATION);
      const parsed = parseINTIMPORT(converted.csv);
      expect(parsed.candidates).toHaveLength(OWNER_SEMANTIC_POPULATION);
      const candidatesById = new Map(
        parsed.candidates.map((candidate) => [candidate.sourceProductId, candidate] as const),
      );
      const selectedCandidates = selection.selected.map(({ sourceProductId }) => {
        const candidate = candidatesById.get(sourceProductId);
        if (!candidate) throw new Error(`Recorded pilot product is absent: ${sourceProductId}`);
        return candidate;
      });
      expect(selectedCandidates).toHaveLength(20);
      expect(new Set(selectedCandidates.map((candidate) => candidate.sourceProductId)).size).toBe(
        20,
      );
      expect(
        selectedCandidates.every(
          (candidate) => !['INVALID', 'DUPLICATE'].includes(candidate.state),
        ),
      ).toBe(true);
      const ownerById = new Map(
        converted.ownerClassifications.map((classification) => [
          classification.sourceProductId,
          classification,
        ]),
      );
      const ownerByRow = new Map<number, OwnerProductClassification>(
        selectedCandidates.map((candidate) => [
          candidate.rowIndex,
          ownerById.get(candidate.sourceProductId!)!,
        ]),
      );

      resetMapperKnowledgeCache();
      const mapperBefore = await loadMapperKnowledge();
      expect(mapperBefore.indexedRows).toBeGreaterThan(0);
      const sourceFingerprint = await productImportSourceFingerprint(
        JSON.stringify({
          seed: selection.seed,
          ids: selection.selected.map((row) => row.sourceProductId),
        }),
      );

      const execute = async (label: string): Promise<PipelineRun> => {
        const run = await startIntimportRun({
          mode: 'STANDARD',
          label,
          fileName: 'PL_POLAND_GELLATTI_SEMANTIC_CLASSIFIED.xlsx',
          sourceFingerprint,
          totalRows: 20,
        });
        try {
          const canonical = await loadIntimportCanonicalExactMatches(selectedCandidates);
          const initial = runIntimportLocalIntelligence(
            selectedCandidates,
            canonical.index,
            mapperBefore,
            new Map(),
            new Map(),
            new Map(),
            ownerByRow,
          );
          expect(initial.rows).toHaveLength(20);
          const identityByRow = new Map(
            initial.rows.map((row) => [row.rowIndex, row.researchIdentity] as const),
          );
          const planByRow = new Map(
            initial.rows.map((row) => [row.rowIndex, row.researchPlan] as const),
          );
          const enrichment = await runIntimportEnrichment(
            initial.rows.map((intelligence) => ({
              intelligence,
              barcode: intelligence.researchIdentity.barcode,
            })),
            createIntimportWebProvider({
              importId: run.id,
              identityFor: (request) =>
                identityByRow.get(request.rowIndex) ?? {
                  brand: null,
                  manufacturer: null,
                  name: request.displayName,
                  variant: null,
                  barcode: request.barcode,
                  netQuantity: null,
                  knownSourceUrl: null,
                  technicalPdfUrl: null,
                },
              stepFor: (request) => {
                const steps = planByRow.get(request.rowIndex)?.steps ?? [];
                const step = steps[request.researchStepIndex] ?? steps.at(-1);
                return step
                  ? { kind: step.kind, url: step.url, allowedDomains: step.allowedDomains }
                  : null;
              },
            }),
          );
          expect(enrichment.products).toHaveLength(20);
          const semantic = await runIntimportSemanticClassification(
            enrichment.products,
            createIntimportSemanticProvider({ importId: run.id }),
          );
          const final = reassessIntimportAfterEnrichment({
            candidates: selectedCandidates,
            enrichedProducts: enrichment.products,
            mapper: mapperBefore,
            semanticClassifications: semantic.classifications,
            semanticEvidenceReceipts: semantic.evidenceReceipts,
            ownerClassifications: ownerByRow,
          });
          expect(final.rows).toHaveLength(20);
          const importPlan = planIntimportImport(final.rows);
          expect(importPlan.rows).toHaveLength(20);
          const plannedByRow = new Map(importPlan.rows.map((row) => [row.rowIndex, row] as const));
          const finalCandidates = selectedCandidates.map((candidate): IntimportCandidate => {
            const planned = plannedByRow.get(candidate.rowIndex)!;
            const ean =
              typeof planned.insert.ean_code === 'string' && planned.insert.ean_code.length > 0
                ? planned.insert.ean_code
                : candidate.ean;
            return { ...candidate, ean, eanRaw: ean, insert: planned.insert };
          });
          const dedup = planIntimportDedup(finalCandidates);
          expect(dedup.totalAccounted).toBe(20);
          expect(dedup.counts.EXACT_DUPLICATE).toBe(0);
          expect(dedup.counts.IDENTITY_CONFLICT).toBe(0);
          const forceDistinct = new Set(
            dedup.rows.filter((row) => row.forceDistinct).map((row) => row.rowIndex),
          );
          const ingestCandidates: ProductIntakeCandidate[] = finalCandidates.map((candidate) => ({
            rowIndex: candidate.rowIndex,
            status: 'valid',
            insert: candidate.insert,
            warnings: candidate.warnings,
            skipReason: null,
            forceDistinctIdentity: forceDistinct.has(candidate.rowIndex),
          }));
          expect(ingestCandidates).toHaveLength(20);
          const summary = await importProductCatalog(ingestCandidates, {
            importRun: {
              id: run.id,
              shouldCancel: () => false,
              recordOutcome: async (input) => {
                await recordProductImportRowOutcome({ runId: run.id, ...input });
              },
            },
          });
          if (summary.failed > 0 || summary.skipped > 0) {
            const finalByRow = new Map(final.rows.map((row) => [row.rowIndex, row] as const));
            const failedReceipts = [
              ...new Set(
                summary.rowResults
                  .filter((row) => row.outcome === 'failed')
                  .flatMap((row) => finalByRow.get(row.rowIndex)?.enrichmentEvidenceReceipts ?? []),
              ),
            ];
            const { data: usageRows } = failedReceipts.length
              ? await supabase!
                  .from('intimport_enrichment_usage')
                  .select('idempotency_key,fields_requested,result_json')
                  .in('idempotency_key', failedReceipts)
              : { data: [] };
            const usageByReceipt = new Map(
              (usageRows ?? []).map((usage) => [String(usage.idempotency_key), usage] as const),
            );
            console.log(
              `POLAND_OWNER_20_IMPORT_FAILURES=${JSON.stringify(
                summary.rowResults
                  .filter((row) => row.outcome === 'failed' || row.outcome === 'skipped')
                  .map((result) => {
                    const intelligence = finalByRow.get(result.rowIndex);
                    return {
                      ...result,
                      sourceProductId: intelligence?.sourceProductId ?? null,
                      productName: intelligence?.displayName ?? null,
                      role: intelligence?.ownerClassification?.roleCode ?? null,
                      productAccuracy: intelligence?.productionAccuracy.productAccuracy ?? null,
                      rawProductAccuracy:
                        intelligence?.productionAccuracy.rawProductAccuracy ?? null,
                      gellattiReady:
                        intelligence?.productionAccuracy.gellattiReadiness.ready ?? false,
                      proposalEvidence: intelligence?.evidence ?? null,
                      semanticFamily: intelligence?.ownerClassification?.semanticFamily ?? null,
                      physicalForm: intelligence?.ownerClassification?.physicalForm ?? null,
                      researchIdentity: intelligence?.researchIdentity ?? null,
                      enrichmentReceipts:
                        intelligence?.enrichmentEvidenceReceipts.map((receipt) => {
                          const usage = usageByReceipt.get(receipt) as
                            | { fields_requested?: unknown; result_json?: unknown }
                            | undefined;
                          const resultJson =
                            usage?.result_json && typeof usage.result_json === 'object'
                              ? (usage.result_json as Record<string, unknown>)
                              : {};
                          return {
                            receipt,
                            fieldsRequested: usage?.fields_requested ?? null,
                            requestIdentity: resultJson.requestIdentity ?? null,
                            factFields: Array.isArray(resultJson.facts)
                              ? resultJson.facts.map((fact) =>
                                  fact && typeof fact === 'object'
                                    ? ((fact as Record<string, unknown>).field ?? null)
                                    : null,
                                )
                              : [],
                          };
                        }) ?? [],
                    };
                  }),
              )}`,
            );
          }
          expect(summary.total).toBe(20);
          expect(summary.failed).toBe(0);
          expect(summary.skipped).toBe(0);
          expect(summary.inBatchDuplicates).toBe(0);
          expect(summary.rowResults).toHaveLength(20);
          await finishProductImportRun(run.id, 'COMPLETED');
          return {
            initial: initial.rows,
            enriched: enrichment.products,
            finalRows: final.rows,
            summary,
            researchCalls: enrichment.summary.callsUsed + semantic.summary.modelCalls,
          };
        } catch (error) {
          await finishProductImportRun(run.id, 'FAILED').catch(() => undefined);
          throw error;
        }
      };

      const first = await execute('Poland owner-classified pilot 20 — first run');
      const second = await execute('Poland owner-classified pilot 20 — idempotency run');
      expect(second.summary.created).toBe(0);
      expect(second.summary.existingDuplicates).toBe(20);
      expect(new Set(first.summary.productIds).size).toBe(20);
      expect(second.summary.productIds).toEqual(first.summary.productIds);

      const products = await Promise.all(first.summary.productIds.map((id) => getProduct(id)));
      expect(products.every(Boolean)).toBe(true);
      expect(products.every((product) => product?.matched_basement_id === null)).toBe(true);
      expect(products.every((product) => product?.product_code?.startsWith('PR-ING-'))).toBe(true);

      resetMapperKnowledgeCache();
      const mapperAfter = await loadMapperKnowledge();
      expect(mapperAfter.indexedRows).toBe(mapperBefore.indexedRows);
      expect(mapperAfter.fingerprint).toBe(mapperBefore.fingerprint);
      expect(createHash('sha256').update(readFileSync(WORKBOOK)).digest('hex')).toBe(
        workbookBefore,
      );

      const firstResultByRow = new Map(first.summary.rowResults.map((row) => [row.rowIndex, row]));
      const enrichedByRow = new Map(first.enriched.map((row) => [row.rowIndex, row]));
      const initialByRow = new Map(first.initial.map((row) => [row.rowIndex, row]));
      const reportRows = first.finalRows.map((row, index) => {
        const importResult = firstResultByRow.get(row.rowIndex)!;
        const enriched = enrichedByRow.get(row.rowIndex)!;
        const initial = initialByRow.get(row.rowIndex)!;
        const profile = row.workingValues?.profileMatch;
        return {
          ordinal: index + 1,
          sourceProductId: row.sourceProductId,
          productName: row.displayName,
          role: row.ownerClassification?.roleCode ?? null,
          ean: row.researchIdentity.barcode ?? row.insert.ean_code ?? null,
          canonicalResult: importResult.outcome,
          canonicalProductId: importResult.productId ?? null,
          canonicalProductCode: importResult.productCode ?? null,
          exactIdentityStatus: initial.exactCanonicalMatch
            ? 'EXACT_CANONICAL_REUSE'
            : row.researchIdentity.barcode
              ? 'EXACT_GTIN_AVAILABLE'
              : 'CANONICAL_SOURCE_IDENTITY',
          productAccuracy: row.productionAccuracy.productAccuracy,
          metadataCompleteness: row.productionAccuracy.metadataCompleteness.score,
          gellattiReady: row.productionAccuracy.gellattiReadiness.ready,
          readinessClass: row.productionAccuracy.roleReadiness,
          semanticFamily: row.ownerClassification?.semanticFamily ?? null,
          physicalForm: row.ownerClassification?.physicalForm ?? null,
          mapperDonor: profile?.references[0] ?? null,
          mapperSimilarity: profile?.confidence ?? null,
          verifiedFields: fieldStateCount(row, 'VERIFIED'),
          derivedFields: fieldStateCount(row, 'DERIVED'),
          estimatedFields: fieldStateCount(row, 'ESTIMATED'),
          unknownFields: fieldStateCount(row, 'UNKNOWN'),
          blockers: row.productionAccuracy.gellattiReadiness.blockers,
          autonomousResearchPerformed: enriched.webAttempted,
          researchFieldsCredited: [...new Set(enriched.appliedFacts.map((fact) => fact.field))],
          duplicateStatus:
            importResult.outcome === 'existing' ? 'CANONICAL_REUSE' : 'NEW_CANONICAL',
          finalImportStatus: classifyIntimportFinalResult(row),
        };
      });
      expect(reportRows).toHaveLength(20);

      const count = (predicate: (row: (typeof reportRows)[number]) => boolean): number =>
        reportRows.filter(predicate).length;
      const report = {
        environment: 'STAGING',
        projectRef: STAGING_REF,
        sourceSheet: OWNER_SEMANTIC_SHEET,
        population: OWNER_SEMANTIC_POPULATION,
        seed: selection.seed,
        total: reportRows.length,
        firstRun: {
          created: first.summary.created,
          reused: first.summary.existingDuplicates,
          failed: first.summary.failed,
          researchCalls: first.researchCalls,
        },
        secondRun: {
          created: second.summary.created,
          reused: second.summary.existingDuplicates,
          failed: second.summary.failed,
          researchCalls: second.researchCalls,
        },
        counts: {
          ready: count((row) => row.gellattiReady),
          baseReady: count((row) => row.readinessClass === 'BASE_READY'),
          toppingReady: count((row) => row.readinessClass === 'TOPPING_READY'),
          baseAndToppingReady: count((row) => row.role === 'O' && row.gellattiReady),
          notReady: count((row) => !row.gellattiReady),
          exactCanonicalReuse: count((row) => row.canonicalResult === 'existing'),
          newlyCreatedCanonicalPr: count((row) => row.canonicalResult === 'created'),
          familyMapperUsed: count((row) => row.mapperDonor !== null),
          noMapperNeeded: count((row) => row.mapperDonor === null),
          unresolvedCritical: count((row) => row.blockers.length > 0),
          duplicatesCreated: 0,
        },
        mapper: {
          beforeRows: mapperBefore.indexedRows,
          afterRows: mapperAfter.indexedRows,
          beforeFingerprint: mapperBefore.fingerprint,
          afterFingerprint: mapperAfter.fingerprint,
          unchanged: mapperBefore.fingerprint === mapperAfter.fingerprint,
        },
        products: reportRows,
      };
      console.log(`POLAND_OWNER_20_RESULT=${JSON.stringify(report)}`);
    },
    20 * 60_000,
  );
});
