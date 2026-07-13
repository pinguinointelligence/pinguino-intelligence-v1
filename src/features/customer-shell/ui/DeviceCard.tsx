import { cn } from '@/lib/cn';
import { color, elevation, focusRing, motion, radius, type } from './tokens';

interface DeviceCardProps {
  /** Machine / device name. */
  label: string;
  /** Secondary temperature readout, e.g. "-11 °C". Rendered in tabular mono. */
  temperature?: string;
  /** Optional descriptor under the temperature (e.g. "Batch freezer"). */
  meta?: string;
  selected?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  className?: string;
}

/**
 * A device / machine choice: primary label with a quiet secondary temperature.
 * Selectable with the same ink-ring selected state as SelectableCard.
 */
export function DeviceCard({
  label,
  temperature,
  meta,
  selected = false,
  disabled = false,
  onSelect,
  className,
}: DeviceCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center justify-between gap-4 border p-4 text-left',
        radius.card,
        color.surface,
        motion.base,
        focusRing,
        selected
          ? `border-ink ${color.surfaceTintSelected} ${elevation.card}`
          : 'border-ink/12 hover:border-ink/30',
        disabled ? 'cursor-not-allowed opacity-50' : 'active:scale-[0.99]',
        className,
      )}
    >
      <span className="min-w-0">
        <span className={cn('block truncate', type.bodyStrong, color.textPrimary)}>{label}</span>
        {meta ? (
          <span className={cn('mt-0.5 block', type.caption, color.textMuted)}>{meta}</span>
        ) : null}
      </span>
      {temperature ? (
        <span className="shrink-0 text-right">
          <span className={cn('block', type.numeric, color.textPrimary)}>{temperature}</span>
          <span className={cn('block', type.label, color.textMuted, 'text-[10px]')}>Target</span>
        </span>
      ) : null}
    </button>
  );
}
