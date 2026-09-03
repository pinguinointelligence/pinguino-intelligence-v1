/**
 * LIVE SCANNER — the wiring.
 *
 * Frame acquisition, recognition and the session are three separate authorities; this is
 * the only place that knows about all three, and it is deliberately thin. Its whole job
 * is: take a frame, grade it, keep the best one, ask what it is, fold the answer into the
 * session, and hand the result to the UI.
 *
 * Everything it uses already existed and is reused unchanged — `createLiveFrameSource`
 * drives the loop across Safari and Chrome, `scoreRgbaFrame` grades, and
 * `RollingBestFrameWindow` keeps the best frame of each short window so a confirmed
 * product carries a sharp reference image rather than whatever frame happened to win.
 *
 * PRIVACY. No video is streamed anywhere. Frames are read into a canvas in the page,
 * graded and decoded locally, and only the throttled, capped paid rung ever sends a
 * single selected still. `stop()` releases the camera.
 */
import { scoreRgbaFrame, type FrameQuality } from './frameQuality';
import { RollingBestFrameWindow } from './rollingBestFrame';
import type { LiveRecognizer } from './liveRecognition';
import {
  emptyLiveScanSession,
  observeFrame,
  removeAccepted,
  resolveAccepted,
  type AcceptedProduct,
  type LiveScanEvent,
  type LiveScanSessionState,
} from './liveScanSession';

export interface GrabbedFrame {
  readonly pixels: ImageData;
  readonly at: number;
}

/** What the UI is told after every frame. */
export interface LiveScanUpdate {
  readonly event: LiveScanEvent;
  readonly state: LiveScanSessionState;
}

export interface LiveScanControllerOptions {
  /** Reads the current video frame. Injected so the loop is testable without a DOM. */
  readonly grabFrame: () => GrabbedFrame | null;
  readonly recognizer: LiveRecognizer;
  readonly onUpdate: (update: LiveScanUpdate) => void;
  /** Optional: released on `stop()`, so the camera light goes out when the user cancels. */
  readonly stream?: MediaStream | null;
  /**
   * Carry a sweep across a camera restart.
   *
   * Ending at the review screen releases the camera, so "Skanuj dalej" has to open a new
   * one — and with it a new controller. Without this the customer would silently lose
   * everything they had already collected.
   */
  readonly resumeFrom?: LiveScanSnapshot | null;
}

/** Everything a sweep must survive a camera restart with. */
export interface LiveScanSnapshot {
  readonly state: LiveScanSessionState;
  readonly captures: ReadonlyMap<string, ImageData>;
}

/**
 * The live session as the UI sees it.
 *
 * Frames arrive faster than recognition completes, so the controller is strictly
 * non-reentrant: a frame that arrives mid-identification is dropped rather than queued.
 * Dropping is correct here — the next frame is 33 ms away and shows the same product.
 */
export class LiveScanController {
  private session: LiveScanSessionState;
  private readonly window = new RollingBestFrameWindow<ImageData>();
  /** The best frame of the most recently matured window, kept as the reference image. */
  private reference: ImageData | null = null;
  /** Reference images per accepted product, kept out of the pure session state. */
  private readonly captures: Map<string, ImageData>;
  private running = false;
  private busy = false;

  constructor(private readonly options: LiveScanControllerOptions) {
    this.session = options.resumeFrom?.state ?? emptyLiveScanSession();
    this.captures = new Map(options.resumeFrom?.captures ?? []);
  }

  /** What a successor controller needs to continue this sweep. */
  snapshot(): LiveScanSnapshot {
    return { state: this.session, captures: new Map(this.captures) };
  }

  get state(): LiveScanSessionState {
    return this.session;
  }

  captureFor(identityKey: string): ImageData | null {
    return this.captures.get(identityKey) ?? null;
  }

  start(): void {
    this.running = true;
  }

  /** Called for every camera frame by `createLiveFrameSource`. */
  onFrame(): void {
    if (!this.running || this.busy) return;
    const grabbed = this.options.grabFrame();
    if (!grabbed) return;

    const { pixels, at } = grabbed;
    const quality = scoreRgbaFrame(pixels.data, pixels.width, pixels.height);

    // Every frame is ranked, so the reference image is the best of a window and not the
    // one that happened to coincide with the decode.
    this.window.offer({
      value: pixels,
      score: quality.score,
      readable: quality.acceptableForAutoCapture,
      capturedAt: at,
    });
    const matured = this.window.takeReady(at);
    if (matured) this.reference = matured.value;

    this.busy = true;
    void this.identify(pixels, quality, at).finally(() => {
      this.busy = false;
    });
  }

  private async identify(pixels: ImageData, quality: FrameQuality, at: number): Promise<void> {
    const observation = await this.options.recognizer.observe(pixels, quality, at);
    const next = observeFrame(this.session, observation);
    this.session = next.state;

    // A product keeps the sharpest frame available when it was accepted.
    if (next.event.kind === 'confirmed' || next.event.kind === 'unresolved') {
      this.captures.set(next.event.product.identityKey, this.reference ?? pixels);
      // The scanner keeps sweeping: the window reopens immediately for the next product.
      this.window.reset();
      this.reference = null;
    }

    this.options.onUpdate({ event: next.event, state: this.session });
  }

  /** Drop a product from the review list; it can be scanned again straight away. */
  remove(identityKey: string): LiveScanSessionState {
    this.session = removeAccepted(this.session, identityKey);
    this.captures.delete(identityKey);
    return this.session;
  }

  /** Adopt the identity the deep flow established for a product collected here. */
  resolve(
    identityKey: string,
    resolution: { readonly id: string; readonly displayName: string },
  ): LiveScanSessionState {
    const capture = this.captures.get(identityKey);
    this.session = resolveAccepted(this.session, identityKey, resolution);
    if (capture) {
      this.captures.delete(identityKey);
      this.captures.set(resolution.id, capture);
    }
    return this.session;
  }

  get accepted(): readonly AcceptedProduct[] {
    return this.session.accepted;
  }

  /** Ends the sweep and releases the camera. */
  stop(): void {
    this.running = false;
    this.window.reset();
    for (const track of this.options.stream?.getTracks() ?? []) track.stop();
  }
}

/**
 * Reads video frames into pixels through a reused canvas.
 *
 * Downscaled: recognition does not need full sensor resolution, and a smaller frame keeps
 * the per-frame cost low enough to run continuously on a phone.
 */
export function createVideoFrameGrabber(
  video: HTMLVideoElement,
  maxWidth = 640,
): () => GrabbedFrame | null {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  return () => {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!context || width < 2 || height < 2) return null;
    const scale = Math.min(1, maxWidth / width);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return {
      pixels: context.getImageData(0, 0, canvas.width, canvas.height),
      at: performance.now(),
    };
  };
}
