/**
 * LIVE SCANNER — the continuous multi-product session.
 *
 * This is the one piece the existing Scanner genuinely did not have. Everything about
 * FRAMES is already solved and is reused untouched: `liveFrameSource` drives the loop,
 * `scoreRgbaFrame` grades each frame, `RollingBestFrameWindow` keeps the best one, and
 * the local barcode stack decodes without `BarcodeDetector` (which Safari does not
 * expose). What was missing is the SESSION: the existing scanner resolves exactly one
 * product per mount and then spends its effort completing that product's nutrition,
 * ingredients and allergens.
 *
 * The fast path is IDENTIFICATION, not profiling. A recognised product is matched
 * against the catalogue and accepted; the deep profiling flow stays where it is and is
 * handed the genuinely unknown ones. Neither authority is duplicated.
 *
 * PURE. No camera, no network, no React, no clock of its own — every input arrives as an
 * observation with its own timestamp, so the whole acceptance policy is testable without
 * a browser.
 */
import type { FrameQuality } from './frameQuality';

/** Which authority produced an observation. Tracked so cost per scan is measurable. */
export type ScanRoute =
  | 'LOCAL_BARCODE'
  | 'LOCAL_OCR'
  | 'CATALOG_MATCH'
  | 'VISION_FALLBACK'
  | 'UNKNOWN';

export type LiveScanEvent =
  /** The frame was not worth reading. The customer is never told to retake it. */
  | { kind: 'ignored_low_quality' }
  /** Something is there, but not yet enough to name it. */
  | { kind: 'searching' }
  /** A named candidate that has not yet earned acceptance. */
  | { kind: 'candidate'; identityKey: string; label: string; evidence: number; needed: number }
  /** GREEN. Accepted exactly once, with the best frame of the window. */
  | { kind: 'confirmed'; product: AcceptedProduct }
  /** Already in the basket and still in view — deliberately silent. */
  | { kind: 'duplicate_suppressed'; identityKey: string };

export interface ScanObservation {
  readonly at: number;
  readonly quality: FrameQuality;
  /** A validated barcode. Presence alone is not enough — see `barcodeValidated`. */
  readonly barcode?: string | null;
  /** True only when the barcode passed checksum/format validation. */
  readonly barcodeValidated?: boolean;
  /** Stable identity for the recognised thing, e.g. a catalogue id or `ean:123…`. */
  readonly identityKey?: string | null;
  readonly label?: string | null;
  readonly route: ScanRoute;
  /** 0..1 for the recognition routes. Ignored for a validated barcode. */
  readonly confidence?: number;
}

export interface AcceptedProduct {
  readonly identityKey: string;
  readonly label: string;
  readonly route: ScanRoute;
  readonly acceptedAt: number;
  /** How many qualifying observations backed the decision. */
  readonly evidence: number;
  /** True when the product still needs the deep Scanner/contribution flow. */
  readonly needsDeepScan: boolean;
}

export interface LiveScanSessionState {
  readonly accepted: readonly AcceptedProduct[];
  /** Recent qualifying observations per identity, newest last. */
  readonly evidence: Readonly<Record<string, readonly number[]>>;
  /** When each identity was accepted, for the cooldown. */
  readonly acceptedAt: Readonly<Record<string, number>>;
  readonly counters: Readonly<Record<ScanRoute, number>>;
}

/**
 * A validated barcode is an exact identity, so it locks on the first qualifying frame.
 * Everything else has to hold still: a single frame of a recognition model is exactly
 * the weak guess the owner ruled out.
 */
export const BARCODE_EVIDENCE_REQUIRED = 1;
export const RECOGNITION_EVIDENCE_REQUIRED = 3;
/** Below this a recognition observation is not even counted as evidence. */
export const RECOGNITION_CONFIDENCE_FLOOR = 0.7;
/** Evidence older than this no longer supports acceptance — the phone has moved on. */
export const EVIDENCE_WINDOW_MS = 2_500;
/** How long an accepted product stays suppressed while it is still in view. */
export const DUPLICATE_COOLDOWN_MS = 8_000;

const EMPTY_COUNTERS: Record<ScanRoute, number> = {
  LOCAL_BARCODE: 0,
  LOCAL_OCR: 0,
  CATALOG_MATCH: 0,
  VISION_FALLBACK: 0,
  UNKNOWN: 0,
};

