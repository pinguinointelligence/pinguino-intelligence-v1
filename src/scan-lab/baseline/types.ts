/**
 * Scan Core — Phase 0 baseline harness: shared contracts.
 *
 * This folder is an ISOLATED measurement harness (route /scan-lab/baseline, preview/dev only).
 * It must never import from src/features/product-scanner, the catalogue, the Engine or recipe stores.
 * It records benchmark evidence locally (IndexedDB) and exports it as a bundle; nothing leaves the device
 * automatically. No unique device identifiers are recorded.
 */

export type ExecutionMode =
  | 'safari_tab'
  | 'standalone_pwa'
  | 'chrome_tab'
  | 'browser_tab'
  | 'unknown';

export interface DeviceMeta {
  /** Chosen or typed by the tester (e.g. "iPhone 15 Pro Max", "Galaxy Note10+"). Never a serial number. */
  modelLabel: string;
  /** Detected from the user agent where possible (e.g. "iOS 26.6.1", "Android 12"). */
  os: string;
  /** Detected browser + version (e.g. "Safari 26.6", "Chrome 148"). */
  browser: string;
  executionMode: ExecutionMode;
  /** Desktop/laptop vs phone/tablet, from the UA (Mobile token / platform); drives the capability profile. */
  formFactor: 'mobile' | 'desktop' | 'unknown';
  userAgent: string;
  screen: { width: number; height: number; dpr: number };
  hardwareConcurrency: number | null;
  deviceMemoryGb: number | null;
  /** From navigator.userAgentData high-entropy hints when the browser grants them (Chromium): real
   *  platform version + model string (e.g. "SM-N975F"); the reduced UA only says "Android 10; K". */
  clientHints?: {
    platform: string | null;
    platformVersion: string | null;
    model: string | null;
    brands: string | null;
  } | null;
  capturedAt: string; // ISO timestamp
}

export interface CameraOption {
  deviceId: string;
  label: string;
  facing: 'user' | 'environment' | 'unknown';
  /** Heuristic: label mentions ultra-wide / 0.5x / "camera2 2" etc. */
  likelyUltrawide: boolean;
  /** Heuristic rank for "primary back camera" (lower is better). */
  primaryRank: number;
  /** Human note about the lens heuristic (e.g. iOS virtual multi-camera may auto-switch to the ultra-wide lens up close). */
  lensNote: string | null;
}

export interface RequestedVideo {
  width: number;
  height: number;
  frameRate: number;
  facingMode?: 'environment' | 'user';
  deviceId?: string;
}

export interface DeliveredVideo {
  width: number;
  height: number;
  frameRate: number | null;
  aspectRatio: number | null;
  facingMode: string | null;
  deviceId: string | null;
  label: string | null;
  settings: Record<string, unknown>;
  capabilities: Record<string, unknown> | null;
  supportedConstraints: Record<string, boolean>;
  /** capabilities.focusMode lists 'continuous' (or settings say so); null when the browser exposes nothing. */
  autofocus: boolean | null;
  /** Sharpness (Laplacian variance) and mean luma of a 320-px sample right after the first frame. */
  startQuality: { laplacianVar: number; meanLuma: number } | null;
  /** How long getUserMedia took from call to first resolved stream, ms. */
  openMs: number;
  /** Time from getUserMedia call to the first decoded video frame (loadeddata/rVFC), ms. */
  firstFrameMs: number | null;
}

export interface ControlProbeResult {
  supported: boolean;
  range?: { min: number; max: number; step?: number };
  before?: unknown;
  requested?: unknown;
  after?: unknown;
  ok: boolean;
  error?: string;
  durationMs: number;
}

export interface CameraControls {
  zoom: ControlProbeResult;
  torch: ControlProbeResult;
  focusModeExposed: boolean;
}

export interface LoopStats {
  source: 'video_frame_callback' | 'animation_frame';
  durationMs: number;
  framesPresented: number;
  framesProcessed: number;
  framesDroppedLocalize: number;
  framesDroppedDecode: number;
  cadenceMs: Percentiles;
  fpsPerSecond: number[];
  visibilityEvents: Array<{ t: number; state: string }>;
  /** Worker busy time / wall time — a CPU proxy, explicitly not a CPU percentage. */
  localizeDutyCycle: number;
  decodeDutyCycle: number;
}

export interface Percentiles {
  count: number;
  p50: number;
  p95: number;
  max: number;
  mean: number;
}

export type FrameTransferPath = 'video_frame' | 'image_bitmap' | 'rgba_buffer';

export interface TransferStats {
  path: FrameTransferPath;
  mainToWorkerMs: Percentiles;
  workerReplyMs: Percentiles;
  bufferReuseHits: number;
  bufferAllocations: number;
}

export interface Quad {
  points: [Point, Point, Point, Point];
}
export interface Point {
  x: number;
  y: number;
}

export interface SaliencyCandidate {
  quad: Quad;
  /** Dominant bar orientation in degrees (0 = bars vertical, code reads left→right). */
  orientationDeg: number;
  score: number;
  blockCount: number;
  /** Approximate module width in source pixels, null when not measurable. */
  moduleEstimatePx: number | null;
  /** Candidate width relative to the frame width, 0..1. */
  fillRatio: number;
}

