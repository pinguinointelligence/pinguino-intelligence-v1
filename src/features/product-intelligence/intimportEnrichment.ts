/**
 * INTIMPORT targeted enrichment — bounded, cached, capped, and never automatic.
 *
 * Nothing in this module runs during Parse. It runs only after an explicit owner
 * action, only for products the shared readiness authority could not settle,
 * and only for the specific fields that are actually missing. Products at or
 * above the no-web threshold are skipped only when Gellatti Readiness also
 * passes: turning a genuinely ready 94 % into 97 % is not worth a paid call.
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
  MAX_CALLS_PER_PRODUCT,
  runIntimportLocalIntelligence,
  type IntimportReassessmentOverride,
  type IntimportProductIntelligence,
} from './intimportIntelligence';
import type { OwnerProductClassification } from './ownerProductClassification';
import {
  intimportNumber,
  normalizeNutritionBasis,
  type IntimportCandidate,
} from '@/data/products/intimport';
import type { SourceAuthorityClass } from './sourceAuthority';
import type { MapperKnowledge } from './mapperValueInference';
import { knownField, type FieldBasis, type WorkingNumericField } from './productFieldTruth';
import type { CardContribution } from './productSourceCard';
import type { ProductionAccuracyEvidenceProvenance } from './productProductionAccuracy';
import {
  canonicalizeProductSemanticEvidence,
  classifyProductSemantics,
  type ProductSemanticClassification,
  type ProductSemanticEvidence,
} from './productRecognition';
import { validateBarcode } from '@/features/product-scanner/barcode';

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
  merged.nutrition =
    nutrition.size > 0
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
export const enrichmentCacheKey = (
  row: IntimportProductIntelligence,
  barcode: string | null,
): string =>
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
    if (
      parsed === null ||
      parsed < 0 ||
      (field !== 'kcal_per_100g' && parsed > 100) ||
      !authority
    ) {
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
  evidence: ProductEvidenceInput = product.evidence,
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
    evidence,
    sourceCard: sourceCardFromEnrichment(candidate, product),
    evidenceProvenance,
    enrichmentEvidenceReceipts: product.enrichmentEvidenceReceipts,
    semanticEvidenceReceipt,
  };
}

/**
 * A checksum-valid GTIN discovered by the trusted enrichment loop becomes part
 * of the same normalized identity contract that a tabular EAN would use. It is
 * deliberately not written back into `source`: that map remains the untouched
 * workbook evidence. Conflicting or invalid web values never become identity.
 */
