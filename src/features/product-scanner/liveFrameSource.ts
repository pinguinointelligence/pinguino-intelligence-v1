export type LiveFrameSourceKind = 'video_frame_callback' | 'animation_frame';

export interface AnimationFrameScheduler {
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (handle: number) => void;
}

export interface LiveFrameSource {
  readonly kind: LiveFrameSourceKind;
  start(): void;
  pause(): void;
  resume(): void;
  stop(): void;
}

const browserScheduler = (): AnimationFrameScheduler => ({
  requestAnimationFrame: (callback) => globalThis.requestAnimationFrame(callback),
  cancelAnimationFrame: (handle) => globalThis.cancelAnimationFrame(handle),
});

/** Browser differences stop here. Every scheduled frame feeds the same Scanner pipeline. */
export function createLiveFrameSource(
  video: HTMLVideoElement,
  onFrame: () => void,
  scheduler: AnimationFrameScheduler = browserScheduler(),
): LiveFrameSource {
  const frameVideo = video;
  const useVideoFrames = typeof frameVideo.requestVideoFrameCallback === 'function';
  let active = false;
  let handle: number | null = null;

  const cancel = () => {
    if (handle === null) return;
    if (useVideoFrames) frameVideo.cancelVideoFrameCallback?.(handle);
    else scheduler.cancelAnimationFrame(handle);
    handle = null;
  };

  const schedule = () => {
    if (!active || handle !== null) return;
    if (useVideoFrames) {
      handle =
        frameVideo.requestVideoFrameCallback?.(() => {
          handle = null;
          if (!active) return;
          onFrame();
          schedule();
        }) ?? null;
    } else {
      handle = scheduler.requestAnimationFrame(() => {
        handle = null;
        if (!active) return;
        onFrame();
        schedule();
      });
    }
  };

  const start = () => {
    if (active) return;
    active = true;
    schedule();
  };
  const pause = () => {
    active = false;
    cancel();
  };

  return {
    kind: useVideoFrames ? 'video_frame_callback' : 'animation_frame',
    start,
    pause,
    resume: start,
    stop: pause,
  };
}
