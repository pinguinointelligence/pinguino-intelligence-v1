// @vitest-environment jsdom
/**
 * PRO MOBILE UX v2 · B2/B9 — the spatial model of the phone workbench.
 *
 * `cockpitMove` decides which way the cockpit sheet moves between two states;
 * `runSpatialTransition` applies a change inside one View Transition when the
 * browser has the API, and simply applies it when it does not (jsdom, older
 * browsers) — the change itself never depends on the animation.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cockpitMove, runSpatialTransition } from './spatialTransition';

/** jsdom has no View Transitions API: each test installs this stub and removes it. */
type StartViewTransitionStub = (update: () => void | Promise<void>) => {
  finished: Promise<unknown>;
  ready?: Promise<unknown>;
  updateCallbackDone?: Promise<unknown>;
};
const transitionHost = document as unknown as { startViewTransition?: StartViewTransitionStub };

afterEach(() => {
  delete transitionHost.startViewTransition;
  delete document.documentElement.dataset.proSpatial;
});

describe('cockpitMove — which way the sheet moves', () => {
  const closed = (activeTab: string) => ({ activeTab, open: false });
  const open = (activeTab: string) => ({ activeTab, open: true });

  it('drops the Receptura dashboard from above and lifts it back up', () => {
    expect(cockpitMove(closed('profile'), open('profile'))).toBe('drop');
    expect(cockpitMove(open('profile'), closed('profile'))).toBe('lift');
  });

  it('raises a module out of the bottom bar and sinks it back there', () => {
    expect(cockpitMove(closed('profile'), open('monitor'))).toBe('rise');
    expect(cockpitMove(open('production'), closed('production'))).toBe('close');
  });

  it('lifts the dashboard away when a module takes its place, and drops it back over one', () => {
    expect(cockpitMove(open('profile'), open('monitor'))).toBe('lift');
    expect(cockpitMove(open('summary'), open('profile'))).toBe('drop');
  });

  it('slides the modules in the bottom bar order: forward to the right, back to the left', () => {
    expect(cockpitMove(open('monitor'), open('production'))).toBe('forward');
    expect(cockpitMove(open('production'), open('summary'))).toBe('forward');
    expect(cockpitMove(open('summary'), open('monitor'))).toBe('back');
  });

  it('does not move when nothing visible changes', () => {
    expect(cockpitMove(closed('profile'), closed('monitor'))).toBeNull();
    expect(cockpitMove(open('monitor'), open('monitor'))).toBeNull();
  });
});

describe('runSpatialTransition — the change never depends on the animation', () => {
  it('applies the update directly where the View Transitions API is missing', () => {
    const update = vi.fn();
    runSpatialTransition('drop', update);
    expect(update).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset.proSpatial).toBeUndefined();
  });

  it('applies the update directly when there is no movement to show', () => {
    const start = vi.fn<StartViewTransitionStub>();
    transitionHost.startViewTransition = start;
    const update = vi.fn();
    runSpatialTransition(null, update);
    expect(update).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
  });

  it('names the move for the duration of one transition and applies the update inside it', async () => {
    let finish: () => void = () => undefined;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const start = vi.fn<StartViewTransitionStub>(() => ({
      finished,
      ready: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
    }));
    transitionHost.startViewTransition = start;
    const update = vi.fn();
    runSpatialTransition('forward', update);
    expect(document.documentElement.dataset.proSpatial).toBe('forward');
    expect(update).not.toHaveBeenCalled();
    await start.mock.calls[0]![0]();
    expect(update).toHaveBeenCalledTimes(1);
    finish();
    await finished;
    await Promise.resolve();
    expect(document.documentElement.dataset.proSpatial).toBeUndefined();
  });

  it('holds the transition open until the asked-for route has settled', async () => {
    const start = vi.fn<StartViewTransitionStub>(() => ({
      finished: new Promise(() => undefined),
    }));
    transitionHost.startViewTransition = start;
    let settle: () => void = () => undefined;
    const settled = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    );
    const update = vi.fn();
    runSpatialTransition('rise', update, settled);
    let done = false;
    const running = Promise.resolve(start.mock.calls[0]![0]()).then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(update).toHaveBeenCalledTimes(1);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);
    settle();
    await running;
    expect(done).toBe(true);
  });
});
