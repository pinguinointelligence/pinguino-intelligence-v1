/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  TUTORIAL_SEEN_KEY,
  readSeen,
  shouldAutoStart,
  useTutorialStore,
  writeSeen,
} from './tutorialState';

const reset = () => {
  window.localStorage.clear();
  useTutorialStore.setState({ run: { status: 'idle' } });
};

beforeEach(reset);
afterEach(reset);

describe('§29 — the tutorial introduces itself once', () => {
  it('has not been seen on a fresh browser', () => {
    expect(readSeen()).toBe(false);
    expect(shouldAutoStart({ seen: false, anchoredStepCount: 3, alreadyRunning: false })).toBe(
      true,
    );
  });

  it('does not offer itself again once it has been', () => {
    writeSeen();
    expect(window.localStorage.getItem(TUTORIAL_SEEN_KEY)).toBe('1');
    expect(shouldAutoStart({ seen: true, anchoredStepCount: 3, alreadyRunning: false })).toBe(
      false,
    );
  });

  it('does not start over itself, and does not start with nothing to show', () => {
    expect(shouldAutoStart({ seen: false, anchoredStepCount: 3, alreadyRunning: true })).toBe(
      false,
    );
    expect(shouldAutoStart({ seen: false, anchoredStepCount: 0, alreadyRunning: false })).toBe(
      false,
    );
  });

  it('a storage that refuses to answer behaves like „not seen yet", never like a crash', () => {
    const hostile = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(readSeen(hostile)).toBe(false);
    expect(() => writeSeen(hostile)).not.toThrow();
  });
});

describe('§29 — Dalej, Wstecz, Pomiń', () => {
  it('advances and stops at the end, recording that it was seen', () => {
    useTutorialStore.getState().start();
    expect(useTutorialStore.getState().run).toEqual({ status: 'running', index: 0 });
    useTutorialStore.getState().next(3);
    useTutorialStore.getState().next(3);
    expect(useTutorialStore.getState().run).toEqual({ status: 'running', index: 2 });
    useTutorialStore.getState().next(3);
    expect(useTutorialStore.getState().run).toEqual({ status: 'idle' });
    expect(readSeen()).toBe(true);
  });

  it('goes back, but never before the first step', () => {
    useTutorialStore.getState().start();
    useTutorialStore.getState().next(3);
    useTutorialStore.getState().back();
    expect(useTutorialStore.getState().run).toEqual({ status: 'running', index: 0 });
    useTutorialStore.getState().back();
    expect(useTutorialStore.getState().run).toEqual({ status: 'running', index: 0 });
  });

  it('„Pomiń" ends it exactly like finishing — it does not come back tomorrow', () => {
    useTutorialStore.getState().start();
    useTutorialStore.getState().skip();
    expect(useTutorialStore.getState().run).toEqual({ status: 'idle' });
    expect(readSeen()).toBe(true);
  });

  it('„Uruchom samouczek ponownie" restarts a tutorial already marked as seen', () => {
    writeSeen();
    useTutorialStore.getState().start();
    expect(useTutorialStore.getState().run).toEqual({ status: 'running', index: 0 });
  });

  it('an idle store ignores next and back', () => {
    useTutorialStore.getState().next(3);
    useTutorialStore.getState().back();
    expect(useTutorialStore.getState().run).toEqual({ status: 'idle' });
  });
});
