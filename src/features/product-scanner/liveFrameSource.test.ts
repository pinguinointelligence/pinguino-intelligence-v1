import { describe, expect, it, vi } from 'vitest';
import { createLiveFrameSource } from './liveFrameSource';

describe('LiveFrameSource browser adapter', () => {
  it('uses requestVideoFrameCallback when the video element supports it', () => {
    let callback: (() => void) | null = null;
    const cancel = vi.fn();
    const video = {
      requestVideoFrameCallback: vi.fn((next: () => void) => {
        callback = next;
        return 41;
      }),
      cancelVideoFrameCallback: cancel,
    } as unknown as HTMLVideoElement;
    const onFrame = vi.fn();
    const source = createLiveFrameSource(video, onFrame);

    expect(source.kind).toBe('video_frame_callback');
    source.start();
    expect(video.requestVideoFrameCallback).toHaveBeenCalledOnce();
    (callback as (() => void) | null)?.();
    expect(onFrame).toHaveBeenCalledOnce();
    source.stop();
    expect(cancel).toHaveBeenCalledWith(41);
  });

  it('falls back to a controlled animation-frame scheduler', () => {
    let callback: FrameRequestCallback | null = null;
    const cancelAnimationFrame = vi.fn();
    const onFrame = vi.fn();
    const source = createLiveFrameSource({} as HTMLVideoElement, onFrame, {
      requestAnimationFrame: (next) => {
        callback = next;
        return 9;
      },
      cancelAnimationFrame,
    });

    expect(source.kind).toBe('animation_frame');
    source.start();
    (callback as FrameRequestCallback | null)?.(10);
    expect(onFrame).toHaveBeenCalledOnce();
    source.pause();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(9);
    source.resume();
    source.stop();
  });

  it('stops scheduling while paused and resumes without losing session state', () => {
    let callback: (() => void) | null = null;
    const video = {
      requestVideoFrameCallback(next: () => void) {
        callback = next;
        return 3;
      },
      cancelVideoFrameCallback: vi.fn(),
    } as unknown as HTMLVideoElement;
    const onFrame = vi.fn();
    const source = createLiveFrameSource(video, onFrame);
    source.start();
    source.pause();
    (callback as (() => void) | null)?.();
    expect(onFrame).not.toHaveBeenCalled();
    source.resume();
    (callback as (() => void) | null)?.();
    expect(onFrame).toHaveBeenCalledOnce();
  });
});
