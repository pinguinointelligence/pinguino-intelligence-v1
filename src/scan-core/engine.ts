/**
 * Scan Core engine (pure): tracker + per-track adaptive policy + per-target state machine + track-scoped
 * confirmation. The worker feeds candidates per frame and decode results per request; the engine returns
 * decode requests, the per-frame instrumentation record (audit §"HARNESS / DIAGNOSTICS") and observations.
 * No camera, no pixels, no product knowledge here.
 */
import { AXIS, mergeCollinear, type MergedCandidate, type RawCandidate } from './candidates';
import type { DigitVotes, Read, ReadSource } from './confirmation';
import { formatFromDecoder, type ScanObservation } from './observation';
import { PolicyState, type Decision, type Guidance, type Roi } from './policy';
import { planeSizes, type CameraProfile } from './profile';
import { candidateQuality, type CandidateQuality } from './quality';
import { TargetStateMachine, type CameraAction, type ScanState } from './stateMachine';
import { Tracker, type Track } from './track';
import type { TierBudget } from './tiers';

export interface EngineFrameInput {
  frameIndex: number;
  tMs: number;
  sourceW: number;
  sourceH: number;
  /** raw saliency candidates in SOURCE pixel coordinates */
  candidates: RawCandidate[];
  /** LOW-plane luma for on-target quality (optional; metrics fall back to frame-level values) */
  lowLuma?: { data: Uint8Array; width: number; height: number; factor: number };
  sharpness: number;
  meanLuma: number;
  clippedRatio: number;
  workerDuty: number;
  zoomLevel: number;
  torchOn: boolean;
  zoomAvailable: boolean;
  torchAvailable: boolean;
  refocusAvailable: boolean;
}

export interface DecodeRequest {
  trackId: string;
  frameIndex: number;
  roi: Roi;
  harder: boolean;
  /** decode the homography-rectified crop (tilted candidates); result provenance = 'rectified' */
  rectify: boolean;
  /** the code's reading axis is vertical (bars horizontal): transpose the crop by 90° before decoding — lossless, so the read keeps its native/medium provenance */
  rotate90: boolean;
  /** additional retained frames to retry against when the live crop fails (best-crop memory) */
  retryFrames: number[];
  source: ReadSource;
}

export interface DecodeResultItem {
  text: string;
  format: string;
  checksumValid: boolean;
  lineCount: number;
  error: string;
  hasGeometry: boolean;
}

export interface DecodeResult {
  trackId: string;
  frameIndex: number;
  tMs: number;
  source: ReadSource;
  /**
   * Echo of `DecodeRequest.rotate90` for this attempt. When both axes were attempted on one frame this is
   * the only thing that says WHICH one read, and therefore which axis to latch onto. A caller that does
   * not echo it simply keeps probing until the code is confirmed.
   */
  rotate90?: boolean;
  items: DecodeResultItem[];
}

export interface TrackDecisionRecord {
  trackId: string;
  trackState: Track['state'];
  path: Decision['path'];
  reason: string;
  fill: number | null;
  moduleNative: number | null;
  sharpRel: number | null;
  stab: number | null;
  roi: Roi | null;
  harder: boolean;
  quality: CandidateQuality | null;
  agreeing: number;
  /** per-track escalation ladder level (Track.escalationLevel) */
  escalation: 0 | 1 | 2 | 3;
  /** candidate orientation (degrees; 0 = bars vertical, reads left→right) and the axis the decoder is fed */
  angleDeg: number | null;
  readingAxis: 'horizontal' | 'vertical' | null;
  /** 0..1 confidence in that axis; below AXIS.confidentAt both axes are attempted */
  axisConfidence: number | null;
  /** this frame attempted both axes for this track (unconfident estimate, or tracked without a read) */
  axisProbe: boolean;
  /** digit-by-digit evidence from the reads so far (null before the first read) */
  digits: DigitVotes | null;
}

