import { communityCopy } from '@/copy/community';
import { cn } from '@/lib/cn';

/**
 * Verified rating (§42) — shown ONLY when it exists.
 *
 * `average === null` means nobody who actually made this recipe has rated it.
 * That renders as „Brak ocen", never as zero stars and never as a neutral 3:
 * a fabricated score would be exactly the fake activity §59 forbids.
 *
 * The rating is not represented by colour alone — the numeric value and the
 * count are always present in text (§62).
 */
export function VerifiedRating({
  average,
  count,
  className,
}: {
  average: number | null;
  count: number;
  className?: string;
}) {
  const copy = communityCopy;
  if (average === null || count <= 0) {
    return (
      <span className={cn('text-sm text-stone-400', className)}>{copy.metrics.noRatingYet}</span>
    );
  }
  const rounded = Math.round(average * 10) / 10;
  return (
    <span
      className={cn('inline-flex items-baseline gap-1.5 text-sm', className)}
      title={`${copy.metrics.verifiedRating}: ${rounded} / 5 (${count})`}
    >
      <span aria-hidden className="text-ink">
        ★
      </span>
      <span className="font-medium text-ink tabular-nums">{rounded.toFixed(1)}</span>
      <span className="text-stone-500 tabular-nums">({count})</span>
      <span className="sr-only">
        {copy.metrics.verifiedRating} {rounded} / 5, {count}
      </span>
    </span>
  );
}
