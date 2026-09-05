/**
 * Live capture for the shared scan flow: the SAME Scan Core stack the real-device baseline proved
 * (camera session → decode worker running the adaptive engine → observations), reduced to one job:
 * hand over the first confirmed barcode as a `ConfirmedScan` and stop. Nothing here decodes,
 * tracks or confirms on its own — the worker owns the pixels, Scan Core owns the decision.
 *
 * Owner QA (2026-09-05) added, on top of the harness:
 *   - the engine's per-frame decision is surfaced (state, guidance, progress, where the code is,
 *     reading axis, digit votes, relative sharpness) and its camera actions are executed (zoom step,
 *     torch, refocus);
 *   - focus is probed honestly: continuous autofocus is requested when the camera exposes it; a
 *     desktop camera that exposes no focus control is treated as fixed-focus, so blur guidance comes
 *     at once ("move the product back") instead of "hold steady";
 *   - a still photograph can be pushed through the same worker and the same Scan Core lane when the
 *     live image cannot get sharp (fixed-focus webcams) — no second decoder, same confirmation rules.
 */
import { CameraSession } from '@/scan-lab/baseline/camera/cameraSession';
import { FrameLoop } from '@/scan-lab/baseline/loop/frameLoop';
import { DecodeClient } from '@/scan-lab/baseline/worker/decodeClient';
import {
  fromScanCoreObservation,
  type ConfirmedScan,
  type ScanCoreObservationLike,
} from '@/scan-contract/confirmedScan';

export type CaptureStatus =
  | 'starting'
  | 'live'
  | 'reading'
  | 'confirmed'
  | 'stopped'
  | 'unavailable';

export type CaptureScanState = 'SEARCHING' | 'FOUND' | 'READING' | 'HOLD' | 'COMPLETE' | 'LOST';
export type CaptureGuidance =
  | 'none'
  | 'hold_steady'
  | 'move_closer'
  | 'move_away'
  | 'aim_in_frame'
  | 'improve_light'
  | 'camera_inadequate';
export type FocusControl = 'continuous' | 'none' | 'unknown';
export type FormFactor = 'mobile' | 'desktop' | 'unknown';

/** digit-by-digit evidence from the reads so far (only what the decoder actually read) */
export interface DigitEvidence {
  digits: (string | null)[];
  stable: boolean[];
  reads: number;
}

/** one frame's decision, as the customer needs it */
export interface CaptureFrame {
  state: CaptureScanState;
  guidance: CaptureGuidance;
  /** 0..1 confirmation progress of the primary track */
  progress: number;
  timedOut: boolean;
  sourceW: number;
  sourceH: number;
  /** primary track box in source pixels, when the engine has one */
  roi: { x: number; y: number; w: number; h: number } | null;
  /** the axis the engine is scanning the primary code along */
  readingAxis: 'horizontal' | 'vertical' | null;
  /** sharpness of the primary code relative to the session median (null before a track) */
  sharpRel: number | null;
  digits: DigitEvidence | null;
  zoomLevel: number;
  torchOn: boolean;
  focusControl: FocusControl;
  formFactor: FormFactor;
}

export interface ScanCoreCaptureHandlers {
  onConfirmed: (scan: ConfirmedScan) => void;
  onStatus?: (status: CaptureStatus) => void;
  onFrame?: (frame: CaptureFrame) => void;
  onError?: (message: string) => void;
}

/** the engine's decision record, structurally (the engine module stays behind the worker) */
interface DecisionLike {
  scanState?: CaptureScanState;
  guidance?: CaptureGuidance;
  action?: 'none' | 'zoom_step' | 'torch_on' | 'refocus';
  progress?: number;
  timedOut?: boolean;
  sourceW?: number;
  sourceH?: number;
  medium?: { w: number; h: number };
  primaryTrackId?: string | null;
  tracks?: {
    trackId: string;
    roi: { x: number; y: number; w: number; h: number; plane: 'medium' | 'native' } | null;
    sharpRel?: number | null;
    readingAxis?: 'horizontal' | 'vertical' | null;
    digits?: DigitEvidence | null;
  }[];
}

