/**
 * Scan Core boundary: the only thing Scan Core emits. No product identity, catalog, price, nutrition,
 * Mapper, Solver or recipe data — Scan Import consumes this later, after its own audit.
 */
export type ScanObservation =
  | {
      kind: 'barcode';
      value: string;
      format: 'EAN13' | 'EAN8' | 'UPCA' | 'UPCE' | 'unknown';
      confirmedAt: number;
      lane: 'fast' | 'slow';
      evidence: {
        frames: number[];
        agreeing: number;
        moduleNative: number | null;
        fill: number | null;
      };
    }
  | { kind: 'none'; reason: 'no_candidate' | 'blur' | 'too_far' | 'camera_inadequate' | 'timeout' };

export function formatOf(text: string): Extract<ScanObservation, { kind: 'barcode' }>['format'] {
  if (/^\d{13}$/.test(text)) return 'EAN13';
  if (/^\d{8}$/.test(text)) return 'EAN8';
  if (/^\d{12}$/.test(text)) return 'UPCA';
  return 'unknown';
}
