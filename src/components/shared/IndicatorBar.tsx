import { cn } from '@/lib/cn';
import { barPosition } from '@/lib/math';
import { STATUS_MARKER_CLASSES, type IndicatorStatus } from './status';

interface IndicatorBarProps {
  min: number;
  max: number;
  value: number;
  /** Optional target zone rendered as a subtle band on the track. */
  targetMin?: number;
  targetMax?: number;
  status?: IndicatorStatus;
  label?: string;
  className?: string;
}

/** Linear laboratory range bar — thin track, target zone, tick marker. No gauges (Design Lock §3). */
export function IndicatorBar({
  min,
  max,
  value,
  targetMin,
  targetMax,
  status = 'good',
  label,
  className,
}: IndicatorBarProps) {
  const hasTarget = targetMin !== undefined && targetMax !== undefined;
  const targetLeft = hasTarget ? barPosition(min, max, targetMin) : 0;
  const targetWidth = hasTarget ? barPosition(min, max, targetMax) - targetLeft : 0;

  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn('relative h-1.5 w-full rounded-full bg-ink/8', className)}
    >
      {hasTarget ? (
        <div
          className="absolute inset-y-0 rounded-full bg-status-ideal/25"
          style={{ left: `${targetLeft}%`, width: `${targetWidth}%` }}
        />
      ) : null}
      <div
        className={cn(
          'absolute top-1/2 h-3.5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full',
          STATUS_MARKER_CLASSES[status],
        )}
        style={{ left: `${barPosition(min, max, value)}%` }}
      />
    </div>
  );
}
