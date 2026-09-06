/**
 * Scan Core — adaptive path policy (Phase 1 design §3). Pure, per frame, deterministic.
 * Every threshold cites the Phase 0 corpus table it was derived from
 * (reports/scan-core-phase-1/P1_CORPUS_ANALYSIS_2026-09-04.md).
 */
import { moduleNativePx, planeSizes, type CameraProfile } from './profile';

export type ScanPath =
  | 'SKIP_NO_CANDIDATE'
  | 'SKIP_BLUR'
  | 'LOW_MEDIUM'
  | 'NATIVE_ROI'
  | 'FAR_NATIVE_ROI'
  | 'RESCUE_FULL';

export type Guidance =
  | 'none'
  | 'hold_steady'
  | 'move_closer'
  | 'move_away'
  | 'aim_in_frame'
  | 'improve_light'
  | 'camera_inadequate';

export const THRESHOLDS = {
  /** table 4: < 0.5 × session median → 13–15 % success; ≥ 1.0 → 66–71 % */
  blurRel: 0.5,
  /** table 3: native cheap 0 % above fill 0.5, 42 % at 0.35–0.5; harder-with-downscale 40 % → decode close codes on the MEDIUM plane */
  largeFill: 0.35,
  /** table 2: ≤ 1.5 px modules → 27 % success and 15 % wrong reads; 2 px → 69 % / 0.35 % */
  farModulePx: 1.7,
  /** table 7: stability ≥ 0.2 → 33 % success vs 59 % when ≤ 0.02 */
  motionStab: 0.2,
  motionResume: 0.1,
  /** decision package §Locate: rescue full-frame pass at low duty (≈3/s at 30 fps), never every frame */
  rescueEveryN: 10,
  /** table 3: ROI 0 % below fill 0.12 with a 12 % margin → wider margin for small candidates */
  wideMarginBelowFill: 0.2,
  marginNarrow: 0.15,
  marginWide: 0.25,
  lostMs: 500,
  blurGuidanceMs: 500,
  noCandidateGuidanceMs: 1500,
  inadequateAfterMs: 10000,
  /** thermal: worker busy above this share halves the rescue cadence and drops harder retries */
  dutyBudget: 0.5,
  /** low-light / glare guidance (corpus low-light + glare scenes; not yet a decode gate) */
  darkMeanLuma: 60,
  glareClipRatio: 0.05,
} as const;

export interface Candidate {
  /** width / source width */
  fill: number;
  widthPx: number;
  heightPx: number;
  angleDeg: number;
  cx: number;
  cy: number;
}

export interface FrameSignals {
  frameIndex: number;
  tMs: number;
  candidate: Candidate | null;
  /** Laplacian variance of the frame (or candidate region) on the LOW plane */
  sharpness: number;
  meanLuma: number;
  clippedRatio: number;
  /** worker busy share over the last ~2 s, 0..1 */
  workerDuty: number;
  zoomApplied: boolean;
}

export interface Roi {
  x: number;
  y: number;
  w: number;
  h: number;
  plane: 'medium' | 'native';
}

export interface Decision {
  path: ScanPath;
  reason: string;
  roi: Roi | null;
  /** harder options on the crop (after repeated misses or in the FAR regime) */
  harder: boolean;
  fill: number | null;
  moduleNative: number | null;
  sharpRel: number | null;
  stab: number | null;
  guidance: Guidance;
  /** ask the camera layer for zoom ×2 (only if the profile exposes zoom and the probe approved it) */
  requestZoom: boolean;
}

export class PolicyState {
  private readonly sharpWindow: number[] = [];
  private lastCandidate: Candidate | null = null;
  private lastCandidateAt = -Infinity;
  private blurSince: number | null = null;
  private noCandidateSince: number | null = null;
  private framesSinceRescue = 0;
  private missesOnStable = 0;
  private farSince: number | null = null;
  private lastFill: number | null = null;

  constructor(
    readonly profile: CameraProfile,
    readonly zoomApproved = false,
  ) {
    if (profile.startSharpness) this.sharpWindow.push(profile.startSharpness);
  }

