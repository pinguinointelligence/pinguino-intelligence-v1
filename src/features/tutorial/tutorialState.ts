/**
 * §29 — has this person seen the tutorial, and where are they in it.
 *
 * Two different questions, kept apart on purpose:
 *   · SEEN is durable — it survives the session, because a tutorial that
 *     reappears on every visit is an interruption, not an introduction;
 *   · the RUN is not — closing the tab abandons it, and „Uruchom samouczek
 *     ponownie" starts a fresh one.
 *
 * Storage is best-effort by design. A private window, cleared site data or a
 * browser that refuses storage must not make the tutorial run forever or throw
 * on a screen the customer is trying to use, so every read and write is wrapped
 * and an unreadable store behaves like „not seen yet".
 */
import { create } from 'zustand';

export const TUTORIAL_SEEN_KEY = 'gellatti.tutorial.home.seen.v1';

export function readSeen(storage: Storage | null = safeStorage()): boolean {
  try {
    return storage?.getItem(TUTORIAL_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeSeen(storage: Storage | null = safeStorage()): void {
  try {
    storage?.setItem(TUTORIAL_SEEN_KEY, '1');
  } catch {
    /* A tutorial that cannot remember is still better than one that throws. */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export type TutorialRun =
  | { readonly status: 'idle' }
  | { readonly status: 'running'; readonly index: number };

export interface TutorialState {
  run: TutorialRun;
  /** Start (or restart) the tutorial from its first step. */
  start: () => void;
  /** Advance; finishing the last step ends the run and records it as seen. */
  next: (total: number) => void;
  back: () => void;
  /** „Pomiń" — ends the run and records it as seen, exactly like finishing. */
  skip: () => void;
}

export const useTutorialStore = create<TutorialState>((set, get) => ({
  run: { status: 'idle' },
  start: () => set({ run: { status: 'running', index: 0 } }),
  next: (total) => {
    const run = get().run;
    if (run.status !== 'running') return;
    if (run.index + 1 >= total) {
      writeSeen();
      set({ run: { status: 'idle' } });
      return;
    }
    set({ run: { status: 'running', index: run.index + 1 } });
  },
  back: () => {
    const run = get().run;
    if (run.status !== 'running' || run.index === 0) return;
    set({ run: { status: 'running', index: run.index - 1 } });
  },
  skip: () => {
    writeSeen();
    set({ run: { status: 'idle' } });
  },
}));

/**
 * The first-run decision, as a pure function so it can be reasoned about
 * without a browser: the tutorial offers itself once, only when there is
 * something REAL to point at.
 *
 * `anchoredStepCount` counts only steps whose element is on screen. The
 * HOME|PRO opener is `anchorOptional` — it can always be shown — so counting
 * it would make every page in the application "have a tutorial": a first-time
 * visitor landing on the Shop or on a shared recipe would get a one-step
 * tutorial, and one click of „Dalej" or „Pomiń" there would mark it seen, so
 * the real HOME tutorial would never appear. Found during integration
 * (2026-09-11), where that same auto-start also fired inside unrelated page
 * tests.
 */
export function shouldAutoStart(input: {
  readonly seen: boolean;
  readonly anchoredStepCount: number;
  readonly alreadyRunning: boolean;
}): boolean {
  return !input.seen && !input.alreadyRunning && input.anchoredStepCount > 0;
}
