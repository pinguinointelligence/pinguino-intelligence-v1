/**
 * INTIMPORT targeted enrichment — bounded, cached, capped, and never automatic.
 *
 * Nothing in this module runs during Parse. It runs only after an explicit owner
 * action, only for products the local stage could not settle (< 90 %), and only
 * for the specific fields that are actually missing. Products at or above the
 * no-web threshold are skipped outright: turning 94 % into 97 % is not worth a
 * single paid call.
 *
 * The external lookup itself is INJECTED. This module owns the policy — what to
 * ask, how often, when to stop — never the transport, so it stays pure and fully
 * testable with no network.
 */
import {
  AUTO_IMPORT_FLOOR,
  NO_WEB_CONFIDENCE,
  assessProductConfidence,
  isAutoImportEligible,
  routeAfterWeb,
  type EnrichmentRoute,
  type EvidenceSource,
  type ProductEvidenceField,
  type ProductEvidenceInput,
} from './productEvidenceConfidence';
import {
  runIntimportLocalIntelligence,
  type IntimportReassessmentOverride,
  type IntimportProductIntelligence,
} from './intimportIntelligence';
import {
  intimportNumber,
  normalizeNutritionBasis,
  type IntimportCandidate,
} from '@/data/products/intimport';
import type { SourceAuthorityClass } from './sourceAuthority';
import type { MapperKnowledge } from './mapperValueInference';
import { knownField, type FieldBasis, type WorkingNumericField } from './productFieldTruth';
import type { CardContribution } from './productSourceCard';
import type {
  ProductionAccuracyEvidenceProvenance,
} from './productProductionAccuracy';
import {
  canonicalizeProductSemanticEvidence,
  classifyProductSemantics,
  type ProductSemanticClassification,
  type ProductSemanticEvidence,
} from './productRecognition';

/** One external observation. `null` value means "looked, found nothing". */
export interface EnrichmentFact {
  field: ProductEvidenceField;
  value: string | number | null;
  source: EvidenceSource;
  /** Exact server-classified provenance. Optional only for pure/local providers. */
  sourceUrl?: string;
  sourceDomain?: string | null;
  sourceTitle?: string | null;
  sourceAuthorityClass?: SourceAuthorityClass;
  retrievedAt?: string;
}

export interface EnrichmentRequest {
  /** Stable identity for caching — validated GTIN when present, else identity key. */
  cacheKey: string;
  /** The parsed row this request came from, so the caller can supply identity. */
  rowIndex: number;
  displayName: string | null;
  brand: string | null;
  barcode: string | null;
  /** ONLY these fields may be researched. */
  fields: readonly ProductEvidenceField[];
  /** Zero-based position in the deterministic strongest-first research plan. */
  researchStepIndex: number;
}

export interface EnrichmentResponse {
  facts: readonly EnrichmentFact[];
  /** How many billable external calls this actually consumed. */
  calls: number;
  estimatedCostUsd?: number;
  /** Server-owned usage-ledger key. catalog-submit verifies it before crediting web evidence. */
  evidenceReceipt?: string;
  /** Server refused before spending because the import-wide cap is exhausted. */
  capReached?: boolean;
  /** Product-level source result. STEP_COMPLETE means continue to the next
   * planned source while useful fields are still missing. */
  researchOutcome?: 'ENRICHED' | 'STEP_COMPLETE' | 'SEARCH_EXHAUSTED' | 'SOURCE_CONFLICT';
  crossSkuRejections?: readonly { sourceUrl: string; reasonCodes: string[] }[];
}

export type EnrichmentProvider = (request: EnrichmentRequest) => Promise<EnrichmentResponse>;

export interface EnrichmentCaps {
  /** Hard ceiling on external calls for the whole import. */
  maxCallsPerImport: number;
  /** Hard ceiling on spend for the whole import, in USD. */
  maxSpendUsd: number;
  /** How many products may be researched at once. Never hundreds. */
  concurrency: number;
}

