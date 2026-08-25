/** Bounded semantic-classifier orchestration for the explicit owner enrichment action. */
import type { IntimportProductIntelligence } from './intimportIntelligence';
import type {
  ProductSemanticClassification,
  ProductSemanticEvidence,
  ProductSemanticValidationError,
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
  validationErrors?: ProductSemanticValidationError[];
  repairAttempted?: boolean;
  repairAccepted?: boolean;
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
  runStatus: 'COMPLETED' | 'PAUSED_BUDGET';
  processed: number;
  pending: number;
  nextRowIndex: number | null;
  rejectedWithDiagnostics: number;
  repairAttempted: number;
  repairAccepted: number;
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
  const cache = new Map<string, SemanticClassificationResponse>();
  let deterministicOnly = 0;
  let modelAttempted = 0;
  let modelCalls = 0;
  let cacheHits = 0;
  let capReached = false;
  let rejectedWithDiagnostics = 0;
  let repairAttempted = 0;
  let repairAccepted = 0;
  void concurrency; // sequence is deliberate: an emergency pause has an exact resume cursor

  for (const row of rows) {
    if (!row.recognition.modelRequired) {
      decisions.set(row.rowIndex, row.recognition);
      deterministicOnly += 1;
      continue;
    }
    modelAttempted += 1;
    const key = row.recognition.evidenceFingerprint;
    const cached = cache.get(key);
    const response = cached ?? await provider({ rowIndex: row.rowIndex, evidence: row.recognitionEvidence });
    if (response.capReached) {
      capReached = true;
      break; // neither this row nor untouched rows receive a fabricated final decision
    }
    if (!cached) cache.set(key, response);
    if (cached || response.cacheHit) cacheHits += 1;
    if (!cached) modelCalls += response.calls;
    if (response.validationErrors?.length) rejectedWithDiagnostics += 1;
    if (response.repairAttempted) repairAttempted += 1;
    if (response.repairAccepted) repairAccepted += 1;
    const classification = response.classification;
    const accepted =
      classification.authority === 'PRODUCT_RECOGNITION_V2' &&
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
      runStatus: capReached ? 'PAUSED_BUDGET' : 'COMPLETED',
      processed: decisions.size,
      pending: rows.length - decisions.size,
      nextRowIndex: decisions.size < rows.length ? rows[decisions.size]?.rowIndex ?? null : null,
      rejectedWithDiagnostics,
      repairAttempted,
      repairAccepted,
    },
  };
}
