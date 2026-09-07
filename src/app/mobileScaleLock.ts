/**
 * Keep the phone layout at 1:1.
 *
 * The browser already does most of this. The viewport meta pins
 * `minimum-scale=1, maximum-scale=1, user-scalable=no`, which Chrome and every
 * Android browser honour in full: pinch is refused and the page cannot be zoomed out
 * below 1.
 *
 * iOS Safari is the exception. It has deliberately ignored `user-scalable=no` and
 * `maximum-scale` since iOS 10 so that people can always enlarge a page, so the meta
 * tag alone leaves the phone able to pinch. Safari does expose its own gesture events,
 * and refusing `gesturestart` is the documented way to opt a page out — the page then
 * never leaves 1:1, which is the same end state as "snap back after release" without
 * animating the viewport or touching scroll.
 *
 * That is the whole mechanism: a viewport meta, and three listeners for the one browser
 * that ignores it. Nothing here measures, stores or restores scroll position, and no
 * layout is read or written, so scrolling and the page's own geometry are untouched.
 *
 * ACCESSIBILITY. This is a deliberate owner decision, and it has a cost worth stating:
 * blocking pinch works against WCAG 2.1 SC 1.4.4 (Resize text), which expects a page to
 * survive 200% zoom. Text can still be enlarged through the OS display settings and
 * Safari's own page-zoom menu, neither of which this touches.
 */

/** Safari's proprietary pinch events; not in the DOM lib's WindowEventMap. */
const SAFARI_GESTURE_EVENTS = ['gesturestart', 'gesturechange', 'gestureend'] as const;

export function lockMobileScale(): void {
  if (typeof document === 'undefined') return;

  // Removes the 300 ms double-tap-to-zoom without affecting panning or scrolling.
  document.documentElement.style.touchAction = 'manipulation';

  const refuse = (event: Event) => event.preventDefault();
  for (const name of SAFARI_GESTURE_EVENTS) {
    // `passive: false` is required, or preventDefault is ignored.
    document.addEventListener(name, refuse, { passive: false });
  }
}
