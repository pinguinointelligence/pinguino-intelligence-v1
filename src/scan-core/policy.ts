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
  /**
   * Dimensions of the plane the worker actually holds this frame. The profile's own sourceW/H come from
   * `track.getSettings()`, which on a portrait phone reports the sensor's LANDSCAPE dimensions while the
   * frames arrive portrait — clamping an ROI against the transposed pair floored the crop to nothing
   * (owner QA 2026-09-06). Defaults to the profile when the caller has nothing better.
   */
  sourceW?: number;
  sourceH?: number;
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
    // the frame in hand, never the (possibly transposed) profile settings
    const sourceW = f.sourceW && f.sourceW > 0 ? f.sourceW : p.sourceW;
    const sourceH = f.sourceH && f.sourceH > 0 ? f.sourceH : p.sourceH;
    const planes = planeSizes({ sourceW, sourceH });
    const c = f.candidate;
    const base: Decision = {
      path: 'SKIP_NO_CANDIDATE',
      reason: '',
      roi: null,
      harder: false,
      fill: c ? c.fill : null,
      moduleNative: c ? moduleNativePx(c.fill, sourceW) : null,
      sharpRel: null,
      stab: null,
      guidance: 'none',
      requestZoom: false,
    };
    this.framesSinceRescue += 1;

    if (!c) {
      this.noCandidateSince ??= f.tMs;
      const lost = f.tMs - this.lastCandidateAt > THRESHOLDS.lostMs;
      if (lost) this.lastCandidate = null;
      const cadence =
        f.workerDuty > THRESHOLDS.dutyBudget
          ? THRESHOLDS.rescueEveryN * 2
          : THRESHOLDS.rescueEveryN;
      /* SOL-045 (owner, 2026-09-06): "on the computer the camera sees the barcode but the image is
         far too blurry to decode". A lens that cannot resolve the bars never produces a candidate,
         and this branch used to feed no sharpness history at all — so the session median stayed
         empty, the blur test below could never fire, and the customer was told to aim the code in
         the frame, forever. The frame's own sharpness is part of the session's focus evidence
         whether or not a candidate formed. */
      this.pushSharp(f.sharpness);
      const med = this.sharpMedian();
      const unsharp = med !== null && f.sharpness < THRESHOLDS.blurRel * med;
      // a large candidate that just vanished together with sharpness = too close for this lens (D1/D2 12 cm)
      const tooClose =
        this.lastFill !== null &&
        this.lastFill > 0.3 &&
        f.tMs - this.lastCandidateAt <= 1500 &&
        unsharp;
      if (unsharp) this.blurSince ??= f.tMs;
      else this.blurSince = null;
      // nothing to wait for on a fixed-focus lens: say it as soon as the blur is established
      const blurPersistent =
        this.blurSince !== null &&
        (p.autofocus === false || f.tMs - this.blurSince > THRESHOLDS.blurGuidanceMs);
      /* A camera that is ALWAYS out of focus defeats a relative sharpness test: every frame is
         blurry, so the session median is blurry too and `unsharp` never fires. After the
         no-candidate grace period the honest reading is that this lens cannot resolve the code at
         this distance — the only lever the customer has is distance (fixed focus) or light. */
      const searching = f.tMs - this.noCandidateSince > THRESHOLDS.noCandidateGuidanceMs;
      const dark =
        f.meanLuma < THRESHOLDS.darkMeanLuma || f.clippedRatio > THRESHOLDS.glareClipRatio;
      const guidance: Guidance = tooClose
        ? 'move_away'
        : blurPersistent
          ? p.autofocus === false
            ? 'move_away'
            : 'hold_steady'
          : searching
            ? dark
              ? 'improve_light'
              : p.autofocus === false
                ? 'move_away'
                : 'aim_in_frame'
            : 'none';
      if (this.framesSinceRescue >= cadence) {
        this.framesSinceRescue = 0;
        return {
          ...base,
          path: 'RESCUE_FULL',
          sharpRel: med && med > 0 ? f.sharpness / med : null,
          reason: blurPersistent
            ? `no candidate and the frame is persistently unsharp; scheduled full-frame pass every ${cadence} frames`
            : `no candidate; scheduled full-frame pass on the MEDIUM plane every ${cadence} frames`,
          roi: { x: 0, y: 0, w: planes.medium.w, h: planes.medium.h, plane: 'medium' },
          harder: true,
          guidance,
        };
      }
      return {
        ...base,
        sharpRel: med && med > 0 ? f.sharpness / med : null,
        reason: tooClose
          ? 'no candidate after a large blurred one: too close'
          : blurPersistent
            ? 'no candidate and the frame is persistently unsharp'
            : 'no candidate',
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
        Math.hypot(c.cx - lc.cx, c.cy - lc.cy) / Math.max(1, sourceW);
    }
    this.lastCandidate = c;
    this.lastCandidateAt = f.tMs;
    this.lastFill = c.fill;

    this.pushSharp(f.sharpness);
    const med = this.sharpMedian();
    const sharpRel = med && med > 0 ? f.sharpness / med : null;
    const moduleNative = moduleNativePx(c.fill, sourceW);
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
      /* A close code used to return harder:false UNCONDITIONALLY, so it could never reach zxing's own
         rotation/inversion retry however long it was tracked without a read — the customer holding a
         turned tin right up to the lens got the cheapest possible pass, forever. Same bounded rung as
         NATIVE_ROI below: only after two misses on a stable candidate, and any hit resets it. */
      const harder = !unstable && this.missesOnStable >= 2;
      return {
        ...out,
        path: 'LOW_MEDIUM',
        reason: `fill ${c.fill.toFixed(2)} ≥ ${THRESHOLDS.largeFill}: module ${(moduleNative / planes.medium.factor).toFixed(1)} px on MEDIUM${harder ? ', harder after 2 misses' : ''} (table 3)`,
        roi,
        harder,
        guidance: light,
      };
    }

    if (moduleNative < THRESHOLDS.farModulePx) {
      this.farSince ??= f.tMs;
      const roi = this.cropOn(c, 1, sourceW, sourceH, THRESHOLDS.marginWide, 'native');
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
    const roi = this.cropOn(c, 1, sourceW, sourceH, margin, 'native');
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
   * Axis-aligned crop that CONTAINS the candidate at its actual angle.
   *
   * This used to put `widthPx` on x and `heightPx` on y with no reference to `angleDeg` — a box shaped for
   * a horizontal code, whatever the code was doing. A code at 90° was therefore never inside its own ROI
   * (the engine papered over that one case by swapping the box about its centre afterwards), and a code at
   * 45° was inside neither the box nor the swapped box: the diagonal tin the owner had to turn by hand
   * (QA 2026-09-06). Projecting the rotated box onto the plane axes — the same projection `candidateBox`
   * in quality.ts already uses — covers every angle, and is identical to the old box at 0°.
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
    // margins keep their old meaning: a share of the extent on that axis (2·hw === w at 0°)
    const mx = 2 * hw * margin;
    const my = 2 * hh * margin;
    // a centre outside the plane would otherwise fold the box inside out (x1 < x0 → w = 0)
    const cx = Math.min(Math.max(c.cx / factor, 0), planeW);
    const cy = Math.min(Math.max(c.cy / factor, 0), planeH);
    const x0 = Math.max(0, Math.floor(cx - hw - mx));
    const y0 = Math.max(0, Math.floor(cy - hh - my));
    const x1 = Math.min(planeW, Math.ceil(cx + hw + mx));
    const y1 = Math.min(planeH, Math.ceil(cy + hh + my));
    return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0), plane };
  }
}