/**
 * The provider does not honour `max_tool_calls`, so every admission decision
 * reserves this many searches up front rather than trusting the ceiling.
 */
export const WORST_CASE_SEARCHES_PER_CALL = 3;

export const DEFAULT_ENRICHMENT_CAPS: EnrichmentCaps = Object.freeze({
  maxCallsPerImport: 400,
  maxSpendUsd: 5,
  concurrency: 4,
});

export interface EnrichedProduct extends IntimportProductIntelligence {
  preWebConfidence: number;
  postWebConfidence: number;
  webAttempted: boolean;
  webSkippedReason: string | null;
  callsUsed: number;
  cacheHit: boolean;
  finalRoute: EnrichmentRoute;
  autoImportEligible: boolean;
  appliedFacts: EnrichmentFact[];
  researchOutcome: 'NOT_NEEDED' | 'ENRICHED' | 'SEARCH_EXHAUSTED' | 'SOURCE_CONFLICT';
  crossSkuRejections: { sourceUrl: string; reasonCodes: string[] }[];
}

export interface EnrichmentProgress {
  processed: number;
  total: number;
  webAttempted: number;
  callsUsed: number;
  spendUsd: number;
}

export interface EnrichmentRunSummary {
  products: number;
  runStatus: 'COMPLETED' | 'PAUSED_BUDGET';
  processed: number;
  pending: number;
  nextRowIndex: number | null;
  webSkippedHighConfidence: number;
  webSkippedExisting: number;
  webAttempted: number;
  cacheHits: number;
  callsUsed: number;
  spendUsd: number;
  capReached: boolean;
  movedToNoWeb: number;
  finalReadyLocal: number;
  finalWebRecommended: number;
  finalReviewRequired: number;
  importEligible: number;
}

/** Evidence rebuild after new facts arrive. Stronger existing evidence always wins. */
function mergeFacts(
  base: ProductEvidenceInput,
  facts: readonly EnrichmentFact[],
): { evidence: ProductEvidenceInput; applied: EnrichmentFact[] } {
  const fields = { ...base.fields };
  const applied: EnrichmentFact[] = [];
  for (const fact of facts) {
    // A web result that found nothing must never erase what we already knew.
    if (fact.value === null || fact.value === '') continue;
    const existing = fields[fact.field];
    // Weak external evidence cannot overwrite stronger known evidence.
    if (existing && !isWeaker(existing, fact.source)) continue;
    fields[fact.field] = fact.source;
    applied.push(fact);
  }
  return { evidence: { ...base, fields }, applied };
}

const NUTRITION_SEMANTIC_LABELS: Readonly<Record<string, string>> = {
  nutritionBasis: 'basis',
  energyKcal: 'kcal',
  fat: 'fat_g',
  carbohydrate: 'carbohydrate_g',
  sugars: 'sugars_g',
  fiber: 'fiber_g',
  protein: 'protein_g',
  salt: 'salt_g',
};

/** Keep semantic evidence and accepted enrichment facts on the same exact row. */
function mergeSemanticFacts(
  base: ProductSemanticEvidence,
  facts: readonly EnrichmentFact[],
): ProductSemanticEvidence {
  const merged: ProductSemanticEvidence = {
    ...base,
    sourceUrls: [...base.sourceUrls],
  };
  const nutrition = new Map<string, string>();
  for (const part of (base.nutrition ?? '').split('|')) {
    const [label, ...value] = part.trim().split(':');
    if (label && value.length > 0) nutrition.set(label, value.join(':'));
  }
  for (const fact of facts) {
    const value = fact.value === null ? null : String(fact.value).trim();
    if (!value) continue;
    if (fact.field === 'ingredients') merged.ingredients = value;
    else if (fact.field === 'dosage') merged.dosage = value;
    else if (fact.field === 'technicalParameters') merged.technicalParameters = value;
    else if (fact.field === 'manufacturer') merged.manufacturer = value;
    else if (fact.field === 'barcode') merged.gtin = value;
    const nutritionLabel = NUTRITION_SEMANTIC_LABELS[String(fact.field)];
    if (nutritionLabel) nutrition.set(nutritionLabel, value);
    if (fact.sourceUrl) merged.sourceUrls = [...merged.sourceUrls, fact.sourceUrl];
  }
  merged.nutrition = nutrition.size > 0
    ? [...nutrition.entries()].map(([label, value]) => `${label}:${value}`).join(' | ')
    : null;
  merged.sourceUrls = [...new Set(merged.sourceUrls)];
  return canonicalizeProductSemanticEvidence(merged);
}

