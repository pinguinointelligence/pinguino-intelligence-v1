/**
 * Camera acquisition for the harness (B1–B6): open with an explicit request, record what was delivered,
 * enumerate cameras after permission, switch by tester choice, probe zoom and torch, and map every
 * failure to a Polish sentence. No identifiers are persisted: deviceId/groupId are stripped from the
 * recorded settings and capabilities (they are per-origin hashes, but the rule is "none").
 */
import type {
  CameraControls,
  CameraOption,
  ControlProbeResult,
  DeliveredVideo,
  RequestedVideo,
} from '../types';
import { rankCameras } from './cameraHeuristics';

export interface CameraErrorInfo {
  code: string;
  messagePl: string;
  retryLooser: boolean;
}

export function describeCameraError(error: unknown): CameraErrorInfo {
  const name =
    error && typeof error === 'object' && 'name' in error
      ? String((error as { name: unknown }).name)
      : 'Error';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return {
        code: name,
        messagePl:
          'Brak zgody na użycie aparatu. Zezwól na dostęp do aparatu w ustawieniach przeglądarki i spróbuj ponownie.',
        retryLooser: false,
      };
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return { code: name, messagePl: 'Nie znaleziono aparatu.', retryLooser: false };
    case 'NotReadableError':
    case 'TrackStartError':
      return {
        code: name,
        messagePl:
          'Aparat jest zajęty przez inną aplikację lub kartę. Zamknij ją i spróbuj ponownie.',
        retryLooser: false,
      };
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return {
        code: name,
        messagePl: 'Aparat nie obsługuje żądanych ustawień — próbuję łagodniejszych.',
        retryLooser: true,
      };
    case 'SecurityError':
      return {
        code: name,
        messagePl: 'Aparat działa tylko na stronie HTTPS. Otwórz stronę przez bezpieczny adres.',
        retryLooser: false,
      };
    case 'AbortError':
      return {
        code: name,
        messagePl: 'Uruchamianie aparatu zostało przerwane. Spróbuj ponownie.',
        retryLooser: false,
      };
    case 'TypeError':
      return {
        code: name,
        messagePl: 'Nieprawidłowe ustawienia aparatu (błąd harnessu).',
        retryLooser: true,
      };
    default:
      return {
        code: name,
        messagePl: 'Nie udało się uruchomić aparatu. Spróbuj ponownie.',
        retryLooser: false,
      };
  }
}

const IDENTIFIER_KEYS = new Set(['deviceId', 'groupId']);

/** Copies a MediaTrackSettings/Capabilities-like object into plain JSON without identifiers. */
export function sanitizeTrackRecord(record: object | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!record) return out;
  for (const [key, value] of Object.entries(record)) {
    if (IDENTIFIER_KEYS.has(key)) continue;
    if (value === undefined || typeof value === 'function') continue;
    out[key] = value;
  }
  return out;
}

export function buildConstraints(
  requested: RequestedVideo,
  rung: 0 | 1 | 2,
): MediaStreamConstraints {
  if (rung === 2) return { video: true, audio: false };
  if (rung === 1) {
    return {
      video: requested.deviceId
        ? { deviceId: { exact: requested.deviceId } }
        : { facingMode: requested.facingMode ?? 'environment' },
      audio: false,
    };
  }
  const video: MediaTrackConstraints = {
    width: { ideal: requested.width },
    height: { ideal: requested.height },
    frameRate: { ideal: requested.frameRate },
  };
  if (requested.deviceId) video.deviceId = { exact: requested.deviceId };
  else video.facingMode = { ideal: requested.facingMode ?? 'environment' };
  return { video, audio: false };
}

type TrackWithCaps = MediaStreamTrack & { getCapabilities?: () => MediaTrackCapabilities };

export class CameraSession {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  delivered: DeliveredVideo | null = null;
  requested: RequestedVideo | null = null;
  lastRung: 0 | 1 | 2 = 0;

  get track(): MediaStreamTrack | null {
    return this.stream?.getVideoTracks()[0] ?? null;
  }

  static isSupported(nav: Navigator = navigator): boolean {
    return typeof nav.mediaDevices?.getUserMedia === 'function';
  }

