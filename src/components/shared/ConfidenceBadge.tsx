import { cn } from '@/lib/cn';
import { useSurfaceTone } from '@/components/ui/surface';
import { CONFIDENCE_DOT_CLASSES, CONFIDENCE_LABELS, confidenceLevel } from './confidence';

interface ConfidenceBadgeProps {
  /** Confidence score 0–100 (Masterplan §16). */
  score: number;
  showScore?: boolean;
  className?: string;
}

/** Ingredient data confidence — verified vs estimated must always be distinguishable. */
export function ConfidenceBadge({ score, showScore = false, className }: ConfidenceBadgeProps) {
  const shell = useSurfaceTone() === 'shell';
  const level = confidenceLevel(score);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 text-xs',
        shell ? 'text-ivory/70' : 'text-stone-600',
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', CONFIDENCE_DOT_CLASSES[level])} />
      {CONFIDENCE_LABELS[level]}
      {showScore ? (
        <span
          className={cn(
            'font-mono text-[0.7rem] tabular-nums',
            shell ? 'text-ivory/40' : 'text-stone-400',
          )}
        >
          {score}%
        </span>
      ) : null}
    </span>
  );
}
