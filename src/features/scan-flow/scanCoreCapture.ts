/**
 * Live capture for the shared scan flow: the SAME Scan Core stack the real-device baseline proved
 * (camera session → decode worker running the adaptive engine → observations), reduced to one job:
 * hand over the first confirmed barcode as a `ConfirmedScan` and stop. Nothing here decodes,
 * tracks or confirms on its own — the worker owns the pixels, Scan Core owns the decision.
 *
 * What the flow adds on top of the harness (owner QA, 2026-09-05): the engine's per-frame decision is
 * surfaced to the customer (state, guidance, progress, where the code is) and its camera actions are
 * executed — zoom step when it asks for one and the camera can zoom, torch in the dark.
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
  zoomLevel: number;
  torchOn: boolean;
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
  }[];
}

const BUILD: string | null = import.meta.env.VITE_SCAN_LAB_BUILD ?? null;
const ZOOM_STEP_FACTOR = 1.5;

function formFactor(): 'mobile' | 'desktop' | 'unknown' {
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
  private acting = false;
  private lastFrameEmit = 0;
  private lastFrameKey = '';

  constructor(private readonly handlers: ScanCoreCaptureHandlers) {}

  static supported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia === 'function' &&
      typeof Worker === 'function'
    );
  }

  async start(video: HTMLVideoElement): Promise<void> {
    this.video = video;
    this.done = false;
    this.handlers.onStatus?.('starting');
    const delivered = await this.camera.open(video, {
      width: 1920,
      height: 1080,
      frameRate: 30,
      facingMode: 'environment',
    });
    if (this.done) return;
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
    client.sendProfile(
      {
        formFactor: formFactor(),
        sourceW: delivered.width,
        sourceH: delivered.height,
        fps: delivered.frameRate,
        autofocus: delivered.autofocus,
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
      refocusAvailable: false,
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
      zoomLevel: this.zoomLevel,
      torchOn: this.torchOn,
    };
    // the UI needs a change or a heartbeat, not every frame
    const now = performance.now();
    const key = `${frame.state}|${frame.guidance}|${frame.timedOut}|${Math.round(frame.progress * 10)}|${roi ? Math.round(roi.x / 40) + ',' + Math.round(roi.y / 40) : '-'}`;
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

  /** JPEG data URL of the current frame (label photograph), or null when no frame is available. */
  captureStill(maxLongEdge = 1600): string | null {
    const v = this.video;
    if (!v || !v.videoWidth || !v.videoHeight) return null;
    const scale = Math.min(1, maxLongEdge / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
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
