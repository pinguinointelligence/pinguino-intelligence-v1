/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FriendlyLabMomentViewport } from './FriendlyLabMomentViewport';
import { announceFriendlyLabMoment } from './friendlyLabMoment';
import { FRIENDLY_LAB_MESSAGE_MOTION } from './friendlyLabMotionTiming';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let host: HTMLDivElement;
let root: Root;
let originalMatchMedia: typeof window.matchMedia;

const card = () =>
  document.querySelector<HTMLElement>('[data-testid="friendly-lab-moment-card"]');

beforeEach(async () => {
  vi.useFakeTimers();
  originalMatchMedia = window.matchMedia;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: false }),
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<FriendlyLabMomentViewport />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.querySelector('[data-testid="friendly-lab-moment-layer"]')?.remove();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: originalMatchMedia,
  });
  vi.useRealTimers();
});

describe('Friendly Lab app-level moment window', () => {
  it('shows Apply as a polite top-center card for the normal 3.6 second dwell', async () => {
    await act(async () =>
      announceFriendlyLabMoment('apply-complete', 'apply:recipe-1:revision-4'),
    );

    const layer = document.querySelector<HTMLElement>(
      '[data-testid="friendly-lab-moment-layer"]',
    );
    expect(layer?.className).toContain('fixed');
    expect(layer?.className).toContain('left-1/2');
    expect(layer?.className).toContain('top-[calc(env(safe-area-inset-top)+var(--pro-header-height)+0.75rem)]');
    expect(layer?.className).toContain('w-[calc(100vw-2rem)]');
    expect(layer?.className).toContain('sm:w-[400px]');
    expect(card()?.getAttribute('aria-live')).toBe('polite');
    expect(layer?.dataset.momentKind).toBe('apply-complete');
    expect(card()?.dataset.motionPhase).toBe('entering');
    expect(card()?.textContent).toContain('Perfetto. Receptura jest gotowa.');

    await act(async () => vi.advanceTimersByTimeAsync(20));
    expect(card()?.dataset.motionPhase).toBe('visible');
    await act(async () =>
      vi.advanceTimersByTimeAsync(
        FRIENDLY_LAB_MESSAGE_MOTION.entryMs +
          FRIENDLY_LAB_MESSAGE_MOTION.informationalVisibleMs -
          1,
      ),
    );
    expect(card()?.dataset.motionPhase).toBe('visible');
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(card()?.dataset.motionPhase).toBe('leaving');
  });

  it('keeps Production completion visible for the important 4.6 second dwell', async () => {
    await act(async () =>
      announceFriendlyLabMoment('production-complete', 'production:run-1:completed'),
    );
    expect(card()?.textContent).toContain('Gellattissimo! Partia gotowa.');

    await act(async () =>
      vi.advanceTimersByTimeAsync(
        20 +
          FRIENDLY_LAB_MESSAGE_MOTION.entryMs +
          FRIENDLY_LAB_MESSAGE_MOTION.importantVisibleMs -
          1,
      ),
    );
    expect(card()?.dataset.motionPhase).toBe('visible');
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(card()?.dataset.motionPhase).toBe('leaving');
  });

  it('deduplicates repeated transitions and never stacks different moments', async () => {
    await act(async () => {
      announceFriendlyLabMoment('save-complete', 'save:recipe-1:v2');
      announceFriendlyLabMoment('save-complete', 'save:recipe-1:v2');
    });
    expect(document.querySelectorAll('[data-testid="friendly-lab-moment-card"]')).toHaveLength(1);
    expect(card()?.textContent).toContain('Gotowe. Receptura zapisana.');

    await act(async () =>
      announceFriendlyLabMoment('label-ready', 'label:run-1:ready'),
    );
    expect(document.querySelectorAll('[data-testid="friendly-lab-moment-card"]')).toHaveLength(1);
    expect(card()?.textContent).toContain('Gotowe. Etykieta czeka na druk.');
  });

  it('starts fully visible without slide/scale timing when reduced motion is requested', async () => {
    await act(async () => root.unmount());
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });
    root = createRoot(host);
    await act(async () => root.render(<FriendlyLabMomentViewport />));
    await act(async () =>
      announceFriendlyLabMoment('save-complete', 'save:recipe-2:v1'),
    );
    expect(card()?.dataset.motionPhase).toBe('visible');
  });
});
