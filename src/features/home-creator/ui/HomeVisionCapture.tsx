/**
 * §31 — the full-screen fruit camera.
 *
 * Deliberately not the barcode scanner: that one hunts a code in a moving
 * stream and needs a technical panel. This asks for ONE photograph of ONE
 * fruit, so the screen is a viewfinder, a reticle, one sentence and a shutter.
 *
 * The owner's shape, followed literally:
 *   · no small X in the top-left — every control lives in the bottom thumb zone;
 *   · no separate "AI" button — taking the photograph IS asking the question;
 *   · one honest refusal, never a candidate table.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { homeCreatorCopy } from '../homeCreatorCopy';
import { decideVisionOutcome } from '../homeVisionRecognition';
import { identifyLiveFrame, type LiveIdentifyResponse } from '@/services/productScanner';

/** The camera frame handed to the recogniser. JPEG keeps a fruit legible at a fraction of PNG. */
const CAPTURE_MIME = 'image/jpeg';
const CAPTURE_QUALITY = 0.86;
/** Long edge of the still we send. Enough for a fruit, small enough for one quick call. */
const CAPTURE_MAX_EDGE = 1280;

type Phase = 'starting' | 'live' | 'thinking' | 'unsure' | 'denied';

function sessionId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `vis_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** Draw the current video frame to a canvas and hand back bare base64 (no data: prefix). */
function stillFromVideo(video: HTMLVideoElement): { mime: string; base64: string } | null {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  const scale = Math.min(1, CAPTURE_MAX_EDGE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL(CAPTURE_MIME, CAPTURE_QUALITY);
  const comma = url.indexOf(',');
  if (comma < 0) return null;
  return { mime: CAPTURE_MIME, base64: url.slice(comma + 1) };
}

export function HomeVisionCapture({
  onClose,
  onRecognised,
}: {
  onClose: () => void;
  /** Canonical catalogue names of the fruit(s) recognised with confidence (§30). */
  onRecognised: (names: readonly string[]) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>('starting');
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [canSwitch, setCanSwitch] = useState(false);
  const session = useRef(sessionId());

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const media = navigator.mediaDevices;
    void (async () => {
      try {
        // A browser (or an insecure context) with no camera API is the same
        // outcome as a refused permission: we say so, we do not pretend.
        if (!media?.getUserMedia) throw new Error('no_camera_api');
        const stream = await media.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setPhase('live');
        // A switch control that cannot switch anything is clutter, so it only
        // appears where a second camera really exists (§31).
        const devices = await media.enumerateDevices().catch(() => []);
        if (!cancelled) {
          setCanSwitch(devices.filter((d) => d.kind === 'videoinput').length > 1);
        }
      } catch {
        if (!cancelled) setPhase('denied');
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [facing, stop]);

  const close = useCallback(() => {
    stop();
    onClose();
  }, [onClose, stop]);

  /** §31: the shutter IS the question. No second "AI" tap. */
  const shoot = useCallback(() => {
    const video = videoRef.current;
    if (!video || phase === 'thinking') return;
    const still = stillFromVideo(video);
    if (!still) {
      setPhase('unsure');
      return;
    }
    setPhase('thinking');
    void (async () => {
      // A recogniser that fails is a photograph that said nothing — never an
      // error thrown at someone holding up a banana.
      const answer: LiveIdentifyResponse | null = await identifyLiveFrame({
        sessionId: session.current,
        frame: still,
      }).catch(() => null);
      const outcome = decideVisionOutcome([answer]);
      if (outcome.kind === 'recognised') {
        stop();
        onRecognised(outcome.names);
        return;
      }
      setPhase('unsure');
    })();
  }, [onRecognised, phase, stop]);

  const thinking = phase === 'thinking';

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={homeCreatorCopy.intent.visionTooltip}
      data-testid="home-vision-capture"
      data-phase={phase}
    >
      {/* The viewfinder fills the screen; everything else floats over it. */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className={cn(
          'absolute inset-0 size-full object-cover',
          facing === 'user' && 'scale-x-[-1]',
        )}
        data-testid="home-vision-video"
      />

      {/* One sentence, high enough to clear the reticle and the thumb zone. */}
      <p
        className="relative z-[2] mt-[max(24px,env(safe-area-inset-top))] px-6 text-center text-[17px] leading-snug font-semibold text-white drop-shadow"
        data-testid="home-vision-prompt"
      >
        {phase === 'denied'
          ? homeCreatorCopy.vision.cameraUnavailable
          : phase === 'unsure'
            ? homeCreatorCopy.vision.unsure
            : thinking
              ? homeCreatorCopy.vision.thinking
              : homeCreatorCopy.vision.prompt}
      </p>

      {/* The reticle: a soft rounded frame, not a technical overlay. */}
      <div className="pointer-events-none relative z-[1] flex flex-1 items-center justify-center">
        <div
          aria-hidden
          className={cn(
            'aspect-square w-[min(72vw,320px)] rounded-[36px] border-2 transition-colors',
            thinking ? 'border-white' : 'border-white/70',
          )}
          style={{ boxShadow: '0 0 0 100vmax rgb(0 0 0 / 0.34)' }}
          data-testid="home-vision-reticle"
        />
      </div>

      {/* THUMB ZONE — close left, shutter centre, switch right (§31). */}
      <div className="relative z-[2] mb-[max(28px,env(safe-area-inset-bottom))] grid grid-cols-3 items-center px-8">
        <button
          type="button"
          onClick={close}
          aria-label={homeCreatorCopy.vision.close}
          title={homeCreatorCopy.vision.close}
          data-testid="home-vision-close"
          className="justify-self-start inline-flex size-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm"
        >
          <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" fill="none">
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <button
          type="button"
          onClick={shoot}
          disabled={phase === 'denied' || thinking}
          aria-label={homeCreatorCopy.vision.shutter}
          data-testid="home-vision-shutter"
          className={cn(
            'justify-self-center inline-flex size-[74px] items-center justify-center rounded-full border-[5px] border-white/85 transition-transform',
            thinking ? 'scale-95 bg-white/40' : 'bg-white/25 active:scale-95',
            phase === 'denied' && 'opacity-40',
          )}
        >
          <span aria-hidden className="size-[54px] rounded-full bg-white" />
        </button>

        {canSwitch ? (
          <button
            type="button"
            onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
            aria-label={homeCreatorCopy.vision.switchCamera}
            title={homeCreatorCopy.vision.switchCamera}
            data-testid="home-vision-switch"
            className="justify-self-end inline-flex size-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm"
          >
            <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" fill="none">
              <path
                d="M2.75 5.25h8.5m0 0L9 3m2.25 2.25L9 7.5m4.25 3.25h-8.5m0 0L7 8.5m-2.25 2.25L7 13"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ) : (
          <span aria-hidden />
        )}
      </div>
    </div>
  );
}
