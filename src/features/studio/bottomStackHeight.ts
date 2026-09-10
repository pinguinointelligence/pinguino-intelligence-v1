import { useLayoutEffect, type RefObject } from 'react';

/**
 * PRO MOBILE UX v2 · A2 — the ONE measurement of the phone's bottom chrome.
 *
 * Below 960 px the workbench keeps a fixed stack at the bottom of the screen:
 * the score / „Przelicz" strip, the four-module bar under it, and the device's
 * safe-area inset. Its height is not a constant — the strip wraps when its text
 * does, it is absent during an active Production run, and every translation
 * moves it. The cockpit sheet above it and the document scrolled behind it used
 * to reserve fixed guesses instead (the nav alone, or nav + 4.75rem), so on
 * served staging the last 62 px of Monitor sat under the strip at full scroll.
 *
 * This publishes the MEASURED height as one CSS variable on the workbench, so
 * every reservation reads the same number. Where the stack is not displayed
 * (the desktop workbench hides it) the measurement is 0.
 */
export const BOTTOM_STACK_HEIGHT_VAR = '--pro-mobile-bottom-stack-height';

export function usePublishedBottomStackHeight(
  stackRef: RefObject<HTMLElement | null>,
  targetRef: RefObject<HTMLElement | null>,
): void {
  useLayoutEffect(() => {
    const stack = stackRef.current;
    const target = targetRef.current;
    if (!stack || !target) return;
    const publish = () => {
      target.style.setProperty(BOTTOM_STACK_HEIGHT_VAR, `${stack.offsetHeight}px`);
    };
    publish();
    // A layout read works in a hidden tab; a ResizeObserver callback may wait
    // for the next rendered frame. The first value is therefore measured
    // synchronously, and the observer only keeps it current.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish);
    observer?.observe(stack);
    window.addEventListener('resize', publish);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', publish);
      target.style.removeProperty(BOTTOM_STACK_HEIGHT_VAR);
    };
  }, [stackRef, targetRef]);
}
