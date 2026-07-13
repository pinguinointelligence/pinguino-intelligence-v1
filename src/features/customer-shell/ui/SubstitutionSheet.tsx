import { cn } from '@/lib/cn';
import { color, focusRing, motion, radius, type } from './tokens';
import { BottomSheet } from './BottomSheet';
import { TouchButton } from './TouchButton';

export interface SubstitutionOption {
  id: string;
  name: string;
  /** Short rationale, e.g. "Similar sweetness, lower freezing point." */
  note?: string;
  /** Optional quiet tag, e.g. "In stock". */
  tag?: string;
  disabled?: boolean;
}

interface SubstitutionSheetProps {
  open: boolean;
  onClose: () => void;
  /** The ingredient being replaced (shown in the title). */
  ingredientName: string;
  options: SubstitutionOption[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  onConfirm?: () => void;
  confirmLabel?: string;
}

/**
 * Bottom sheet for swapping one ingredient for another. Each option is a large
 * tappable row with a clear selected state; a pinned footer confirms. Purely
 * presentational — the caller owns selection + confirm.
 */
export function SubstitutionSheet({
  open,
  onClose,
  ingredientName,
  options,
  selectedId,
  onSelect,
  onConfirm,
  confirmLabel = 'Use substitute',
}: SubstitutionSheetProps) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={`Replace ${ingredientName}`}
      footer={
        <TouchButton block onClick={onConfirm} disabled={!selectedId}>
          {confirmLabel}
        </TouchButton>
      }
    >
      <ul role="radiogroup" aria-label={`Substitutes for ${ingredientName}`} className="flex flex-col gap-2">
        {options.map((opt) => {
          const active = opt.id === selectedId;
          return (
            <li key={opt.id}>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                disabled={opt.disabled}
                onClick={() => onSelect?.(opt.id)}
                className={cn(
                  'flex w-full items-start gap-3 border p-3.5 text-left',
                  radius.control,
                  motion.base,
                  focusRing,
                  active
                    ? `border-ink ${color.surfaceTintSelected}`
                    : 'border-ink/12 hover:border-ink/30',
                  opt.disabled ? 'cursor-not-allowed opacity-50' : 'active:scale-[0.99]',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border',
                    active ? 'border-ink bg-ink text-paper' : 'border-ink/25 text-transparent',
                  )}
                >
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={cn('truncate', type.bodyStrong, color.textPrimary)}>{opt.name}</span>
                    {opt.tag ? (
                      <span className={cn('shrink-0', type.caption, color.statusIdeal)}>{opt.tag}</span>
                    ) : null}
                  </span>
                  {opt.note ? (
                    <span className={cn('mt-0.5 block', type.secondary, color.textSecondary)}>{opt.note}</span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </BottomSheet>
  );
}
