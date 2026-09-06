/**
 * Live frame loop (B7–B9): requestVideoFrameCallback cadence with an rAF fallback, one capture path per
 * run (RGBA buffer → luma on the main thread, ImageBitmap, or VideoFrame handed to the worker), presented
 * vs processed vs dropped counts, per-second fps, visibility events and worker duty cycles as a CPU proxy.
 */
import type { FrameEvidence, FrameTickRecord, FrameTransferPath, LoopStats } from '../types';
import { SampleBuffer } from '../stats/percentiles';
import { rgbaToLuminance } from '../vision/luminance';
import type { DecodeClient } from '../worker/decodeClient';

interface VideoFrameMetadata {
  presentedFrames?: number;
  mediaTime?: number;
  expectedDisplayTime?: number;
  captureTime?: number;
  receiveTime?: number;
}
type VideoWithRvfc = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, metadata: VideoFrameMetadata) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};
type VideoFrameCtor = new (source: CanvasImageSource) => { close(): void; displayWidth: number };

export interface FrameLoopOptions {
  video: HTMLVideoElement;
  client: DecodeClient;
  path: FrameTransferPath | 'auto';
  /** Cap on the analysis plane's LONG edge in px (portrait phones deliver 1080×1920); 0 = native, capped at 1920. */
  analysisLongEdge?: number;
  onTick?: (tick: FrameTickRecord & { frameIndex: number }) => void;
  doc?: Document;
}

export function supportsVideoFrameCallback(video: HTMLVideoElement): boolean {
  return typeof (video as VideoWithRvfc).requestVideoFrameCallback === 'function';
}

export function availableTransferPaths(offscreenInWorker: boolean): FrameTransferPath[] {
  const paths: FrameTransferPath[] = ['rgba_buffer'];
  if (offscreenInWorker && typeof createImageBitmap === 'function') paths.push('image_bitmap');
  if (
    offscreenInWorker &&
    typeof (globalThis as { VideoFrame?: unknown }).VideoFrame === 'function'
  ) {
    paths.push('video_frame');
  }
  return paths;
}

export class FrameLoop {
  private running = false;
  private handle = 0;
  private frameIndex = 0;
  private t0 = 0;
  private lastCallbackAt: number | null = null;
  private lastCurrentTime = -1;
  private firstPresented: number | null = null;
  private lastPresented: number | null = null;
  private callbacks = 0;
  private processed = 0;
  private droppedDecode = 0;
  private droppedLocalize = 0;
  private capturing = false;
  private readonly cadence = new SampleBuffer(8192);
  private readonly fpsBuckets: number[] = [];
  private readonly visibility: Array<{ t: number; state: string }> = [];
  private localizeBusyMs = 0;
  private decodeBusyMs = 0;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private resolvedPath: FrameTransferPath = 'rgba_buffer';
  private source: LoopStats['source'] = 'animation_frame';
  private readonly onVisibility = () => {
    const state = this.doc.visibilityState;
    this.visibility.push({ t: performance.now() - this.t0, state });
  };
  private readonly doc: Document;

  constructor(private readonly opts: FrameLoopOptions) {
    this.doc = opts.doc ?? document;
  }

  get path(): FrameTransferPath {
    return this.resolvedPath;
  }

  start(): void {
    if (this.running) return;
    const { video, client } = this.opts;
    const offscreen = client.ready?.offscreenCanvas ?? false;
    const available = availableTransferPaths(offscreen);
    this.resolvedPath =
      this.opts.path === 'auto'
        ? 'rgba_buffer'
        : available.includes(this.opts.path)
          ? this.opts.path
          : 'rgba_buffer';
    this.running = true;
    this.t0 = performance.now();
    this.frameIndex = 0;
    this.callbacks = 0;
    this.processed = 0;
    this.droppedDecode = 0;
    this.droppedLocalize = 0;
    this.localizeBusyMs = 0;
    this.decodeBusyMs = 0;
    this.firstPresented = null;
    this.lastPresented = null;
    this.lastCallbackAt = null;
    this.cadence.reset();
    this.fpsBuckets.length = 0;
    this.visibility.length = 0;
    this.doc.addEventListener('visibilitychange', this.onVisibility);
    this.source = supportsVideoFrameCallback(video) ? 'video_frame_callback' : 'animation_frame';
    this.schedule();
  }

  /** The harness forwards every worker result so duty cycles can be accumulated here. */
  noteEvidence(evidence: FrameEvidence): void {
    if (evidence.saliency) this.localizeBusyMs += evidence.saliency.durationMs;
    for (const d of evidence.decodes) this.decodeBusyMs += d.durationMs;
  }

  stop(): LoopStats {
    this.running = false;
    const video = this.opts.video as VideoWithRvfc;
    if (this.source === 'video_frame_callback') video.cancelVideoFrameCallback?.(this.handle);
    else cancelAnimationFrame(this.handle);
    this.doc.removeEventListener('visibilitychange', this.onVisibility);
    const durationMs = performance.now() - this.t0;
    const presented =
      this.firstPresented !== null && this.lastPresented !== null
        ? this.lastPresented - this.firstPresented + 1
        : this.callbacks;
    return {
      source: this.source,
      durationMs,
      framesPresented: presented,
      framesProcessed: this.processed,
      framesDroppedLocalize: this.droppedLocalize,
      framesDroppedDecode: this.droppedDecode,
      cadenceMs: this.cadence.snapshot(),
      fpsPerSecond: [...this.fpsBuckets],
      visibilityEvents: [...this.visibility],
      localizeDutyCycle: durationMs > 0 ? this.localizeBusyMs / durationMs : 0,
      decodeDutyCycle: durationMs > 0 ? this.decodeBusyMs / durationMs : 0,
    };
  }

