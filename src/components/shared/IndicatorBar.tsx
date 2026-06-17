import { cn } from '@/lib/cn';
import { useSurfaceTone } from '@/components/ui/surface';
import { barPosition, idealCoreRange } from '@/lib/math';
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
  const shell = useSurfaceTone() === 'shell';
  const hasTarget = targetMin !== undefined && targetMax !== undefined;
  const targetLeft = hasTarget ? barPosition(min, max, targetMin) : 0;
  const targetWidth = hasTarget ? barPosition(min, max, targetMax) - targetLeft : 0;
  const markerClasses = shell ? STATUS_MARKER_CLASSES_SHELL : STATUS_MARKER_CLASSES;

  // Display-only "ideal core" — the central half of the true band, derived from the
  // passed targets (never the engine). Decorative; does not affect classification.
  const core = hasTarget ? idealCoreRange(targetMin, targetMax) : null;
  const coreLeft = core ? barPosition(min, max, core.coreMin) : 0;
  const coreWidth = core ? barPosition(min, max, core.coreMax) - coreLeft : 0;

  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn(
        'relative h-1.5 w-full rounded-full',
        shell ? 'bg-ivory/10' : 'bg-ink/8',
        className,
      )}
    >
      {/* True target band — the full acceptable range (faint, wide). */}
      {hasTarget ? (
        <div
          aria-hidden
          className={cn('absolute inset-y-0 rounded-full', shell ? 'bg-status-ideal/30' : 'bg-status-ideal/25')}
          style={{ left: `${targetLeft}%`, width: `${targetWidth}%` }}
        />
      ) : null}
      {/* Ideal-core window — narrower, centered; glowing ivory hairline on the dark
          shell, faint and glow-free on paper. Purely decorative. */}
      {core ? (
        <div
          aria-hidden
          className={cn(
            'absolute inset-y-0 rounded-full',
            shell
              ? 'bg-ivory/[0.10] ring-1 ring-inset ring-ivory/35 shadow-[0_0_6px_rgba(239,233,220,0.22)]'
              : 'bg-ink/[0.06]',
          )}
          style={{ left: `${coreLeft}%`, width: `${coreWidth}%` }}
        />
      ) : null}
      <div
        aria-hidden
        className={cn(
          'absolute top-1/2 h-3.5 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full',
          markerClasses[status],
        )}
        style={{ left: `${barPosition(min, max, value)}%` }}
      />
    </div>
  );
}
