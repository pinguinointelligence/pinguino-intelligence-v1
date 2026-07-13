import { cn } from '@/lib/cn';
import { color, focusRing, motion, radius, touch, type } from './tokens';

export interface BatchOption {
  id: string;
  /** Primary label, e.g. "1 kg". */
  label: string;
  /** Optional secondary line, e.g. "≈ 12 scoops". */
  meta?: string;
  disabled?: boolean;
}

interface BatchSelectorProps {
  options: BatchOption[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  /** Accessible group label. */
  legend?: string;
  className?: string;
}

/**
 * Batch-size chooser rendered as a wrapping segmented control (grid on mobile so
 * it never horizontal-scrolls). Each segment is a >=52px target with a clear
 * selected fill. Presentational only.
 */
export function BatchSelector({
  options,
  selectedId,
  onSelect,
  legend = 'Batch size',
  className,
}: BatchSelectorProps) {
  return (
    <div role="radiogroup" aria-label={legend} className={cn('grid grid-cols-3 gap-2', className)}>
      {options.map((opt) => {
        const active = opt.id === selectedId;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={opt.disabled}
            onClick={() => onSelect?.(opt.id)}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 border px-2 text-center',
              touch.control,
              radius.control,
              motion.base,
              focusRing,
              active
                ? 'border-ink bg-ink text-paper'
                : 'border-ink/15 bg-paper text-ink hover:border-ink/35',
              opt.disabled && 'cursor-not-allowed opacity-40',
              !opt.disabled && !active && 'active:scale-[0.98]',
            )}
          >
            <span className={cn(type.bodyStrong, 'leading-none')}>{opt.label}</span>
            {opt.meta ? (
              <span
                className={cn(
                  'leading-none',
                  type.caption,
                  active ? 'text-paper/70' : color.textMuted,
                )}
              >
                {opt.meta}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