export interface FrameDecisionRecord {
  frameIndex: number;
  tMs: number;
  sourceW: number;
  sourceH: number;
  low: { w: number; h: number };
  medium: { w: number; h: number };
  tracks: TrackDecisionRecord[];
  primaryTrackId: string | null;
  scanState: ScanState;
  action: CameraAction;
  guidance: Guidance;
  blocker: boolean;
  progress: number;
  decodeRequests: number;
  /** READING/HOLD exceeded STATE.readingTimeoutMs without a confirmation */
  timedOut: boolean;
}

export interface EngineOptions {
  profile: CameraProfile;
  budget: TierBudget;
  zoomApproved: boolean;
}

export class ScanCoreEngine {
  readonly tracker = new Tracker();
  readonly stateMachine = new TargetStateMachine();
  private readonly policies = new Map<string, PolicyState>();
  private readonly searchPolicy: PolicyState;
  private readonly emitted = new Set<string>();
  private roiTimestamps: number[] = [];
  /** per-track reading axis proven by a valid read: trackId → rotate90 that produced it */
  private readonly axisLatch = new Map<string, boolean>();
  /** successive rescue passes alternate their scan axis (deterministic; no clock, no randomness) */
  private rescueRotate = false;
  /** dimensions of the last frame actually processed (the profile's may be transposed) */
  private frameW: number;
  private frameH: number;
  /**
   * Valid reads from full-frame rescue decodes that no single track could own (several live tracks,
   * none of which has read that value). Kept as evidence, never confirmed from. Bounded.
   */
  readonly unattributedReads: Array<{
    frameIndex: number;
    tMs: number;
    text: string;
    format: string;
  }> = [];

  constructor(readonly opts: EngineOptions) {
    this.searchPolicy = new PolicyState(opts.profile, opts.zoomApproved);
    this.frameW = opts.profile.sourceW;
    this.frameH = opts.profile.sourceH;
  }

  private policyFor(track: Track): PolicyState {
    let p = this.policies.get(track.id);
    if (!p) {
      p = new PolicyState(this.opts.profile, this.opts.zoomApproved);
      this.policies.set(track.id, p);
    }
    return p;
  }

  private roiBudgetAllows(tMs: number): boolean {
    this.roiTimestamps = this.roiTimestamps.filter((t) => tMs - t < 1000);
    if (this.roiTimestamps.length >= this.opts.budget.nativeRoiPerSecond) return false;
    this.roiTimestamps.push(tMs);
    return true;
  }