const CREDIT_ORDER: Readonly<Record<EvidenceSource, number>> = Object.freeze({
  user_confirmed: 7,
  label: 6,
  mapper_exact: 6,
  manufacturer: 5,
  source_file: 5,
  barcode_registry: 4,
  retailer: 2,
  web_search: 2,
  mapper_family: 1,
});

/** True when `incoming` is strictly stronger than `existing`. */
const isWeaker = (existing: EvidenceSource, incoming: EvidenceSource): boolean =>
  CREDIT_ORDER[incoming] > CREDIT_ORDER[existing];

/** Deterministic cache key: a validated GTIN identifies a product globally. */
export const enrichmentCacheKey = (row: IntimportProductIntelligence, barcode: string | null): string =>
  barcode
    ? `gtin:${barcode}`
    : `id:${(row.displayName ?? '').toLowerCase().replace(/\s+/g, ' ').trim()}|${row.sourceProductId ?? ''}`;

export interface EnrichmentInputRow {
  intelligence: IntimportProductIntelligence;
  /** Defaults to the evidence the local stage already computed. */
  evidence?: ProductEvidenceInput;
  barcode: string | null;
}

const WORKING_FIELD_BY_FACT: Readonly<Partial<Record<ProductEvidenceField, WorkingNumericField>>> =
  Object.freeze({
    energyKcal: 'kcal_per_100g',
    fat: 'fat_percent',
    carbohydrate: 'carbohydrate_percent',
    sugars: 'total_sugars_percent',
    fiber: 'fiber_percent',
    protein: 'protein_percent',
    salt: 'salt_percent',
  });

function verifiedFactBasis(fact: EnrichmentFact): {
  basis: FieldBasis;
  confidence: number;
} | null {
  switch (fact.sourceAuthorityClass) {
    case 'OFFICIAL_MANUFACTURER':
    case 'OFFICIAL_BRAND':
    case 'OFFICIAL_TECHNICAL_PDF':
      return { basis: 'official_manufacturer', confidence: 0.98 };
    case 'OFFICIAL_PRIVATE_LABEL':
      return { basis: 'private_label_card', confidence: 0.95 };
    case 'AUTHORITATIVE_RETAILER':
      return { basis: 'retailer_card', confidence: 0.92 };
    case 'STRUCTURED_PRODUCT_DATABASE':
      return { basis: 'retailer_card', confidence: 0.9 };
    default:
      // Local/test providers predate server authority metadata. Their explicit
      // source type remains usable in the pure layer; production providers
      // always send sourceAuthorityClass and the server independently verifies it.
      if (fact.source === 'manufacturer') {
        return { basis: 'official_manufacturer', confidence: 0.95 };
      }
      if (fact.source === 'retailer') return { basis: 'retailer_card', confidence: 0.85 };
      return null;
  }
}

