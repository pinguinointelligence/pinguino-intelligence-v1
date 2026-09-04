/**
 * Decode Worker: luminance → bar-texture saliency (localize) → zxing variants, one frame at a time.
 * Never queues: a frame that arrives while another is in flight is answered with `dropped` at once.
 * All per-frame buffers are pooled; the incoming luma ArrayBuffer is transferred back to the main thread.
 */
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import type { DecodeOutcome, FrameEvidence, Quad, SaliencyCandidate } from '../types';
import { downscaleLuminance, lumaQuality, rgbaToLuminance } from '../vision/luminance';
import { expandQuad, rectifyQuad } from '../vision/rectify';
import { BarSaliency } from '../vision/saliency';
import {
  CHEAP_OPTIONS,
  HARDER_OPTIONS,
  createZxingDecoder,
  type ZxingDecoder,
} from './zxingAdapter';
import {
  DEFAULT_DECODE_PLAN,
  type DecodePlan,
  type FrameMessage,
  type MainToWorker,
  type WorkerToMain,
} from './protocol';

interface WorkerScope {
  postMessage(message: WorkerToMain, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<MainToWorker>) => void) | null;
}
const scope = self as unknown as WorkerScope;

let decoder: ZxingDecoder | null = null;
let plan: DecodePlan = { ...DEFAULT_DECODE_PLAN };
const saliency = new BarSaliency();
let busy = false;
let framesWithoutHit = 0;

// pooled buffers
let lumaFromPixels: Uint8Array | undefined;
let downscaled: Uint8Array | undefined;
let roiBuffer: Uint8Array | undefined;
let rectified: Uint8Array | undefined;
let offscreen: OffscreenCanvas | null = null;
let offscreenCtx: OffscreenCanvasRenderingContext2D | null = null;

function post(message: WorkerToMain, transfer?: Transferable[]): void {
  scope.postMessage(message, transfer);
}

function normalizedAngle(orientationDeg: number): number {
  // bar orientation is periodic in 90°; distance to the nearest axis in [-45, 45]
  let a = orientationDeg % 90;
  if (a > 45) a -= 90;
  if (a < -45) a += 90;
  return a;
}

