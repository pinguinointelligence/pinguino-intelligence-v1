import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { color, focusRing, motion, radius, type } from './tokens';

interface TechnicalDetailsProps {
  /** Trigger label. Defaults to the Polish "Dane techniczne". */
  summary?: string;
  /** Optional one-line preview shown next to the chevron while collapsed. */
  preview?: string;
  children: ReactNode;
  /** Start expanded (defaults collapsed — details are opt-in for customers). */
  defaultOpen?: boolean;
  className?: string;
}

/**
 * Progressive-disclosure block using native <details>/<summary> — keyboard and
 * screen-reader friendly for free. Collapsed by default so the customer view
 * stays calm; the technical readout (composition, PAC/POD, temperatures) is one
 * tap away. Presentational only.
 */
export function TechnicalDetails({
  summary = 'Dane techniczne',
  preview,
  children,
  defaultOpen = false,
  className,
}: TechnicalDetailsProps) {
  return (
    <details
      open={defaultOpen}
      className={cn('group border-t border-ink/10', className)}
    >
      <summary
        className={cn(
          'flex cursor-pointer list-none items-center justify-between gap-3 py-4',
          focusRing,
          'rounded-md',
          motion.base,
        )}
      >
        <span className="flex min-w-0 items-baseline gap-2">
          <span className={cn(type.bodyStrong, color.textPrimary)}>{summary}</span>
          {preview ? (
            <span className={cn('truncate', type.caption, color.textMuted)}>{preview}</span>
          ) : null}
        </span>
        <span
          aria-hidden
          className={cn(
            'grid h-7 w-7 shrink-0 place-items-center rounded-full border border-ink/12 text-stone-500',
            'transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none',
          )}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </summary>
      <div className={cn('pb-5', type.secondary, color.textSecondary, radius.control)}>{children}</div>
    </details>
  );
}
