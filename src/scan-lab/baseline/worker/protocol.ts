import type { DecodeVariant, FrameEvidence, FrameTransferPath } from '../types';

/** Which decode variants the worker runs on a frame; the harness measures each separately (B10–B14). */
export interface DecodePlan {
  /** Full-frame, cheap reader options (no tryHarder / tryRotate / tryInvert). */
  fullCheap: boolean;
  /** Full-frame, harder options; run only when the cheap pass found nothing valid, every N-th such frame. */
  fullHarderEveryN: number;
  /** Axis-aligned crop around the best saliency candidate, cheap options. */
  roiCheap: boolean;
  /** Homography-rectified crop of the best candidate, cheap options; skipped when the candidate is near axis-aligned. */
  rectifiedCheap: boolean;
  /** Localise (bar saliency) on every frame. */
  localize: boolean;
  /** Decode input width cap; a 1920-wide plane is decoded as-is when 0. */
  maxDecodeWidth: number;
}

export const DEFAULT_DECODE_PLAN: DecodePlan = {
  fullCheap: true,
  fullHarderEveryN: 2,
  roiCheap: true,
  rectifiedCheap: true,
  localize: true,
  maxDecodeWidth: 0,
};

export interface InitMessage {
  type: 'init';
  wasmUrl: string | null;
  plan: DecodePlan;
}

/** A frame handed to the worker. Exactly one of luma / bitmap / videoFrame is set, matching `path`. */
export interface FrameMessage {
  type: 'frame';
  frameIndex: number;
  tCapture: number;
  /** Epoch ms (performance.timeOrigin + performance.now()) right before postMessage — comparable across the
   *  worker boundary; each worker has its OWN performance.now() origin, so a raw now() would be meaningless. */
  tSent: number;
  path: FrameTransferPath;
  width: number;
  height: number;
  luma?: ArrayBuffer;
  bitmap?: ImageBitmap;
  videoFrame?: unknown;
}

export interface PlanMessage {
  type: 'plan';
  plan: Partial<DecodePlan>;
}

export type MainToWorker = InitMessage | FrameMessage | PlanMessage;

export interface ReadyMessage {
  type: 'ready';
  warmupMs: number;
  zxingVersion: string;
  offscreenCanvas: boolean;
}

export interface ResultMessage {
  type: 'result';
  evidence: FrameEvidence;
  /** The luma buffer handed back for reuse (rgba_buffer path only). */
  luma?: ArrayBuffer;
  /** Epoch ms (see FrameMessage.tSent). */
  tWorkerDone: number;
}

export interface DroppedMessage {
  type: 'dropped';
  frameIndex: number;
  luma?: ArrayBuffer;
}

export interface WorkerErrorMessage {
  type: 'error';
  frameIndex: number | null;
  message: string;
  luma?: ArrayBuffer;
}

export type WorkerToMain = ReadyMessage | ResultMessage | DroppedMessage | WorkerErrorMessage;

export const VARIANT_ORDER: readonly DecodeVariant[] = [
  'full_cheap',
  'full_harder',
  'roi_cheap',
  'rectified_cheap',
];
