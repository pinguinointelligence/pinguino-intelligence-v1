/**
 * Main-thread side of the decode Worker: one frame in flight, a two-slot luma buffer pool, and the
 * transfer/latency statistics the checklist asks for (B9). Never blocks the caller: `submit` returns
 * false when the worker is busy and the loop counts a dropped frame.
 */
import type { FrameEvidence, FrameTransferPath, TransferStats } from '../types';
import { SampleBuffer } from '../stats/percentiles';
import type {
  CameraStateMessage,
  DecodePlan,
  ProfileMessage,
  ReadyMessage,
  WorkerToMain,
} from './protocol';

export interface SubmitFrame {
  frameIndex: number;
  tCapture: number;
  path: FrameTransferPath;
  width: number;
  height: number;
  luma?: Uint8Array;
  bitmap?: ImageBitmap;
  videoFrame?: { close(): void };
}

export interface DecodeClientOptions {
  plan?: Partial<DecodePlan>;
  onResult: (evidence: FrameEvidence) => void;
  onDropped?: (frameIndex: number) => void;
  onError?: (message: string, frameIndex: number | null) => void;
  onObservation?: (frameIndex: number, observation: unknown) => void;
  /** Worker factory (injectable for tests). */
  createWorker?: () => Worker;
  readyTimeoutMs?: number;
}

function defaultWorker(): Worker {
  return new Worker(new URL('./decodeWorker.ts', import.meta.url), { type: 'module' });
}

export class DecodeClient {
  private worker: Worker | null = null;
  private inFlight: { frameIndex: number; tSubmit: number } | null = null;
  private readonly pool: ArrayBuffer[] = [];
  private bufferAllocations = 0;
  private bufferReuseHits = 0;
  private readonly mainToWorker = new SampleBuffer(4096);
  private readonly workerReply = new SampleBuffer(4096);
  private readonly roundTrip = new SampleBuffer(4096);
  private lastPath: FrameTransferPath = 'rgba_buffer';
  ready: ReadyMessage | null = null;

  constructor(private readonly opts: DecodeClientOptions) {}

  get busy(): boolean {
    return this.inFlight !== null;
  }

  async start(): Promise<ReadyMessage> {
    if (this.worker) throw new Error('DecodeClient already started');
    const worker = (this.opts.createWorker ?? defaultWorker)();
    this.worker = worker;
    const ready = new Promise<ReadyMessage>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('decode worker did not become ready in time')),
        this.opts.readyTimeoutMs ?? 30_000,
      );
      worker.onmessage = (event: MessageEvent<WorkerToMain>) => {
        const msg = event.data;
        if (msg.type === 'ready') {
          clearTimeout(timer);
          this.ready = msg;
          worker.onmessage = (e: MessageEvent<WorkerToMain>) => this.onMessage(e.data);
          resolve(msg);
        } else if (msg.type === 'error') {
          clearTimeout(timer);
          reject(new Error(msg.message));
        }
      };
      worker.onerror = (event) => {
        clearTimeout(timer);
        reject(new Error(`decode worker failed to load: ${event.message}`));
      };
    });
    worker.postMessage({ type: 'init', wasmUrl: null, plan: this.opts.plan ?? {} });
    return ready;
  }

  setPlan(plan: Partial<DecodePlan>): void {
    this.worker?.postMessage({ type: 'plan', plan });
  }

  sendProfile(profile: ProfileMessage['profile'], zoomApproved: boolean): void {
    this.worker?.postMessage({ type: 'profile', profile, zoomApproved } satisfies ProfileMessage);
  }

  sendCameraState(state: Omit<CameraStateMessage, 'type'>): void {
    this.worker?.postMessage({ type: 'camera', ...state } satisfies CameraStateMessage);
  }

  /** Luma buffer from the pool (allocates only when the pool is empty or the size changed). */
  acquireLumaBuffer(size: number): Uint8Array {
    while (this.pool.length) {
      const buf = this.pool.pop()!;
      if (buf.byteLength === size) {
        this.bufferReuseHits += 1;
        return new Uint8Array(buf);
      }
    }
    this.bufferAllocations += 1;
    return new Uint8Array(new ArrayBuffer(size));
  }

  submit(frame: SubmitFrame): boolean {
    const worker = this.worker;
    if (!worker || this.inFlight) {
      if (frame.luma) this.release(frame.luma.buffer as ArrayBuffer);
      frame.bitmap?.close();
      frame.videoFrame?.close();
      return false;
    }
    this.inFlight = { frameIndex: frame.frameIndex, tSubmit: performance.now() };
    this.lastPath = frame.path;
    const transfer: Transferable[] = [];
    const message = {
      type: 'frame' as const,
      frameIndex: frame.frameIndex,
      tCapture: frame.tCapture,
      tSent: 0,
      path: frame.path,
      width: frame.width,
      height: frame.height,
      luma: frame.luma ? (frame.luma.buffer as ArrayBuffer) : undefined,
      bitmap: frame.bitmap,
      videoFrame: frame.videoFrame,
    };
    if (message.luma) transfer.push(message.luma);
    if (frame.bitmap) transfer.push(frame.bitmap);
    if (frame.videoFrame) transfer.push(frame.videoFrame as unknown as Transferable);
    message.tSent = performance.timeOrigin + performance.now();
    worker.postMessage(message, transfer);
    return true;
  }

  stats(): TransferStats {
    return {
      path: this.lastPath,
      mainToWorkerMs: this.mainToWorker.snapshot(),
      workerReplyMs: this.workerReply.snapshot(),
      bufferReuseHits: this.bufferReuseHits,
      bufferAllocations: this.bufferAllocations,
    };
  }

  roundTripStats() {
    return this.roundTrip.snapshot();
  }

  resetStats(): void {
    this.mainToWorker.reset();
    this.workerReply.reset();
    this.roundTrip.reset();
    this.bufferAllocations = 0;
    this.bufferReuseHits = 0;
  }

  stop(): void {
    this.worker?.terminate();
    this.worker = null;
    this.inFlight = null;
    this.pool.length = 0;
  }

  private release(buffer: ArrayBuffer | undefined): void {
    if (buffer && buffer.byteLength > 0 && this.pool.length < 2) this.pool.push(buffer);
  }

  private onMessage(msg: WorkerToMain): void {
    const now = performance.now();
    if (msg.type === 'result') {
      const flight = this.inFlight;
      this.inFlight = null;
      this.release(msg.luma);
      if (msg.evidence.transfer) this.mainToWorker.push(msg.evidence.transfer.mainToWorkerMs);
      this.workerReply.push(Math.max(0, performance.timeOrigin + now - msg.tWorkerDone));
      if (flight && flight.frameIndex === msg.evidence.frameIndex) {
        msg.evidence.roundTripMs = now - flight.tSubmit;
        this.roundTrip.push(msg.evidence.roundTripMs);
      }
      this.opts.onResult(msg.evidence);
      return;
    }
    if (msg.type === 'dropped') {
      this.release(msg.luma);
      this.opts.onDropped?.(msg.frameIndex);
      return;
    }
    if (msg.type === 'observation') {
      this.opts.onObservation?.(msg.frameIndex, msg.observation);
      return;
    }
    if (msg.type === 'error') {
      if (this.inFlight && this.inFlight.frameIndex === msg.frameIndex) this.inFlight = null;
      this.release(msg.luma);
      this.opts.onError?.(msg.message, msg.frameIndex);
    }
  }
}