  private schedule(): void {
    if (!this.running) return;
    const video = this.opts.video as VideoWithRvfc;
    if (this.source === 'video_frame_callback' && video.requestVideoFrameCallback) {
      this.handle = video.requestVideoFrameCallback((now, metadata) => {
        this.onFrame(now, metadata);
        this.schedule();
      });
    } else {
      this.handle = requestAnimationFrame((now) => {
        if (video.currentTime !== this.lastCurrentTime) {
          this.lastCurrentTime = video.currentTime;
          this.onFrame(now, undefined);
        }
        this.schedule();
      });
    }
  }

  private onFrame(now: number, metadata: VideoFrameMetadata | undefined): void {
    this.callbacks += 1;
    if (metadata && typeof metadata.presentedFrames === 'number') {
      if (this.firstPresented === null) this.firstPresented = metadata.presentedFrames;
      this.lastPresented = metadata.presentedFrames;
    }
    if (this.lastCallbackAt !== null) this.cadence.push(now - this.lastCallbackAt);
    this.lastCallbackAt = now;
    const second = Math.floor((now - this.t0) / 1000);
    while (this.fpsBuckets.length <= second) this.fpsBuckets.push(0);
    this.fpsBuckets[second] = (this.fpsBuckets[second] ?? 0) + 1;

    const tMs = now - this.t0;
    const frameIndex = this.frameIndex;
    this.frameIndex += 1;

    if (this.doc.hidden) {
      this.droppedDecode += 1;
      this.opts.onTick?.({ frameIndex, tMs, processed: false });
      return;
    }
    if (this.opts.client.busy || this.capturing) {
      this.droppedDecode += 1;
      this.opts.onTick?.({ frameIndex, tMs, processed: false });
      return;
    }
    const tCapture = performance.now();
    const { width, height } = this.analysisSize();
    if (width === 0 || height === 0) {
      this.droppedLocalize += 1;
      this.opts.onTick?.({ frameIndex, tMs, processed: false });
      return;
    }
    if (this.resolvedPath === 'rgba_buffer') {
      const luma = this.captureLuma(width, height);
      const captureToLumaMs = performance.now() - tCapture;
      const accepted = luma
        ? this.opts.client.submit({
            frameIndex,
            tCapture,
            path: 'rgba_buffer',
            width,
            height,
            luma,
          })
        : false;
      if (accepted) this.processed += 1;
      else this.droppedDecode += 1;
      this.opts.onTick?.({ frameIndex, tMs, processed: accepted, captureToLumaMs });
      return;
    }
    // asynchronous paths: mark capturing until the bitmap/frame is handed over
    this.capturing = true;
    void this.captureAsync(frameIndex, tCapture, width, height)
      .then((accepted) => {
        if (accepted) this.processed += 1;
        else this.droppedDecode += 1;
        this.opts.onTick?.({
          frameIndex,
          tMs,
          processed: accepted,
          captureToLumaMs: performance.now() - tCapture,
        });
      })
      .catch(() => {
        this.droppedLocalize += 1;
        this.opts.onTick?.({ frameIndex, tMs, processed: false });
      })
      .finally(() => {
        this.capturing = false;
      });
  }

  private analysisSize(): { width: number; height: number } {
    const { video } = this.opts;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return { width: 0, height: 0 };
    const cap =
      this.opts.analysisLongEdge && this.opts.analysisLongEdge > 0
        ? this.opts.analysisLongEdge
        : 1920;
    const long = Math.max(vw, vh);
    if (long <= cap) return { width: vw, height: vh };
    const scale = cap / long;
    return {
      width: Math.round((vw * scale) / 2) * 2,
      height: Math.round((vh * scale) / 2) * 2,
    };
  }

  private captureLuma(width: number, height: number): Uint8Array | null {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }
    const canvas = this.canvas;
    const ctx = this.ctx;
    if (!ctx) return null;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.drawImage(this.opts.video, 0, 0, width, height);
    const image = ctx.getImageData(0, 0, width, height);
    const luma = this.opts.client.acquireLumaBuffer(width * height);
    rgbaToLuminance(image.data, width, height, luma);
    return luma;
  }

  private async captureAsync(
    frameIndex: number,
    tCapture: number,
    width: number,
    height: number,
  ): Promise<boolean> {
    const { video, client } = this.opts;
    if (this.resolvedPath === 'video_frame') {
      const Ctor = (globalThis as { VideoFrame?: VideoFrameCtor }).VideoFrame;
      if (Ctor) {
        try {
          const frame = new Ctor(video);
          return client.submit({
            frameIndex,
            tCapture,
            path: 'video_frame',
            width: video.videoWidth,
            height: video.videoHeight,
            videoFrame: frame,
          });
        } catch {
          // Safari: VideoFrame from <video> unsupported → fall back for the rest of the run
          this.resolvedPath = 'image_bitmap';
        }
      } else {
        this.resolvedPath = 'image_bitmap';
      }
    }
    const bitmap = await createImageBitmap(video, {
      resizeWidth: width,
      resizeHeight: height,
      resizeQuality: 'low',
    });
    return client.submit({
      frameIndex,
      tCapture,
      path: 'image_bitmap',
      width: bitmap.width,
      height: bitmap.height,
      bitmap,
    });
  }
}
