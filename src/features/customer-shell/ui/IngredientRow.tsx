import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { color, focusRing, motion, type } from './tokens';
import { LockedGram } from './LockedGram';

interface IngredientRowProps {
  name: string;
  /** Exact amount, e.g. "185 g". Ignored when `locked` is true. */
  amount?: string;
  /** Optional secondary note, e.g. "whole milk 3.5%". */
  note?: string;
  /** When true, the amount is replaced by the compact locked stand-in. */
  locked?: boolean;
  /** Label for the locked stand-in (e.g. "Ilość w Home i Pro"). */
  lockedLabel?: string;
  /**
   * An honest open-requirement label (e.g. "Wybierz składnik") shown in place of an
   * amount when a line has no safe dose yet. The line carries NO gram number.
   */
  requirement?: string;
  /**
   * A friendly, TAPPABLE intensity affordance for an unresolved flavor line
   * ("Ustal intensywność smaku" / the chosen intensity). Opening it lets the
   * customer pick a flavor-intensity PREFERENCE — never grams.
   */
  intensity?: { label: string; onClick: () => void };
  /** Opens the per-row actions sheet (substitute / remove / why …). */
  onMore?: () => void;
  /** Accessible label for the "more" trigger. */
  moreLabel?: string;
  /** Optional trailing action (kept for compatibility, e.g. a "Substitute" button). */
  action?: ReactNode;
  className?: string;
}

/**
 * A single line of a recipe: ingredient name (dominant) with, on the right, either
 * a tappable intensity affordance, an honest requirement, the compact locked
 * stand-in, or a tabular amount — plus an optional "…" per-row actions trigger.
 * Rows are hairline-separated by the containing list. Presentational only.
 */
export function IngredientRow({
  name,
  amount,
  note,
  locked = false,
  lockedLabel,
  requirement,
  intensity,
  onMore,
  moreLabel = 'Więcej opcji',
  action,
  className,
}: IngredientRowProps) {
  return (
    <div className={cn('flex items-center gap-3 py-3.5', className)}>
      <div className="min-w-0 flex-1">
        <p className={cn('truncate', type.bodyStrong, color.textPrimary)}>{name}</p>
        {note ? <p className={cn('truncate', type.caption, color.textMuted)}>{note}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {intensity ? (
          <button
            type="button"
            onClick={intensity.onClick}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border border-ink/20 bg-ink/[0.04] px-3 py-1.5',
              type.caption,
              'font-medium',
              color.textPrimary,
              motion.base,
              focusRing,
              'hover:border-ink/40 active:scale-[0.98]',
            )}
          >
            <span>{intensity.label}</span>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : requirement ? (
          <span
            className={cn(
              'inline-flex items-center rounded-full border border-ink/15 bg-stone-50 px-2.5 py-1',
              type.caption,
              color.textMuted,
            )}
          >
            {requirement}
          </span>
        ) : locked ? (
          <LockedGram label={lockedLabel} hint="Dokładne ilości dostępne w płatnym planie" />
        ) : (
          <span className={cn(type.numeric, color.textPrimary)}>{amount ?? '—'}</span>
        )}
        {onMore ? (
          <button
            type="button"
            onClick={onMore}
            aria-label={moreLabel}
            className={cn(
              'grid h-9 w-9 shrink-0 place-items-center rounded-full',
              color.textMuted,
              motion.base,
              focusRing,
              'hover:bg-ink/10 hover:text-ink',
            )}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <circle cx="5" cy="12" r="1.7" />
              <circle cx="12" cy="12" r="1.7" />
              <circle cx="19" cy="12" r="1.7" />
            </svg>
          </button>
        ) : null}
        {action ? <span className="shrink-0">{action}</span> : null}
      </div>
    </div>
  );
}

/**
 * A compact "Substitute" trigger sized as a proper tap target — pass as the
 * `action` of an IngredientRow.
 */
export function SubstituteAction({ onClick, label = 'Substitute' }: { onClick?: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex min-h-[36px] items-center rounded-full border border-ink/15 px-3',
        type.caption,
        'font-medium text-ink hover:border-ink/40',
        motion.base,
        focusRing,
      )}
    >
      {label}
    </button>
  );
}