  processFrame(input: EngineFrameInput): {
    record: FrameDecisionRecord;
    requests: DecodeRequest[];
  } {
    this.frameW = input.sourceW > 0 ? input.sourceW : this.frameW;
    this.frameH = input.sourceH > 0 ? input.sourceH : this.frameH;
    const planes = planeSizes({ sourceW: input.sourceW, sourceH: input.sourceH });
    const merged: MergedCandidate[] = mergeCollinear(input.candidates, input.sourceW);
    const upd = this.tracker.update(input.frameIndex, input.tMs, merged);
    for (const id of [...this.policies.keys()])
      if (!this.tracker.tracks.some((t) => t.id === id)) this.policies.delete(id);
    for (const id of [...this.axisLatch.keys()])
      if (!this.tracker.tracks.some((t) => t.id === id)) this.axisLatch.delete(id);

    const requests: DecodeRequest[] = [];
    const records: TrackDecisionRecord[] = [];
    const live = [
      ...upd.assigned,
      ...upd.created.map((t) => ({
        track: t,
        candidate: merged.find((m) => m.cx === t.geometry.cx && m.cy === t.geometry.cy)!,
        stability: null as number | null,
      })),
    ];
    let primaryGuidance: Guidance = 'none';
    let primaryUnstable = false;
    const primary = this.tracker.primary(input.sourceW, input.sourceH);
    const readThisFrame = primary
      ? primary.evidence.some((e) => e.kind === 'valid_read' && input.tMs - e.tMs < 100)
      : false;

    for (const { track, candidate } of live) {
      if (!candidate) continue;
      const policy = this.policyFor(track);
      const quality = input.lowLuma
        ? candidateQuality(input.lowLuma.data, input.lowLuma.width, input.lowLuma.height, {
            ...track.geometry,
            cx: track.geometry.cx / input.lowLuma.factor,
            cy: track.geometry.cy / input.lowLuma.factor,
            widthPx: track.geometry.widthPx / input.lowLuma.factor,
            heightPx: track.geometry.heightPx / input.lowLuma.factor,
          })
        : null;
      const d = policy.decide({
        frameIndex: input.frameIndex,
        tMs: input.tMs,
        sourceW: input.sourceW,
        sourceH: input.sourceH,
        candidate: {
          fill: candidate.fill,
          widthPx: candidate.widthPx,
          heightPx: candidate.heightPx,
          angleDeg: candidate.angleDeg,
          cx: candidate.cx,
          cy: candidate.cy,
        },
        sharpness: input.sharpness,
        meanLuma: quality?.meanLuma ?? input.meanLuma,
        clippedRatio: quality?.glareOnTarget ?? input.clippedRatio,
        workerDuty: input.workerDuty,
        zoomApplied: input.zoomLevel > 1,
      });
      track.considerBest(input.frameIndex, {
        sharpness: input.sharpness,
        contrast: quality?.contrast ?? 0,
        moduleNative: d.moduleNative,
        tiltDeg: quality?.tiltDeg ?? Math.abs(candidate.angleDeg % 90),
      });
      if (quality && quality.cutEdges.length > 0 && d.guidance === 'none')
        d.guidance = 'aim_in_frame';
      const unstable = d.stab !== null && d.stab >= 0.2;
      const est = axisEstimate(candidate.angleDeg, candidate.axisConfidence);
      const latched = this.axisLatch.get(track.id);
      /* THE FIX (owner QA 2026-09-06). The reading axis used to be a DECISION: one boolean produced one
         request, and if the estimate was wrong the very same wrong estimate was reproduced on every
         frame of the same scene — no progress at all, and the only lever left was turning the product.
         It is now an ATTEMPT, bounded three ways:
           · a confident, unlatched estimate still costs exactly ONE decode (the common case);
           · both axes are attempted only while the estimate is untrustworthy — unconfident geometry, or a
             code that has been TRACKED WITHOUT A READ for `AXIS_PROBE.afterMisses` decodes;
           · both attempts spend the tier's ROI budget, so decodes per second never rise;
         and it LATCHES: the axis that produced a valid read becomes the estimate, so the work drops back
         to one decode per frame while the confirmation contract collects its agreeing frames. Repeated
         misses on the latched axis re-open the probe, so the latch can never wedge the scan. */
      const primaryRotate = latched ?? est.axis === 'vertical';
      const probeBothAxes =
        (latched === undefined && !est.confident) || track.misses >= AXIS_PROBE.afterMisses;
      if (
        track.state !== 'COMPLETE' &&
        track.state !== 'LOST' &&
        d.roi &&
        (d.path === 'LOW_MEDIUM' || d.path === 'NATIVE_ROI' || d.path === 'FAR_NATIVE_ROI')
      ) {
        const native = d.roi.plane === 'native';
        /* A track whose only reads come from the rectified crop can NEVER confirm: §17 of the confirmation
           contract requires one independent, non-rectified agreeing read, because a homography alias
           repeats identically frame after frame. Such a track is not progressing — it reads the same value
           forever and then times out — and the policy cannot see it, because every rectified read resets
           the miss ladder that would have escalated the raw crop. Give the RAW attempts zxing's own retry
           ladder while the track is in that state; it is bounded by the state itself and ends with the
           first independent read. */
        const reads = track.evidence.filter((e) => e.kind === 'valid_read');
        const rectifiedOnly = reads.length > 0 && reads.every((e) => e.source === 'rectified');
        const tilt =
          quality?.tiltDeg ??
          Math.min(Math.abs(candidate.angleDeg % 90), 90 - Math.abs(candidate.angleDeg % 90));
        const level = track.escalationLevel();
        /* A code tilted well away from both axes cannot be read by scanning EITHER of them: a straight
           scan line leaves the bars before it has crossed all 95 modules. Only the rectified crop reads
           it — and that crop was gated on `native`, so a close code (LOW_MEDIUM, i.e. exactly the tin held
           up to the lens) could never reach it however long it was tracked without a read. The gate is now
           the tilt and the miss ladder, which is what it was always meant to be; the plane is irrelevant
           because the lane rectifies from the source pixels either way. */
        const rectifyPrimary = tilt > 8 && level >= 1;
        // one crop, up to two attempts: the primary, and — while the axis is untrustworthy — the other axis
        const attempts: Array<{ rotate90: boolean; rectify: boolean }> = [
          { rotate90: rectifyPrimary ? false : primaryRotate, rectify: rectifyPrimary },
        ];
        if (probeBothAxes) attempts.push({ rotate90: !primaryRotate, rectify: false });
        for (let k = 0; k < attempts.length; k += 1) {
          // every native attempt is a real decode and must fit the tier budget
          if (native && !this.roiBudgetAllows(input.tMs)) break;
          const { rotate90, rectify } = attempts[k]!;
          const primaryAttempt = k === 0;
          const harder =
            (d.harder || (rectifiedOnly && !rectify)) && this.opts.budget.harderAllowed;
          requests.push({
            trackId: track.id,
            frameIndex: input.frameIndex,
            roi: d.roi,
            harder,
            rectify,
            rotate90,
            retryFrames:
              primaryAttempt && level >= 2
                ? track.retryFrames().filter((f) => f !== input.frameIndex)
                : [],
            source: rectify ? 'rectified' : native ? 'native' : 'medium',
          });
        }
      }
      if (primary && track.id === primary.id) {
        primaryGuidance = d.guidance;
        primaryUnstable = unstable;
      }
      records.push({
        trackId: track.id,
        trackState: track.state,
        path: d.path,
        reason: d.reason,
        fill: d.fill,
        moduleNative: d.moduleNative,
        sharpRel: d.sharpRel,
        stab: d.stab,
        roi: d.roi,
        harder: d.harder,
        quality,
        agreeing: track.confirmation.state.agreeing,
        escalation: track.escalationLevel(),
        angleDeg: candidate.angleDeg,
        readingAxis: primaryRotate ? 'vertical' : 'horizontal',
        axisConfidence: candidate.axisConfidence,
        axisProbe: probeBothAxes,
        digits: track.confirmation.digitVotes(),
      });
    }

    if (live.length === 0) {
      const d = this.searchPolicy.decide({
        frameIndex: input.frameIndex,
        tMs: input.tMs,
        sourceW: input.sourceW,
        sourceH: input.sourceH,
        candidate: null,
        sharpness: input.sharpness,
        meanLuma: input.meanLuma,
        clippedRatio: input.clippedRatio,
        workerDuty: input.workerDuty,
        zoomApplied: input.zoomLevel > 1,
      });
      primaryGuidance = d.guidance;
      if (d.path === 'RESCUE_FULL' && d.roi) {
        /* Rescue is the ONE pass that runs when nothing is located at all — and it was hardcoded to scan
           rows, so a code the locator could not see could only ever be rescued if it happened to be
           horizontal. Alternating the axis between successive rescues covers both for the same cost:
           still one full-frame decode per rescue, at the unchanged cadence. */
        this.rescueRotate = !this.rescueRotate;
        requests.push({
          trackId: '',
          frameIndex: input.frameIndex,
          roi: d.roi,
          harder: this.opts.budget.harderAllowed,
          rectify: false,
          rotate90: this.rescueRotate,
          retryFrames: [],
          source: 'rescue',
        });
      }
      records.push({
        trackId: '',
        trackState: 'CANDIDATE',
        path: d.path,
        reason: d.reason,
        fill: null,
        moduleNative: null,
        sharpRel: d.sharpRel,
        stab: null,
        roi: d.roi,
        harder: d.harder,
        quality: null,
        agreeing: 0,
        escalation: 0,
        angleDeg: null,
        readingAxis: null,
        axisConfidence: null,
        axisProbe: false,
        digits: null,
      });
    }

    const sm = this.stateMachine.step({
      tMs: input.tMs,
      frameIndex: input.frameIndex,
      primary,
      guidance: primaryGuidance,
      unstable: primaryUnstable,
      readThisFrame,
      meanLuma: input.meanLuma,
      zoomAvailable: input.zoomAvailable,
      zoomApproved: this.opts.zoomApproved,
      zoomLevel: input.zoomLevel,
      torchAvailable: input.torchAvailable,
      torchOn: input.torchOn,
      refocusAvailable: input.refocusAvailable,
    });
    const record: FrameDecisionRecord = {
      frameIndex: input.frameIndex,
      tMs: input.tMs,
      sourceW: input.sourceW,
      sourceH: input.sourceH,
      low: { w: planes.low.w, h: planes.low.h },
      medium: { w: planes.medium.w, h: planes.medium.h },
      tracks: records,
      primaryTrackId: primary?.id ?? null,
      scanState: sm.state,
      action: sm.action,
      guidance: sm.guidance,
      blocker: sm.blocker,
      progress: sm.progress,
      decodeRequests: requests.length,
      timedOut: sm.timedOut,
    };
    return { record, requests };
  }

