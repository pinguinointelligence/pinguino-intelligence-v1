/**
 * Scan Core engine (pure): tracker + per-track adaptive policy + per-target state machine + track-scoped
 * confirmation. The worker feeds candidates per frame and decode results per request; the engine returns
 * decode requests, the per-frame instrumentation record (audit §"HARNESS / DIAGNOSTICS") and observations.
 * No camera, no pixels, no product knowledge here.
 */
import { mergeCollinear, type MergedCandidate, type RawCandidate } from './candidates';
import type { Read, ReadSource } from './confirmation';
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
    const planes = planeSizes({ sourceW: input.sourceW, sourceH: input.sourceH });
    const merged: MergedCandidate[] = mergeCollinear(input.candidates, input.sourceW);
    const upd = this.tracker.update(input.frameIndex, input.tMs, merged);
    for (const id of [...this.policies.keys()])
      if (!this.tracker.tracks.some((t) => t.id === id)) this.policies.delete(id);

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
      if (
        track.state !== 'COMPLETE' &&
        track.state !== 'LOST' &&
        d.roi &&
        (d.path === 'LOW_MEDIUM' || d.path === 'NATIVE_ROI' || d.path === 'FAR_NATIVE_ROI')
      ) {
        const native = d.roi.plane === 'native';
        if (!native || this.roiBudgetAllows(input.tMs)) {
          const harder = d.harder && this.opts.budget.harderAllowed;
          const tilt =
            quality?.tiltDeg ??
            Math.min(Math.abs(candidate.angleDeg % 90), 90 - Math.abs(candidate.angleDeg % 90));
          const level = track.escalationLevel();
          const rectify = native && tilt > 8 && level >= 1;
          requests.push({
            trackId: track.id,
            frameIndex: input.frameIndex,
            roi: d.roi,
            harder,
            rectify,
            retryFrames:
              level >= 2 ? track.retryFrames().filter((f) => f !== input.frameIndex) : [],
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
      });
    }

    if (live.length === 0) {
      const d = this.searchPolicy.decide({
        frameIndex: input.frameIndex,
        tMs: input.tMs,
        candidate: null,
        sharpness: input.sharpness,
        meanLuma: input.meanLuma,
        clippedRatio: input.clippedRatio,
        workerDuty: input.workerDuty,
        zoomApplied: input.zoomLevel > 1,
      });
      primaryGuidance = d.guidance;
      if (d.path === 'RESCUE_FULL' && d.roi)
        requests.push({
          trackId: '',
          frameIndex: input.frameIndex,
          roi: d.roi,
          harder: this.opts.budget.harderAllowed,
          rectify: false,
          retryFrames: [],
          source: 'rescue',
        });
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
    if (anyValid) policy.noteHit();
    else {
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
          fill: track.geometry.widthPx / this.opts.profile.sourceW,
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
    return (track.geometry.widthPx / this.opts.profile.sourceW) * (this.opts.profile.sourceW / 95);
  }

  /** A rescue decode has no track; attach it to the primary track if one exists (else it only informs search). */
}