  /** Opens the camera walking three rungs (exact request → facing only → anything). */
  async open(video: HTMLVideoElement, requested: RequestedVideo): Promise<DeliveredVideo> {
    this.stop();
    this.video = video;
    this.requested = requested;
    const t0 = performance.now();
    let stream: MediaStream | null = null;
    let lastError: unknown = null;
    for (const rung of [0, 1, 2] as const) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(buildConstraints(requested, rung));
        this.lastRung = rung;
        break;
      } catch (error) {
        lastError = error;
        if (!describeCameraError(error).retryLooser) throw error;
      }
    }
    if (!stream) throw lastError ?? new Error('getUserMedia failed');
    const openMs = performance.now() - t0;
    this.stream = stream;
    video.setAttribute('playsinline', 'true');
    video.playsInline = true;
    video.muted = true;
    video.autoplay = true;
    video.srcObject = stream;
    const firstFrameMs = await this.awaitFirstFrame(video, t0);
    const track = this.track as TrackWithCaps | null;
    const settings = track?.getSettings() ?? {};
    const capabilities = track?.getCapabilities ? track.getCapabilities() : null;
    const supported = navigator.mediaDevices.getSupportedConstraints() as unknown as Record<
      string,
      boolean
    >;
    this.delivered = {
      width: settings.width ?? video.videoWidth,
      height: settings.height ?? video.videoHeight,
      frameRate: typeof settings.frameRate === 'number' ? settings.frameRate : null,
      aspectRatio: typeof settings.aspectRatio === 'number' ? settings.aspectRatio : null,
      facingMode: typeof settings.facingMode === 'string' ? settings.facingMode : null,
      deviceId: null,
      label: track?.label ?? null,
      settings: sanitizeTrackRecord(settings),
      capabilities: capabilities ? sanitizeTrackRecord(capabilities) : null,
      supportedConstraints: { ...supported },
      openMs,
      firstFrameMs,
    };
    return this.delivered;
  }

  private awaitFirstFrame(video: HTMLVideoElement, t0: number): Promise<number | null> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value: number | null) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const timer = setTimeout(() => finish(null), 8000);
      const rvfc = (
        video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }
      ).requestVideoFrameCallback;
      if (typeof rvfc === 'function') {
        rvfc.call(video, () => {
          clearTimeout(timer);
          finish(performance.now() - t0);
        });
      } else {
        video.addEventListener(
          'loadeddata',
          () => {
            clearTimeout(timer);
            finish(performance.now() - t0);
          },
          { once: true },
        );
      }
      video.play().catch(() => {
        /* autoplay policy: the tester's tap started this, so play() normally resolves */
      });
    });
  }

  /** Labels are only populated after permission — call after a successful open(). */
  async listCameras(): Promise<CameraOption[]> {
    if (typeof navigator.mediaDevices?.enumerateDevices !== 'function') return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return rankCameras(devices);
  }

  /** Zoom + torch probes (B5/B6): apply, read back, restore. Each probe records before/requested/after. */
  async probeControls(): Promise<CameraControls> {
    const track = this.track as TrackWithCaps | null;
    const caps = (track?.getCapabilities ? track.getCapabilities() : {}) as Record<string, unknown>;
    const zoomCap = caps['zoom'] as { min?: number; max?: number; step?: number } | undefined;
    const torchCap = caps['torch'] as boolean | undefined;
    const focusModes = caps['focusMode'] as string[] | undefined;
    const zoom = await this.probeZoom(track, zoomCap);
    const torch = await this.probeTorch(track, torchCap);
    return { zoom, torch, focusModeExposed: Array.isArray(focusModes) && focusModes.length > 0 };
  }

  private async probeZoom(
    track: MediaStreamTrack | null,
    cap: { min?: number; max?: number; step?: number } | undefined,
  ): Promise<ControlProbeResult> {
    const t0 = performance.now();
    if (!track || !cap || typeof cap.min !== 'number' || typeof cap.max !== 'number') {
      return { supported: false, ok: false, durationMs: performance.now() - t0 };
    }
    const before = (track.getSettings() as Record<string, unknown>)['zoom'];
    const target = Math.min(
      cap.max,
      Math.max(cap.min, typeof before === 'number' && before < 2 ? 2 : cap.min),
    );
    try {
      await track.applyConstraints({ advanced: [{ zoom: target } as MediaTrackConstraintSet] });
      const after = (track.getSettings() as Record<string, unknown>)['zoom'];
      // restore
      if (typeof before === 'number')
        await track.applyConstraints({ advanced: [{ zoom: before } as MediaTrackConstraintSet] });
      return {
        supported: true,
        range: { min: cap.min, max: cap.max, step: cap.step },
        before,
        requested: target,
        after,
        ok: after === target,
        durationMs: performance.now() - t0,
      };
    } catch (error) {
      return {
        supported: true,
        range: { min: cap.min, max: cap.max, step: cap.step },
        before,
        requested: target,
        ok: false,
        error: String(error),
        durationMs: performance.now() - t0,
      };
    }
  }

  private async probeTorch(
    track: MediaStreamTrack | null,
    cap: boolean | undefined,
  ): Promise<ControlProbeResult> {
    const t0 = performance.now();
    if (!track || cap !== true)
      return { supported: false, ok: false, durationMs: performance.now() - t0 };
    const before = (track.getSettings() as Record<string, unknown>)['torch'];
    try {
      await track.applyConstraints({ advanced: [{ torch: true } as MediaTrackConstraintSet] });
      const after = (track.getSettings() as Record<string, unknown>)['torch'];
      await track.applyConstraints({ advanced: [{ torch: false } as MediaTrackConstraintSet] });
      return {
        supported: true,
        before,
        requested: true,
        after,
        ok: after === true,
        durationMs: performance.now() - t0,
      };
    } catch (error) {
      return {
        supported: true,
        before,
        requested: true,
        ok: false,
        error: String(error),
        durationMs: performance.now() - t0,
      };
    }
  }

  async setTorch(on: boolean): Promise<boolean> {
    const track = this.track;
    if (!track) return false;
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      return (track.getSettings() as Record<string, unknown>)['torch'] === on;
    } catch {
      return false;
    }
  }

  async setZoom(zoom: number): Promise<number | null> {
    const track = this.track;
    if (!track) return null;
    try {
      await track.applyConstraints({ advanced: [{ zoom } as MediaTrackConstraintSet] });
      const after = (track.getSettings() as Record<string, unknown>)['zoom'];
      return typeof after === 'number' ? after : null;
    } catch {
      return null;
    }
  }

  onEnded(callback: () => void): () => void {
    const track = this.track;
    if (!track) return () => {};
    track.addEventListener('ended', callback);
    return () => track.removeEventListener('ended', callback);
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    this.video = null;
    this.delivered = null;
  }
}