function sourceCardFromEnrichment(
  candidate: IntimportCandidate,
  product: EnrichedProduct,
): CardContribution | null {
  const researchedBasis = product.appliedFacts.find((fact) => fact.field === 'nutritionBasis');
  const basis = normalizeNutritionBasis(
    researchedBasis?.value === null || researchedBasis?.value === undefined
      ? candidate.source['Nutrition Basis']
      : String(researchedBasis.value),
  );
  if (basis !== 'per_100g') return null;

  const fields: CardContribution['fields'] = {};
  for (const fact of product.appliedFacts) {
    const field = WORKING_FIELD_BY_FACT[fact.field];
    if (!field || fact.value === null) continue;
    const parsed = intimportNumber(String(fact.value)).value;
    const authority = verifiedFactBasis(fact);
    if (parsed === null || parsed < 0 || (field !== 'kcal_per_100g' && parsed > 100) || !authority) {
      continue;
    }
    fields[field] = knownField({
      value: parsed,
      state: 'VERIFIED',
      confidence: authority.confidence,
      basis: authority.basis,
      note: `zweryfikowany research: ${fact.sourceUrl ?? fact.source}`,
    });
  }
  return Object.keys(fields).length > 0
    ? {
        fields,
        per100ml: null,
        reasons: [`enrichment per 100 g: ${Object.keys(fields).length} zweryfikowanych pól`],
      }
    : null;
}

function reassessmentOverride(
  candidate: IntimportCandidate,
  product: EnrichedProduct,
  semanticEvidenceReceipt: string | null,
): IntimportReassessmentOverride {
  const evidenceProvenance: Partial<
    Record<ProductEvidenceField, ProductionAccuracyEvidenceProvenance>
  > = Object.fromEntries(
    product.appliedFacts.map((fact) => [
      fact.field,
      {
        source: fact.source,
        sourceUrl: fact.sourceUrl ?? null,
        sourceAuthorityClass: fact.sourceAuthorityClass ?? null,
      },
    ]),
  );
  return {
    evidence: product.evidence,
    sourceCard: sourceCardFromEnrichment(candidate, product),
    evidenceProvenance,
    enrichmentEvidenceReceipts: product.enrichmentEvidenceReceipts,
    semanticEvidenceReceipt,
  };
}

/** Rerun the same local completion/scoring authority after web + semantic
 * enrichment. This is the single seam the import UI and read-only proofs use;
 * no enriched fact is overlaid onto an otherwise stale pre-web score. */
export function reassessIntimportAfterEnrichment(input: {
  candidates: readonly IntimportCandidate[];
  enrichedProducts: readonly EnrichedProduct[];
  mapper: MapperKnowledge | null;
  semanticClassifications?: ReadonlyMap<number, ProductSemanticClassification>;
  semanticEvidenceReceipts?: ReadonlyMap<number, string>;
}) {
  const enrichedByRow = new Map(input.enrichedProducts.map((row) => [row.rowIndex, row] as const));
  const candidatesByRow = new Map(input.candidates.map((row) => [row.rowIndex, row] as const));
  const recognitionEvidence = new Map(
    input.enrichedProducts.map((row) => [row.rowIndex, row.recognitionEvidence] as const),
  );
  const overrides = new Map<number, IntimportReassessmentOverride>();
  for (const [rowIndex, product] of enrichedByRow) {
    const candidate = candidatesByRow.get(rowIndex);
    if (!candidate) continue;
    overrides.set(
      rowIndex,
      reassessmentOverride(
        candidate,
        product,
        input.semanticEvidenceReceipts?.get(rowIndex) ?? null,
      ),
    );
  }
  return runIntimportLocalIntelligence(
    input.candidates,
    {},
    input.mapper,
    input.semanticClassifications ?? new Map(),
    recognitionEvidence,
    overrides,
  );
}

/**
 * Run targeted enrichment over the rows the local stage could not settle.
 *
 * Skips every EXISTING and READY_LOCAL product without a call, researches only
 * the missing fields, reuses cached research for repeated products, honours the
 * per-product / per-import / spend caps, and stops gracefully when a cap is hit —
 * remaining products are left for review rather than silently overspent on.
 */
