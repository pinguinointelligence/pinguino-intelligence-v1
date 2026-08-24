/**
 * The live-capture decision. One frame in, one verdict out.
 *
 * The scanner used to be a photo form: press „Zrób zdjęcie", again, again, then
 * analyse. Here the owner just turns the package in front of the camera and the
 * session keeps the few frames that are actually worth analysing — sharp, unique,
 * and each showing a surface that is still needed.
 *
 * Everything below is local. No frame reaches a model because of this module; it
 * only decides which frames are worth keeping at all (§2, §27).
 */
import type { FrameQuality } from './frameQuality';
import type { ScanEvidenceKind } from './evidenceState';

/** The view a captured frame is evidence FOR. */
export type CaptureView = ScanEvidenceKind;

export interface FrameSignals {
  quality: FrameQuality;
  /** A GTIN decoded from THIS frame, if any. */
  barcode: string | null;
  /** 64-bit difference hash — how this frame looks, cheaply. */
  hash: bigint;
  /** Fraction of the frame occupied by edges; a proxy for printed text. */
  textDensity: number;
}

export interface CapturedFrame {
  view: CaptureView;
  hash: bigint;
  score: number;
}

export interface LiveCaptureInput {
  /** Views still worth capturing, most useful first. Empty = capture nothing. */
  wanted: readonly CaptureView[];
  captured: readonly CapturedFrame[];
  /** Consecutive frames that already passed the quality gate. */
  stableFrames: number;
  signals: FrameSignals;
  /** Hard ceiling on evidence frames in one session. */
  maxFrames: number;
}

export type LiveCaptureDecision =
  | { kind: 'capture'; view: CaptureView; reason: 'barcode_read' | 'requested_view' }
  | { kind: 'hold'; reason: HoldReason; guidance: string }
  | { kind: 'duplicate' }
  | { kind: 'enough' };

export type HoldReason =
  | 'unstable'
  | 'blurred'
  | 'glare'
  | 'too_dark'
  | 'no_text'
  | 'settling';

/** Frames must be held steady this long before one is kept. */
export const STABLE_FRAMES_BEFORE_CAPTURE = 3;
/** Two frames closer than this in Hamming distance show the same thing. */
export const DUPLICATE_HAMMING_DISTANCE = 6;
/** A text surface has to actually show text before it counts as that evidence. */
export const TEXT_VIEW_DENSITY_FLOOR = 0.12;

const TEXT_VIEWS: ReadonlySet<CaptureView> = new Set<CaptureView>(['nutrition', 'ingredients']);

export const GUIDANCE: Readonly<Record<HoldReason, string>> = Object.freeze({
  unstable: 'Przytrzymaj telefon nieruchomo.',
  blurred: 'Zbliż etykietę i przytrzymaj nieruchomo.',
  glare: 'Zmniejsz odblask na etykiecie.',
  too_dark: 'Za ciemno — doświetl etykietę.',
  no_text: 'Zbliż się do napisów na etykiecie.',
  settling: 'Przytrzymaj jeszcze chwilę.',
});

export function hammingDistance(left: bigint, right: bigint): number {
  let difference = left ^ right;
  let bits = 0;
  while (difference > 0n) {
    bits += Number(difference & 1n);
    difference >>= 1n;
  }
  return bits;
}

/**
 * Difference hash of a frame, computed on a tiny grayscale grid. Two frames of the
 * same surface hash almost identically however the hand moved, which is what makes
 * „the owner is still showing the same side" cheap to recognise.
 */
export function frameHash(
  luminance: Uint8Array | readonly number[],
  width: number,
  height: number,
): bigint {
  const columns = 9;
  const rows = 8;
  let hash = 0n;
  for (let row = 0; row < rows; row += 1) {
    const y = Math.min(height - 1, Math.floor(((row + 0.5) * height) / rows));
    let previous = 0;
    for (let column = 0; column < columns; column += 1) {
      const x = Math.min(width - 1, Math.floor(((column + 0.5) * width) / columns));
      const value = luminance[y * width + x] ?? 0;
      if (column > 0) hash = (hash << 1n) | (value > previous ? 1n : 0n);
      previous = value;
    }
  }
  return hash;
}

/** Edge density of a frame — printed text raises it, a plain surface does not. */
export function textDensity(
  luminance: Uint8Array | readonly number[],
  width: number,
  height: number,
): number {
  if (width < 3 || height < 3) return 0;
  let edges = 0;
  let samples = 0;
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const center = luminance[y * width + x] ?? 0;
      const right = luminance[y * width + x + 1] ?? 0;
      const below = luminance[(y + 1) * width + x] ?? 0;
      if (Math.abs(center - right) > 34 || Math.abs(center - below) > 34) edges += 1;
      samples += 1;
    }
  }
  return samples === 0 ? 0 : edges / samples;
}

function holdReason(signals: FrameSignals, view: CaptureView | null): HoldReason | null {
  const { quality } = signals;
  if (quality.glare > 0.18) return 'glare';
  if (quality.exposure < 0.35) return 'too_dark';
  if (quality.sharpness < 0.35) return 'blurred';
  if (!quality.acceptableForAutoCapture) return 'unstable';
  if (view !== null && TEXT_VIEWS.has(view) && signals.textDensity < TEXT_VIEW_DENSITY_FLOOR)
    return 'no_text';
  return null;
}

export function liveCaptureDecision(input: LiveCaptureInput): LiveCaptureDecision {
  if (input.wanted.length === 0 || input.captured.length >= input.maxFrames) {
    return { kind: 'enough' };
  }
  // A decoded barcode is its own proof — no stability wait, no quality argument.
  // It is also the single most valuable frame in the session, because it is what
  // routes the scan to an existing product before anything is paid for.
  const barcodeWanted = input.wanted.includes('barcode');
  if (barcodeWanted && input.signals.barcode) {
    return { kind: 'capture', view: 'barcode', reason: 'barcode_read' };
  }
  const view = input.wanted.find((candidate) => candidate !== 'barcode') ?? null;
  if (view === null) {
    // Only the barcode is still wanted and this frame does not carry one.
    return { kind: 'hold', reason: 'settling', guidance: GUIDANCE.settling };
  }
  const reason = holdReason(input.signals, view);
  if (reason) return { kind: 'hold', reason, guidance: GUIDANCE[reason] };
  const duplicate = input.captured.some(
    (frame) => hammingDistance(frame.hash, input.signals.hash) <= DUPLICATE_HAMMING_DISTANCE,
  );
  // The same side of the package held in front of the lens for ten seconds is one
  // piece of evidence, not ten. It must not consume a frame slot or a model call.
  if (duplicate) return { kind: 'duplicate' };
  if (input.stableFrames + 1 < STABLE_FRAMES_BEFORE_CAPTURE) {
    return { kind: 'hold', reason: 'settling', guidance: GUIDANCE.settling };
  }
  return { kind: 'capture', view, reason: 'requested_view' };
}
