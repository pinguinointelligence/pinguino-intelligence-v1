import { useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

/**
 * A passive hover/focus preview of text that the layout had to truncate.
 *
 * PINGÜINO had no tooltip primitive — every surface used the browser's native
 * `title`, which the platform renders in its own style, after its own delay,
 * and never on keyboard focus. This is the in-app replacement: the same
 * charcoal/hairline language as the rest of the Pro workbench.
 *
 * Deliberately inert. It previews, and does nothing else — no click target, no
 * edit affordance, no modal, no state beyond its own visibility. It renders
 * through a PORTAL because the ingredient rows live inside a scroll container,
 * and an absolutely positioned tooltip would be clipped by it (or would grow
 * the container's scrollable area, which is a layout shift by another name).
 *
 * Truncation here is purely visual — the full text stays in the DOM — so
 * assistive technology already reads the complete name and needs no `title`.
 */
export function HoverPreview({
  text,
  children,
  className,
  focusable = false,
  align = 'start',
  maxWidthPx,
  ariaLabel,
  testId,
}: {
  text: string;
  children: ReactNode;
  className?: string;
  /**
   * Make the trigger reachable by keyboard. Used for small informational marks
   * whose meaning is otherwise mouse-only; NOT used for row text, which would
   * add a tab stop per row for information already present in the DOM.
   */
  focusable?: boolean;
  /** Keep edge-adjacent previews inside their owning side of the workspace. */
  align?: 'start' | 'end';
  /** A tighter content-specific cap than the default long-name preview. */
  maxWidthPx?: number;
  /** Accessible name for compact informational marks whose visible copy is symbolic. */
  ariaLabel?: string;
  testId?: string;
}) {
  const [anchor, setAnchor] = useState<{
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
  } | null>(null);
  const id = useId();

  const show = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const placeAbove = window.innerHeight - rect.bottom < 120 && rect.top > 120;
    const vertical = placeAbove
      ? { bottom: Math.max(8, window.innerHeight - rect.top + 6) }
      : { top: rect.bottom + 6 };
    setAnchor(
      align === 'end'
        ? { right: Math.max(8, window.innerWidth - rect.right), ...vertical }
        : { left: Math.max(8, rect.left), ...vertical },
    );
  };

  return (
    <>
      <span
        className={className}
        tabIndex={focusable ? 0 : undefined}
        role={focusable ? 'button' : undefined}
        onMouseEnter={(event) => show(event.currentTarget)}
        onMouseLeave={() => setAnchor(null)}
        onFocus={(event) => show(event.currentTarget)}
        onBlur={() => setAnchor(null)}
        onClick={focusable ? (event) => show(event.currentTarget) : undefined}
        onKeyDown={
          focusable
            ? (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                show(event.currentTarget);
              }
            : undefined
        }
        aria-label={ariaLabel}
        aria-describedby={anchor ? id : undefined}
        data-hover-preview="true"
        data-testid={testId}
      >
        {children}
      </span>
      {anchor && typeof document !== 'undefined'
        ? createPortal(
            <span
              id={id}
              role="tooltip"
              style={{
                left: anchor.left,
                right: anchor.right,
                top: anchor.top,
                bottom: anchor.bottom,
                maxWidth: maxWidthPx
                  ? `min(${maxWidthPx}px, calc(100vw - 16px))`
                  : 'min(30rem, calc(100vw - 16px))',
              }}
              className={cn(
                'pointer-events-none fixed z-[90] rounded-[10px] border border-ink/12 bg-charcoal',
                'px-2.5 py-1.5 text-xs leading-snug break-words text-white shadow-pro-e2',
              )}
              data-testid="hover-preview"
            >
              {text}
            </span>,
            document.body,
          )
        : null}
    </>
  );
}