  /** Decode results come back asynchronously; evidence goes to the track, confirmation may emit an observation. */
  /**
   * A rescue decode reads the whole frame, so its result carries no track geometry. It may be
   * attributed to a track only when the attribution is unambiguous: a single live track, or exactly
   * one track that has already read these digits. Otherwise the read is retained as unattributed
   * evidence and can never confirm anything (two-code isolation).
   */
  private attributeRescue(result: DecodeResult): Track | undefined {
    const live = this.tracker.tracks.filter((t) => t.state !== 'LOST');
    if (live.length === 0) return undefined;
    if (live.length === 1) return live[0];
    const digitsOf = (i: DecodeResultItem) => i.text.replace(/\D/g, '');
    const valid = result.items.filter((i) => i.checksumValid && digitsOf(i));
    const owners = new Set<Track>();
    for (const i of valid) {
      const d = digitsOf(i);
      for (const t of live)
        if (t.evidence.some((e) => e.kind === 'valid_read' && e.text === d)) owners.add(t);
    }
    if (owners.size === 1) return [...owners][0];
    for (const i of valid) {
      this.unattributedReads.push({
        frameIndex: result.frameIndex,
        tMs: result.tMs,
        text: digitsOf(i),
        format: i.format,
      });
      if (this.unattributedReads.length > 32) this.unattributedReads.shift();
    }
    return undefined;
  }