export const emptyLiveScanSession = (): LiveScanSessionState => ({
  accepted: [],
  evidence: {},
  acceptedAt: {},
  counters: { ...EMPTY_COUNTERS },
});

/** A validated barcode is trusted; anything else must clear the confidence floor. */
const qualifies = (observation: ScanObservation): boolean => {
  if (observation.barcodeValidated === true) return true;
  return (observation.confidence ?? 0) >= RECOGNITION_CONFIDENCE_FLOOR;
};

const evidenceRequired = (observation: ScanObservation): number =>
  observation.barcodeValidated === true ? BARCODE_EVIDENCE_REQUIRED : RECOGNITION_EVIDENCE_REQUIRED;

/**
 * Fold one observation into the session.
 *
 * Returns the next state and what the customer should see. The caller decides what to do
 * with the event — turn the outline green, keep the reticle searching, say nothing.
 */
export function observeFrame(
  state: LiveScanSessionState,
  observation: ScanObservation,
): { readonly state: LiveScanSessionState; readonly event: LiveScanEvent } {
  // A frame the optics cannot support is dropped in silence. This is the rule that
  // replaces "bad photo, try again": the scanner simply waits for a better frame.
  if (!observation.quality.acceptableForAutoCapture) {
    return { state, event: { kind: 'ignored_low_quality' } };
  }

  const identityKey = observation.identityKey ?? null;
  if (identityKey === null || identityKey === '') {
    return { state, event: { kind: 'searching' } };
  }

  // Still in the basket and still in view: say nothing, add nothing.
  const acceptedAt = state.acceptedAt[identityKey];
  if (acceptedAt !== undefined && observation.at - acceptedAt < DUPLICATE_COOLDOWN_MS) {
    return { state, event: { kind: 'duplicate_suppressed', identityKey } };
  }

  const counters: Record<ScanRoute, number> = {
    ...state.counters,
    [observation.route]: (state.counters[observation.route] ?? 0) + 1,
  };

  if (!qualifies(observation)) {
    // Counted for cost, but too weak to be evidence.
    return { state: { ...state, counters }, event: { kind: 'searching' } };
  }

  const fresh = (state.evidence[identityKey] ?? []).filter(
    (at) => observation.at - at < EVIDENCE_WINDOW_MS,
  );
  const timestamps = [...fresh, observation.at];
  const needed = evidenceRequired(observation);
  const label = observation.label ?? identityKey;

  if (timestamps.length < needed) {
    return {
      state: { ...state, counters, evidence: { ...state.evidence, [identityKey]: timestamps } },
      event: { kind: 'candidate', identityKey, label, evidence: timestamps.length, needed },
    };
  }

  const product: AcceptedProduct = {
    identityKey,
    label,
    route: observation.route,
    acceptedAt: observation.at,
    evidence: timestamps.length,
    // An identified-but-unmatched product is where the EXISTING deep Scanner takes over.
    needsDeepScan: observation.route === 'UNKNOWN',
  };

  return {
    state: {
      accepted: [...state.accepted, product],
      // Evidence is spent on acceptance, so re-entry starts from zero.
      evidence: { ...state.evidence, [identityKey]: [] },
      acceptedAt: { ...state.acceptedAt, [identityKey]: observation.at },
      counters,
    },
    event: { kind: 'confirmed', product },
  };
}

/** Remove one product from the review list, and let it be scanned again immediately. */
export function removeAccepted(
  state: LiveScanSessionState,
  identityKey: string,
): LiveScanSessionState {
  // Dropping the cooldown entry is the point: a removed product must be scannable
  // again at once, not after the suppression window.
  const acceptedAt = Object.fromEntries(
    Object.entries(state.acceptedAt).filter(([key]) => key !== identityKey),
  );
  return {
    ...state,
    accepted: state.accepted.filter((p) => p.identityKey !== identityKey),
    acceptedAt,
  };
}

/** The products that still need the deep Scanner before they can enter a recipe. */
export const unresolvedProducts = (state: LiveScanSessionState): readonly AcceptedProduct[] =>
  state.accepted.filter((p) => p.needsDeepScan);