export async function runIntimportEnrichment(
  rows: readonly EnrichmentInputRow[],
  provider: EnrichmentProvider,
  caps: EnrichmentCaps = DEFAULT_ENRICHMENT_CAPS,
  onProgress?: (progress: EnrichmentProgress) => void,
): Promise<{ products: EnrichedProduct[]; summary: EnrichmentRunSummary }> {
  const cache = new Map<string, EnrichmentResponse>();
  const results: EnrichedProduct[] = [];
  let callsUsed = 0;
  let spendUsd = 0;
  let capReached = false;
  let webAttempted = 0;
  let cacheHits = 0;

  // Reserve the worst case BEFORE admitting a job. One provider response can
  // invoke several searches (3 observed live against a ceiling of 2), so
  // admitting whenever `used < cap` overshoots on any cap that does not divide
  // evenly — a cap of 5 would have allowed 6.
  const capExhausted = () =>
    capReached ||
    callsUsed + WORST_CASE_SEARCHES_PER_CALL > caps.maxCallsPerImport ||
    spendUsd >= caps.maxSpendUsd;

  const settle = (
    row: EnrichmentInputRow,
    postConfidence: number,
    extra: Partial<EnrichedProduct>,
  ): EnrichedProduct => {
    const assessment = extra.assessment ?? row.intelligence.assessment;
    const finalRoute = routeAfterWeb(assessment);
    return {
      ...row.intelligence,
      ...extra,
      assessment,
      preWebConfidence: row.intelligence.assessment.confidence,
      postWebConfidence: postConfidence,
      webAttempted: extra.webAttempted ?? false,
      webSkippedReason: extra.webSkippedReason ?? null,
      callsUsed: extra.callsUsed ?? 0,
      cacheHit: extra.cacheHit ?? false,
      appliedFacts: extra.appliedFacts ?? [],
      researchOutcome: extra.researchOutcome ?? 'NOT_NEEDED',
      crossSkuRejections: extra.crossSkuRejections ?? [],
      finalRoute,
      autoImportEligible: isAutoImportEligible(assessment),
    };
  };

  // One product is completed through its ordered source plan before another is
  // admitted. This makes emergency pause/resume exact and prevents in-flight
  // requests from overshooting the shared ceiling.
  for (const row of rows) {
    const { intelligence } = row;
    if (intelligence.route === 'EXISTING') {
      results.push(settle(row, intelligence.assessment.confidence, {
        webSkippedReason: 'istniejący produkt kanoniczny — brak potrzeby wyszukiwania',
      }));
    } else if (intelligence.assessment.confidence >= NO_WEB_CONFIDENCE) {
      results.push(settle(row, intelligence.assessment.confidence, {
        webSkippedReason: `lokalna pewność ≥${NO_WEB_CONFIDENCE}% — wyszukiwanie zbędne`,
      }));
    } else if (intelligence.enrichmentTargets.length === 0) {
      results.push(settle(row, intelligence.assessment.confidence, {
        webSkippedReason: 'brak pól, które wyszukiwanie mogłoby uzupełnić',
      }));
    } else {
      let evidence = row.evidence ?? intelligence.evidence;
      let recognitionEvidence = intelligence.recognitionEvidence;
      let recognition = intelligence.recognition;
      let fields = intelligence.enrichmentTargets.filter((field) => !evidence.fields[field]);
      let appliedFacts: EnrichmentFact[] = [];
      let receipts = [...intelligence.enrichmentEvidenceReceipts];
      let productCalls = 0;
      let productCacheHit = false;
      let outcome: EnrichedProduct['researchOutcome'] = 'SEARCH_EXHAUSTED';
      let crossSkuRejections: EnrichedProduct['crossSkuRejections'] = [];
      let attempted = false;
      const plan = intelligence.researchPlan.steps;

      for (let researchStepIndex = 0; researchStepIndex < plan.length && fields.length > 0; researchStepIndex += 1) {
        if (capExhausted()) {
          capReached = true;
          break;
        }
        const identityKey = enrichmentCacheKey(intelligence, row.barcode);
        const step = plan[researchStepIndex]!;
        const key = `${identityKey}|${step.kind}|${step.url ?? ''}|${[...fields].sort().join(',')}`;
        const cached = cache.get(key);
        const response = cached ?? await provider({
          cacheKey: key,
          rowIndex: intelligence.rowIndex,
          displayName: intelligence.displayName,
          brand: intelligence.researchIdentity.brand,
          barcode: row.barcode,
          fields,
          researchStepIndex,
        });
        if (response.capReached) {
          capReached = true;
          break;
        }
        attempted = true;
        if (cached) {
          cacheHits += 1;
          productCacheHit = true;
        } else {
          cache.set(key, response);
          callsUsed += response.calls;
          productCalls += response.calls;
          spendUsd += response.estimatedCostUsd ?? 0;
        }
        const merged = mergeFacts(evidence, response.facts);
        evidence = merged.evidence;
        appliedFacts = [...appliedFacts, ...merged.applied];
        recognitionEvidence = mergeSemanticFacts(recognitionEvidence, merged.applied);
        recognition = classifyProductSemantics(recognitionEvidence);
        if (response.evidenceReceipt) receipts = [...new Set([...receipts, response.evidenceReceipt])];
        crossSkuRejections = [
          ...crossSkuRejections,
          ...(response.crossSkuRejections ?? []).map((entry) => ({
            sourceUrl: entry.sourceUrl,
            reasonCodes: [...entry.reasonCodes],
          })),
        ];
        fields = intelligence.enrichmentTargets.filter((field) => !evidence.fields[field]);
        if (response.researchOutcome === 'SOURCE_CONFLICT') {
          outcome = 'SOURCE_CONFLICT';
          break;
        }
        if (fields.length === 0 || response.researchOutcome === 'ENRICHED') {
          outcome = 'ENRICHED';
          break;
        }
        if (response.researchOutcome === 'SEARCH_EXHAUSTED') break;
        // Responses from pre-closeout test/local providers had no source
        // outcome. Treat that legacy contract as one complete search, while the
        // production provider returns STEP_COMPLETE to traverse the whole plan.
        if (!response.researchOutcome) {
          outcome = merged.applied.length > 0 ? 'ENRICHED' : 'SEARCH_EXHAUSTED';
          break;
        }
      }
      if (capReached) break; // current product is resumable, not falsely finalized
      if (attempted) webAttempted += 1;
      const assessment = assessProductConfidence(evidence);
      results.push(settle(row, assessment.confidence, {
        evidence,
        assessment,
        webAttempted: attempted,
        callsUsed: productCalls,
        cacheHit: productCacheHit,
        appliedFacts,
        recognitionEvidence,
        recognition,
        enrichmentEvidenceReceipts: receipts,
        researchOutcome: outcome,
        crossSkuRejections,
      }));
    }
    onProgress?.({ processed: results.length, total: rows.length, webAttempted, callsUsed, spendUsd });
  }

  results.sort((left, right) => left.rowIndex - right.rowIndex);
  const count = (route: EnrichmentRoute) =>
    results.filter((row) => row.finalRoute === route).length;

  return {
    products: results,
    summary: {
      products: rows.length,
      runStatus: capReached ? 'PAUSED_BUDGET' : 'COMPLETED',
      processed: results.length,
      pending: rows.length - results.length,
      nextRowIndex: results.length < rows.length ? rows[results.length]?.intelligence.rowIndex ?? null : null,
      webSkippedHighConfidence: results.filter((row) =>
        row.webSkippedReason?.includes(`≥${NO_WEB_CONFIDENCE}%`),
      ).length,
      webSkippedExisting: results.filter((row) => row.route === 'EXISTING').length,
      webAttempted,
      cacheHits,
      callsUsed,
      spendUsd: Math.round(spendUsd * 10000) / 10000,
      capReached,
      movedToNoWeb: results.filter(
        (row) =>
          row.webAttempted &&
          row.preWebConfidence < NO_WEB_CONFIDENCE &&
          row.postWebConfidence >= NO_WEB_CONFIDENCE,
      ).length,
      finalReadyLocal: count('READY_LOCAL'),
      finalWebRecommended: count('WEB_RECOMMENDED'),
      finalReviewRequired: count('REVIEW_REQUIRED'),
      importEligible: results.filter((row) => row.autoImportEligible).length,
    },
  };
}

export { AUTO_IMPORT_FLOOR, NO_WEB_CONFIDENCE };