  ingestDecode(result: DecodeResult): ScanObservation | null {
    const track = result.trackId
      ? this.tracker.tracks.find((t) => t.id === result.trackId)
      : this.attributeRescue(result);
    if (!track) return null;
    const policy = this.policyFor(track);
    let anyValid = false;
    for (const item of result.items) {
      const digits = item.text.replace(/\D/g, '');
      if (item.checksumValid && digits) {
        anyValid = true;
        const read: Read = {
          frameIndex: result.frameIndex,
          tMs: result.tMs,
          text: digits,
          lineCount: item.lineCount,
          moduleNative: this.lastModule(track),
          source: result.source,
          format: item.format,
          rawText: item.text,
        };
        track.pushRead(read);
        track.evidence[track.evidence.length - 1]!.format = item.format;
      } else if (digits) {
        track.addEvidence({
          frameIndex: result.frameIndex,
          tMs: result.tMs,
          kind: 'invalid_hypothesis',
          source: result.source,
          text: digits,
          error: item.error,
          lineCount: item.lineCount,
        });
      } else if (item.hasGeometry) {
        track.addEvidence({
          frameIndex: result.frameIndex,
          tMs: result.tMs,
          kind: 'error_geometry',
          source: result.source,
          error: item.error,
        });
      }
    }
    if (anyValid) {
      policy.noteHit();
      /* Latch the axis that actually read, so the other attempt stops for this code. A rectified read
         says nothing about the raw crop's axis (that crop is upright by construction) and a rescue read
         has no track geometry at all, so neither may set the latch. */
      if (
        result.rotate90 !== undefined &&
        result.source !== 'rescue' &&
        result.source !== 'rectified'
      )
        this.axisLatch.set(track.id, result.rotate90);
    } else {
      track.misses += 1;
      policy.noteMiss();
    }
    const st = track.confirmation.state;
    if (st.status === 'confirmed' && !this.emitted.has(track.id)) {
      this.emitted.add(track.id);
      const reads = track.evidence.filter(
        (e) =>
          e.kind === 'valid_read' &&
          e.text === st.value &&
          (st.format === null || formatFromDecoder(e.format ?? '') === st.format),
      );
      const fmt = reads.map((e) => e.format).find((f): f is string => Boolean(f)) ?? '';
      const rawValue = reads.map((e) => e.rawText).find((r): r is string => Boolean(r));
      return {
        trackId: track.id,
        kind: 'barcode',
        state: 'COMPLETE',
        barcode: {
          format: formatFromDecoder(fmt),
          value: st.value ?? undefined,
          rawValue,
          verified: true,
          agreeingFrames: st.agreeing,
          lane: st.lane,
          sources: [...new Set(reads.map((e) => e.source))],
          moduleNative: this.lastModule(track),
          fill: track.geometry.widthPx / Math.max(1, this.frameW),
          lineCounts: reads.map((e) => e.lineCount ?? 0),
        },
        bestFrames: track.retryFrames(),
        timing: {
          firstSeenAt: track.firstSeenMs,
          completedAt: st.confirmedAt ?? undefined,
          framesObserved: track.frames,
        },
        reasons: st.mixedFormats ? ['mixed_formats'] : [],
      };
    }
    return null;
  }

