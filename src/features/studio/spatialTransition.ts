import { flushSync } from 'react-dom';

/**
 * PRO MOBILE UX v2 · B2/B9 — the spatial model of the phone workbench.
 *
 * The Receptura dashboard is a sheet that lives ABOVE the ingredient workspace:
 * it drops down from the recipe bar and lifts back into it. The process
 * modules (Monitor → Produkcja → Etykieta) sit side by side in the order of the
 * bottom bar, so moving forward slides the next one in from the right and
 * moving back reverses it. Opening a module from the ingredient workspace
 * raises it from the bottom bar it was chosen in; closing it sinks it there.
 *
 * The movement is carried by the browser's View Transitions API over the
 * EXISTING sheet — no second copy of any screen, no animation library. Where
 * the API is missing the update simply happens, and `prefers-reduced-motion`
 * turns the movement off in CSS (theme-pro-light.css). The CSS reads the move
 * from `html[data-pro-spatial]`, set only for the lifetime of one transition.
 */
export type SpatialMove = 'drop' | 'lift' | 'forward' | 'back' | 'rise' | 'close' | 'reveal';

interface ViewTransitionLike {
  finished: Promise<unknown>;
  ready?: Promise<unknown>;
  updateCallbackDone?: Promise<unknown>;
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => ViewTransitionLike;
};

/** The bottom bar's order — the axis every forward/back movement follows. */
const MODULE_ORDER: readonly string[] = ['profile', 'monitor', 'production', 'summary'];

interface CockpitPosition {
  activeTab: string;
  open: boolean;
}

/** Which way the sheet moves between two cockpit states, or null for no movement. */
export function cockpitMove(from: CockpitPosition, to: CockpitPosition): SpatialMove | null {
  if (!from.open && !to.open) return null;
  if (from.open && !to.open) return from.activeTab === 'profile' ? 'lift' : 'close';
  if (!from.open && to.open) return to.activeTab === 'profile' ? 'drop' : 'rise';
  if (from.activeTab === to.activeTab) return null;
  if (to.activeTab === 'profile') return 'drop';
  if (from.activeTab === 'profile') return 'lift';
  return MODULE_ORDER.indexOf(to.activeTab) > MODULE_ORDER.indexOf(from.activeTab)
    ? 'forward'
    : 'back';
}

/**
 * Applies `update` inside one spatial transition. `settled` may hold the
 * transition open until a route delivered in a React transition has rendered,
 * so the new snapshot shows the module that was asked for.
 */
export function runSpatialTransition(
  move: SpatialMove | null,
  update: () => void,
  settled?: () => Promise<void>,
): void {
  const doc = typeof document === 'undefined' ? null : (document as ViewTransitionDocument);
  if (move === null || !doc || typeof doc.startViewTransition !== 'function') {
    update();
    return;
  }
  const root = doc.documentElement;
  root.dataset.proSpatial = move;
  const clear = () => {
    if (root.dataset.proSpatial === move) delete root.dataset.proSpatial;
  };
  try {
    const transition = doc.startViewTransition(async () => {
      flushSync(update);
      if (settled) await settled();
    });
    // A transition skipped by the next one (a fast second tap) rejects `ready`;
    // that is a normal outcome here, not an error worth a console entry.
    transition.ready?.catch(() => undefined);
    transition.updateCallbackDone?.catch(() => undefined);
    transition.finished.then(clear, clear);
  } catch {
    clear();
    update();
  }
}
