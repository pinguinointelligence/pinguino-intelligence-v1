/**
 * Scan Core — per-target state machine (audit §5.5 Guide): SEARCHING → FOUND → READING → HOLD → COMPLETE,
 * LOST, persistent blocker. 3-frame debounce, hysteresis, timeouts, and the automatic escalation ladder that
 * runs BEFORE user guidance (zoom step / torch), gated by what the camera actually exposes and what the
 * probe approved. Pure and deterministic.
 */
import type { Guidance } from './policy';
import type { Track } from './track';

export type ScanState = 'SEARCHING' | 'FOUND' | 'READING' | 'HOLD' | 'COMPLETE' | 'LOST';

export type CameraAction = 'none' | 'zoom_step' | 'torch_on' | 'refocus';

export interface StateInput {
  tMs: number;
  frameIndex: number;
  primary: Track | null;
  /** policy guidance for the primary track this frame */
  guidance: Guidance;
  /** unstable candidate (policy modifier) */
  unstable: boolean;
  /** evidence this frame: a checksum-valid read landed on the primary track */
  readThisFrame: boolean;
  meanLuma: number;
  /** camera facts */
  zoomAvailable: boolean;
  zoomApproved: boolean;
  zoomLevel: number;
  torchAvailable: boolean;
  torchOn: boolean;
  refocusAvailable: boolean;
}

export interface StateOutput {
  /** READING/HOLD lasted longer than STATE.readingTimeoutMs without a confirmation */
  timedOut: boolean;
  state: ScanState;
  /** the automatic action to try first; guidance shown only when actions are exhausted */
  action: CameraAction;
  guidance: Guidance;
  blocker: boolean;
  trackId: string | null;
  progress: number;
}

export const STATE = {
  debounceFrames: 3,
  /** audit: FOUND > 1.5 s without evidence → escalate (zoom step / „Przybliż”) */
  foundEscalateMs: 1500,
  /** audit: HOLD 300–600 ms of steady framing */
  holdMs: 400,
  lostMs: 500,
  lostToSearchMs: 2000,
  /** persistent blocker after this long in the same blocking guidance */
  blockerMs: 1000,
  darkLuma: 60,
  maxZoomSteps: 2,
  /** PROVISIONAL — needs probe evidence: READING/HOLD without a confirmation for this long raises a blocker */
  readingTimeoutMs: 4000,
} as const;

export class TargetStateMachine {
  state: ScanState = 'SEARCHING';
  private candidateState: ScanState = 'SEARCHING';
  private candidateFrames = 0;
  private stateSince = 0;
  private trackId: string | null = null;
  private zoomSteps = 0;
  private torchTried = false;
  private refocusTried = false;
  private guidanceSince: { code: Guidance; tMs: number } | null = null;
  private lastActionAt = -Infinity;
  private readingSince: number | null = null;

  private transition(next: ScanState, tMs: number): void {
    if (next === this.state) {
      this.candidateState = next;
      this.candidateFrames = 0;
      return;
    }
    // debounce: a new state must be requested on 3 consecutive frames (COMPLETE and LOST are immediate)
    if (next === 'COMPLETE' || next === 'LOST' || next === 'SEARCHING') {
      this.state = next;
      this.stateSince = tMs;
      this.candidateFrames = 0;
      return;
    }
    if (this.candidateState === next) this.candidateFrames += 1;
    else {
      this.candidateState = next;
      this.candidateFrames = 1;
    }
    if (this.candidateFrames >= STATE.debounceFrames) {
      this.state = next;
      this.stateSince = tMs;
      this.candidateFrames = 0;
    }
  }

  private rearm(): void {
    this.readingSince = null;
    this.zoomSteps = 0;
    this.torchTried = false;
    this.refocusTried = false;
    this.guidanceSince = null;
  }

