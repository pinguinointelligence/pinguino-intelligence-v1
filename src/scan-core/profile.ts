/**
 * Scan Core — capability profile. One architecture on every client; the profile parametrizes the policy.
 * Isolated: no imports from catalog, Mapper, Solver, recipes or the product scanner.
 */
export interface CameraProfile {
  formFactor: 'mobile' | 'desktop' | 'unknown';
  sourceW: number;
  sourceH: number;
  fps: number | null;
  /** capabilities.focusMode includes 'continuous'; null = not exposed. */
  autofocus: boolean | null;
  zoomMax: number | null;
  torch: boolean;
  /** Laplacian variance of a 320-px sample right after the first frame (baseline for sharpness). */
  startSharpness: number | null;
}

export interface PlaneSpec {
  w: number;
  h: number;
  /** integer downscale factor from the source */
  factor: number;
}

/** LOW = long edge ÷ 3 (never below a 320-px long edge), MEDIUM = ÷ 2, NATIVE = source. */
export function planeSizes(profile: Pick<CameraProfile, 'sourceW' | 'sourceH'>): {
  low: PlaneSpec;
  medium: PlaneSpec;
  native: PlaneSpec;
} {
  const long = Math.max(profile.sourceW, profile.sourceH);
  const lowFactor = long >= 960 ? 3 : long >= 640 ? 2 : 1;
  const medFactor = long >= 960 ? 2 : 1;
  const mk = (f: number): PlaneSpec => ({
    w: Math.floor(profile.sourceW / f),
    h: Math.floor(profile.sourceH / f),
    factor: f,
  });
  return { low: mk(lowFactor), medium: mk(medFactor), native: mk(1) };
}

/** Module width (px on the SOURCE plane) implied by a candidate's fill, assuming EAN-13 (95 modules). */
export function moduleNativePx(fill: number, sourceW: number, modules = 95): number {
  return (fill * sourceW) / modules;
}
