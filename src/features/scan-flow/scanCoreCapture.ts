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
  /** SOL-045: the measured image chain, for QA and the dev lab. Never customer-facing. */
  onDiagnostics?: (diagnostics: CameraDiagnostics) => void;
}

/**
 * SOL-045 (owner, 2026-09-06): "on the computer the camera sees the barcode but the image is far too
 * blurry to decode". Before changing anything the whole chain has to be measurable: what was asked
 * of `getUserMedia`, what the track actually delivered, what the <video> element carries, what size
 * the DECODER is handed, and which capabilities the camera really exposes. Every field here is
 * measured, none is assumed; no user-identifying device id is recorded.
 */
export interface CameraDiagnostics {
  requested: { width: number; height: number; frameRate: number; facingMode: string | null };
  /** which rung of the constraint ladder actually opened the camera (0 = the full request) */
  rung: 0 | 1 | 2;
  delivered: {
    width: number | null;
    height: number | null;
    frameRate: number | null;
    facingMode: string | null;
  };
  video: { width: number; height: number };
  /** what the decoder is handed: the source frame capped by the tier's analysis long edge */
  decoderInput: { width: number; height: number; longEdgeCap: number };
  capabilities: { focusMode: readonly string[] | null; zoom: boolean; torch: boolean };
  focusControl: FocusControl;
  formFactor: FormFactor;
  /**
   * WHICH physical camera answered, and how many the machine offers. The label is the hardware's own
   * model name ("FaceTime HD Camera"), never a device id — a laptop that silently picked the wrong
   * lens is the difference between a readable code and the owner's blurred screen.
   */
  camera: { label: string | null; videoInputs: number | null };
  /** the preview's CSS box. The decoder reads the SOURCE frame; this proves the two are not confused. */
  preview: { cssWidth: number; cssHeight: number };
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

/** the analysis long edge the frame loop caps the decoder input at (its own default) */
export const DECODER_LONG_EDGE_CAP = 1920;

/**
 * SOL-045 — the measured image chain, assembled from what the platform reports. Pure: everything it
 * returns was read from the track, the element or the request; nothing is inferred.
 */
export function cameraDiagnostics(input: {
  requested: { width: number; height: number; frameRate: number; facingMode?: string };
  rung: 0 | 1 | 2;
  track: MediaStreamTrack | null;
  video: { videoWidth: number; videoHeight: number };
  focusControl: FocusControl;
  formFactor: FormFactor;
  zoomMax: number | null;
  torch: boolean;
  videoInputs?: number | null;
  preview?: { cssWidth: number; cssHeight: number };
}): CameraDiagnostics {
  const settings = (input.track?.getSettings?.() ?? {}) as Record<string, unknown>;
  const caps = ((input.track as TrackCaps | null)?.getCapabilities?.() ?? null) as Record<
    string,
    unknown
  > | null;
  const focusModes = Array.isArray(caps?.['focusMode'])
    ? (caps!['focusMode'] as string[]).filter((m): m is string => typeof m === 'string')
    : null;
  const vw = input.video.videoWidth || 0;
  const vh = input.video.videoHeight || 0;
  const long = Math.max(vw, vh);
  const scale = long > DECODER_LONG_EDGE_CAP && long > 0 ? DECODER_LONG_EDGE_CAP / long : 1;
  return {
    requested: {
      width: input.requested.width,
      height: input.requested.height,
      frameRate: input.requested.frameRate,
      facingMode: input.requested.facingMode ?? null,
    },
    rung: input.rung,
    delivered: {
      width: typeof settings['width'] === 'number' ? (settings['width'] as number) : null,
      height: typeof settings['height'] === 'number' ? (settings['height'] as number) : null,
      frameRate:
        typeof settings['frameRate'] === 'number' ? (settings['frameRate'] as number) : null,
      facingMode:
        typeof settings['facingMode'] === 'string' ? (settings['facingMode'] as string) : null,
    },
    video: { width: vw, height: vh },
    decoderInput: {
      width: Math.round((vw * scale) / 2) * 2,
      height: Math.round((vh * scale) / 2) * 2,
      longEdgeCap: DECODER_LONG_EDGE_CAP,
    },
    capabilities: {
      focusMode: focusModes,
      zoom: input.zoomMax !== null,
      torch: input.torch,
    },
    focusControl: input.focusControl,
    formFactor: input.formFactor,
    camera: {
      label: typeof input.track?.label === 'string' && input.track.label ? input.track.label : null,
      videoInputs: input.videoInputs ?? null,
    },
    preview: {
      cssWidth: Math.round(input.preview?.cssWidth ?? 0),
      cssHeight: Math.round(input.preview?.cssHeight ?? 0),
    },
  };
}

/**
 * SOL-045 — is the QA read-out asked for? It is opt-in through the address (`?camera=diag`) and never
 * shown otherwise: these are engineering numbers, not something a customer should ever read.
 */
export function cameraQaRequested(search?: string): boolean {
  const query = search ?? (typeof window !== 'undefined' ? window.location.search : '');
  return new URLSearchParams(query).get('camera') === 'diag';
}

/** the measured chain as one readable block: request -> track -> element -> decoder -> capabilities */
export function cameraDiagnosticsReport(d: CameraDiagnostics): string {
  const size = (w: number | null, h: number | null) =>
    w && h ? `${w}x${h}` : w || h ? `${w ?? '?'}x${h ?? '?'}` : 'nieznane';
  return [
    `urzadzenie      ${d.formFactor}`,
    `kamera          ${d.camera.label ?? 'bez nazwy'}${
      d.camera.videoInputs !== null ? ` (dostepnych: ${d.camera.videoInputs})` : ''
    }`,
    `zadano          ${size(d.requested.width, d.requested.height)} @${d.requested.frameRate} fps` +
      `${d.requested.facingMode ? ` facingMode=${d.requested.facingMode}` : ' bez facingMode'}`,
    `otwarto szczebel ${d.rung} ${d.rung === 0 ? '(pelne zadanie)' : d.rung === 1 ? '(sam facingMode)' : '(cokolwiek)'}`,
    `track dal       ${size(d.delivered.width, d.delivered.height)} @${d.delivered.frameRate ?? '?'} fps` +
      `${d.delivered.facingMode ? ` facingMode=${d.delivered.facingMode}` : ''}`,
    `<video>         ${size(d.video.width, d.video.height)}`,
    `podglad CSS     ${size(d.preview.cssWidth, d.preview.cssHeight)}`,
    `dekoder dostaje ${size(d.decoderInput.width, d.decoderInput.height)} (limit dluzszego boku ${d.decoderInput.longEdgeCap})`,
    `ostrosc         ${d.focusControl}${
      d.capabilities.focusMode
        ? ` focusMode=[${d.capabilities.focusMode.join(', ')}]`
        : ' brak focusMode'
    }`,
    `zoom / latarka  ${d.capabilities.zoom ? 'tak' : 'nie'} / ${d.capabilities.torch ? 'tak' : 'nie'}`,
  ].join('\n');
}

/** how many cameras the machine offers — the count alone, no labels and no ids are collected here */
export async function countVideoInputs(): Promise<number | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return null;
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'videoinput').length;
  } catch {
    return null;
  }
}

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
    const formFactor = detectFormFactor();
    // A laptop has no environment-facing camera; asking for one lets the browser pick any device it
    // likes (SOL-045). The rear camera is requested only where one exists.
    const requested = {
      width: 1920,
      height: 1080,
      frameRate: 30,
      ...(formFactor === 'mobile' ? { facingMode: 'environment' as const } : {}),
    };
    const delivered = await this.camera.open(video, requested);
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
    // the measurement is published once the camera is live: the device count is asked for last so a
    // slow enumerateDevices never delays the preview the customer is waiting for
    const box =
      typeof video.getBoundingClientRect === 'function' ? video.getBoundingClientRect() : null;
    const videoInputs = await countVideoInputs();
    if (this.done) return;
    this.handlers.onDiagnostics?.(
      cameraDiagnostics({
        requested,
        rung: this.camera.lastRung,
        track: this.camera.track,
        video,
        focusControl: this.focusControl,
        formFactor: this.formFactor,
        zoomMax: this.zoomMax,
        torch: this.torchAvailable,
        videoInputs,
        preview: { cssWidth: box?.width ?? 0, cssHeight: box?.height ?? 0 },
      }),
    );
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
