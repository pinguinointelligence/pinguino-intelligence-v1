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
  /** When true, the amount is replaced by the locked 🔒 stand-in. */
  locked?: boolean;
  /** Optional trailing action (e.g. a "Substitute" button). */
  action?: ReactNode;
  className?: string;
}

/**
 * A single line of a recipe: ingredient name (+ optional note) with a tabular
 * amount on the right, or the locked 🔒 stand-in. Rows are hairline-separated by
 * the containing list. Presentational only.
 */
export function IngredientRow({
  name,
  amount,
  note,
  locked = false,
  action,
  className,
}: IngredientRowProps) {
  return (
    <div className={cn('flex items-center gap-3 py-3.5', className)}>
      <div className="min-w-0 flex-1">
        <p className={cn('truncate', type.body, color.textPrimary)}>{name}</p>
        {note ? <p className={cn('truncate', type.caption, color.textMuted)}>{note}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {locked ? (
          <LockedGram hint="Exact grams available on a paid plan" />
        ) : (
          <span className={cn(type.numeric, color.textPrimary)}>{amount ?? '—'}</span>
        )}
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
