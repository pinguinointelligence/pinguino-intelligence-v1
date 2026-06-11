import { cn } from '@/lib/cn';
import { CONFIDENCE_DOT_CLASSES, CONFIDENCE_LABELS, confidenceLevel } from './confidence';

interface ConfidenceBadgeProps {
  /** Confidence score 0–100 (Masterplan §16). */
  score: number;
  showScore?: boolean;
  className?: string;
}

/** Ingredient data confidence — verified vs estimated must always be distinguishable. */
export function ConfidenceBadge({ score, showScore = false, className }: ConfidenceBadgeProps) {
  const level = confidenceLevel(score);
  return (
    <span className={cn('inline-flex items-center gap-2 text-xs text-stone-600', className)}>
      <span className={cn('size-1.5 rounded-full', CONFIDENCE_DOT_CLASSES[level])} />
      {CONFIDENCE_LABELS[level]}
      {showScore ? (
        <span className="font-mono text-[0.7rem] text-stone-400 tabular-nums">{score}%</span>
      ) : null}
    </span>
  );
}
