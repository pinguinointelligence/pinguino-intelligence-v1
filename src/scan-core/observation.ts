/**
 * Scan Core boundary (audit §8.2, adapted): the only thing Scan Core emits. Symbology comes from the
 * decoder, never from digit count. No product identity, catalog, price, nutrition, Mapper, Solver or recipe
 * data — Scan Import consumes this later, after its own audit.
 */
export type BarcodeFormat = 'EAN-13' | 'EAN-8' | 'UPC-A' | 'UPC-E' | 'unknown';

/** zxing-wasm format strings → contract symbology. Anything else is 'unknown' (never guessed from length). */
export function formatFromDecoder(decoderFormat: string): BarcodeFormat {
  switch (decoderFormat.replace(/[-_\s]/g, '').toUpperCase()) {
    case 'EAN13':
      return 'EAN-13';
    case 'EAN8':
      return 'EAN-8';
    case 'UPCA':
      return 'UPC-A';
    case 'UPCE':
      return 'UPC-E';
    default:
      return 'unknown';
  }
}

export interface BarcodeEvidenceSummary {
  format: BarcodeFormat;
  /** present only when verified */
  value?: string;
  verified: boolean;
  agreeingFrames: number;
  lane: 'fast' | 'consensus' | null;
  /** provenance of the agreeing reads: 'native' | 'medium' | 'rescue' | 'rectified' */
  sources: string[];
  moduleNative: number | null;
  fill: number | null;
  lineCounts: number[];
}

export interface ScanObservation {
  trackId: string;
  kind: 'barcode';
  state: 'READING' | 'COMPLETE';
  barcode: BarcodeEvidenceSummary;
  /** frame indices of the best retained crops (the worker owns the pixels) */
  bestFrames: number[];
  timing: { firstSeenAt: number; completedAt?: number; framesObserved: number };
  reasons: string[];
}

export type ScanNone = {
  kind: 'none';
  reason: 'no_candidate' | 'blur' | 'too_far' | 'camera_inadequate' | 'timeout';
};
