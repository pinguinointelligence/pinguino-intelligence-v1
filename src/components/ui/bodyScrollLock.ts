/**
 * ONE page-scroll lock, shared by every modal surface (PRO MOBILE UX v2 · A1).
 *
 * Four surfaces used to lock the page on their own: the mobile cockpit sheet,
 * the navigation drawer, every DialogShell and the product picker. Each saved
 * `body.style.overflow` when it opened and wrote that saved value back when it
 * closed, which is correct only while surfaces close in the exact reverse order
 * they opened. When a surface that opened FIRST closes before (or in the same
 * commit as) one that opened LATER, the later surface writes its saved `hidden`
 * back last and the page stays locked. React runs a removed subtree's cleanups
 * parent-first, so a dialog that is open inside the cockpit sheet when the
 * recipe context remounts is enough. On a phone the document owns scrolling, so
 * nothing scrolls any more until a reload.
 *
 * A counter makes the order irrelevant: the first lock saves the page's own
 * value, the last release restores it, and nothing in between touches it.
 */
let activeLocks = 0;
let pageOverflow = '';

export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') return () => undefined;
  if (activeLocks === 0) {
    pageOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  activeLocks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeLocks = Math.max(0, activeLocks - 1);
    if (activeLocks === 0) document.body.style.overflow = pageOverflow;
  };
}

/** Test seam: forget any lock a failed test left behind. */
export function resetBodyScrollLockForTests(): void {
  activeLocks = 0;
  pageOverflow = '';
}
