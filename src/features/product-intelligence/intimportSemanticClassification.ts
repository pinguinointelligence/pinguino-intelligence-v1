/** Bounded semantic-classifier orchestration for the explicit owner enrichment action. */
import type { IntimportProductIntelligence } from './intimportIntelligence';
import type {
  ProductSemanticClassification,
  ProductSemanticEvidence,
} from './productRecognition';

export interface SemanticClassificationRequest {
  rowIndex: number;
  evidence: ProductSemanticEvidence;
}

export interface SemanticClassificationResponse {
  classification: ProductSemanticClassification;
  calls: number;
  cacheHit: boolean;
  evidenceReceipt: string | null;
  model: string | null;
  capReached?: boolean;
  error?: string | null;
}

export type SemanticClassificationProvider = (
  request: SemanticClassificationRequest,
) => Promise<SemanticClassificationResponse>;

export interface SemanticClassificationSummary {
  products: number;
  deterministicOnly: number;
  modelAttempted: number;
  modelCalls: number;
  cacheHits: number;
  unresolved: number;
  capReached: boolean;
}

export async function runIntimportSemanticClassification(
  rows: readonly IntimportProductIntelligence[],
  provider: SemanticClassificationProvider,
  concurrency = 4,
): Promise<{
  classifications: ReadonlyMap<number, ProductSemanticClassification>;
  evidenceReceipts: ReadonlyMap<number, string>;
  summary: SemanticClassificationSummary;
}> {
  const decisions = new Map<number, ProductSemanticClassification>();
  const receipts = new Map<number, string>();
  const cache = new Map<string, Promise<SemanticClassificationResponse>>();
  const queue = [...rows];
  let deterministicOnly = 0;
  let modelAttempted = 0;
  let modelCalls = 0;
  let cacheHits = 0;
  let capReached = false;

  const workers = Array.from({ length: Math.max(1, Math.min(8, concurrency)) }, async () => {
    for (;;) {
      const row = queue.shift();
      if (!row) return;
      if (!row.recognition.modelRequired || capReached) {
        decisions.set(row.rowIndex, row.recognition);
        deterministicOnly += 1;
        continue;
      }
      modelAttempted += 1;
      const key = row.recognition.evidenceFingerprint;
      const cached = cache.get(key);
      const request = cached ?? provider({
        rowIndex: row.rowIndex,
        evidence: row.recognitionEvidence,
      });
      if (!cached) cache.set(key, request);
      const response = await request;
      if (response.capReached) {
        capReached = true;
        decisions.set(row.rowIndex, row.recognition);
        continue;
      }
      if (cached || response.cacheHit) cacheHits += 1;
      if (!cached) modelCalls += response.calls;
      const classification = response.classification;
      // The server result must be pinned to the exact evidence sent. Anything
      // else degrades to the deterministic REVIEW result.
      const accepted = classification.authority === 'PRODUCT_RECOGNITION_V2' &&
        classification.evidenceFingerprint === key
        ? classification
        : row.recognition;
      decisions.set(row.rowIndex, accepted);
      if (
        response.evidenceReceipt &&
        accepted.classificationSource === 'SERVER_MODEL' &&
        accepted.evidenceFingerprint === key
      ) receipts.set(row.rowIndex, response.evidenceReceipt);
    }
  });
  await Promise.all(workers);

  return {
    classifications: decisions,
    evidenceReceipts: receipts,
    summary: {
      products: rows.length,
      deterministicOnly,
      modelAttempted,
      modelCalls,
      cacheHits,
      unresolved: [...decisions.values()].filter((entry) => entry.modelRequired).length,
      capReached,
    },
  };
}
