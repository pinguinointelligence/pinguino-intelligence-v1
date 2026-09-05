/**
 * SCAN CORE ↔ SCAN IMPORT 2.0 — the shared contract package.
 *
 * The only thing the two modules share. No runtime dependencies, no imports from either module.
 * Scan Core emits a `ScanObservation` (src/scan-core/observation.ts on claude/scan-core-phase-0);
 * `fromScanCoreObservation` turns a COMPLETE, verified one into a `ConfirmedScan`. Scan Import 2.0
 * consumes `ConfirmedScan` only. Nothing here knows about products, countries, prices or Mapper.
 */

/** Symbologies Scan Core reports from the actual decoder string — never inferred from digit count. */
export type ConfirmedSymbology = 'EAN-13' | 'EAN-8' | 'UPC-A' | 'UPC-E';

export interface ConfirmedScan {
  /** Decoder-reported symbology as normalised by Scan Core; 'unknown' is passed through and rejected downstream. */
  symbology: ConfirmedSymbology | 'unknown';
  /** Digits as confirmed by Scan Core (checksum-valid according to the decoder). Re-validated downstream. */
  value: string;
  /** Decoder text before digit normalisation, when Scan Core had it. */
  rawValue?: string;
  confirmation: {
    lane: 'fast' | 'consensus';
    agreeingFrames: number;
    /** provenance of the agreeing reads: 'native' | 'medium' | 'rescue' | 'rectified' */
    sources: readonly string[];
  };
  evidence: {
    moduleNative: number | null;
    fill: number | null;
    /** reads of these digits also arrived with another symbology on the same track */
    mixedFormats: boolean;
  };
  timing: { firstSeenAt: number; completedAt: number };
  provenance: { trackId: string; harnessBuild: string | null };
}

/** Structural shape of Scan Core's `ScanObservation` (kept in sync by the end-to-end fixture test). */
export interface ScanCoreObservationLike {
  trackId: string;
  kind: 'barcode';
  state: 'READING' | 'COMPLETE';
  barcode: {
    format: string;
    value?: string;
    rawValue?: string;
    verified: boolean;
    agreeingFrames: number;
    lane: 'fast' | 'consensus' | null;
    sources: readonly string[];
    moduleNative: number | null;
    fill: number | null;
    lineCounts: readonly number[];
  };
  bestFrames: readonly number[];
  timing: { firstSeenAt: number; completedAt?: number; framesObserved: number };
  reasons: readonly string[];
}

const SYMBOLOGIES: ReadonlySet<string> = new Set(['EAN-13', 'EAN-8', 'UPC-A', 'UPC-E']);

/**
 * Only a COMPLETE, verified observation with a value and a confirmation lane becomes a ConfirmedScan.
 * Everything else is Scan Core's business (guidance, retries) and never crosses the boundary.
 */
export function fromScanCoreObservation(
  obs: ScanCoreObservationLike,
  harnessBuild: string | null = null,
): ConfirmedScan | null {
  if (obs.kind !== 'barcode' || obs.state !== 'COMPLETE') return null;
  const b = obs.barcode;
  if (!b.verified || !b.value || !b.lane) return null;
  return {
    symbology: SYMBOLOGIES.has(b.format) ? (b.format as ConfirmedSymbology) : 'unknown',
    value: b.value,
    ...(b.rawValue ? { rawValue: b.rawValue } : {}),
    confirmation: { lane: b.lane, agreeingFrames: b.agreeingFrames, sources: [...b.sources] },
    evidence: {
      moduleNative: b.moduleNative,
      fill: b.fill,
      mixedFormats: obs.reasons.includes('mixed_formats'),
    },
    timing: {
      firstSeenAt: obs.timing.firstSeenAt,
      completedAt: obs.timing.completedAt ?? obs.timing.firstSeenAt,
    },
    provenance: { trackId: obs.trackId, harnessBuild },
  };
}