function quadBounds(quad: Quad, width: number, height: number, marginFrac: number) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of quad.points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const mx = (maxX - minX) * marginFrac;
  const my = (maxY - minY) * marginFrac;
  const x0 = Math.max(0, Math.floor(minX - mx));
  const y0 = Math.max(0, Math.floor(minY - my));
  const x1 = Math.min(width, Math.ceil(maxX + mx));
  const y1 = Math.min(height, Math.ceil(maxY + my));
  return { x0, y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

function cropLuma(
  luma: Uint8Array,
  width: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
): Uint8Array {
  const size = w * h;
  const out = roiBuffer && roiBuffer.length === size ? roiBuffer : new Uint8Array(size);
  roiBuffer = out;
  for (let y = 0; y < h; y += 1) {
    const src = (y0 + y) * width + x0;
    out.set(luma.subarray(src, src + w), y * w);
  }
  return out;
}

/** Shift decoder geometry from a crop back into full-frame coordinates. */
function offsetOutcome(outcome: DecodeOutcome, dx: number, dy: number): DecodeOutcome {
  for (const r of outcome.results) {
    if (!r.quad) continue;
    for (const p of r.quad.points) {
      p.x += dx;
      p.y += dy;
    }
  }
  return outcome;
}

function hasValidHit(outcomes: readonly DecodeOutcome[]): boolean {
  return outcomes.some((o) => o.results.some((r) => r.checksumValid));
}

async function lumaFromBitmap(
  source: ImageBitmap | (CanvasImageSource & { close(): void }),
  width: number,
  height: number,
): Promise<Uint8Array> {
  if (typeof OffscreenCanvas === 'undefined')
    throw new Error('OffscreenCanvas unavailable in this worker');
  if (!offscreen || offscreen.width !== width || offscreen.height !== height) {
    offscreen = new OffscreenCanvas(width, height);
    offscreenCtx = offscreen.getContext('2d', { willReadFrequently: true });
  }
  if (!offscreenCtx) throw new Error('OffscreenCanvas 2d context unavailable');
  offscreenCtx.drawImage(source as CanvasImageSource, 0, 0, width, height);
  const image = offscreenCtx.getImageData(0, 0, width, height);
  lumaFromPixels = rgbaToLuminance(image.data, width, height, lumaFromPixels);
  return lumaFromPixels;
}

async function handleFrame(msg: FrameMessage): Promise<void> {
  const tRecv = performance.now();
  const transferMs = tRecv - msg.tSent;
  const { width, height, frameIndex, tCapture } = msg;
  const decodes: DecodeOutcome[] = [];
  let luma: Uint8Array;
  let luminanceMs: number | undefined;
  const bitmapSource = (msg.bitmap ?? msg.videoFrame) as
    | (CanvasImageSource & { close(): void })
    | undefined;
  try {
    if (msg.luma) {
      luma = new Uint8Array(msg.luma);
    } else if (bitmapSource) {
      const t = performance.now();
      luma = await lumaFromBitmap(bitmapSource, width, height);
      luminanceMs = performance.now() - t;
    } else {
      throw new Error('frame carries no pixels');
    }
  } finally {
    try {
      bitmapSource?.close();
    } catch {
      /* already closed */
    }
  }

  const quality = lumaQuality(luma, width, height, 4);

  // Optional decode-size cap (B10/B11: decode at 1280 vs 1920 as actually delivered)
  let decodeLuma = luma;
  let dw = width;
  let dh = height;
  if (plan.maxDecodeWidth > 0 && width > plan.maxDecodeWidth) {
    const factor = Math.ceil(width / plan.maxDecodeWidth);
    const level = downscaleLuminance(luma, width, height, factor, downscaled);
    downscaled = level.data;
    decodeLuma = level.data;
    dw = level.width;
    dh = level.height;
  }

  const saliencyResult = plan.localize ? saliency.analyze(luma, width, height) : undefined;
  const best: SaliencyCandidate | undefined = saliencyResult?.candidates[0];

  const dec = decoder;
  if (!dec) throw new Error('decoder not initialised');

  if (plan.fullCheap)
    decodes.push(await dec.decodeLuma(decodeLuma, dw, dh, 'full_cheap', CHEAP_OPTIONS));
  if (!hasValidHit(decodes)) {
    framesWithoutHit += 1;
    if (plan.fullHarderEveryN > 0 && framesWithoutHit % plan.fullHarderEveryN === 0) {
      decodes.push(await dec.decodeLuma(decodeLuma, dw, dh, 'full_harder', HARDER_OPTIONS));
    }
  } else {
    framesWithoutHit = 0;
  }

  if (best) {
    if (plan.roiCheap) {
      const b = quadBounds(best.quad, width, height, 0.12);
      if (b.w >= 32 && b.h >= 8) {
        const roi = cropLuma(luma, width, b.x0, b.y0, b.w, b.h);
        decodes.push(
          offsetOutcome(
            await dec.decodeLuma(roi, b.w, b.h, 'roi_cheap', CHEAP_OPTIONS),
            b.x0,
            b.y0,
          ),
        );
      }
    }
    if (plan.rectifiedCheap && Math.abs(normalizedAngle(best.orientationDeg)) > 8) {
      const region = rectifyQuad(luma, width, height, expandQuad(best.quad, 0.15, 0.25), rectified);
      rectified = region.data;
      const outcome = await dec.decodeLuma(
        region.data,
        region.width,
        region.height,
        'rectified_cheap',
        CHEAP_OPTIONS,
      );
      outcome.durationMs += region.durationMs; // rectification is part of this variant's cost
      // geometry of a rectified crop is not in frame coordinates; drop it rather than mislead
      for (const r of outcome.results) r.quad = null;
      decodes.push(outcome);
    }
  }

  const evidence: FrameEvidence = {
    frameIndex,
    tCapture,
    width,
    height,
    transfer: { path: msg.path, mainToWorkerMs: transferMs },
    workerBusyMs: performance.now() - tRecv,
    luminanceMs,
    saliency: saliencyResult,
    decodes,
    quality,
  };
  const tWorkerDone = performance.now();
  if (msg.luma) post({ type: 'result', evidence, luma: msg.luma, tWorkerDone }, [msg.luma]);
  else post({ type: 'result', evidence, tWorkerDone });
}

scope.onmessage = (event) => {
  const msg = event.data;
  if (msg.type === 'init') {
    plan = { ...DEFAULT_DECODE_PLAN, ...msg.plan };
    decoder = createZxingDecoder({ wasmUrl: msg.wasmUrl ?? wasmUrl });
    decoder
      .warmup()
      .then((warmupMs) =>
        post({
          type: 'ready',
          warmupMs,
          zxingVersion: decoder?.version ?? 'unknown',
          offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
        }),
      )
      .catch((error: unknown) =>
        post({ type: 'error', frameIndex: null, message: `wasm warmup failed: ${String(error)}` }),
      );
    return;
  }
  if (msg.type === 'plan') {
    plan = { ...plan, ...msg.plan };
    return;
  }
  if (msg.type === 'frame') {
    if (busy) {
      try {
        ((msg.bitmap ?? msg.videoFrame) as { close?: () => void } | undefined)?.close?.();
      } catch {
        /* ignore */
      }
      if (msg.luma)
        post({ type: 'dropped', frameIndex: msg.frameIndex, luma: msg.luma }, [msg.luma]);
      else post({ type: 'dropped', frameIndex: msg.frameIndex });
      return;
    }
    busy = true;
    handleFrame(msg)
      .catch((error: unknown) => {
        if (msg.luma)
          post(
            { type: 'error', frameIndex: msg.frameIndex, message: String(error), luma: msg.luma },
            [msg.luma],
          );
        else post({ type: 'error', frameIndex: msg.frameIndex, message: String(error) });
      })
      .finally(() => {
        busy = false;
      });
  }
};
