/**
 * Live capture for the shared scan flow: the SAME Scan Core stack the real-device baseline proved
 * (camera session → decode worker running the adaptive engine → observations), reduced to one job:
 * hand over the first confirmed barcode as a `ConfirmedScan` and stop. Nothing here decodes,
 * tracks or confirms on its own — the worker owns the pixels, Scan Core owns the decision.
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

export interface ScanCoreCaptureHandlers {
  onConfirmed: (scan: ConfirmedScan) => void;
  onStatus?: (status: CaptureStatus) => void;
  onError?: (message: string) => void;
}

const BUILD: string | null = import.meta.env.VITE_SCAN_LAB_BUILD ?? null;

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
    const client = new DecodeClient({
      plan: { mode: 'scancore', maxDecodeWidth: 0 },
      onResult: () => undefined,
      onObservation: (_frameIndex, observation) => this.onObservation(observation),
      onError: (message) => this.handlers.onError?.(message),
    });
    this.client = client;
    await client.start();
    client.sendProfile(
      {
        formFactor: formFactor(),
        sourceW: delivered.width,
        sourceH: delivered.height,
        fps: delivered.frameRate,
        autofocus: delivered.autofocus,
        zoomMax: null,
        torch: false,
        startSharpness: delivered.startQuality?.laplacianVar ?? null,
        hardwareConcurrency:
          typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? null) : null,
      },
      false,
    );
    client.sendCameraState({ zoomLevel: 1, torchOn: false, refocusAvailable: false });
    if (this.done) return;
    this.loop = new FrameLoop({ video, client, path: 'auto' });
    this.loop.start();
    this.handlers.onStatus?.('live');
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
    this.camera.stop();
    this.handlers.onStatus?.('stopped');
  }
}
