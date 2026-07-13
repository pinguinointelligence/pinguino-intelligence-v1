import { cn } from '@/lib/cn';
import { focusRing, motion, radius, type } from './tokens';

interface FlavorChipProps {
  label: string;
  /** When provided, renders a removable chip with a labelled × control. */
  onRemove?: () => void;
  /** Non-removable selected/active styling. */
  selected?: boolean;
  className?: string;
}

/**
 * A flavour tag. Two modes: a static/selectable pill, or a removable pill whose
 * × has its own accessible label and a comfortable tap target. Text stays on one
 * line; rows of chips wrap (never horizontal-scroll).
 */
export function FlavorChip({ label, onRemove, selected = false, className }: FlavorChipProps) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 border py-1.5 pl-3.5',
        onRemove ? 'pr-1.5' : 'pr-3.5',
        radius.pill,
        type.secondary,
        selected ? 'border-ink bg-ink text-paper' : 'border-ink/15 bg-paper text-ink',
        className,
      )}
    >
      <span className="truncate">{label}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          className={cn(
            'grid h-7 w-7 shrink-0 place-items-center rounded-full',
            selected ? 'text-paper/80 hover:bg-paper/15' : 'text-stone-500 hover:bg-ink/10',
            motion.base,
            focusRing,
          )}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path
              d="M3 3l6 6M9 3l-6 6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      ) : null}
    </span>
  );
}
