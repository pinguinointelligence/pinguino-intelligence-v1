/**
 * SINGLE ACTIVE MODAL — the shared registry behind `DialogShell`.
 *
 * Every mounted shell registers here, so the app can state — and a test can
 * assert — how many modal surfaces exist at once. The owner's complaint was a
 * flow briefly showing two or three shells in sequence, which reads as
 * instability rather than as one system.
 *
 * This deliberately does not unmount anyone: a shell's own state owns its
 * lifetime, and tearing it down from here would be a second authority over the
 * same thing. It makes the stack VISIBLE and makes the topmost shell the only
 * one that reads, paints and behaves as a dialog.
 *
 * It lives in its own module so `DialogShell.tsx` exports only a component.
 */
const openShells: symbol[] = [];
const subscribers = new Set<() => void>();

const notify = (): void => {
  subscribers.forEach((run) => run());
};

/** Registers a shell and returns its unregister function. */
export function registerDialogShell(id: symbol, onChange: () => void): () => void {
  openShells.push(id);
  subscribers.add(onChange);
  notify();
  return () => {
    const at = openShells.indexOf(id);
    if (at !== -1) openShells.splice(at, 1);
    subscribers.delete(onChange);
    notify();
  };
}

/** TRUE only for the shell that mounted last — the one the user is answering. */
export const isTopmostDialogShell = (id: symbol): boolean =>
  openShells[openShells.length - 1] === id;

/** Test/diagnostic seam: how many shells are mounted right now. */
export const openDialogCount = (): number => openShells.length;
