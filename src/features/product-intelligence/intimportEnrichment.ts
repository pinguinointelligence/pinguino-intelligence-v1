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
  MAX_CALLS_PER_PRODUCT,
  type IntimportProductIntelligence,
} from './intimportIntelligence';
import type { SourceAuthorityClass } from './sourceAuthority';

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
            webSkippedReason: 'istniejący produkt kanoniczny — brak potrzeby wyszukiwania',
          }),
        );
      } else if (intelligence.assessment.confidence >= NO_WEB_CONFIDENCE) {
        // The hard cost rule: local evidence already suffices.
        results.push(
          settle(row, intelligence.assessment.confidence, {
            webSkippedReason: `lokalna pewność ≥${NO_WEB_CONFIDENCE}% — wyszukiwanie zbędne`,
          }),
        );
      } else if (intelligence.enrichmentTargets.length === 0) {
        results.push(
          settle(row, intelligence.assessment.confidence, {
            webSkippedReason: 'brak pól, które wyszukiwanie mogłoby uzupełnić',
          }),
        );
      } else if (capExhausted()) {
        capReached = true;
        results.push(
          settle(row, intelligence.assessment.confidence, {
            webSkippedReason: 'osiągnięto limit wywołań/kosztu importu',
          }),
        );
      } else {
        const key = enrichmentCacheKey(intelligence, row.barcode);
        const cached = cache.get(key);
        const response =
          cached ??
          (await provider({
            cacheKey: key,
            rowIndex: intelligence.rowIndex,
            displayName: intelligence.displayName,
            brand: intelligence.researchIdentity.brand,
            barcode: row.barcode,
            fields: intelligence.enrichmentTargets.slice(0, MAX_CALLS_PER_PRODUCT),
          }));
        if (response.capReached) {
          // A server-side spend refusal is a truthful terminal state, not an
          // exception that discards every enriched row already completed.
          capReached = true;
          results.push(
            settle(row, intelligence.assessment.confidence, {
              webSkippedReason: 'osiągnięto serwerowy limit wywołań importu',
            }),
          );
        } else {
          if (cached) cacheHits += 1;
          else {
            cache.set(key, response);
            callsUsed += response.calls;
            spendUsd += response.estimatedCostUsd ?? 0;
          }
          webAttempted += 1;

          const { evidence, applied } = mergeFacts(
            row.evidence ?? intelligence.evidence,
            response.facts,
          );
          const assessment = assessProductConfidence(evidence);
          results.push(
            settle(row, assessment.confidence, {
              // This is the seam that used to drop the enriched evidence: the
              // assessment was replaced, but `row.intelligence.evidence` survived
              // unchanged and was later handed to the canonical ingest planner.
              evidence,
              assessment,
              webAttempted: true,
              callsUsed: cached ? 0 : response.calls,
              cacheHit: Boolean(cached),
              appliedFacts: applied,
              enrichmentEvidenceReceipts: response.evidenceReceipt
                ? [
                    ...new Set([
                      ...intelligence.enrichmentEvidenceReceipts,
                      response.evidenceReceipt,
                    ]),
                  ]
                : intelligence.enrichmentEvidenceReceipts,
            }),
          );
        }
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