const BUILD: string | null = import.meta.env.VITE_SCAN_LAB_BUILD ?? null;
const ZOOM_STEP_FACTOR = 1.5;
const STILL_MAX_EDGE = 1920;

export function detectFormFactor(): FormFactor {
  if (typeof navigator === 'undefined') return 'unknown';
  const touch = (navigator.maxTouchPoints ?? 0) > 1;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || touch
    ? 'mobile'
    : 'desktop';
}

/** Plain-language reasons the camera could not start (permission, no device, insecure context). */
export function describeCaptureError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Brak zgody na użycie aparatu. Możesz wpisać kod z opakowania.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return 'Nie znaleziono aparatu. Możesz wpisać kod z opakowania.';
  if (name === 'NotReadableError')
    return 'Aparat jest zajęty przez inną aplikację. Możesz wpisać kod z opakowania.';
  return 'Nie udało się uruchomić aparatu. Możesz wpisać kod z opakowania.';
}

type TrackCaps = MediaStreamTrack & { getCapabilities?: () => Record<string, unknown> };

/** what the camera says about focus, and what was applied — never assumed */
export async function probeFocus(track: MediaStreamTrack | null): Promise<FocusControl> {
  const caps = ((track as TrackCaps | null)?.getCapabilities?.() ?? null) as Record<
    string,
    unknown
  > | null;
  const modes = caps?.['focusMode'];
  if (!Array.isArray(modes)) return 'unknown';
  if (!modes.includes('continuous')) return 'none';
  try {
    await track!.applyConstraints({
      advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
    });
    return 'continuous';
  } catch {
    return 'none';
  }
}

export class ScanCoreCapture {
  private readonly camera = new CameraSession();
  private client: DecodeClient | null = null;
  private loop: FrameLoop | null = null;
  private video: HTMLVideoElement | null = null;
  private done = false;
  private zoomLevel = 1;
  private zoomMax: number | null = null;
  private torchOn = false;
  private torchAvailable = false;
  private focusControl: FocusControl = 'unknown';
  private formFactor: FormFactor = 'unknown';
  private acting = false;
  private lastFrameEmit = 0;
  private lastFrameKey = '';
  private stillFrameIndex = 100_000;

  constructor(private readonly handlers: ScanCoreCaptureHandlers) {}

