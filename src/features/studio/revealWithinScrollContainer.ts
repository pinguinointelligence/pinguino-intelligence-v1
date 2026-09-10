/**
 * PRO MOBILE UX v2 · A3 — land ON the target, and stay there while it settles.
 *
 * „Otwórz ustawienia" used to focus the first `[data-testid="workbench-settings-line"]`
 * in the document one microtask after asking for the cockpit. On a phone that
 * first match is the desktop column's copy, which only CSS hides, so the focus
 * went nowhere; the sheet then opened at the top, on the recipe name and Save
 * card, instead of on the settings the customer was sent to confirm.
 *
 * The caller names the VISIBLE container (the sheet on a phone, the column on
 * desktop). The target is looked up inside it, aligned inside its own scroll
 * container, and re-aligned on a timer until its position stops moving, because
 * the sections above it can still be rendering when the sheet opens. A timer and
 * not `requestAnimationFrame`: frames do not run while a tab is hidden.
 */
export interface RevealWithinScrollContainerOptions {
  /** The copy of the workbench the customer can actually see. */
  container: HTMLElement;
  selector: string;
  /** Space kept above the target once it is aligned, in px. */
  offset?: number;
  /** Give up re-aligning after this long, in ms. */
  timeoutMs?: number;
  intervalMs?: number;
  /** Called once, with the target, when it has stopped moving (focus it here). */
  onSettled?: (target: HTMLElement) => void;
}

function isScrollContainer(node: HTMLElement): boolean {
  const { overflowY } = getComputedStyle(node);
  return (overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight;
}

/** The nearest ancestor of `target`, up to and including `boundary`, that scrolls. */
export function nearestScrollContainer(
  target: HTMLElement,
  boundary: HTMLElement,
): HTMLElement | null {
  for (let node = target.parentElement; node; node = node.parentElement) {
    if (isScrollContainer(node)) return node;
    if (node === boundary) return null;
  }
  return null;
}

export function revealWithinScrollContainer({
  container,
  selector,
  offset = 12,
  timeoutMs = 1500,
  intervalMs = 50,
  onSettled,
}: RevealWithinScrollContainerOptions): () => void {
  const startedAt = Date.now();
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastTop: number | null = null;
  let stableTicks = 0;

  const finish = (target: HTMLElement) => {
    cancelled = true;
    onSettled?.(target);
  };

  const tick = () => {
    if (cancelled) return;
    const target = container.querySelector<HTMLElement>(selector);
    if (target) {
      const scroller = nearestScrollContainer(target, container);
      if (scroller) {
        const delta =
          target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - offset;
        if (Math.abs(delta) > 1) scroller.scrollTop += delta;
      }
      const top = target.getBoundingClientRect().top;
      stableTicks = lastTop !== null && Math.abs(top - lastTop) < 1 ? stableTicks + 1 : 0;
      lastTop = top;
      if (stableTicks >= 2 || Date.now() - startedAt >= timeoutMs) {
        finish(target);
        return;
      }
    } else if (Date.now() - startedAt >= timeoutMs) {
      cancelled = true;
      return;
    }
    timer = setTimeout(tick, intervalMs);
  };

  tick();
  return () => {
    cancelled = true;
    if (timer !== null) clearTimeout(timer);
  };
}
