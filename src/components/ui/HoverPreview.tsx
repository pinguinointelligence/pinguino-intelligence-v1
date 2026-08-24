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
}: {
  text: string;
  children: ReactNode;
  className?: string;
}) {
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const id = useId();

  const show = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    setAnchor({ left: Math.max(8, rect.left), top: rect.bottom + 6 });
  };

  return (
    <>
      <span
        className={className}
        onMouseEnter={(event) => show(event.currentTarget)}
        onMouseLeave={() => setAnchor(null)}
        onFocus={(event) => show(event.currentTarget)}
        onBlur={() => setAnchor(null)}
        aria-describedby={anchor ? id : undefined}
        data-hover-preview="true"
      >
        {children}
      </span>
      {anchor && typeof document !== 'undefined'
        ? createPortal(
            <span
              id={id}
              role="tooltip"
              style={{ left: anchor.left, top: anchor.top, maxWidth: 'min(30rem, 92vw)' }}
              className={cn(
                'pointer-events-none fixed z-[90] rounded-[10px] border border-ink/12 bg-charcoal',
                'px-2.5 py-1.5 text-xs leading-snug text-white shadow-pro-e2',
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
