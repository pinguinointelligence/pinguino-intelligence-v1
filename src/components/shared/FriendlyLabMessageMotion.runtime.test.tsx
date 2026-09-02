/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FriendlyLabMessageMotion } from './FriendlyLabMessageMotion';
import {
  FRIENDLY_LAB_MESSAGE_MOTION,
  type FriendlyLabMessageTiming,
} from './friendlyLabMotionTiming';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let host: HTMLDivElement;
let root: Root;
let originalMatchMedia: typeof window.matchMedia;

const renderMessage = async (timing: FriendlyLabMessageTiming) => {
  await act(async () => {
    root.render(
      <FriendlyLabMessageMotion timing={timing} testId="friendly-message">
        Gotowe.
      </FriendlyLabMessageMotion>,
    );
  });
};

const message = () => host.querySelector<HTMLElement>('[data-testid="friendly-message"]');

beforeEach(() => {
  vi.useFakeTimers();
  originalMatchMedia = window.matchMedia;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: false }),
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: originalMatchMedia,
  });
  vi.useRealTimers();
});

describe('Friendly Lab transient message motion', () => {
  it('keeps informational feedback fully visible for 3.6 seconds before a 220 ms exit', async () => {
    await renderMessage('informational');
    expect(message()?.dataset.motionPhase).toBe('entering');

    await act(async () => vi.advanceTimersByTimeAsync(20));
    expect(message()?.dataset.motionPhase).toBe('visible');

    await act(async () =>
      vi.advanceTimersByTimeAsync(
        FRIENDLY_LAB_MESSAGE_MOTION.entryMs +
          FRIENDLY_LAB_MESSAGE_MOTION.informationalVisibleMs -
          1,
      ),
    );
    expect(message()?.dataset.motionPhase).toBe('visible');

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(message()?.dataset.motionPhase).toBe('leaving');

    await act(async () => vi.advanceTimersByTimeAsync(FRIENDLY_LAB_MESSAGE_MOTION.exitMs));
    expect(message()).toBeNull();
  });

  it('keeps an important completion fully visible for 4.6 seconds', async () => {
    await renderMessage('important');
    await act(async () =>
      vi.advanceTimersByTimeAsync(
        20 +
          FRIENDLY_LAB_MESSAGE_MOTION.entryMs +
          FRIENDLY_LAB_MESSAGE_MOTION.importantVisibleMs -
          1,
      ),
    );
    expect(message()?.dataset.motionPhase).toBe('visible');

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(message()?.dataset.motionPhase).toBe('leaving');
  });

  it.each(['progress', 'persistent'] as const)('never auto-hides %s feedback', async (timing) => {
    await renderMessage(timing);
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(message()?.dataset.motionPhase).toBe('visible');
  });

  it('removes motion for reduced-motion users while preserving the informational dwell', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });
    await renderMessage('informational');
    expect(message()?.dataset.motionPhase).toBe('visible');

    await act(async () =>
      vi.advanceTimersByTimeAsync(FRIENDLY_LAB_MESSAGE_MOTION.informationalVisibleMs - 1),
    );
    expect(message()).not.toBeNull();

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(message()).toBeNull();
  });
});