export interface SaliencyResult {
  durationMs: number;
  candidates: SaliencyCandidate[];
  downscaledWidth: number;
  downscaledHeight: number;
}

export type DecodeVariant =
  | 'full_cheap'
  | 'full_harder'
  | 'roi_cheap'
  | 'roi_harder'
  | 'rectified_cheap'
  | 'core_medium'
  | 'core_native'
  | 'core_rectified'
  | 'core_rescue';

export interface DecodeOutcome {
  variant: DecodeVariant;
  inputWidth: number;
  inputHeight: number;
  durationMs: number;
  results: Array<{
    text: string;
    format: string;
    isValid: boolean;
    error: string;
    checksumValid: boolean;
    lineCount: number;
    quad: Quad | null;
  }>;
  /** Number of results zxing returned with an error but with geometry (detect-without-decode evidence). */
  errorResultsWithGeometry: number;
}

export interface FrameEvidence {
  frameIndex: number;
  /** performance.now() on the main thread when the frame was captured. */
  tCapture: number;
  width: number;
  height: number;
  transfer?: { path: FrameTransferPath; mainToWorkerMs: number };
  /** Main-thread submit → worker reply, ms (what the tester feels). */
  roundTripMs?: number;
  /** Time the worker spent on this frame (luminance + localize + every decode), ms. */
  workerBusyMs?: number;
  luminanceMs?: number;
  saliency?: SaliencyResult;
  decodes: DecodeOutcome[];
  /** Scan Core v0 per-frame decision record (audit diagnostics), present in scancore mode. */
  decision?: unknown;
  /** Scan Core observation emitted on this frame, if any. */
  observation?: unknown;
  /** Blur proxy (variance of a subsampled Laplacian) and exposure proxy on the luminance plane. */
  quality?: { laplacianVar: number; meanLuma: number; clippedHighRatio: number };
}

export interface ProbeStep {
  label: string;
  /** applyConstraints wall time, ms. */
  applyMs: number;
  settingsBefore: Record<string, unknown>;
  settingsAfter: Record<string, unknown>;
  /** ms from the end of applyConstraints to the first presented frame (rVFC), null when none came. */
  frameGapMs: number | null;
  /** presented frames in the 2 s after the apply. */
  framesIn2s: number;
  /** sharpness (Laplacian variance) and mean luma of a 320-px sample: before, then every ~200 ms for 2 s. */
  lapBefore: number | null;
  lapAfter: number[];
  meanBefore: number | null;
  meanAfter: number[];
  error?: string;
}

export interface ProbeResult {
  kind: 'resolution_switch' | 'zoom';
  at: string;
  steps: ProbeStep[];
}

export type SceneKind = 'barcode' | 'object';

export interface SceneDefinition {
  id: string;
  kind: SceneKind;
  title: string; // Polish, tester-facing
  instruction: string; // Polish, tester-facing
  durationMs: number;
  /** Optional: the tester may type the printed EAN so wrong reads can be counted. */
  expectsCode: boolean;
}

export type SceneRunState = 'ready' | 'recording' | 'done' | 'retry';

/** One presented frame as seen by the main loop; `tMs` is relative to the scene start. */
export interface FrameTickRecord {
  tMs: number;
  /** false when the frame was dropped because the worker was still busy. */
  processed: boolean;
  captureToLumaMs?: number | null;
}

export interface SceneRunSummary {
  sceneId: string;
  attempt: number;
  startedAt: string;
  /** performance.now() at scene start — the origin of every relative time in this scene. */
  t0: number;
  durationMs: number;
  framesProcessed: number;
  framesStored: number;
  firstCandidateMs: number | null;
  firstDecodeMs: number | null;
  decodedValues: Record<string, number>; // value -> count
  wrongValues: string[]; // values that differ from the tester-declared code (when declared)
  candidateCount: number;
  candidatesWithoutDecode: number;
  localizeMs: Percentiles;
  decodeFullMs: Percentiles;
  decodeRoiMs: Percentiles;
  decodeRectifiedMs: Percentiles;
  transferMs: Percentiles;
  declaredCode: string | null;
  notes: string;
  /** Presented-frame ticks (≤ 60 Hz × duration); absent when the loop could not observe presentation. */
  frameTicks?: FrameTickRecord[];
  /** Transfer path used for this scene. */
  transferPath?: FrameTransferPath;
}

export interface SessionRecord {
  sessionId: string;
  createdAt: string;
  device: DeviceMeta;
  camera: {
    selected: CameraOption | null;
    options: CameraOption[];
    requested: RequestedVideo;
    delivered: DeliveredVideo | null;
    /** Set when the harness re-opened on the ranked primary camera after facingMode picked another lens. */
    autoSwitchedFrom?: DeliveredVideo | null;
  };
  controls: CameraControls | null;
  loop: LoopStats | null;
  transfer: TransferStats | null;
  /** Decode worker facts recorded once per session. */
  worker: { warmupMs: number; zxingVersion: string; offscreenCanvas: boolean } | null;
  /** Phase 1 probes (resolution switch, zoom) run from the diagnostics panel. */
  probes?: ProbeResult[];
  scenes: SceneRunSummary[];
  harnessVersion: string;
}
