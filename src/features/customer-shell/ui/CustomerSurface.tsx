import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { color, customerSpec, safeArea, type } from './tokens';

interface CustomerSurfaceProps {
  children: ReactNode;
  /**
   * When a sticky bottom CTA is present, reserve room so it never covers the last
   * of the content (spacer is sized to a large control + safe-area inset).
   */
  hasStickyCta?: boolean;
  className?: string;
}

/**
 * Root frame for the customer shell. Provides the scoped surface WITHOUT touching
 * global CSS: ink text, a single readable column on mobile that widens (but never
 * sprawls into a dense dashboard) on desktop, and horizontal safe-area insets. The
 * background is intentionally transparent so the dark page backdrop supplied by the
 * shell wrapper shows through — cards (`bg-paper`) then read as lifted above it.
 * One column always — max content width is `customerSpec.contentMaxWidthPx`.
 */
export function CustomerSurface({ children, hasStickyCta = false, className }: CustomerSurfaceProps) {
  return (
    <div
      className={cn(
        'customer-shell min-h-full w-full overflow-x-hidden',
        color.textPrimary,
        type.body,
        safeArea.x,
        className,
      )}
    >
      <div
        className="mx-auto w-full px-5 pt-6 sm:px-8 sm:pt-10"
        style={{ maxWidth: customerSpec.contentMaxWidthPx }}
      >
        {children}
        {/* Spacer so the sticky CTA (fixed) never overlaps the final content. */}
        {hasStickyCta ? (
          <div aria-hidden className="h-[calc(72px+env(safe-area-inset-bottom))]" />
        ) : (
          <div aria-hidden className={cn('h-8', safeArea.bottomRaw)} />
        )}
      </div>
    </div>
  );
}

/**
 * A titled block within the surface. Quiet uppercase eyebrow + optional lead-in,
 * hairline-separated from what precedes it. Mobile-first vertical rhythm.
 */
export function CustomerSection({
  label,
  title,
  lead,
  children,
  className,
}: {
  label?: string;
  title?: string;
  lead?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('py-7 first:pt-0', className)}>
      {label ? <p className={cn(type.label, color.textMuted)}>{label}</p> : null}
      {title ? <h2 className={cn(type.title, color.textPrimary, label && 'mt-2')}>{title}</h2> : null}
      {lead ? <p className={cn(type.secondary, color.textSecondary, 'mt-2 max-w-prose')}>{lead}</p> : null}
      {children ? <div className={cn(title || lead || label ? 'mt-5' : '')}>{children}</div> : null}
    </section>
  );
}