  private lastModule(track: Track): number | null {
    return track.geometry.widthPx / 95;
  }

  /** A rescue decode has no track; attach it to the primary track if one exists (else it only informs search). */
}

export const AXIS_PROBE = {
  /**
   * Consecutive decode misses on a tracked code after which BOTH axes are attempted again — the "short
   * measured period of tracking a code without a single read". Same rung as the policy's harder
   * escalation, and reset by any valid read (Track.pushRead).
   */
  afterMisses: 2,
} as const;

/** the axis the decoder must scan along: bars vertical (0°/180°) → horizontal reading; bars horizontal (90°/270°) → vertical */
export function readingAxisOf(angleDeg: number): 'horizontal' | 'vertical' {
  const axis = ((angleDeg % 180) + 180) % 180;
  return axis > 45 && axis < 135 ? 'vertical' : 'horizontal';
}

/**
 * The axis plus whether it may be bet on. The cut at 45°/135° is exact and has no hysteresis, so a tin
 * held diagonally is a coin flip that lands the same way on every frame of the same scene; the candidate's
 * own `axisConfidence` (fragment agreement × distance from that boundary) decides whether one attempt is
 * enough or both axes must be tried. An absent confidence is treated as unconfident: probing costs one
 * extra decode out of the same budget, guessing costs the customer the scan.
 */
export function axisEstimate(
  angleDeg: number,
  axisConfidence?: number,
): { axis: 'horizontal' | 'vertical'; confident: boolean } {
  return {
    axis: readingAxisOf(angleDeg),
    confident: (axisConfidence ?? 0) >= AXIS.confidentAt,
  };
}

/**
 * The same box turned about its centre, on whole pixels and inside the plane.
 *
 * Turning an odd-sized box about its centre produced HALF-PIXEL x/y, and the worker feeds those straight
 * into `plane.subarray((y0 + y) * pw + x0, …)`, where JS truncates — the crop came out half a row off, on
 * the vertical path only (owner QA 2026-09-06). The engine no longer needs this on the request path (the
 * policy's crop is angle-aware), but any caller turning an ROI must get whole pixels.
 */
export function swapRoiAboutCentre(roi: Roi, planeW?: number, planeH?: number): Roi {
  const cx = roi.x + roi.w / 2;
  const cy = roi.y + roi.h / 2;
  const w = Math.max(1, Math.round(planeW === undefined ? roi.h : Math.min(roi.h, planeW)));
  const h = Math.max(1, Math.round(planeH === undefined ? roi.w : Math.min(roi.w, planeH)));
  const x = Math.round(cx - w / 2);
  const y = Math.round(cy - h / 2);
  return {
    x: Math.max(0, planeW === undefined ? x : Math.min(x, planeW - w)),
    y: Math.max(0, planeH === undefined ? y : Math.min(y, planeH - h)),
    w,
    h,
    plane: roi.plane,
  };
}
