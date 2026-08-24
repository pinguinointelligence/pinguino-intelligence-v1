/**
 * The order in which a scan spends. Cheap, exact and free comes first; the model is
 * the last resort, not the first move.
 *
 *   barcode read locally
 *     → Gellatti's own catalogue          (free, instant, no quota)
 *     → exact GTIN lookup at the source   (one narrow server-side call)
 *     → label analysis, once              (paid)
 *     → ONE precise request for the view that is still genuinely missing
 *     → estimation through the shared Product Intelligence pipeline
 *
 * The served flow ran this backwards: it photographed, analysed, and only then
 * discovered it was missing something it could have been told for free.
 */
import type { ScanEvidenceKind, ScanEvidenceState } from './evidenceState';

export type ScanRoute =
  /** The product already exists. Nothing is analysed, nothing is charged. */
  | { kind: 'existing_product' }
  /** Keep watching the live camera; there is not enough evidence to act on. */
  | { kind: 'collect' }
  /** Ask the exact GTIN source before asking the owner for anything. */
  | { kind: 'ean_lookup' }
  | { kind: 'analyze_label'; accurateRetry: boolean }
  | { kind: 'request_evidence'; view: ScanEvidenceKind; message: string }
  /** Everything needed is present — go to the result. */
  | { kind: 'ready' }
  /**
   * The package cannot supply the rest. Continue with Product Intelligence and
   * Mapper estimation rather than asking for another photograph.
   */
  | { kind: 'estimate' };

export interface ScanRoutingInput {
  /** An exact canonical product was found for this barcode. */
  catalogMatch: boolean;
  barcode: string | null;
  /** The exact GTIN lookup has already run for this session. */
  eanLookupDone: boolean;
  /** Evidence frames held by the session. */
  frameCount: number;
  /** Frames the last analysis actually saw. */
  analyzedFrameCount: number;
  visionCalls: number;
  maxVisionCalls: number;
  evidence: ScanEvidenceState;
}

export function routeScan(input: ScanRoutingInput): ScanRoute {
  if (input.catalogMatch) return { kind: 'existing_product' };
  // Free before paid, always: an unlooked-up GTIN is the cheapest question there is.
  if (input.barcode && !input.eanLookupDone) return { kind: 'ean_lookup' };
  // Resolved without a single model call — this is the whole point of EAN-first.
  if (input.evidence.complete) return { kind: 'ready' };
  if (input.frameCount === 0) return { kind: 'collect' };
  if (input.frameCount > input.analyzedFrameCount && input.visionCalls < input.maxVisionCalls) {
    return { kind: 'analyze_label', accurateRetry: input.visionCalls > 0 };
  }
  if (input.evidence.requestView && input.visionCalls < input.maxVisionCalls) {
    return {
      kind: 'request_evidence',
      view: input.evidence.requestView,
      message: input.evidence.requestMessage ?? '',
    };
  }
  return { kind: 'estimate' };
}

/** Everything a scan session can end as. */
export type ScanOutcome =
  | 'existing_product'
  | 'cancelled'
  | 'analysis_failed'
  | 'incomplete_awaiting_evidence'
  | 'duplicate_of_existing'
  | 'product_created';

/**
 * The owner's NEW-PRODUCT allowance is spent by ONE thing: a new canonical product
 * actually coming into existence. The owner reached „Limit analiz wykorzystany" on an
 * analysis that was itself incomplete and whose barcode recognition had failed — a
 * scan that produced nothing must charge for nothing.
 */
export function consumesNewProductAllowance(outcome: ScanOutcome): boolean {
  return outcome === 'product_created';
}

/** Whether a route is allowed to call the paid label model. */
export function routeSpendsVisionCall(route: ScanRoute): boolean {
  return route.kind === 'analyze_label';
}

/** The result card may only appear once collection has genuinely finished (§20). */
export function scanShowsResult(route: ScanRoute): boolean {
  return route.kind === 'ready' || route.kind === 'estimate' || route.kind === 'existing_product';
}