  /** Running median of sharpness over candidate frames (bounded window, table 4 normalisation). */
  private sharpMedian(): number | null {
    if (this.sharpWindow.length === 0) return null;
    const s = [...this.sharpWindow].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)] ?? null;
  }

  private pushSharp(v: number): void {
    this.sharpWindow.push(v);
    if (this.sharpWindow.length > 60) this.sharpWindow.shift();
  }

  /** Report a decode miss on the current stable candidate (drives the cheap→harder escalation). */
  noteMiss(): void {
    this.missesOnStable += 1;
  }
  noteHit(): void {
    this.missesOnStable = 0;
  }

  decide(f: FrameSignals): Decision {
    const p = this.profile;
    const planes = planeSizes(p);
    const c = f.candidate;
    const base: Decision = {
      path: 'SKIP_NO_CANDIDATE',
      reason: '',
      roi: null,
      harder: false,
      fill: c ? c.fill : null,
      moduleNative: c ? moduleNativePx(c.fill, p.sourceW) : null,
      sharpRel: null,
      stab: null,
      guidance: 'none',
      requestZoom: false,
    };
    this.framesSinceRescue += 1;

    if (!c) {
      this.noCandidateSince ??= f.tMs;
      this.blurSince = null;
      const lost = f.tMs - this.lastCandidateAt > THRESHOLDS.lostMs;
      if (lost) this.lastCandidate = null;
      const cadence =
        f.workerDuty > THRESHOLDS.dutyBudget
          ? THRESHOLDS.rescueEveryN * 2
          : THRESHOLDS.rescueEveryN;
      // a large candidate that just vanished together with sharpness = too close for this lens (D1/D2 12 cm)
      const med = this.sharpMedian();
      const tooClose =
        this.lastFill !== null &&
        this.lastFill > 0.3 &&
        f.tMs - this.lastCandidateAt <= 1500 &&
        med !== null &&
        f.sharpness < THRESHOLDS.blurRel * med;
      const guidance: Guidance = tooClose
        ? 'move_away'
        : f.tMs - this.noCandidateSince > THRESHOLDS.noCandidateGuidanceMs
          ? 'aim_in_frame'
          : 'none';
      if (this.framesSinceRescue >= cadence) {
        this.framesSinceRescue = 0;
        return {
          ...base,
          path: 'RESCUE_FULL',
          reason: `no candidate; scheduled full-frame pass on the MEDIUM plane every ${cadence} frames`,
          roi: { x: 0, y: 0, w: planes.medium.w, h: planes.medium.h, plane: 'medium' },
          harder: true,
          guidance,
        };
      }
      return {
        ...base,
        reason: tooClose ? 'no candidate after a large blurred one: too close' : 'no candidate',
        guidance,
      };
    }

    this.noCandidateSince = null;
    // stability vs the previous candidate (table 7 metric)
    let stab: number | null = null;
    if (this.lastCandidate && f.tMs - this.lastCandidateAt <= THRESHOLDS.lostMs) {
      const lc = this.lastCandidate;
      stab =
        Math.abs(c.widthPx - lc.widthPx) / Math.max(1, c.widthPx) +
        Math.hypot(c.cx - lc.cx, c.cy - lc.cy) / Math.max(1, p.sourceW);
    }
    this.lastCandidate = c;
    this.lastCandidateAt = f.tMs;
    this.lastFill = c.fill;

    this.pushSharp(f.sharpness);
    const med = this.sharpMedian();
    const sharpRel = med && med > 0 ? f.sharpness / med : null;
    const moduleNative = moduleNativePx(c.fill, p.sourceW);
    const out: Decision = { ...base, sharpRel, stab, moduleNative };

    const light: Guidance =
      f.meanLuma < THRESHOLDS.darkMeanLuma
        ? 'improve_light'
        : f.clippedRatio > THRESHOLDS.glareClipRatio
          ? 'improve_light'
          : 'none';

    if (sharpRel !== null && sharpRel < THRESHOLDS.blurRel) {
      this.blurSince ??= f.tMs;
      // without autofocus there is nothing to wait for: guide at once (design §10)
      const persistent =
        p.autofocus === false || f.tMs - this.blurSince > THRESHOLDS.blurGuidanceMs;
      let guidance: Guidance = 'none';
      if (persistent)
        guidance =
          p.autofocus === false
            ? c.fill > 0.3
              ? 'move_away'
              : 'move_closer'
            : c.fill > 0.3
              ? 'move_away'
              : 'hold_steady';
      return {
        ...out,
        path: 'SKIP_BLUR',
        reason: `sharpness ${sharpRel.toFixed(2)}× median < ${THRESHOLDS.blurRel} (table 4)`,
        guidance,
      };
    }
    this.blurSince = null;

    // instability (table 7: 33 % vs 59 % success) is a MODIFIER: the crop is still decoded on the plane the
    // fill selects (≤ 2 ms), but no harder retry, no zoom request and no escalation while the candidate jitters
    const unstable = stab !== null && stab >= THRESHOLDS.motionStab;
    if (unstable) this.missesOnStable = 0;

    if (c.fill >= THRESHOLDS.largeFill) {
      this.farSince = null;
      const roi = this.cropOn(
        c,
        planes.medium.factor,
        planes.medium.w,
        planes.medium.h,
        THRESHOLDS.marginNarrow,
        'medium',
      );
      // SOL-042: the close-up path is exactly where a customer holding a can to the lens lands, and
      // it was the ONE path with no escalation at all — `harder: false` unconditionally, so zxing's
      // own rotation ladder was never reached however many times the read missed. It now gets the
      // same two-miss rung NATIVE_ROI already has.
      const harderMedium = !unstable && this.missesOnStable >= 2;
      return {
        ...out,
        path: 'LOW_MEDIUM',
        reason: `fill ${c.fill.toFixed(2)} ≥ ${THRESHOLDS.largeFill}: module ${(moduleNative / planes.medium.factor).toFixed(1)} px on MEDIUM${harderMedium ? ', harder after 2 misses' : ''} (table 3)`,
        roi,
        harder: harderMedium,
        guidance: light,
      };
    }

    if (moduleNative < THRESHOLDS.farModulePx) {
      this.farSince ??= f.tMs;
      const roi = this.cropOn(c, 1, p.sourceW, p.sourceH, THRESHOLDS.marginWide, 'native');
      const canZoom = !unstable && this.zoomApproved && (p.zoomMax ?? 1) >= 2 && !f.zoomApplied;
      const tooLong = f.tMs - this.farSince > THRESHOLDS.inadequateAfterMs;
      return {
        ...out,
        path: 'FAR_NATIVE_ROI',
        reason: `module ${moduleNative.toFixed(2)} px < ${THRESHOLDS.farModulePx} (table 2: 15 % wrong reads at ≤ 1.5 px): native crop, harder, slow lane${unstable ? '; unstable' : ''}`,
        roi,
        harder: !unstable,
        requestZoom: canZoom,
        guidance:
          tooLong && !canZoom
            ? f.zoomApplied
              ? 'camera_inadequate'
              : 'move_closer'
            : canZoom
              ? 'none'
              : 'move_closer',
      };
    }

    this.farSince = null;
    const margin =
      c.fill < THRESHOLDS.wideMarginBelowFill ? THRESHOLDS.marginWide : THRESHOLDS.marginNarrow;
    const roi = this.cropOn(c, 1, p.sourceW, p.sourceH, margin, 'native');
    const harder = !unstable && this.missesOnStable >= 2;
    return {
      ...out,
      path: 'NATIVE_ROI',
      reason: `fill ${c.fill.toFixed(2)}, module ${moduleNative.toFixed(1)} px: native crop, margin ${margin}${harder ? ', harder after 2 misses' : ''}${unstable ? '; unstable' : ''} (tables 2–3)`,
      roi,
      harder,
      guidance: light !== 'none' ? light : unstable ? 'hold_steady' : 'none',
    };
  }

  /**
   * SOL-042. The decode crop must be the candidate's box PROJECTED onto the image axes, not its
   * width pasted onto X and its height onto Y.
   *
   * `widthPx` is the code's length along its OWN reading axis and `heightPx` its bar height. Using
   * them as x/y extents is only correct while that axis happens to be horizontal. For a code held
   * vertically the box came out transposed — a short, wide slice ACROSS the middle of a tall code —
   * so the crop handed to the decoder contained bars but neither guard pattern. Nothing downstream
   * could recover from that: no decoder option, no rotation, no rescue. It is why turning the can
   * until the digits sat at the bottom "fixed" scanning — that is the act of bringing the reading
   * axis back to horizontal, and it is why the failure has a period of 90 degrees, not 180.
   *
   * The projection below is exactly the one `candidateBox` in quality.ts already uses, and it is a
   * no-op at 0 degrees (cos=1, sin=0), so a horizontal code crops byte-identically to before.
   */
  private cropOn(
    c: Candidate,
    factor: number,
    planeW: number,
    planeH: number,
    margin: number,
    plane: Roi['plane'],
  ): Roi {
    const w = c.widthPx / factor;
    const h = Math.max(c.heightPx / factor, w * 0.25);
    const rad = (c.angleDeg * Math.PI) / 180;
    const hw = (Math.abs(Math.cos(rad)) * w + Math.abs(Math.sin(rad)) * h) / 2;
    const hh = (Math.abs(Math.sin(rad)) * w + Math.abs(Math.cos(rad)) * h) / 2;
    const mx = hw * 2 * margin;
    const my = hh * 2 * margin;
    const x0 = Math.max(0, Math.floor(c.cx / factor - hw - mx));
    const y0 = Math.max(0, Math.floor(c.cy / factor - hh - my));
    const x1 = Math.min(planeW, Math.ceil(c.cx / factor + hw + mx));
    const y1 = Math.min(planeH, Math.ceil(c.cy / factor + hh + my));
    return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0), plane };
  }
}
