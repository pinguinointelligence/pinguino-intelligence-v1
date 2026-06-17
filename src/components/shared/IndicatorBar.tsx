import { cn } from '@/lib/cn';
import { useSurfaceTone } from '@/components/ui/surface';
import { barPosition } from '@/lib/math';
import {
  STATUS_MARKER_CLASSES,
  STATUS_MARKER_CLASSES_SHELL,
  type IndicatorStatus,
} from './status';

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
  const tone = useSurfaceTone();
  const hasTarget = targetMin !== undefined && targetMax !== undefined;
  const targetLeft = hasTarget ? barPosition(min, max, targetMin) : 0;
  const targetWidth = hasTarget ? barPosition(min, max, targetMax) - targetLeft : 0;
  const markerClasses = tone === 'shell' ? STATUS_MARKER_CLASSES_SHELL : STATUS_MARKER_CLASSES;

  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn(
        'relative h-1.5 w-full rounded-full',
        tone === 'shell' ? 'bg-ivory/10' : 'bg-ink/8',
        className,
      )}
    >
      {hasTarget ? (
        <div
          className={cn(
            'absolute inset-y-0 rounded-full',
            tone === 'shell' ? 'bg-status-ideal/30' : 'bg-status-ideal/25',
          )}
          style={{ left: `${targetLeft}%`, width: `${targetWidth}%` }}
        />
      ) : null}
      <div
        className={cn(
          'absolute top-1/2 h-3.5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full',
          markerClasses[status],
        )}
        style={{ left: `${barPosition(min, max, value)}%` }}
      />
    </div>
  );
}