function candidateWithResearchedBarcode(
  candidate: IntimportCandidate,
  product: EnrichedProduct,
): { candidate: IntimportCandidate; evidence: ProductEvidenceInput } {
  if (candidate.ean) return { candidate, evidence: product.evidence };
  const validated = product.appliedFacts
    .filter((fact) => fact.field === 'barcode' && fact.value !== null)
    .map((fact) => validateBarcode(String(fact.value)))
    .filter((value): value is NonNullable<ReturnType<typeof validateBarcode>> => value !== null);
  const lookupValues = [...new Set(validated.map((value) => value.lookupValue))];
  if (lookupValues.length !== 1) {
    return {
      candidate,
      evidence:
        lookupValues.length > 1
          ? {
              ...product.evidence,
              materialConflicts: [
                ...product.evidence.materialConflicts,
                `conflicting researched GTIN values: ${lookupValues.join(', ')}`,
              ],
            }
          : product.evidence,
    };
  }
  const barcode = lookupValues[0]!;
  return {
    candidate: {
      ...candidate,
      ean: barcode,
      eanRaw: barcode,
      insert: { ...candidate.insert, ean_code: barcode },
    },
    evidence: {
      ...product.evidence,
      fields: { ...product.evidence.fields, barcode: 'barcode_registry' },
      validatedBarcode: true,
    },
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
  ownerClassifications?: ReadonlyMap<number, OwnerProductClassification>;
}) {
  const enrichedByRow = new Map(input.enrichedProducts.map((row) => [row.rowIndex, row] as const));
  const candidateResults = input.candidates.map((candidate) => {
    const product = enrichedByRow.get(candidate.rowIndex);
    return product
      ? candidateWithResearchedBarcode(candidate, product)
      : { candidate, evidence: null };
  });
  const reassessmentCandidates = candidateResults.map((result) => result.candidate);
  const candidatesByRow = new Map(
    reassessmentCandidates.map((row) => [row.rowIndex, row] as const),
  );
  const evidenceByRow = new Map(
    candidateResults.flatMap((result) =>
      result.evidence ? [[result.candidate.rowIndex, result.evidence] as const] : [],
    ),
  );
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
        evidenceByRow.get(rowIndex) ?? product.evidence,
      ),
    );
  }
  return runIntimportLocalIntelligence(
    reassessmentCandidates,
    {},
    input.mapper,
    input.semanticClassifications ?? new Map(),
    recognitionEvidence,
    overrides,
    input.ownerClassifications ?? new Map(),
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
      finalRoute,
      autoImportEligible: isAutoImportEligible(assessment),
    };
  };

  // Bounded worker pool — never hundreds of simultaneous requests.
  const queue = [...rows];
  const workers = Array.from({ length: Math.max(1, caps.concurrency) }, async () => {
    for (;;) {
      const row = queue.shift();
      if (!row) return;
      const { intelligence } = row;

      if (intelligence.route === 'EXISTING') {
        results.push(
          settle(row, intelligence.assessment.confidence, {
            webSkippedReason: 'Istniejący produkt kanoniczny — brak potrzeby wyszukiwania',
          }),
        );
      } else if (
        intelligence.assessment.confidence >= NO_WEB_CONFIDENCE &&
        intelligence.productionAccuracy.gellattiReadiness.ready
      ) {
        // The hard cost rule applies only after the shared readiness authority
        // confirms that local evidence really suffices. A high legacy evidence
        // score must not suppress research for an unresolved Engine-critical gap.
        results.push(
          settle(row, intelligence.assessment.confidence, {
            webSkippedReason: `lokalna pewność ≥${NO_WEB_CONFIDENCE}% — wyszukiwanie zbędne`,
          }),
        );
      } else if (intelligence.enrichmentTargets.length === 0) {
        results.push(
          settle(row, intelligence.assessment.confidence, {
            webSkippedReason: 'Brak pól, które wyszukiwanie mogłoby uzupełnić',
          }),
        );
      } else if (capExhausted()) {
        capReached = true;
        results.push(
          settle(row, intelligence.assessment.confidence, {
            webSkippedReason: 'Osiągnięto limit wywołań/kosztu importu',
          }),
        );
      } else {
        const productKey = enrichmentCacheKey(intelligence, row.barcode);
        let currentEvidence = row.evidence ?? intelligence.evidence;
        let recognitionEvidence = intelligence.recognitionEvidence;
        const appliedFacts: EnrichmentFact[] = [];
        const evidenceReceipts = new Set(intelligence.enrichmentEvidenceReceipts);
        let productCalls = 0;
        let productCacheHit = false;
        let serverCapReached = false;

        // Execute the existing strongest-first research plan. Preparing this
        // plan without consuming its later steps made a first-source miss look
        // terminal even when an official domain/retailer fallback was already
        // available. Three bounded steps are enough to preserve the cap and
        // still honour "try the next source".
        for (
          let researchStepIndex = 0;
          researchStepIndex < MAX_CALLS_PER_PRODUCT;
          researchStepIndex += 1
        ) {
          const remaining = intelligence.enrichmentTargets.filter(
            (field) => !currentEvidence.fields[field],
          );
          if (remaining.length === 0 || capExhausted()) break;
          const key = `${productKey}|step:${researchStepIndex}|fields:${[...remaining].sort().join(',')}`;
          const cached = cache.get(key);
          const response =
            cached ??
            (await provider({
              cacheKey: key,
              rowIndex: intelligence.rowIndex,
              displayName: intelligence.displayName,
              brand: intelligence.researchIdentity.brand,
              barcode: row.barcode,
              fields: remaining,
              researchStepIndex,
            }));
          if (response.capReached) {
            capReached = true;
            serverCapReached = true;
            break;
          }
          if (cached) {
            cacheHits += 1;
            productCacheHit = true;
          } else {
            cache.set(key, response);
            callsUsed += response.calls;
            spendUsd += response.estimatedCostUsd ?? 0;
            productCalls += response.calls;
          }
          if (response.evidenceReceipt) evidenceReceipts.add(response.evidenceReceipt);
          const merged = mergeFacts(currentEvidence, response.facts);
          currentEvidence = merged.evidence;
          appliedFacts.push(...merged.applied);
          recognitionEvidence = mergeSemanticFacts(recognitionEvidence, merged.applied);
          if (assessProductConfidence(currentEvidence).criticalReadiness) break;
        }

        webAttempted += 1;
        const assessment = assessProductConfidence(currentEvidence);
        results.push(
          settle(row, assessment.confidence, {
            evidence: currentEvidence,
            assessment,
            webAttempted: true,
            webSkippedReason: serverCapReached
              ? 'Osiągnięto serwerowy limit wywołań importu'
              : null,
            callsUsed: productCalls,
            cacheHit: productCacheHit,
            appliedFacts,
            recognitionEvidence,
            recognition: classifyProductSemantics(recognitionEvidence),
            enrichmentEvidenceReceipts: [...evidenceReceipts],
          }),
        );
      }

      onProgress?.({
        processed: results.length,
        total: rows.length,
        webAttempted,
        callsUsed,
        spendUsd,
      });
    }
  });
  await Promise.all(workers);

  results.sort((left, right) => left.rowIndex - right.rowIndex);
  const count = (route: EnrichmentRoute) =>
    results.filter((row) => row.finalRoute === route).length;

  return {
    products: results,
    summary: {
      products: results.length,
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