  static supported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia === 'function' &&
      typeof Worker === 'function'
    );
  }

  get focus(): FocusControl {
    return this.focusControl;
  }

  async start(video: HTMLVideoElement): Promise<void> {
    this.video = video;
    this.done = false;
    this.formFactor = detectFormFactor();
    this.handlers.onStatus?.('starting');
    const delivered = await this.camera.open(video, {
      width: 1920,
      height: 1080,
      frameRate: 30,
      facingMode: 'environment',
    });
    if (this.done) return;
    // focus first: continuous autofocus is requested when the camera exposes it at all
    this.focusControl = await probeFocus(this.camera.track);
    // zoom + torch capability probe (apply, read back, restore) — the same probe the harness ran
    let zoomMax: number | null = null;
    let torch = false;
    try {
      const controls = await this.camera.probeControls();
      zoomMax =
        controls.zoom.supported && controls.zoom.ok ? (controls.zoom.range?.max ?? null) : null;
      torch = controls.torch.supported && controls.torch.ok;
    } catch {
      /* controls stay unknown: the engine then guides the customer instead of zooming */
    }
    if (this.done) return;
    this.zoomMax = zoomMax !== null && zoomMax > 1 ? zoomMax : null;
    this.torchAvailable = torch;
    const client = new DecodeClient({
      plan: { mode: 'scancore', maxDecodeWidth: 0 },
      onResult: (evidence) => this.onEvidence(evidence as { decision?: unknown }),
      onObservation: (_frameIndex, observation) => this.onObservation(observation),
      onError: (message) => this.handlers.onError?.(message),
    });
    this.client = client;
    await client.start();
    if (this.done) {
      client.stop();
      return;
    }
    // a desktop camera that exposes no focus control is, in practice, a fixed-focus lens: the engine
    // must guide at once (move the product back) instead of waiting for an autofocus that does not exist
    const autofocus =
      this.focusControl === 'continuous'
        ? true
        : this.focusControl === 'none' || this.formFactor === 'desktop'
          ? false
          : delivered.autofocus;
    client.sendProfile(
      {
        formFactor: this.formFactor,
        sourceW: delivered.width,
        sourceH: delivered.height,
        fps: delivered.frameRate,
        autofocus,
        zoomMax: this.zoomMax,
        torch: this.torchAvailable,
        startSharpness: delivered.startQuality?.laplacianVar ?? null,
        hardwareConcurrency:
          typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? null) : null,
      },
      this.zoomMax !== null && this.zoomMax >= 2,
    );
    this.sendCameraState();
    this.loop = new FrameLoop({ video, client, path: 'auto' });
    this.loop.start();
    this.handlers.onStatus?.('live');
  }

  private sendCameraState(): void {
    this.client?.sendCameraState({
      zoomLevel: this.zoomLevel,
      torchOn: this.torchOn,
      refocusAvailable: this.focusControl === 'continuous',
    });
  }

  private onEvidence(evidence: { decision?: unknown }): void {
    if (this.done) return;
    const d = evidence.decision as DecisionLike | undefined;
    if (!d || typeof d !== 'object') return;
    void this.applyAction(d.action ?? 'none');
    const handler = this.handlers.onFrame;
    if (!handler) return;
    const primary = d.tracks?.find((t) => t.trackId === d.primaryTrackId) ?? null;
    let roi: CaptureFrame['roi'] = null;
    if (primary?.roi && d.sourceW && d.sourceH) {
      const scale = primary.roi.plane === 'medium' && d.medium?.w ? d.sourceW / d.medium.w : 1;
      roi = {
        x: primary.roi.x * scale,
        y: primary.roi.y * scale,
        w: primary.roi.w * scale,
        h: primary.roi.h * scale,
      };
    }
    const frame: CaptureFrame = {
      state: d.scanState ?? 'SEARCHING',
      guidance: d.guidance ?? 'none',
      progress: Math.max(0, Math.min(1, d.progress ?? 0)),
      timedOut: d.timedOut === true,
      sourceW: d.sourceW ?? this.video?.videoWidth ?? 0,
      sourceH: d.sourceH ?? this.video?.videoHeight ?? 0,
      roi,
      readingAxis: primary?.readingAxis ?? null,
      sharpRel: primary?.sharpRel ?? null,
      digits: primary?.digits ?? null,
      zoomLevel: this.zoomLevel,
      torchOn: this.torchOn,
      focusControl: this.focusControl,
      formFactor: this.formFactor,
    };
    // the UI needs a change or a heartbeat, not every frame
    const now = performance.now();
    const digitsKey = frame.digits ? frame.digits.digits.map((x) => x ?? '.').join('') : '';
    const key = `${frame.state}|${frame.guidance}|${frame.timedOut}|${Math.round(frame.progress * 10)}|${roi ? Math.round(roi.x / 40) + ',' + Math.round(roi.y / 40) : '-'}|${frame.readingAxis}|${digitsKey}|${frame.sharpRel !== null && frame.sharpRel < 0.5 ? 'blur' : 'ok'}`;
    if (key !== this.lastFrameKey || now - this.lastFrameEmit > 250) {
      this.lastFrameKey = key;
      this.lastFrameEmit = now;
      handler(frame);
    }
  }

  private async applyAction(action: NonNullable<DecisionLike['action']>): Promise<void> {
    if (action === 'none' || this.acting || this.done) return;
    this.acting = true;
    try {
      if (action === 'zoom_step' && this.zoomMax !== null && this.zoomLevel < this.zoomMax) {
        const target = Math.min(
          this.zoomMax,
          Math.round(this.zoomLevel * ZOOM_STEP_FACTOR * 10) / 10,
        );
        const applied = await this.camera.setZoom(target);
        if (applied !== null) this.zoomLevel = applied;
        this.sendCameraState();
      } else if (action === 'torch_on' && this.torchAvailable && !this.torchOn) {
        this.torchOn = await this.camera.setTorch(true);
        this.sendCameraState();
      } else if (action === 'refocus' && this.focusControl === 'continuous') {
        // kick the autofocus: manual → continuous re-arms the hunt on cameras that expose both
        const track = this.camera.track;
        if (track) {
          try {
            await track.applyConstraints({
              advanced: [{ focusMode: 'manual' } as MediaTrackConstraintSet],
            });
          } catch {
            /* not every camera accepts manual; the continuous re-apply below still helps */
          }
          await track.applyConstraints({
            advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
          });
        }
      }
    } catch {
      /* a refused camera control is not an error for the customer */
    } finally {
      this.acting = false;
    }
  }

  private onObservation(observation: unknown): void {
    if (this.done) return;
    const obs = observation as ScanCoreObservationLike | null | undefined;
    if (!obs || obs.kind !== 'barcode') return;
    if (obs.state !== 'COMPLETE') {
      this.handlers.onStatus?.('reading');
      return;
    }
    const confirmed = fromScanCoreObservation(obs, BUILD);
    if (!confirmed) return;
    this.done = true;
    this.handlers.onStatus?.('confirmed');
    this.stop();
    this.handlers.onConfirmed(confirmed);
  }

  /**
   * A still photograph (fixed-focus webcam fallback) through the SAME worker and Scan Core lane: the
   * image is pushed as two consecutive frames so the fast lane can confirm from two agreeing reads.
   * Resolves true when Scan Core confirmed a code from it (onConfirmed already fired), false otherwise.
   */
  async decodeStill(file: Blob, waitMs = 2500): Promise<boolean> {
    const client = this.client;
    if (!client || this.done) return false;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, STILL_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const rgba = ctx.getImageData(0, 0, width, height).data;
    // the live loop yields the worker to the still frames
    this.loop?.stop();
    this.loop = null;
    const submit = () => {
      const luma = client.acquireLumaBuffer(width * height);
      for (let i = 0, p = 0; i < luma.length; i += 1, p += 4)
        luma[i] = (rgba[p]! * 77 + rgba[p + 1]! * 150 + rgba[p + 2]! * 29) >> 8;
      return client.submit({
        frameIndex: this.stillFrameIndex++,
        tCapture: performance.now(),
        path: 'rgba_buffer',
        width,
        height,
        luma,
      });
    };
    const started = performance.now();
    let submitted = 0;
    while (submitted < 3 && !this.done && performance.now() - started < waitMs) {
      if (submit()) submitted += 1;
      await new Promise((r) => setTimeout(r, 120));
    }
    const deadline = started + waitMs;
    while (!this.done && performance.now() < deadline) await new Promise((r) => setTimeout(r, 60));
    if (!this.done && this.video && this.client) {
      this.loop = new FrameLoop({ video: this.video, client: this.client, path: 'auto' });
      this.loop.start();
    }
    return this.done;
  }

  stop(): void {
    this.done = true;
    try {
      this.loop?.stop();
    } catch {
      /* the loop may already be idle */
    }
    this.loop = null;
    this.client?.stop();
    this.client = null;
    if (this.torchOn) void this.camera.setTorch(false).catch(() => false);
    this.camera.stop();
    this.handlers.onStatus?.('stopped');
  }
}
