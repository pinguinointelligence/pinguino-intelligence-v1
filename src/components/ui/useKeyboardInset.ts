import { useEffect, useState } from 'react';

/**
 * How much of the LAYOUT viewport the on-screen keyboard covers, in CSS pixels.
 *
 * DESIGN V3.0 HOME (XII): a bottom layer rises above the keyboard at the same height and
 * returns to the bottom when the keyboard goes away. Mobile browsers keep `position:
 * fixed; bottom: 0` anchored to the layout viewport, which the keyboard does not resize,
 * so a bottom sheet would sit under the keys. The visual viewport does shrink — the
 * difference between the two is the keyboard. A small difference (a collapsing URL bar)
 * is not a keyboard and reads as 0, so the layer never jitters while the page scrolls.
 *
 * The same visual-viewport reading the product picker uses (`mobileProductPickerRect`).
 */
const KEYBOARD_THRESHOLD_PX = 120;

export function keyboardInsetFor(viewport: {
  readonly innerHeight: number;
  readonly visualHeight: number;
  readonly visualOffsetTop: number;
}): number {
  const covered = viewport.innerHeight - (viewport.visualOffsetTop + viewport.visualHeight);
  return covered >= KEYBOARD_THRESHOLD_PX ? Math.round(covered) : 0;
}

export function useKeyboardInset(enabled = true): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const visual = window.visualViewport;
    if (!visual) return;
    const update = () =>
      setInset(
        keyboardInsetFor({
          innerHeight: window.innerHeight,
          visualHeight: visual.height,
          visualOffsetTop: visual.offsetTop,
        }),
      );
    update();
    visual.addEventListener('resize', update);
    visual.addEventListener('scroll', update);
    return () => {
      visual.removeEventListener('resize', update);
      visual.removeEventListener('scroll', update);
      setInset(0);
    };
  }, [enabled]);
  return enabled ? inset : 0;
}