  step(inp: StateInput): StateOutput {
    const p = inp.primary;
    // track identity changes reset the escalation ladder
    const id = p && p.state !== 'LOST' ? p.id : null;
    if (id !== this.trackId) {
      this.trackId = id;
      this.rearm();
      if (!id && this.state !== 'SEARCHING')
        this.transition(this.state === 'COMPLETE' ? 'SEARCHING' : 'LOST', inp.tMs);
    }

    let desired: ScanState = this.state;
    if (!p || p.state === 'LOST') {
      if (this.state === 'LOST' && inp.tMs - this.stateSince > STATE.lostToSearchMs)
        desired = 'SEARCHING';
      else if (this.state === 'COMPLETE') desired = 'SEARCHING';
      else if (this.state !== 'SEARCHING')
        desired = inp.tMs - (p?.lastSeenMs ?? this.stateSince) > STATE.lostMs ? 'LOST' : this.state;
    } else if (p.state === 'COMPLETE') desired = 'COMPLETE';
    else if (p.state === 'READING' || inp.readThisFrame)
      desired = inp.unstable
        ? 'READING'
        : this.state === 'HOLD' || this.state === 'READING'
          ? inp.unstable
            ? 'READING'
            : 'HOLD'
          : 'READING';
    else if (p.state === 'FOUND') desired = 'FOUND';
    else desired = this.state === 'SEARCHING' ? 'SEARCHING' : this.state;
    this.transition(desired, inp.tMs);

    // automatic actions before guidance (audit: FOUND > 1.5 s → zoom step; dark → torch), throttled
    let action: CameraAction = 'none';
    const inFoundTooLong =
      this.state === 'FOUND' && inp.tMs - this.stateSince > STATE.foundEscalateMs;
    const canAct = inp.tMs - this.lastActionAt > 700;
    if (canAct && p && this.state !== 'COMPLETE') {
      if (inp.meanLuma < STATE.darkLuma && inp.torchAvailable && !inp.torchOn && !this.torchTried) {
        action = 'torch_on';
        this.torchTried = true;
      } else if (
        inp.guidance === 'move_closer' &&
        inp.zoomAvailable &&
        inp.zoomApproved &&
        this.zoomSteps < STATE.maxZoomSteps &&
        (inFoundTooLong || this.state === 'READING')
      ) {
        action = 'zoom_step';
        this.zoomSteps += 1;
      } else if (
        inp.guidance === 'hold_steady' &&
        inp.refocusAvailable &&
        !this.refocusTried &&
        inp.tMs - this.stateSince > STATE.foundEscalateMs
      ) {
        action = 'refocus';
        this.refocusTried = true;
      }
      if (action !== 'none') this.lastActionAt = inp.tMs;
    }

    // guidance only when no action is pending; persistent blocker after 1 s of the same blocking code
    if (this.state === 'READING' || this.state === 'HOLD') {
      if (this.readingSince === null) this.readingSince = inp.tMs;
    } else this.readingSince = null;
    const timedOut =
      this.readingSince !== null && inp.tMs - this.readingSince > STATE.readingTimeoutMs;
    let guidance: Guidance = action !== 'none' ? 'none' : inp.guidance;
    if (timedOut && guidance === 'none') guidance = 'hold_steady';
    if (
      guidance === 'move_closer' &&
      inp.zoomAvailable &&
      inp.zoomApproved &&
      this.zoomSteps < STATE.maxZoomSteps
    )
      guidance = 'none';
    if (this.state === 'COMPLETE') guidance = 'none';
    let blocker = timedOut;
    if (guidance !== 'none' && guidance !== 'hold_steady') {
      if (!this.guidanceSince || this.guidanceSince.code !== guidance)
        this.guidanceSince = { code: guidance, tMs: inp.tMs };
      blocker = inp.tMs - this.guidanceSince.tMs > STATE.blockerMs;
    } else this.guidanceSince = null;

    const progress =
      this.state === 'COMPLETE'
        ? 1
        : p
          ? Math.min(
              0.9,
              (p.confirmation.state.agreeing ?? 0) / 2 +
                (p.state === 'READING' ? 0.3 : p.state === 'FOUND' ? 0.15 : 0),
            )
          : 0;
    return {
      state: this.state,
      action,
      guidance,
      blocker,
      trackId: this.trackId,
      progress,
      timedOut,
    };
  }
}
